/**
 * GET /api/ads/reconcile?since=YYYY-MM-DD&until=YYYY-MM-DD[&project=Name]
 *
 * Checks stored data against Meta. For each configured ad account it compares
 * Meta's own account-level spend for the range (what Ads Manager shows) with
 * the sum of the stored ad-level rows, and lists the days that have no rows at
 * all. A gap means the range needs a re-sync:
 *   POST /api/ads/fetch-today?since=…&until=…
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAccountTotals } from "@/lib/meta";
import { supabase } from "@/lib/supabase";
import { addDays, daysInclusive, isYMD, todayInTz } from "@/lib/dates";
import { fetchAllRows } from "@/lib/supabasePaged";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Differences below this (fraction of Meta spend) are treated as rounding. */
const TOLERANCE = 0.005;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const today = todayInTz();
  let since = isYMD(searchParams.get("since")) ? searchParams.get("since")! : addDays(today, -29);
  let until = isYMD(searchParams.get("until")) ? searchParams.get("until")! : today;
  if (since > until) [since, until] = [until, since];
  if (until > today) until = today;
  if (since > until) since = until;
  const project = searchParams.get("project");

  let accounts: { id: string; name: string }[];
  try {
    accounts = JSON.parse(process.env.META_AD_ACCOUNTS || "[]");
  } catch {
    return NextResponse.json({ success: false, error: "META_AD_ACCOUNTS is not valid JSON." }, { status: 500 });
  }
  if (project && project !== "all") accounts = accounts.filter((a) => a.name === project);

  try {
    const rows = await fetchAllRows<{ project_name: string; snapshot_date: string; spend: number }>((from, to) => {
      let q = supabase
        .from("daily_ad_snapshots")
        .select("project_name, snapshot_date, spend")
        .gte("snapshot_date", since)
        .lte("snapshot_date", until)
        .order("id");
      if (project && project !== "all") q = q.eq("project_name", project);
      return q.range(from, to);
    });

    const stored = new Map<string, { spend: number; days: Set<string> }>();
    for (const r of rows) {
      const e = stored.get(r.project_name) ?? { spend: 0, days: new Set<string>() };
      e.spend += Number(r.spend);
      e.days.add(r.snapshot_date);
      stored.set(r.project_name, e);
    }

    const allDays: string[] = [];
    for (let d = since; d <= until; d = addDays(d, 1)) allDays.push(d);

    const results = await Promise.all(
      accounts.map(async (account) => {
        const db = stored.get(account.name) ?? { spend: 0, days: new Set<string>() };
        try {
          const meta = await fetchAccountTotals(since, until, account.id);
          const diff = meta.spend - db.spend;
          return {
            project_name: account.name,
            meta_spend: Math.round(meta.spend * 100) / 100,
            stored_spend: Math.round(db.spend * 100) / 100,
            difference: Math.round(diff * 100) / 100,
            matches: Math.abs(diff) <= Math.max(1, meta.spend * TOLERANCE),
            days_without_data: allDays.filter((d) => !db.days.has(d)),
          };
        } catch (err) {
          return {
            project_name: account.name,
            stored_spend: Math.round(db.spend * 100) / 100,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    const totalMeta = results.reduce((s, r) => s + ("meta_spend" in r ? (r.meta_spend ?? 0) : 0), 0);
    const totalStored = results.reduce((s, r) => s + r.stored_spend, 0);

    return NextResponse.json({
      success: true,
      since,
      until,
      days: daysInclusive(since, until),
      matches: results.every((r) => "matches" in r && r.matches),
      total_meta_spend: Math.round(totalMeta * 100) / 100,
      total_stored_spend: Math.round(totalStored * 100) / 100,
      accounts: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reconcile] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
