/** Database access for the WhatsApp bot (Supabase). */

import { supabase } from "@/lib/supabase";
import type { Answers } from "@/lib/bot/config";

export type ConvState =
  | "no_phone"
  | "duplicate"
  | "awaiting_start"
  | "in_progress"
  | "completed"
  | "not_interested"
  | "opted_out"
  | "no_response"
  | "undeliverable"
  | "failed";

export interface Conversation {
  lead_id: string;
  phone: string | null;
  name: string | null;
  project_name: string | null;
  state: ConvState;
  answers: Answers;
  score: string | null;
  summary: string | null;
  lead_questions: string | null;
  bot_paused: boolean;
  needs_attention: boolean;
  attention_reason: string | null;
  off_topic_count: number;
  llm_calls_date: string | null;
  llm_calls_count: number;
  alerts_sent: string[];
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message: string | null;
  started_at: string;
  completed_at: string | null;
  followup_track: "nudge" | "nurture" | null;
  followup_stage: number;
  followups_sent: number;
  unanswered_followups: number;
  next_followup_at: string | null;
  sheet_status: string | null;
  sheet_dirty: boolean;
  sheet_error: string | null;
  error: string | null;
  updated_at: string;
}

export type ConvPatch = Partial<Omit<Conversation, "lead_id">>;

export async function getConversation(leadId: string): Promise<Conversation | null> {
  const { data, error } = await supabase.from("wa_conversations").select("*").eq("lead_id", leadId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Conversation) ?? null;
}

/** The most recent conversation for a phone number. */
export async function findByPhone(phone: string, opts: { skipDuplicates?: boolean } = {}): Promise<Conversation | null> {
  let q = supabase.from("wa_conversations").select("*").eq("phone", phone);
  // A repeat enquiry is parked; replies belong to the conversation in progress.
  if (opts.skipDuplicates) q = q.neq("state", "duplicate");
  const { data, error } = await q.order("started_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as Conversation) ?? null;
}

/** Insert a conversation; returns null if one already exists for the lead. */
export async function createConversation(row: Partial<Conversation> & { lead_id: string }): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from("wa_conversations")
    .upsert(row, { onConflict: "lead_id", ignoreDuplicates: true })
    .select("*");
  if (error) throw new Error(error.message);
  return (data?.[0] as Conversation) ?? null;
}

export async function updateConversation(leadId: string, patch: ConvPatch): Promise<Conversation> {
  const { data, error } = await supabase
    .from("wa_conversations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Conversation;
}

/**
 * Process one lead's messages one at a time: two replies arriving together
 * must not both answer the same question. Waits up to ~15s for the lock.
 */
export async function withLock<T>(leadId: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 30; i++) {
    const now = new Date();
    const { data, error } = await supabase
      .from("wa_conversations")
      .update({ locked_until: new Date(now.getTime() + 45_000).toISOString() })
      .eq("lead_id", leadId)
      .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
      .select("lead_id");
    if (error) throw new Error(error.message);
    if (data && data.length > 0) {
      try {
        return await fn();
      } finally {
        await supabase.from("wa_conversations").update({ locked_until: null }).eq("lead_id", leadId);
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Could not lock conversation ${leadId}`);
}

export interface MessageRow {
  lead_id?: string | null;
  phone: string;
  direction: "in" | "out";
  wa_message_id?: string | null;
  msg_type?: string;
  body?: string;
  payload?: unknown;
  status?: string;
  error?: string | null;
}

/** Record an inbound message; returns false if it was already processed. */
export async function recordInbound(row: MessageRow): Promise<boolean> {
  const { data, error } = await supabase
    .from("wa_messages")
    .upsert(row, { onConflict: "wa_message_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function recordOutbound(row: MessageRow): Promise<void> {
  const { error } = await supabase.from("wa_messages").insert(row);
  if (error) console.error("[bot] failed to log outbound message:", error.message);
}

export async function linkMessage(waMessageId: string, leadId: string): Promise<void> {
  await supabase.from("wa_messages").update({ lead_id: leadId }).eq("wa_message_id", waMessageId);
}

export async function recentMessages(leadId: string, limit = 8): Promise<{ direction: string; body: string | null }[]> {
  const { data } = await supabase
    .from("wa_messages")
    .select("direction, body, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).reverse();
}

export async function updateMessageStatus(waMessageId: string, status: string, error?: string | null): Promise<{ lead_id: string | null; msg_type: string | null } | null> {
  const { data } = await supabase
    .from("wa_messages")
    .update({ status, ...(error ? { error } : {}) })
    .eq("wa_message_id", waMessageId)
    .select("lead_id, msg_type");
  return (data?.[0] as { lead_id: string | null; msg_type: string | null }) ?? null;
}

export async function getKnowledge(projectName: string | null): Promise<string> {
  const names = ["General", ...(projectName ? [projectName] : [])];
  const { data } = await supabase.from("knowledge_base").select("project_name, content").in("project_name", names);
  return (data ?? [])
    .filter((r) => r.content?.trim())
    .sort((a, b) => (a.project_name === "General" ? -1 : b.project_name === "General" ? 1 : 0))
    .map((r) => `## ${r.project_name}\n${r.content.trim()}`)
    .join("\n\n")
    .slice(0, 12_000);
}
