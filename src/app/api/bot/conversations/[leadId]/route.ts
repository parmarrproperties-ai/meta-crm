/**
 * GET  /api/bot/conversations/:leadId — one chat with its messages.
 * POST /api/bot/conversations/:leadId — { action: "pause" | "resume" | "resolve" | "reply", text? }
 *      (needs the x-admin-key header).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/bot/adminAuth";
import { sendManualReply, syncSheet } from "@/lib/bot/engine";
import { getConversation, updateConversation } from "@/lib/bot/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ leadId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { leadId } = await params;
  const conversation = await getConversation(leadId);
  if (!conversation) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const { data: messages } = await supabase
    .from("wa_messages")
    .select("id, direction, msg_type, body, status, error, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
    .limit(500);
  return NextResponse.json({ success: true, conversation, messages: messages ?? [] });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { leadId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  try {
    if (action === "reply") {
      const text = String(body?.text ?? "").trim();
      if (!text) return NextResponse.json({ success: false, error: "Empty message" }, { status: 400 });
      const r = await sendManualReply(leadId, text.slice(0, 4000));
      return NextResponse.json({ success: r.ok, error: r.error }, { status: r.ok ? 200 : 400 });
    }
    const patch =
      action === "pause"
        ? { bot_paused: true }
        : action === "resume"
          ? { bot_paused: false }
          : action === "resolve"
            ? { needs_attention: false, attention_reason: null }
            : null;
    if (!patch) return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    const updated = await updateConversation(leadId, { ...patch, sheet_dirty: true });
    await syncSheet(updated);
    return NextResponse.json({ success: true, conversation: updated });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
