/**
 * GET  /api/bot/settings — { paused, autoHours, pending }
 *        pending = leads still waiting for their welcome (auto: true = will be
 *        sent automatically, false = waiting for you to pick them)
 * POST /api/bot/settings — { paused: boolean } (needs the x-admin-key header)
 *        Resuming also starts sending the fresh waiting welcomes in the background.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/bot/adminAuth";
import { WELCOME_AUTO_MAX_AGE_HOURS } from "@/lib/bot/config";
import { autoSendFreshWelcomes, listPendingWelcomes } from "@/lib/bot/engine";
import { isBotPaused, setBotPaused } from "@/lib/bot/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    success: true,
    paused: await isBotPaused(),
    autoHours: WELCOME_AUTO_MAX_AGE_HOURS,
    pending: await listPendingWelcomes(),
  });
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
    const pending = await listPendingWelcomes();
    const autoCount = body.paused ? 0 : pending.filter((l) => l.auto).length;
    if (autoCount > 0) {
      after(() => autoSendFreshWelcomes().catch((err) => console.error("[settings] auto welcomes failed:", err)));
    }
    return NextResponse.json({
      success: true,
      paused: body.paused,
      autoHours: WELCOME_AUTO_MAX_AGE_HOURS,
      pending,
      autoSending: autoCount,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
