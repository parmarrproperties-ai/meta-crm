/**
 * POST /api/bot/send-welcomes — { leadIds: string[] }
 * Send the welcome message to the leads you picked on the WhatsApp Bot page.
 * Needs the x-admin-key header. Refused while WhatsApp is paused.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/bot/adminAuth";
import { sendWelcomesTo } from "@/lib/bot/engine";
import { isBotPaused } from "@/lib/bot/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.leadIds)
    ? Array.from(new Set(body.leadIds.filter((v: unknown): v is string => typeof v === "string" && v.length > 0))).slice(0, 300) as string[]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ success: false, error: "Pick at least one lead." }, { status: 400 });
  }
  if (await isBotPaused()) {
    return NextResponse.json({ success: false, error: "WhatsApp is paused. Resume it first." }, { status: 409 });
  }
  try {
    return NextResponse.json({ success: true, ...(await sendWelcomesTo(ids)) });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
