/**
 * Meta Marketing API (Graph API) client.
 *
 * Design notes (why the numbers can differ from Ads Manager, and what we do):
 *  - One request per account/date-range with `time_increment=1` so each row is
 *    a full day for the ad account's own timezone (what Ads Manager shows).
 *  - `use_unified_attribution_setting=true` so conversions follow each ad
 *    set's configured attribution window, like Ads Manager does.
 *  - Clicks/CTR/CPC are *link* clicks (Ads Manager's default columns), not
 *    "all clicks". Derived ratios are computed from the raw sums so they
 *    aggregate correctly everywhere else in the app.
 *  - "Results" = first action type present from a configurable priority list.
 *  - Transient errors / rate limits are retried with backoff.
 */

const API_VERSION = process.env.META_API_VERSION || "v23.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export interface MetaAdInsight {
  /** Calendar day (YYYY-MM-DD) in the ad account's timezone. */
  date: string;
  account_id: string;
  account_name: string;
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  spend: number;
  impressions: number;
  /** Link clicks (falls back to all clicks if Meta returns none). */
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  results: number;
  cost_per_result: number;
}

interface RawInsightAction {
  action_type: string;
  value: string;
}

interface RawInsight {
  date_start: string;
  account_id: string;
  account_name: string;
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: RawInsightAction[];
}

/**
 * Ordered list of action types that count as a "result". The first one with a
 * non-zero count wins. Override globally with META_RESULT_ACTION_TYPES
 * (comma separated) or per account via `result_action_types` in
 * META_AD_ACCOUNTS. Check Ads Manager → the column breakdown → "Results" for
 * the exact event your campaigns optimise for.
 */
const DEFAULT_RESULT_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.messaging_conversation_started_7d",
];

export function parseActionTypes(value: string | string[] | undefined | null): string[] {
  const list = Array.isArray(value) ? value : (value ?? "").split(",");
  return list.map((s) => s.trim()).filter(Boolean);
}

const GLOBAL_RESULT_ACTION_TYPES = (() => {
  const configured = parseActionTypes(
    process.env.META_RESULT_ACTION_TYPES ?? process.env.META_RESULT_ACTION_TYPE
  );
  return configured.length > 0 ? configured : DEFAULT_RESULT_ACTION_TYPES;
})();

function pickResults(actions: RawInsightAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  for (const type of types) {
    const match = actions.find((a) => a.action_type === type);
    const n = match ? Number(match.value) : 0;
    if (n > 0) return Math.round(n);
  }
  return 0;
}

export class MetaApiError extends Error {
  constructor(message: string, public code?: number, public status?: number) {
    super(message);
    this.name = "MetaApiError";
  }
}

const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new MetaApiError("Missing META_ACCESS_TOKEN.");
  return token;
}

/** GET a Graph API URL with auth header, retrying transient failures. */
async function graphGet<T = any>(url: string, maxAttempts = 4): Promise<T> {
  const token = getToken();
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        lastError = new MetaApiError(`Non-JSON response from Meta (HTTP ${res.status})`, undefined, res.status);
        if (res.status >= 500) continue;
        throw lastError;
      }

      if (json.error) {
        const err = new MetaApiError(
          `Meta API error ${json.error.code}${json.error.error_subcode ? `/${json.error.error_subcode}` : ""}: ${json.error.message}`,
          json.error.code,
          res.status
        );
        lastError = err;
        if (RETRYABLE_CODES.has(json.error.code) || json.error.is_transient || res.status >= 500) continue;
        throw err;
      }
      if (!res.ok) {
        lastError = new MetaApiError(`Meta API HTTP ${res.status}`, undefined, res.status);
        if (res.status >= 500 || res.status === 429) continue;
        throw lastError;
      }
      return json as T;
    } catch (err) {
      if (err instanceof MetaApiError) {
        // Non-retryable errors were thrown above; retryable ones `continue`d.
        if (!(RETRYABLE_CODES.has(err.code ?? -1) || (err.status ?? 0) >= 500 || err.status === 429)) throw err;
        lastError = err;
      } else {
        lastError = err; // network error → retry
      }
    }
  }
  throw lastError instanceof Error ? lastError : new MetaApiError("Meta API request failed");
}

export function normalizeAccountId(accountId: string): string {
  return /^\d+$/.test(accountId) ? `act_${accountId}` : accountId;
}

export interface FetchInsightsOptions {
  /** Override the result action-type priority list for this account. */
  resultActionTypes?: string[];
}

/**
 * Fetch daily ad-level insights for an inclusive date range.
 * Returns one row per ad per day (days with no delivery are not returned by Meta).
 */
export async function fetchAdInsights(
  since: string, // YYYY-MM-DD
  until: string, // YYYY-MM-DD
  accountId: string,
  options: FetchInsightsOptions = {}
): Promise<MetaAdInsight[]> {
  if (!accountId) throw new MetaApiError("Missing accountId for Meta API fetch.");
  const resultTypes =
    options.resultActionTypes && options.resultActionTypes.length > 0
      ? options.resultActionTypes
      : GLOBAL_RESULT_ACTION_TYPES;

  const fields = [
    "account_id",
    "account_name",
    "ad_id",
    "ad_name",
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "spend",
    "impressions",
    "clicks",
    "inline_link_clicks",
    "actions",
  ].join(",");

  const params = new URLSearchParams({
    fields,
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    use_unified_attribution_setting: "true",
    limit: "500",
  });

  const out: MetaAdInsight[] = [];
  let url = `${BASE_URL}/${normalizeAccountId(accountId)}/insights?${params.toString()}`;

  while (url) {
    const json = await graphGet<{ data?: RawInsight[]; paging?: { next?: string } }>(url);

    for (const raw of json.data ?? []) {
      const spend = parseFloat(raw.spend ?? "0") || 0;
      const impressions = parseInt(raw.impressions ?? "0", 10) || 0;
      const linkClicks = parseInt(raw.inline_link_clicks ?? "", 10);
      const clicks = Number.isFinite(linkClicks) ? linkClicks : parseInt(raw.clicks ?? "0", 10) || 0;
      const results = pickResults(raw.actions, resultTypes);

      out.push({
        date: raw.date_start,
        account_id: raw.account_id,
        account_name: raw.account_name,
        ad_id: raw.ad_id,
        ad_name: raw.ad_name,
        campaign_id: raw.campaign_id,
        campaign_name: raw.campaign_name,
        adset_id: raw.adset_id,
        adset_name: raw.adset_name,
        spend,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        results,
        cost_per_result: results > 0 ? spend / results : 0,
      });
    }

    url = json.paging?.next ?? "";
  }

  return out;
}

export interface MetaLead {
  id: string;
  created_time: string;
  ad_id: string;
  ad_name: string;
  form_id: string;
  campaign_name: string;
  field_data: Record<string, string>;
}

/**
 * Fetch leads for one ad. Pass `sinceUnix` to only get leads created after
 * that time (server-side filter) instead of re-downloading the full history.
 * Requires the `leads_retrieval` permission. Errors propagate to the caller so
 * they can be reported instead of silently producing "0 leads".
 */
export async function fetchLeadDetails(adId: string, sinceUnix?: number): Promise<MetaLead[]> {
  if (!adId) throw new MetaApiError("Missing adId for Meta Leads API fetch.");

  const params = new URLSearchParams({
    fields: ["id", "created_time", "ad_id", "ad_name", "form_id", "campaign_name", "field_data"].join(","),
    limit: "500",
  });
  if (sinceUnix) {
    params.set(
      "filtering",
      JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(sinceUnix) }])
    );
  }

  const all: MetaLead[] = [];
  let url = `${BASE_URL}/${adId}/leads?${params.toString()}`;

  while (url) {
    const json = await graphGet<{ data?: any[]; paging?: { next?: string } }>(url);

    for (const raw of json.data ?? []) {
      const fieldData: Record<string, string> = {};
      if (Array.isArray(raw.field_data)) {
        for (const field of raw.field_data) {
          fieldData[field.name] = field.values?.[0] ?? "";
        }
      }
      all.push({
        id: raw.id,
        created_time: raw.created_time,
        ad_id: raw.ad_id || adId,
        ad_name: raw.ad_name || "",
        form_id: raw.form_id || "",
        campaign_name: raw.campaign_name || "",
        field_data: fieldData,
      });
    }

    url = json.paging?.next ?? "";
  }

  return all;
}
