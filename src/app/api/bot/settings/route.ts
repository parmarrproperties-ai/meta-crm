/**
 * GET  /api/bot/settings — { paused, pendingWelcomes }
 * POST /api/bot/settings — { paused: boolean } (needs the x-admin-key header)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/bot/adminAuth";
import { isBotPaused, setBotPaused } from "@/lib/bot/settings";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function pendingWelcomes(): Promise<number> {
  const { count } = await supabase
    .from("wa_conversations")
    .select("lead_id", { count: "exact", head: true })
    .eq("state", "failed")
    .is("last_inbound_at", null)
    .not("phone", "is", null)
    .gte("started_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  return count ?? 0;
}

export async function GET() {
  return NextResponse.json({ success: true, paused: await isBotPaused(), pendingWelcomes: await pendingWelcomes() });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.paused !== "boolean") {
    return NextResponse.json({ success: false, error: "Send { paused: true | false }" }, { status: 400 });
  }
  try {
    await setBotPaused(body.paused);
    return NextResponse.json({ success: true, paused: body.paused, pendingWelcomes: await pendingWelcomes() });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
