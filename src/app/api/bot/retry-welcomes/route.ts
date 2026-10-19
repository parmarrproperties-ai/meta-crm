/**
 * POST /api/bot/retry-welcomes — send welcomes that weren't sent (template not
 * approved yet, or WhatsApp was paused). Leads from the last 7 days who never
 * replied. Needs the x-admin-key header.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/bot/adminAuth";
import { retryFailedWelcomes } from "@/lib/bot/engine";
import { isBotPaused } from "@/lib/bot/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (await isBotPaused()) {
    return NextResponse.json({ success: false, error: "WhatsApp is paused. Resume it first." }, { status: 409 });
  }
  try {
    const r = await retryFailedWelcomes(7, 100, true);
    return NextResponse.json({ success: true, ...r });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
