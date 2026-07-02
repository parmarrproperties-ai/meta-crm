/**
 * POST /api/reports/weekly
 *
 * Computes a week-over-week report from daily_ad_snapshots,
 * optionally calls Claude for a narrative, and upserts into weekly_reports.
 *
 * Query params:
 *   ?week_start=YYYY-MM-DD  (Monday of the week to compute)
 *   If omitted, computes for the most recently completed week (last Monday–Sunday).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeWeeklySummary, type AdSnapshot } from "@/lib/compute";
import { generateWeeklyNarrative } from "@/lib/claude";

function getMostRecentWeekBounds(): { weekStart: string; weekEnd: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Last Monday
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) - 7);
  // Last Sunday
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  return {
    weekStart: lastMonday.toISOString().split("T")[0],
    weekEnd: lastSunday.toISOString().split("T")[0],
  };
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  if (isCron && !verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const providedStart = searchParams.get("week_start");
  const project = searchParams.get("project");
  const projectName = project && project !== "all" ? project : "Portfolio";

  let weekStart: string;
  let weekEnd: string;

  if (providedStart) {
    weekStart = providedStart;
    weekEnd = addDays(weekStart, 6);
  } else {
    ({ weekStart, weekEnd } = getMostRecentWeekBounds());
  }

  // Previous week bounds
  const prevWeekStart = addDays(weekStart, -7);
  const prevWeekEnd = addDays(weekStart, -1);

  try {
    // Fetch this week's data
    let thisWeekQuery = supabase
      .from("daily_ad_snapshots")
      .select("*")
      .gte("snapshot_date", weekStart)
      .lte("snapshot_date", weekEnd);

    if (projectName !== "Portfolio") {
      thisWeekQuery = thisWeekQuery.eq("project_name", projectName);
    }
    const { data: thisWeekData, error: e1 } = await thisWeekQuery;

    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

    // Fetch previous week's data
    let prevWeekQuery = supabase
      .from("daily_ad_snapshots")
      .select("*")
      .gte("snapshot_date", prevWeekStart)
      .lte("snapshot_date", prevWeekEnd);

    if (projectName !== "Portfolio") {
      prevWeekQuery = prevWeekQuery.eq("project_name", projectName);
    }
    const { data: prevWeekData, error: e2 } = await prevWeekQuery;

    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

    const mapRows = (rows: Record<string, unknown>[]): AdSnapshot[] =>
      rows.map((row) => ({
        ad_id: row.ad_id as string,
        ad_name: row.ad_name as string,
        campaign_name: (row.campaign_name as string) ?? "",
        adset_name: (row.adset_name as string) ?? "",
        spend: Number(row.spend),
        impressions: Number(row.impressions),
        clicks: Number(row.clicks),
        ctr: Number(row.ctr),
        cpc: Number(row.cpc),
        cpm: Number(row.cpm),
        results: Number(row.results),
        cost_per_result: Number(row.cost_per_result),
      }));

    const thisWeek = mapRows(thisWeekData ?? []);
    const prevWeek = mapRows(prevWeekData ?? []);

    const summary = computeWeeklySummary(thisWeek, prevWeek, weekStart, weekEnd);

    // Generate AI narrative (Phase 5 — returns null if no API key)
    const aiSummary = await generateWeeklyNarrative({
      weekStart,
      weekEnd,
      totalSpend: summary.totalSpend,
      totalResults: summary.totalResults,
      avgCTR: summary.avgCTR,
      avgCPA: summary.avgCPA,
      spendChangePct: summary.spendChangePct,
      cpaChangePct: summary.cpaChangePct,
      resultsChangePct: summary.resultsChangePct,
      topAds: summary.topAds.map((a) => ({
        ad_name: a.ad_name,
        results: a.results,
        cost_per_result: a.cost_per_result,
      })),
      bottomAds: summary.bottomAds.map((a) => ({
        ad_name: a.ad_name,
        spend: a.spend,
        results: a.results,
      })),
    });

    // Upsert into weekly_reports
    const { error: upsertError } = await supabase
      .from("weekly_reports")
      .upsert(
        {
          week_start: weekStart,
          week_end: weekEnd,
          project_name: projectName,
          total_spend: summary.totalSpend,
          total_results: summary.totalResults,
          avg_ctr: summary.avgCTR,
          avg_cpa: summary.avgCPA,
          spend_change_pct: summary.spendChangePct,
          cpa_change_pct: summary.cpaChangePct,
          results_change_pct: summary.resultsChangePct,
          top_ads: summary.topAds,
          bottom_ads: summary.bottomAds,
          ai_summary: aiSummary,
        },
        { onConflict: "week_start,project_name" }
      );

    if (upsertError) {
      return NextResponse.json(
        { error: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      weekStart,
      weekEnd,
      summary,
      aiSummary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
