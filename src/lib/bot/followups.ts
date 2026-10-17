/**
 * Daily follow-ups (run by the /api/cron/lead-followups cron).
 *
 *  1. Read "Your Status" from the Google Sheet, so marking a lead Booked /
 *     Not interested / Handled by me there stops follow-ups (and, for
 *     "Handled by me", the bot's replies).
 *  2. Send every follow-up that is due, with an approved template.
 *  3. Retry Sheet rows that failed to update earlier.
 *  4. Start the bot for recent leads the instant webhook missed.
 *  5. Email you a short list of leads that need you today.
 */

import { Resend } from "resend";
import { FOLLOWUPS, PAUSE_BOT_STATUSES, STOP_FOLLOWUP_STATUSES, TEMPLATES } from "@/lib/bot/config";
import { projectLabel, startPendingConversations, syncSheet } from "@/lib/bot/engine";
import { readStatuses, sheetsConfigured } from "@/lib/bot/sheets";
import { ConvPatch, Conversation, recordOutbound, updateConversation } from "@/lib/bot/store";
import { escapeHtml } from "@/lib/csv";
import { fetchAllRows } from "@/lib/supabasePaged";
import { supabase } from "@/lib/supabase";
import { sendTemplate, whatsappConfigured } from "@/lib/whatsapp";

const DAY = 86_400_000;
const firstName = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "there";

export interface FollowupRunResult {
  statusesApplied: number;
  due: number;
  sent: number;
  stopped: number;
  failed: number;
  sheetRowsSynced: number;
  conversationsStarted: number;
  digestSent: boolean;
  errors: string[];
}

async function applySheetStatuses(): Promise<number> {
  if (!sheetsConfigured()) return 0;
  const statuses = await readStatuses();
  const convs = await fetchAllRows<{ lead_id: string; sheet_status: string | null; bot_paused: boolean }>((from, to) =>
    supabase.from("wa_conversations").select("lead_id, sheet_status, bot_paused").order("lead_id").range(from, to)
  );
  let changed = 0;
  for (const c of convs) {
    const s = statuses.get(c.lead_id);
    if (s === undefined || s === (c.sheet_status ?? "")) continue;
    const lower = s.toLowerCase();
    const wasPaused = PAUSE_BOT_STATUSES.has((c.sheet_status ?? "").toLowerCase());
    const patch: ConvPatch = { sheet_status: s };
    if (PAUSE_BOT_STATUSES.has(lower)) patch.bot_paused = true;
    else if (wasPaused) patch.bot_paused = false;
    if (STOP_FOLLOWUP_STATUSES.has(lower)) patch.next_followup_at = null;
    await updateConversation(c.lead_id, patch);
    changed++;
  }
  return changed;
}

function nextAfter(c: Conversation, stage: number): string | null {
  const track = c.followup_track === "nurture" ? "nurture" : "nudge";
  const offsets = FOLLOWUPS[track];
  if (stage >= offsets.length) return null;
  const base = new Date(
    track === "nurture" ? c.completed_at ?? c.started_at : c.last_inbound_at ?? c.started_at
  ).getTime();
  // Never closer than ~a day after the one just sent.
  return new Date(Math.max(base + offsets[stage], Date.now() + 20 * 3600_000)).toISOString();
}

/** Template errors that won't fix themselves by waiting a day. */
const PERMANENT = (code?: number) => code === 131026 || (code !== undefined && code >= 132000 && code < 133000);

async function sendDue(result: FollowupRunResult, deadline: number) {
  const { data, error } = await supabase
    .from("wa_conversations")
    .select("*")
    .lte("next_followup_at", new Date().toISOString())
    .eq("bot_paused", false)
    .in("state", ["awaiting_start", "in_progress", "completed"])
    .order("next_followup_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  const due = (data ?? []) as Conversation[];
  result.due = due.length;

  for (const c of due) {
    if (Date.now() > deadline) break;
    try {
      const stop =
        !c.phone ||
        STOP_FOLLOWUP_STATUSES.has((c.sheet_status ?? "").toLowerCase()) ||
        c.unanswered_followups >= FOLLOWUPS.maxUnanswered;
      if (stop) {
        await updateConversation(c.lead_id, {
          next_followup_at: null,
          ...(c.state === "awaiting_start" ? { state: "no_response" as const } : {}),
          sheet_dirty: true,
        });
        result.stopped++;
        continue;
      }

      const template = c.followup_track === "nurture" ? TEMPLATES.followup : TEMPLATES.nudge;
      const r = await sendTemplate(c.phone!, template, [firstName(c.name), projectLabel(c.project_name)]);
      await recordOutbound({
        lead_id: c.lead_id,
        phone: c.phone!,
        direction: "out",
        wa_message_id: r.messageId ?? null,
        msg_type: `template:${template}`,
        body: `[follow-up ${c.followup_stage + 1}: ${template}]`,
        status: r.success ? "sent" : "failed",
        error: r.error ?? null,
      });

      let patch: ConvPatch;
      if (r.success) {
        const stage = c.followup_stage + 1;
        const next = nextAfter(c, stage);
        patch = {
          followup_stage: stage,
          followups_sent: (c.followups_sent ?? 0) + 1,
          unanswered_followups: (c.unanswered_followups ?? 0) + 1,
          last_outbound_at: new Date().toISOString(),
          next_followup_at: next,
          error: null,
          ...(next === null && c.state === "awaiting_start" ? { state: "no_response" as const } : {}),
        };
        result.sent++;
      } else {
        result.failed++;
        result.errors.push(`${c.lead_id}: ${r.error}`);
        patch = PERMANENT(r.errorCode)
          ? {
              next_followup_at: null,
              error: r.error ?? "send failed",
              needs_attention: true,
              attention_reason: "follow-up not sent",
              ...(r.errorCode === 131026 ? { state: "undeliverable" as const } : {}),
            }
          : { next_followup_at: new Date(Date.now() + DAY).toISOString(), error: r.error ?? "send failed" };
      }
      const updated = await updateConversation(c.lead_id, { ...patch, sheet_dirty: true });
      await syncSheet(updated);
    } catch (err) {
      result.failed++;
      result.errors.push(`${c.lead_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function syncDirty(deadline: number): Promise<number> {
  if (!sheetsConfigured()) return 0;
  const { data } = await supabase.from("wa_conversations").select("*").eq("sheet_dirty", true).limit(100);
  let n = 0;
  for (const c of (data ?? []) as Conversation[]) {
    if (Date.now() > deadline) break;
    await syncSheet(c);
    n++;
  }
  return n;
}

async function sendDigest(): Promise<boolean> {
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_EMAIL_ADDRESS) return false;
  const since = new Date(Date.now() - DAY).toISOString();
  const { data } = await supabase
    .from("wa_conversations")
    .select("name, phone, project_name, score, summary, attention_reason, needs_attention, answers, updated_at")
    .gte("updated_at", since)
    .or("needs_attention.eq.true,score.eq.Hot,answers->>next_step.eq.call,answers->>next_step.eq.visit")
    .order("updated_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];
  if (rows.length === 0) return false;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;font-size:14px">
    <h2 style="margin:0 0 12px">Leads to follow up today (${rows.length})</h2>
    <table cellpadding="6" style="border-collapse:collapse;width:100%">
      <tr style="background:#f1f5f9;text-align:left"><th>Lead</th><th>Score</th><th>Wants</th><th>Why</th></tr>
      ${rows
        .map(
          (r) => `<tr style="border-top:1px solid #e2e8f0">
            <td>${escapeHtml(r.name || "Lead")}<br><span style="color:#64748b">${r.phone ? `+${escapeHtml(r.phone)}` : ""} · ${escapeHtml(r.project_name || "")}</span></td>
            <td>${escapeHtml(r.score || "")}</td>
            <td>${escapeHtml(r.summary || "")}</td>
            <td>${escapeHtml(r.needs_attention ? r.attention_reason || "needs you" : r.score === "Hot" ? "Hot lead" : "Asked for a call/visit")}</td>
          </tr>`
        )
        .join("")}
    </table></div>`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const res = await resend.emails.send({
    from: process.env.ALERT_EMAIL_FROM || "Meta Ads CRM <onboarding@resend.dev>",
    to: process.env.ALERT_EMAIL_ADDRESS,
    subject: `📋 ${rows.length} lead${rows.length > 1 ? "s" : ""} to follow up today`,
    html,
  });
  return !res.error;
}

export async function runFollowups(budgetMs = 50_000): Promise<FollowupRunResult> {
  const deadline = Date.now() + budgetMs;
  const result: FollowupRunResult = {
    statusesApplied: 0,
    due: 0,
    sent: 0,
    stopped: 0,
    failed: 0,
    sheetRowsSynced: 0,
    conversationsStarted: 0,
    digestSent: false,
    errors: [],
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      result.errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  await step("sheet statuses", async () => {
    result.statusesApplied = await applySheetStatuses();
  });
  if (whatsappConfigured()) await step("follow-ups", () => sendDue(result, deadline));
  await step("pending conversations", async () => {
    result.conversationsStarted = await startPendingConversations(24, 30);
  });
  await step("sheet retry", async () => {
    result.sheetRowsSynced = await syncDirty(deadline);
  });
  await step("digest", async () => {
    result.digestSent = await sendDigest();
  });
  return result;
}
