/**
 * POST /api/auth/login
 *
 * Validates the dashboard password and sets an HTTP-only session cookie.
 * The cookie holds a derived token, never the password itself.
 * Failed attempts are rate-limited per IP (best-effort, per server instance).
 */

import { NextRequest, NextResponse } from "next/server";
import { safeEqual, sessionToken } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();
  const entry = attempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) } }
    );
  }

  let password = "";
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const correctPassword = process.env.DASHBOARD_PASSWORD;
  if (!correctPassword || typeof password !== "string" || !safeEqual(password, correctPassword)) {
    const fresh = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS };
    fresh.count += 1;
    attempts.set(ip, fresh);
    return NextResponse.json({ success: false }, { status: 401 });
  }

  attempts.delete(ip);
  const res = NextResponse.json({ success: true });
  res.cookies.set("dashboard_auth", await sessionToken(correctPassword), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}
