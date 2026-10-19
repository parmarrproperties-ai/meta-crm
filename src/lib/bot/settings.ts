/**
 * Bot-wide switches stored in the `bot_settings` table, so they can be
 * flipped from the dashboard without a redeploy.
 *
 * "paused": the bot sends nothing automatically (welcomes, replies,
 * follow-ups). Incoming messages are still saved and flagged for you, and
 * manual replies from the dashboard still work.
 */

import { supabase } from "@/lib/supabase";

let cache: { paused: boolean; at: number } | null = null;

export async function isBotPaused(): Promise<boolean> {
  if (cache && Date.now() - cache.at < 5_000) return cache.paused;
  const { data, error } = await supabase.from("bot_settings").select("value").eq("key", "paused").maybeSingle();
  // Table not created yet → behave as before (not paused).
  const paused = !error && data?.value === true;
  cache = { paused, at: Date.now() };
  return paused;
}

export async function setBotPaused(paused: boolean): Promise<void> {
  const { error } = await supabase
    .from("bot_settings")
    .upsert({ key: "paused", value: paused, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    throw new Error(
      /bot_settings/.test(error.message)
        ? "Run the latest supabase/setup_whatsapp_bot.sql in Supabase first (it adds the bot_settings table)."
        : error.message
    );
  }
  cache = { paused, at: Date.now() };
}
