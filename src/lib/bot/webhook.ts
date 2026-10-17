/* eslint-disable @typescript-eslint/no-explicit-any -- untyped JSON from Meta/Google APIs */
/**
 * Meta webhook handling (one callback URL for both products):
 *  - object "page", field "leadgen": a lead form was submitted → save the
 *    lead and send the welcome message within seconds.
 *  - object "whatsapp_business_account", field "messages": WhatsApp replies
 *    and delivery statuses.
 */

import crypto from "crypto";
import { fetchLeadById } from "@/lib/meta";
import { supabase } from "@/lib/supabase";
import { Inbound, handleInbound, startConversationForLead } from "@/lib/bot/engine";
import { updateConversation, updateMessageStatus } from "@/lib/bot/store";

/** Check Meta's X-Hub-Signature-256 against every configured app secret. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secrets = (process.env.META_APP_SECRET || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!header || secrets.length === 0) return false;
  const given = Buffer.from(header.replace(/^sha256=/, ""), "hex");
  return secrets.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest();
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  });
}

async function projectForAd(adId: string): Promise<string | null> {
  if (!adId) return null;
  const { data } = await supabase
    .from("daily_ad_snapshots")
    .select("project_name")
    .eq("ad_id", adId)
    .order("snapshot_date", { ascending: false })
    .limit(1);
  return data?.[0]?.project_name ?? null;
}

async function handleLeadgen(value: any): Promise<void> {
  const leadgenId = String(value?.leadgen_id ?? "");
  if (!leadgenId) return;
  const lead = await fetchLeadById(leadgenId);
  const adId = lead.ad_id || String(value?.ad_id ?? "");
  const project = await projectForAd(adId);

  const row = {
    lead_id: lead.id,
    created_time: lead.created_time || new Date().toISOString(),
    ad_id: adId || null,
    ad_name: lead.ad_name,
    campaign_name: lead.campaign_name,
    // Don't wipe a project name the nightly sync already set.
    ...(project ? { project_name: project } : {}),
    form_id: lead.form_id || String(value?.form_id ?? ""),
    field_data: lead.field_data,
  };
  const { error } = await supabase.from("leads").upsert(row, { onConflict: "lead_id" });
  if (error) throw new Error(`save lead: ${error.message}`);
  await startConversationForLead({ ...row, project_name: project });
}

function toInbound(msg: any, contacts: any[]): Inbound {
  const profileName = contacts?.find((c) => c?.wa_id === msg.from)?.profile?.name ?? contacts?.[0]?.profile?.name;
  const base: Inbound = { messageId: msg.id, from: String(msg.from), profileName, type: msg.type, raw: msg };
  switch (msg.type) {
    case "text":
      return { ...base, text: msg.text?.body ?? "" };
    case "button": // quick reply on a template
      return { ...base, buttonText: msg.button?.text ?? msg.button?.payload ?? "" };
    case "interactive": {
      const r = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
      return { ...base, replyId: r?.id, replyTitle: r?.title };
    }
    default:
      return base; // image, audio, location, sticker …
  }
}

async function handleStatus(s: any): Promise<void> {
  const failed = s.status === "failed";
  const err = failed ? `${s.errors?.[0]?.code ?? ""} ${s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? ""}`.trim() : null;
  const msg = await updateMessageStatus(String(s.id), String(s.status), err);
  if (failed && msg?.lead_id && msg.msg_type?.startsWith("template:")) {
    const code = Number(s.errors?.[0]?.code);
    await updateConversation(msg.lead_id, {
      ...(code === 131026 ? { state: "undeliverable" as const } : {}),
      needs_attention: true,
      attention_reason: "WhatsApp message failed",
      error: err,
      sheet_dirty: true,
    }).catch(() => undefined);
  }
}

export async function processWebhook(payload: any): Promise<void> {
  const ourNumber = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const jobs: Promise<void>[] = [];

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (payload.object === "page" && change.field === "leadgen") {
        jobs.push(handleLeadgen(value));
      } else if (payload.object === "whatsapp_business_account" && change.field === "messages") {
        if (ourNumber && value?.metadata?.phone_number_id && value.metadata.phone_number_id !== ourNumber) continue;
        for (const s of value?.statuses ?? []) jobs.push(handleStatus(s));
        // Messages from one sender are handled in order.
        const bySender = new Map<string, any[]>();
        for (const m of value?.messages ?? []) bySender.set(m.from, [...(bySender.get(m.from) ?? []), m]);
        for (const msgs of bySender.values()) {
          jobs.push(
            (async () => {
              for (const m of msgs) await handleInbound(toInbound(m, value?.contacts ?? []));
            })()
          );
        }
      }
    }
  }

  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("[webhook] job failed:", r.reason);
}
