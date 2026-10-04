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
import { addDays, daysInclusive, isYMD, todayInTz } from "@/lib/dates";
import { fetchAllRows } from "@/lib/supabasePaged";

export const dynamic = "force-dynamic";

type SnapshotRow = Record<string, any>;

function toSnapshot(row: SnapshotRow): AdSnapshot {
  return {
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
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const today = todayInTz();
  const dateParam = searchParams.get("date"); // legacy single-day param
  const pick = (v: string | null) => (isYMD(v) ? v : null);
  let startDate = pick(searchParams.get("startDate")) ?? pick(dateParam) ?? today;
  let endDate = pick(searchParams.get("endDate")) ?? pick(dateParam) ?? today;
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  const trendDays = Math.min(366, Math.max(1, parseInt(searchParams.get("days") ?? "14", 10) || 14));

  try {
    const project = searchParams.get("project");
    const filterProject = !!project && project !== "all";

    // Current period. Paged: PostgREST caps a single response at 1,000 rows,
    // which a multi-week range across several accounts easily exceeds.
    const todayData = await fetchAllRows<SnapshotRow>((from, to) => {
      let q = supabase
        .from("daily_ad_snapshots")
        .select("*")
        .gte("snapshot_date", startDate)
        .lte("snapshot_date", endDate)
        .order("spend", { ascending: false })
        .order("id");
      if (filterProject) q = q.eq("project_name", project!);
      return q.range(from, to);
    });

    const snapshots = todayData.map(toSnapshot);

    // Portfolio breakdown when viewing "all"
    let portfolio: any[] = [];
    if (!filterProject) {
      const pMap = new Map<string, any>();
      for (const row of todayData) {
        const p = row.project_name;
        const aName = row.account_name ?? p; // fallback for old records
        const key = `${p}::${aName}`;
        const existing = pMap.get(key) ?? {
          project_name: p,
          account_name: aName,
          spend: 0,
          results: 0,
          impressions: 0,
          clicks: 0,
        };
        existing.spend += Number(row.spend);
        existing.results += Number(row.results);
        existing.impressions += Number(row.impressions);
        existing.clicks += Number(row.clicks);
        pMap.set(key, existing);
      }
      portfolio = Array.from(pMap.values())
        .map((p) => ({
          ...p,
          cost_per_result: p.results > 0 ? p.spend / p.results : 0,
          ctr: p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0,
        }))
        .sort((a, b) => b.spend - a.spend);
    }

    const aggregatedSnapshots = aggregateSnapshots(snapshots);

    // Prior period of equal length, immediately before the current one
    const diffDays = daysInclusive(startDate, endDate);
    const priorEndStr = addDays(startDate, -1);
    const priorStartStr = addDays(priorEndStr, -(diffDays - 1));

    let priorSnapshots: AdSnapshot[] | null = null;
    try {
      const priorData = await fetchAllRows<SnapshotRow>((from, to) => {
        let q = supabase
          .from("daily_ad_snapshots")
          .select("*")
          .gte("snapshot_date", priorStartStr)
          .lte("snapshot_date", priorEndStr)
          .order("id");
        if (filterProject) q = q.eq("project_name", project!);
        return q.range(from, to);
      });
      priorSnapshots = aggregateSnapshots(priorData.map(toSnapshot));
    } catch (err) {
      console.warn("[summary] Prior period fetch error:", err instanceof Error ? err.message : err);
    }

    const summary = computeDailySummary(aggregatedSnapshots, `${startDate} to ${endDate}`, priorSnapshots);

    // Trend: last N days ending at endDate
    const trendStart = addDays(endDate, -(trendDays - 1));
    let trendData: SnapshotRow[] = [];
    try {
      trendData = await fetchAllRows<SnapshotRow>((from, to) => {
        let q = supabase
          .from("daily_ad_snapshots")
          .select("snapshot_date, spend, results, impressions, clicks")
          .gte("snapshot_date", trendStart)
          .lte("snapshot_date", endDate)
          .order("snapshot_date", { ascending: true })
          .order("id");
        if (filterProject) q = q.eq("project_name", project!);
        return q.range(from, to);
      });
    } catch (err) {
      console.warn("[summary] Trend data fetch error:", err instanceof Error ? err.message : err);
    }

    const trendMap = new Map<string, { spend: number; results: number; impressions: number; clicks: number }>();
    for (const row of trendData) {
      const d = row.snapshot_date;
      const existing = trendMap.get(d) ?? { spend: 0, results: 0, impressions: 0, clicks: 0 };
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
