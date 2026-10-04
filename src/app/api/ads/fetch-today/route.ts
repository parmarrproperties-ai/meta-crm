/**
 * GET|POST /api/ads/fetch-today
 *
 * Syncs ad insights from the Meta Marketing API into daily_ad_snapshots.
 *
 * A day's numbers keep changing after the day ends (delayed delivery reporting,
 * conversions attributed back up to the attribution window), so every run
 * re-pulls a trailing window and upserts it. Today's partial figures are
 * therefore overwritten by the final ones on the following runs.
 *
 * Query params:
 *   ?days=N          trailing window length incl. today (default META_SYNC_DAYS or 7, max 90)
 *   ?date=YYYY-MM-DD sync that single day only
 *   ?since=…&until=… explicit inclusive range (backfill)
 *
 * Auth is enforced centrally in src/proxy.ts (session cookie or CRON_SECRET).
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAdInsights, parseActionTypes } from "@/lib/meta";
import { supabase } from "@/lib/supabase";
import { addDays, daysInclusive, isYMD, todayInTz } from "@/lib/dates";
import { chunk } from "@/lib/supabasePaged";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface AccountConfig {
  id: string;
  name: string;
  result_action_types?: string | string[];
}

const MAX_DAYS = 90;

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const today = todayInTz();

  let since: string;
  let until: string;
  const dateParam = searchParams.get("date");
  const sinceParam = searchParams.get("since");
  const untilParam = searchParams.get("until");

  if (isYMD(dateParam)) {
    since = until = dateParam;
  } else if (isYMD(sinceParam)) {
    since = sinceParam;
    until = isYMD(untilParam) ? untilParam : today;
  } else {
    const requested = parseInt(searchParams.get("days") ?? process.env.META_SYNC_DAYS ?? "7", 10);
    const days = Math.min(MAX_DAYS, Math.max(1, Number.isFinite(requested) ? requested : 7));
    until = today;
    since = addDays(today, -(days - 1));
  }

  if (since > until) [since, until] = [until, since];
  if (daysInclusive(since, until) > MAX_DAYS) since = addDays(until, -(MAX_DAYS - 1));

  let accounts: AccountConfig[];
  try {
    accounts = JSON.parse(process.env.META_AD_ACCOUNTS || "[]");
  } catch {
    return NextResponse.json(
      { success: false, error: "META_AD_ACCOUNTS is not valid JSON." },
      { status: 500 }
    );
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return NextResponse.json(
      { success: false, error: "No META_AD_ACCOUNTS configured." },
      { status: 500 }
    );
  }

  // Accounts are independent: one failing (expired permission, rate limit)
  // must not discard the data the others returned.
  const errors: { account: string; error: string }[] = [];
  const byKey = new Map<string, Record<string, unknown>>();

  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const insights = await fetchAdInsights(since, until, account.id, {
          resultActionTypes: parseActionTypes(account.result_action_types),
        });
        return { account, insights };
      } catch (err) {
        errors.push({ account: account.name, error: err instanceof Error ? err.message : String(err) });
        return { account, insights: [] };
      }
    })
  );

  for (const { account, insights } of results) {
    for (const ad of insights) {
      const accountId = ad.account_id || account.id;
      byKey.set(`${ad.date}|${accountId}|${ad.ad_id}`, {
        snapshot_date: ad.date,
        account_id: accountId,
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
      });
    }
  }

  const rows = Array.from(byKey.values());

  try {
    for (const batch of chunk(rows, 500)) {
      const { error } = await supabase
        .from("daily_ad_snapshots")
        .upsert(batch, { onConflict: "snapshot_date,account_id,ad_id" });
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[fetch-today] Supabase upsert error:", message);
    return NextResponse.json({ success: false, error: message, errors }, { status: 500 });
  }

  const allFailed = errors.length === accounts.length;
  if (errors.length > 0) console.error("[fetch-today] account errors:", errors);

  return NextResponse.json(
    {
      success: !allFailed,
      partial: errors.length > 0 && !allFailed,
      upserted: rows.length,
      since,
      until,
      errors,
      error: allFailed ? errors.map((e) => `${e.account}: ${e.error}`).join(" | ") : undefined,
      message: `Synced ${rows.length} ad-day rows for ${since} → ${until}.`,
    },
    { status: allFailed ? 502 : 200 }
  );
}

// Vercel Cron issues GET requests.
export async function GET(req: NextRequest) {
  return POST(req);
}
