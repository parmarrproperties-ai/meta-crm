/* eslint-disable @typescript-eslint/no-explicit-any -- untyped JSON from Meta/Google APIs */
/**
 * Gemini client with model rotation.
 *
 * Each Gemini model has its own free-tier rate limit, so the bot tries the
 * models in GEMINI_MODELS in order. A model that answers 429 (rate limited) is
 * put on cooldown in the `llm_model_state` table, so every serverless request
 * skips it until the cooldown ends, and the next model is tried. If every
 * model fails, callers get null and fall back to fixed replies.
 *
 * Gemma models (high free limits) don't support system instructions or JSON
 * mode through the API, so for them the rules go in the prompt and the JSON
 * is parsed out of the text.
 */

import { supabase } from "@/lib/supabase";
import { LLM_CALLS_PER_DAY } from "@/lib/bot/config";

const DEFAULT_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemma-3-27b-it",
  "gemma-3-12b-it",
];

export function configuredModels(): string[] {
  const list = (process.env.GEMINI_MODELS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_MODELS;
}

export function llmConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export interface JsonCallInput {
  system: string;
  user: string;
  /** Gemini response schema (OpenAPI subset). */
  schema: Record<string, unknown>;
  leadId?: string;
  maxOutputTokens?: number;
}

export interface JsonCallResult {
  data: Record<string, unknown>;
  model: string;
}

async function cooldowns(): Promise<Map<string, number>> {
  const { data } = await supabase.from("llm_model_state").select("model, cooldown_until");
  const m = new Map<string, number>();
  for (const r of data ?? []) if (r.cooldown_until) m.set(r.model, new Date(r.cooldown_until).getTime());
  return m;
}

async function setCooldown(model: string, ms: number, error: string) {
  await supabase.from("llm_model_state").upsert(
    { model, cooldown_until: new Date(Date.now() + ms).toISOString(), last_error: error.slice(0, 500), updated_at: new Date().toISOString() },
    { onConflict: "model" }
  );
}

async function logUsage(model: string | null, ok: boolean, leadId?: string, error?: string) {
  await supabase.from("llm_usage").insert({ model, ok, lead_id: leadId ?? null, error: error?.slice(0, 500) ?? null });
}

async function callsToday(): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabase.from("llm_usage").select("id", { count: "exact", head: true }).gte("created_at", since);
  return count ?? 0;
}

/** Pull the first JSON object out of a model's text answer. */
function parseJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(cleaned.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** How long to rest a model after an error, or null to just try the next one. */
function cooldownFor(status: number, body: any): number | null {
  const msg = JSON.stringify(body ?? {}).toLowerCase();
  if (status === 429) {
    if (msg.includes("perday") || msg.includes("per_day") || msg.includes("per day")) return 60 * 60_000;
    const delay = body?.error?.details?.find?.((d: any) => d?.retryDelay)?.retryDelay;
    const secs = typeof delay === "string" ? parseFloat(delay) : NaN;
    return Number.isFinite(secs) ? Math.max(10, secs) * 1000 : 60_000;
  }
  if (status === 404) return 24 * 3600_000; // model retired / not available on this key
  if (status === 400 && (msg.includes("not supported") || msg.includes("not found") || msg.includes("not enabled"))) {
    return 24 * 3600_000;
  }
  if (status === 401 || status === 403) return 10 * 60_000;
  if (status >= 500) return 30_000;
  return null;
}

export async function generateJson(input: JsonCallInput): Promise<JsonCallResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  if ((await callsToday()) >= LLM_CALLS_PER_DAY) {
    console.warn("[llm] daily cap reached");
    return null;
  }

  const rest = await cooldowns();
  const now = Date.now();
  const models = configuredModels().filter((m) => (rest.get(m) ?? 0) <= now);
  if (models.length === 0) {
    await logUsage(null, false, input.leadId, "all models cooling down");
    return null;
  }

  const deadline = Date.now() + 30_000; // keep the webhook well inside its time limit
  for (const model of models) {
    if (Date.now() > deadline) break;
    const isGemma = model.startsWith("gemma");
    const body: Record<string, unknown> = isGemma
      ? {
          contents: [
            {
              role: "user",
              parts: [{ text: `${input.system}\n\nRespond with ONLY one JSON object and nothing else.\n\n${input.user}` }],
            },
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: input.maxOutputTokens ?? 512 },
        }
      : {
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: [{ text: input.user }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: input.maxOutputTokens ?? 512,
            responseMimeType: "application/json",
            responseSchema: input.schema,
            // Flash 2.5 "thinks" by default; not needed for classification.
            ...(model.includes("2.5-flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(12_000, Math.max(3_000, deadline - Date.now())));
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: "no-store",
        }
      ).finally(() => clearTimeout(timer));
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const err = json?.error?.message || `HTTP ${res.status}`;
        const ms = cooldownFor(res.status, json);
        if (ms) await setCooldown(model, ms, err);
        await logUsage(model, false, input.leadId, err);
        console.warn(`[llm] ${model} failed (${res.status}): ${err}`);
        continue;
      }

      const candidate = json?.candidates?.[0];
      const text: string = (candidate?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
      const data = parseJson(text);
      if (!data) {
        await logUsage(model, false, input.leadId, `unparseable output (${candidate?.finishReason ?? "?"})`);
        continue;
      }
      await logUsage(model, true, input.leadId);
      return { data, model };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await setCooldown(model, 30_000, msg);
      await logUsage(model, false, input.leadId, msg);
    }
  }
  return null;
}
