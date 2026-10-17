/**
 * The dashboard has no login, so actions that send WhatsApp messages or change
 * what the bot says need BOT_ADMIN_KEY (sent as the x-admin-key header). If
 * the key isn't set, those actions are switched off.
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export function requireAdmin(req: NextRequest): NextResponse | null {
  const key = process.env.BOT_ADMIN_KEY;
  if (!key) {
    return NextResponse.json({ success: false, error: "Set BOT_ADMIN_KEY in your environment variables to enable this." }, { status: 503 });
  }
  const given = req.headers.get("x-admin-key") ?? "";
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(key).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ success: false, error: "Wrong admin key" }, { status: 401 });
  }
  return null;
}

/** Cron routes: if CRON_SECRET is set (Vercel sends it automatically), require it. */
export function requireCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return null;
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}
