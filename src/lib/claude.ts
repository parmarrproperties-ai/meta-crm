/**
 * Claude (Anthropic) API client for generating weekly narrative summaries.
 * Phase 5 — only called from the weekly report computation route.
 */

export interface WeeklyNarrativeInput {
  weekStart: string;
  weekEnd: string;
  totalSpend: number;
  totalResults: number;
  avgCTR: number;
  avgCPA: number;
  spendChangePct: number | null;
  cpaChangePct: number | null;
  resultsChangePct: number | null;
  topAds: Array<{ ad_name: string; results: number; cost_per_result: number }>;
  bottomAds: Array<{ ad_name: string; spend: number; results: number }>;
}

/**
 * Generate a 3-4 sentence analyst-style weekly summary using Claude.
 * Returns null if ANTHROPIC_API_KEY is not set (graceful degradation).
 */
export async function generateWeeklyNarrative(
  data: WeeklyNarrativeInput
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn("[Claude] ANTHROPIC_API_KEY not set — skipping AI narrative.");
    return null;
  }

  const pctStr = (v: number | null) =>
    v === null ? "N/A" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

  const prompt = `You are a concise performance marketing analyst. Given these week-over-week Meta Ads metrics, write a 3-4 sentence analyst-style summary. Highlight the most important trend and give one specific, actionable suggestion. Be direct and data-driven. Do not use bullet points or headers — write in flowing sentences.

Week: ${data.weekStart} to ${data.weekEnd}
Total Spend: ₹${data.totalSpend.toFixed(0)} (${pctStr(data.spendChangePct)} vs last week)
Total Results: ${data.totalResults} (${pctStr(data.resultsChangePct)} vs last week)
Average CPA: ₹${data.avgCPA.toFixed(0)} (${pctStr(data.cpaChangePct)} vs last week)
Average CTR: ${data.avgCTR.toFixed(2)}%

Top performing ads (by results):
${data.topAds.map((a) => `- ${a.ad_name}: ${a.results} results at ₹${a.cost_per_result.toFixed(0)} per result`).join("\n")}

Underperforming ads (high spend, low results):
${data.bottomAds.map((a) => `- ${a.ad_name}: ₹${a.spend.toFixed(0)} spend, ${a.results} results`).join("\n")}

Write the summary now:`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("[Claude] API error:", err);
      return null;
    }

    const json = await res.json();
    const text = json.content?.[0]?.text;
    return text ?? null;
  } catch (err) {
    console.error("[Claude] Fetch error:", err);
    return null;
  }
}
