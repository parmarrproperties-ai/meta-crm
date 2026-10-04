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
 *   ?since=…&until=… explicit inclusive range (backfill, max 90 days)
 *
 * Long ranges are processed in 7-day windows, saving each window as it
 * completes. If the time budget runs out the response has `partial: true` and
 * `nextSince`; call again with ?since=<nextSince>&until=<until> to continue.
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
const WINDOW_DAYS = 7;
const BUDGET_MS = 45_000;

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
  if (until > today) until = today; // Meta has no data for future days
  if (since > until) since = until;
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

  const deadline = Date.now() + BUDGET_MS;
  const errors: { account: string; error: string }[] = [];
  let upserted = 0;
  let nextSince: string | null = null;

  for (let winStart = since; winStart <= until; winStart = addDays(winStart, WINDOW_DAYS)) {
    if (Date.now() > deadline) {
      nextSince = winStart;
      break;
    }
    const winEnd = addDays(winStart, WINDOW_DAYS - 1) < until ? addDays(winStart, WINDOW_DAYS - 1) : until;

    // Accounts are independent: one failing (expired permission, rate limit)
    // must not discard the data the others returned.
    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const insights = await fetchAdInsights(winStart, winEnd, account.id, {
            resultActionTypes: parseActionTypes(account.result_action_types),
          });
          return { account, insights };
        } catch (err) {
          errors.push({
            account: account.name,
            error: `${winStart}→${winEnd}: ${err instanceof Error ? err.message : String(err)}`,
          });
          return { account, insights: [] };
        }
      })
    );

    const byKey = new Map<string, Record<string, unknown>>();
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
      return NextResponse.json({ success: false, error: message, errors, upserted }, { status: 500 });
    }
    upserted += rows.length;
  }

  const allFailed = upserted === 0 && errors.length > 0;
  if (errors.length > 0) console.error("[fetch-today] account errors:", errors);
  const doneUntil = nextSince ? addDays(nextSince, -1) : until;

  return NextResponse.json(
    {
      success: !allFailed,
      partial: nextSince !== null,
      nextSince,
      upserted,
      since,
      until,
      errors,
      error: allFailed ? errors.map((e) => `${e.account}: ${e.error}`).join(" | ") : undefined,
      message:
        `Synced ${upserted} ad-day rows for ${since} → ${doneUntil}.` +
        (nextSince ? ` Time budget reached; continue from ${nextSince}.` : ""),
    },
    { status: allFailed ? 502 : 200 }
  );
}

// Vercel Cron issues GET requests.
export async function GET(req: NextRequest) {
  return POST(req);
}
