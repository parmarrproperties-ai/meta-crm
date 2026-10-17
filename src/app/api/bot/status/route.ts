/**
 * GET /api/bot/status — setup checklist: which settings are present (never
 * their values), AI model cooldowns and today's usage.
 */

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { configuredModels } from "@/lib/bot/llm";
import { TEMPLATES } from "@/lib/bot/config";

export const dynamic = "force-dynamic";

const has = (k: string) => !!process.env[k];

export async function GET() {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [models, usage, convs] = await Promise.all([
    supabase.from("llm_model_state").select("model, cooldown_until, last_error"),
    supabase.from("llm_usage").select("ok").gte("created_at", since).limit(5000),
    supabase.from("wa_conversations").select("lead_id", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    success: true,
    database: convs.error ? `error: ${convs.error.message} (did you run supabase/setup_whatsapp_bot.sql?)` : "ok",
    checklist: {
      whatsapp: has("WHATSAPP_ACCESS_TOKEN") && has("WHATSAPP_PHONE_NUMBER_ID"),
      webhookVerifyToken: has("META_WEBHOOK_VERIFY_TOKEN"),
      webhookSignatureSecret: has("META_APP_SECRET"),
      leadAccessToken: has("META_PAGE_ACCESS_TOKEN") || has("META_ACCESS_TOKEN"),
      gemini: has("GEMINI_API_KEY"),
      googleSheet: has("GOOGLE_SHEET_ID") && has("GOOGLE_SERVICE_ACCOUNT_EMAIL") && has("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
      adminKey: has("BOT_ADMIN_KEY"),
      ownerAlertsWhatsApp: has("BOT_ALERT_NUMBERS") || has("WHATSAPP_RECIPIENT_NUMBER"),
      ownerAlertsEmail: has("RESEND_API_KEY") && has("ALERT_EMAIL_ADDRESS"),
      botEnabled: process.env.WA_BOT_ENABLED !== "false",
    },
    templates: TEMPLATES,
    models: configuredModels().map((m) => {
      const s = models.data?.find((r) => r.model === m);
      const cooling = s?.cooldown_until && new Date(s.cooldown_until).getTime() > Date.now();
      return { model: m, status: cooling ? `cooling down until ${s!.cooldown_until}` : "ready", lastError: s?.last_error ?? null };
    }),
    aiCallsLast24h: {
      total: usage.data?.length ?? 0,
      failed: (usage.data ?? []).filter((r) => !r.ok).length,
    },
    conversations: convs.count ?? 0,
  });
}
