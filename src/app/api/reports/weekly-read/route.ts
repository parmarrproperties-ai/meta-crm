/**
 * GET /api/reports/weekly-read
 *
 * Reads the latest (or a specific) weekly report from Supabase.
 * Also returns 4-week history for the trend chart.
 *
 * Query params:
 *   ?week_start=YYYY-MM-DD  (optional, defaults to most recent)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("week_start");

  try {
    const project = searchParams.get("project");

    // Fetch the requested or latest weekly report
    let query = supabase
      .from("weekly_reports")
      .select("*")
      .order("week_start", { ascending: false })
      .limit(1);

    if (project && project !== "all") {
      query = query.eq("project_name", project);
    } else {
      query = query.is("project_name", null); // Assuming overall portfolio rows have project_name = null
    }

    if (weekStart) {
      query = query.eq("week_start", weekStart);
    }

    const { data: reportData, error: reportError } = await query;

    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    const report = reportData?.[0] ?? null;

    // Fetch last 4 weeks of history for chart
    let historyQuery = supabase
      .from("weekly_reports")
      .select("week_start, total_spend, total_results, avg_cpa")
      .order("week_start", { ascending: true })
      .limit(4);

    if (project && project !== "all") {
      historyQuery = historyQuery.eq("project_name", project);
    } else {
      historyQuery = historyQuery.is("project_name", null);
    }

    const { data: historyData, error: historyError } = await historyQuery;

    if (historyError) {
      console.warn("[weekly-read] History fetch error:", historyError.message);
    }

    return NextResponse.json({
      report,
      history: historyData ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
