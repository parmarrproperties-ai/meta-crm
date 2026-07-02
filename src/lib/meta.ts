/**
 * Meta Marketing API (Graph API) client.
 * Fetches ad-level insights for a given date range.
 */

const BASE_URL = "https://graph.facebook.com/v20.0";

export interface MetaAdInsight {
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  spend: number;
  impressions: number;
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
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: RawInsightAction[];
  cost_per_action_type?: RawInsightAction[];
}

interface MetaApiResponse {
  data: RawInsight[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
  error?: { message: string; code: number };
}

/**
 * The conversion event you're optimising for.
 * Common values: "lead", "purchase", "complete_registration", "contact"
 * Check your Meta Events Manager for the exact event type name.
 */
const RESULT_ACTION_TYPE = process.env.META_RESULT_ACTION_TYPE ?? "lead";

function parseActions(
  actions: RawInsightAction[] | undefined,
  actionType: string
): number {
  if (!actions) return 0;
  const match = actions.find((a) => a.action_type === actionType);
  return match ? parseInt(match.value, 10) : 0;
}

function parseCostPerAction(
  costActions: RawInsightAction[] | undefined,
  actionType: string
): number {
  if (!costActions) return 0;
  const match = costActions.find((a) => a.action_type === actionType);
  return match ? parseFloat(match.value) : 0;
}

/**
 * Fetch ad insights for a specific date from Meta Marketing API.
 * Automatically handles pagination to return all ads.
 */
export async function fetchAdInsights(
  date: string, // YYYY-MM-DD
  accountId: string
): Promise<MetaAdInsight[]> {
  const token = process.env.META_ACCESS_TOKEN;

  if (!token || !accountId) {
    throw new Error(
      "Missing META_ACCESS_TOKEN or accountId for Meta API fetch."
    );
  }

  const fields = [
    "ad_id",
    "ad_name",
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "actions",
    "cost_per_action_type",
  ].join(",");

  const params = new URLSearchParams({
    fields,
    level: "ad",
    time_range: JSON.stringify({ since: date, until: date }),
    access_token: token,
    limit: "500",
  });

  const allInsights: MetaAdInsight[] = [];
  let url = `${BASE_URL}/${accountId}/insights?${params.toString()}`;

  // Paginate through all results
  while (url) {
    const res = await fetch(url);
    const json: MetaApiResponse = await res.json();

    if (json.error) {
      throw new Error(
        `Meta API error ${json.error.code}: ${json.error.message}`
      );
    }

    for (const raw of json.data ?? []) {
      const spend = parseFloat(raw.spend ?? "0");
      const results = parseActions(raw.actions, RESULT_ACTION_TYPE);
      const costPerResult =
        parseCostPerAction(raw.cost_per_action_type, RESULT_ACTION_TYPE) ||
        (results > 0 ? spend / results : 0);

      allInsights.push({
        ad_id: raw.ad_id,
        ad_name: raw.ad_name,
        campaign_id: raw.campaign_id,
        campaign_name: raw.campaign_name,
        adset_id: raw.adset_id,
        adset_name: raw.adset_name,
        spend,
        impressions: parseInt(raw.impressions ?? "0", 10),
        clicks: parseInt(raw.clicks ?? "0", 10),
        ctr: parseFloat(raw.ctr ?? "0"),
        cpc: parseFloat(raw.cpc ?? "0"),
        cpm: parseFloat(raw.cpm ?? "0"),
        results,
        cost_per_result: costPerResult,
      });
    }

    url = json.paging?.next ?? "";
  }

  return allInsights;
}
