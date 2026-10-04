/**
 * Lead sync: Meta lead-gen API → `leads` table.
 *
 * Which ads: every ad that actually delivered recently (from daily_ad_snapshots),
 *   NOT just ads that already show "results" – those numbers lag and depend on
 *   the configured result action type, so filtering on them drops real leads.
 * Which leads: only those created after a cutoff (server-side `time_created`
 *   filter) instead of re-downloading each ad's entire history every run.
 * How: a small worker pool under a time budget, so a big account can't make the
 *   serverless function time out silently. Anything not reached is reported as
 *   `partial` and gets picked up by the next run (upserts are idempotent).
 * Errors: collected per ad and returned – never swallowed into "0 leads".
 * Status: never written here, so statuses set in the CRM survive re-syncs.
 */

import { fetchLeadDetails } from "@/lib/meta";
import { supabase } from "@/lib/supabase";
import { addDays, todayInTz } from "@/lib/dates";
import { chunk, fetchAllRows } from "@/lib/supabasePaged";

export interface LeadSyncOptions {
  /** Only fetch leads created in the last N days. null = entire history. */
  lookbackDays: number | null;
  /** Only consider ads that delivered in the last N days. null = every ad ever. */
  adWindowDays: number | null;
  /** Stop starting new ads after this many ms. */
  budgetMs?: number;
  concurrency?: number;
  /** Skip the first N ads (continuation of a previous partial run). */
  offset?: number;
}

export interface LeadSyncResult {
  adsTotal: number;
  adsProcessed: number;
  totalSynced: number;
  newLeadsCount: number;
  partial: boolean;
  /** When partial: pass as `offset` to continue where this run stopped. */
  nextOffset: number | null;
  errors: { ad_id: string; error: string }[];
}

interface AdRef {
  ad_id: string;
  project_name: string;
}

async function listActiveAds(adWindowDays: number | null): Promise<AdRef[]> {
  const rows = await fetchAllRows<{ ad_id: string; project_name: string; snapshot_date: string }>((from, to) => {
    let q = supabase
      .from("daily_ad_snapshots")
      .select("ad_id, project_name, snapshot_date")
      .gt("impressions", 0)
      .order("snapshot_date", { ascending: false })
      .order("id");
    if (adWindowDays !== null) q = q.gte("snapshot_date", addDays(todayInTz(), -(adWindowDays - 1)));
    return q.range(from, to);
  });

  // Newest first, so the first sighting of an ad gives its latest project name
  // and the most recently active ads are synced first.
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (r.ad_id && !seen.has(r.ad_id)) seen.set(r.ad_id, r.project_name);
  }
  return Array.from(seen, ([ad_id, project_name]) => ({ ad_id, project_name }));
}

export async function syncLeads(opts: LeadSyncOptions): Promise<LeadSyncResult> {
  const { lookbackDays, adWindowDays, budgetMs = 50_000, concurrency = 6, offset = 0 } = opts;
  const deadline = Date.now() + budgetMs;
  const sinceUnix = lookbackDays === null ? undefined : Math.floor(Date.now() / 1000) - lookbackDays * 86_400;

  const allAds = await listActiveAds(adWindowDays);
  const start = Math.min(Math.max(0, offset), allAds.length);
  const ads = allAds.slice(start);
  const result: LeadSyncResult = {
    adsTotal: allAds.length,
    adsProcessed: 0,
    totalSynced: 0,
    newLeadsCount: 0,
    partial: false,
    nextOffset: null,
    errors: [],
  };

  let next = 0;
  const worker = async () => {
    while (true) {
      if (Date.now() > deadline) {
        result.partial = true;
        return;
      }
      const idx = next++;
      if (idx >= ads.length) return;
      const { ad_id, project_name } = ads[idx];

      try {
        const leads = await fetchLeadDetails(ad_id, sinceUnix);
        if (leads.length > 0) {
          const rows = leads.map((l) => ({
            lead_id: l.id,
            created_time: l.created_time,
            ad_id: l.ad_id,
            ad_name: l.ad_name,
            campaign_name: l.campaign_name,
            project_name,
            form_id: l.form_id,
            field_data: l.field_data,
          }));

          const existing = new Set<string>();
          for (const ids of chunk(rows.map((r) => r.lead_id), 200)) {
            const { data, error } = await supabase.from("leads").select("lead_id").in("lead_id", ids);
            if (error) throw new Error(error.message);
            for (const r of data ?? []) existing.add(r.lead_id);
          }

          for (const batch of chunk(rows, 500)) {
            const { error } = await supabase.from("leads").upsert(batch, { onConflict: "lead_id" });
            if (error) throw new Error(error.message);
          }

          result.totalSynced += rows.length;
          result.newLeadsCount += rows.filter((r) => !existing.has(r.lead_id)).length;
        }
        result.adsProcessed++;
      } catch (err) {
        result.errors.push({ ad_id, error: err instanceof Error ? err.message : String(err) });
        result.adsProcessed++;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  if (result.partial) result.nextOffset = start + Math.min(next, ads.length);
  result.adsProcessed += start; // report progress against the full list

  if (result.errors.length > 0) {
    console.error(`[leadSync] ${result.errors.length} ad(s) failed`, result.errors.slice(0, 5));
  }
  return result;
}

/** Shape the sync result as an API response body. */
export function leadSyncResponse(r: LeadSyncResult) {
  const allFailed = r.adsTotal > 0 && r.errors.length === r.adsProcessed && r.adsProcessed > 0;
  return {
    success: !allFailed,
    upserted: r.totalSynced,
    totalSynced: r.totalSynced,
    newLeadsCount: r.newLeadsCount,
    adsTotal: r.adsTotal,
    adsProcessed: r.adsProcessed,
    partial: r.partial,
    nextOffset: r.nextOffset,
    errorCount: r.errors.length,
    errors: r.errors.slice(0, 10),
    error: allFailed ? `All ${r.errors.length} ad(s) failed: ${r.errors[0]?.error}` : undefined,
    message:
      `Synced ${r.totalSynced} leads (${r.newLeadsCount} new) from ${r.adsProcessed}/${r.adsTotal} ads` +
      (r.partial ? " – time budget reached, run again to continue" : "") +
      (r.errors.length ? ` – ${r.errors.length} ad(s) failed` : "") +
      ".",
  };
}
