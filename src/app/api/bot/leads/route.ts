/**
 * GET /api/bot/leads — every lead the bot has talked to, with answers as
 * readable labels, split by how the chat started:
 *   source "ads"    — a lead form came in and the bot messaged them first
 *   source "direct" — they messaged the WhatsApp number themselves
 */

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabasePaged";
import { QUESTIONS, optionTitle } from "@/lib/bot/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await fetchAllRows<Record<string, any>>((from, to) => // eslint-disable-line @typescript-eslint/no-explicit-any
      supabase
        .from("wa_conversations")
        .select("lead_id, name, phone, project_name, state, answers, score, summary, lead_questions, needs_attention, attention_reason, bot_paused, last_message, last_inbound_at, started_at, completed_at, followups_sent, next_followup_at")
        .order("started_at", { ascending: false })
        .order("lead_id")
        .range(from, to)
    );

    const leads = rows.map((r) => ({
      lead_id: r.lead_id,
      source: String(r.lead_id).startsWith("wa_") ? "direct" : "ads",
      name: r.name,
      phone: r.phone,
      project_name: r.project_name,
      state: r.state,
      score: r.score,
      answers: Object.fromEntries(QUESTIONS.map((q) => [q.id, optionTitle(q.id, r.answers?.[q.id])])),
      lead_questions: r.lead_questions,
      needs_attention: r.needs_attention,
      attention_reason: r.attention_reason,
      bot_paused: r.bot_paused,
      last_message: r.last_message,
      last_activity: r.last_inbound_at ?? r.started_at,
      started_at: r.started_at,
      completed_at: r.completed_at,
      followups_sent: r.followups_sent,
      next_followup_at: r.next_followup_at,
    }));

    return NextResponse.json({
      success: true,
      columns: QUESTIONS.map((q) => ({ id: q.id, label: q.label })),
      leads,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
