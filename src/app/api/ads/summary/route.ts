/**
 * GET /api/ads/summary
 *
 * Returns computed daily summary for a given date (default: today).
 * Reads from Supabase — never calls Meta directly.
 *
 * Query params:
 *   ?date=YYYY-MM-DD  (optional, defaults to today)
 *   ?days=14          (optional, number of days to include in trend chart data)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeDailySummary, aggregateSnapshots, type AdSnapshot } from "@/lib/compute";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date"); // Legacy param
  const startDate = searchParams.get("startDate") ?? date ?? new Date().toISOString().split("T")[0];
  const endDate = searchParams.get("endDate") ?? date ?? new Date().toISOString().split("T")[0];
  const trendDays = parseInt(searchParams.get("days") ?? "14", 10);

  try {
    const project = searchParams.get("project");

    // Fetch snapshots for the date range
    let todayQuery = supabase
      .from("daily_ad_snapshots")
      .select("*")
      .gte("snapshot_date", startDate)
      .lte("snapshot_date", endDate)
      .order("spend", { ascending: false });

    if (project && project !== "all") {
      todayQuery = todayQuery.eq("project_name", project);
    }

    const { data: todayData, error: todayError } = await todayQuery;

    if (todayError) {
      return NextResponse.json(
        { error: todayError.message },
        { status: 500 }
      );
    }

    const snapshots: AdSnapshot[] = (todayData ?? []).map((row) => ({
      ad_id: row.ad_id,
      ad_name: row.ad_name,
      campaign_name: row.campaign_name ?? "",
      adset_name: row.adset_name ?? "",
      spend: Number(row.spend),
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      ctr: Number(row.ctr),
      cpc: Number(row.cpc),
      cpm: Number(row.cpm),
      results: Number(row.results),
      cost_per_result: Number(row.cost_per_result),
      project_name: row.project_name,
    }));

    // Calculate Portfolio Breakdown if viewing "all"
    let portfolio: any[] = [];
    if (!project || project === "all") {
      const pMap = new Map<string, any>();
      for (const row of todayData ?? []) {
        const p = row.project_name;
        const existing = pMap.get(p) ?? {
          project_name: p,
          spend: 0,
          results: 0,
          impressions: 0,
          clicks: 0,
        };
        existing.spend += Number(row.spend);
        existing.results += Number(row.results);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        pMap.set(p, existing);
      }
      portfolio = Array.from(pMap.values()).map(p => ({
        ...p,
        cost_per_result: p.results > 0 ? p.spend / p.results : 0,
        ctr: p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0,
      })).sort((a, b) => b.spend - a.spend);
    }

    const aggregatedSnapshots = aggregateSnapshots(snapshots);
    const summary = computeDailySummary(aggregatedSnapshots, `${startDate} to ${endDate}`);

    // Fetch trend data (last N days aggregated totals) from endDate backward
    const trendStartDate = new Date(endDate);
    trendStartDate.setDate(trendStartDate.getDate() - trendDays + 1);
    const trendStart = trendStartDate.toISOString().split("T")[0];

    let trendQuery = supabase
      .from("daily_ad_snapshots")
      .select("snapshot_date, spend, results, impressions, clicks")
      .gte("snapshot_date", trendStart)
      .lte("snapshot_date", endDate)
      .order("snapshot_date", { ascending: true });

    if (project && project !== "all") {
      trendQuery = trendQuery.eq("project_name", project);
    }

    const { data: trendData, error: trendError } = await trendQuery;

    if (trendError) {
      console.warn("[summary] Trend data fetch error:", trendError.message);
    }

    // Aggregate trend by date
    const trendMap = new Map<
      string,
      { spend: number; results: number; impressions: number; clicks: number }
    >();

    for (const row of trendData ?? []) {
      const d = row.snapshot_date;
      const existing = trendMap.get(d) ?? {
        spend: 0,
        results: 0,
        impressions: 0,
        clicks: 0,
      };
      existing.spend += Number(row.spend);
      existing.results += Number(row.results);
      existing.impressions += Number(row.impressions);
      existing.clicks += Number(row.clicks);
      trendMap.set(d, existing);
    }

    const trend = Array.from(trendMap.entries()).map(([d, v]) => ({
      date: d,
      spend: Math.round(v.spend),
      results: v.results,
      ctr: v.impressions > 0 ? ((v.clicks / v.impressions) * 100).toFixed(2) : "0",
    }));

    return NextResponse.json({ summary, trend, portfolio });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[summary] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
