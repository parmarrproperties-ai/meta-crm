/**
 * POST /api/leads/fetch
 *
 * Manual "Sync leads" from the dashboard.
 *   ?days=N   lookback window (default 7)
 *   ?full=1   re-pull the entire history of every ad ever delivered
 *   ?offset=N continue a previous partial run (see `nextOffset` in the response)
 *
 * Auth is enforced centrally in src/proxy.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { leadSyncResponse, syncLeads } from "@/lib/leadSync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const full = searchParams.get("full") === "1";
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") ?? "7", 10) || 7));

    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

    const result = await syncLeads(
      full
        ? { lookbackDays: null, adWindowDays: null, offset }
        : { lookbackDays: days, adWindowDays: Math.max(30, days), offset }
    );
    const body = leadSyncResponse(result);
    return NextResponse.json(body, { status: body.success ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[fetch-leads] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
