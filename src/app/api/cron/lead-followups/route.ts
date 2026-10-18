/**
 * GET /api/cron/lead-followups — daily (11:00 IST, see vercel.json).
 * Sends due WhatsApp follow-ups, applies statuses from the Google Sheet,
 * retries failed Sheet updates and emails the "leads to follow up" list.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/bot/adminAuth";
import { runFollowups } from "@/lib/bot/followups";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const result = await runFollowups(50_000);
    return NextResponse.json({ success: result.errors.length === 0, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/lead-followups]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
