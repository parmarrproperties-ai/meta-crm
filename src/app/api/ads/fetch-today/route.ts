/**
 * POST /api/ads/fetch-today
 *
 * Pulls today's ad insights from Meta Marketing API and upserts
 * them into Supabase daily_ad_snapshots table.
 *
 * Also accepts ?date=YYYY-MM-DD for historical backfill.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAdInsights } from "@/lib/meta";
import { supabase } from "@/lib/supabase";

function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev mode — no secret required
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  // Allow cron invocations with bearer token
  const isCron = req.headers.get("x-vercel-cron") === "1";
  if (isCron && !verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date =
    searchParams.get("date") ??
    new Date().toISOString().split("T")[0]; // today in UTC

  try {
    const accountsJson = process.env.META_AD_ACCOUNTS || "[]";
    const accounts: { id: string; name: string }[] = JSON.parse(accountsJson);

    if (accounts.length === 0) {
      return NextResponse.json(
        { success: false, error: "No META_AD_ACCOUNTS configured." },
        { status: 500 }
      );
    }

    let totalUpserted = 0;
    const allRows = [];

    for (const account of accounts) {
      console.log(`[fetch-today] Fetching for ${account.name} (${account.id})`);
      const insights = await fetchAdInsights(date, account.id);

      const rows = insights.map((ad) => ({
        snapshot_date: date,
        account_id: ad.account_id || account.id,
        account_name: ad.account_name,
        project_name: account.name,
        ad_id: ad.ad_id,
        ad_name: ad.ad_name,
        campaign_id: ad.campaign_id,
        campaign_name: ad.campaign_name,
        adset_id: ad.adset_id,
        adset_name: ad.adset_name,
        spend: ad.spend,
        impressions: ad.impressions,
        clicks: ad.clicks,
        ctr: ad.ctr,
        cpc: ad.cpc,
        cpm: ad.cpm,
        results: ad.results,
        cost_per_result: ad.cost_per_result,
      }));

      allRows.push(...rows);
    }

    if (allRows.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No ad data returned from Meta for ${date} across all accounts.`,
        upserted: 0,
        date,
      });
    }

    const { error } = await supabase
      .from("daily_ad_snapshots")
      .upsert(allRows, { onConflict: "snapshot_date,account_id,ad_id" });

    if (error) {
      console.error("[fetch-today] Supabase upsert error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      upserted: allRows.length,
      date,
      message: `Successfully fetched and stored ${allRows.length} ad snapshots for ${date}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[fetch-today] Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// Also support GET for cron triggers (Vercel cron uses GET)
export async function GET(req: NextRequest) {
  return POST(req);
}
