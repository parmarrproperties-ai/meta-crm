/**
 * POST /api/bot/setup-sheet — creates the "Leads" tab, header row and the
 * "Your Status" dropdown, then fills the Sheet with every existing chat.
 * Needs the x-admin-key header. Safe to run again.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/bot/adminAuth";
import { setupSheet, sheetsConfigured } from "@/lib/bot/sheets";
import { syncSheet } from "@/lib/bot/engine";
import { supabase } from "@/lib/supabase";
import type { Conversation } from "@/lib/bot/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!sheetsConfigured()) {
    return NextResponse.json(
      { success: false, error: "Set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY first." },
      { status: 400 }
    );
  }
  try {
    const { created } = await setupSheet();
    const { data } = await supabase.from("wa_conversations").select("*").eq("sheet_dirty", true).limit(150);
    const deadline = Date.now() + 40_000;
    let synced = 0;
    for (const c of (data ?? []) as Conversation[]) {
      if (Date.now() > deadline) break;
      await syncSheet(c);
      synced++;
    }
    return NextResponse.json({ success: true, tabCreated: created, rowsSynced: synced });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
