/**
 * GET /api/cron/daily-report
 *
 * Emails yesterday's leads as a CSV. "Yesterday" is the previous calendar day
 * in APP_TIMEZONE (IST by default), not in UTC, so early-morning IST leads
 * land in the right day's report.
 *
 *   ?date=YYYY-MM-DD   report on a specific day instead of yesterday
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendDailyReport } from "@/lib/email";
import { addDays, dayBoundsUtc, isYMD, todayInTz } from "@/lib/dates";
import { fetchAllRows } from "@/lib/supabasePaged";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const dateParam = new URL(req.url).searchParams.get("date");
    const dateStr = isYMD(dateParam) ? dateParam : addDays(todayInTz(), -1);
    const { start, end } = dayBoundsUtc(dateStr);

    const leads = await fetchAllRows((from, to) =>
      supabase
        .from("leads")
        .select("*")
        .gte("created_time", start.toISOString())
        .lt("created_time", end.toISOString())
        .order("created_time", { ascending: true })
        .order("id")
        .range(from, to)
    );

    if (leads.length === 0) {
      console.log(`No leads found for ${dateStr}. Skipping report.`);
      return NextResponse.json({ success: true, message: `No leads on ${dateStr}, email skipped.` });
    }

    console.log(`Sending daily report for ${dateStr} with ${leads.length} leads...`);
    const success = await sendDailyReport(leads, dateStr);
    if (!success) throw new Error("Failed to send daily report email.");

    return NextResponse.json({ success: true, message: `Report sent for ${dateStr} with ${leads.length} leads.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Daily report cron error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
