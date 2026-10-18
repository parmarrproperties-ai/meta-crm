/** GET /api/bot/conversations?filter=all|attention|hot — WhatsApp chats, newest activity first. */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const filter = new URL(req.url).searchParams.get("filter") ?? "all";
  let q = supabase
    .from("wa_conversations")
    .select("lead_id, name, phone, project_name, state, score, summary, needs_attention, attention_reason, bot_paused, last_message, last_inbound_at, last_outbound_at, updated_at, next_followup_at")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (filter === "attention") q = q.eq("needs_attention", true);
  if (filter === "hot") q = q.eq("score", "Hot");
  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, conversations: data ?? [] });
}
