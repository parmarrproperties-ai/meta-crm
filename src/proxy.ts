/**
 * Next.js Proxy: single choke point for authentication.
 *
 *  - /dashboard/*  → needs the dashboard session cookie
 *  - /api/*        → needs the session cookie OR `Authorization: Bearer $CRON_SECRET`
 *                    (Vercel Cron sends that header automatically when CRON_SECRET is set)
 *  - /api/auth/login is public (it is how you obtain the cookie)
 *
 * Fail-closed: in production, if DASHBOARD_PASSWORD is not configured
 * everything is blocked instead of silently exposing lead data.
 * Outside production, an unset password keeps local dev open.
 */

import { NextRequest, NextResponse } from "next/server";
import { safeEqual, sessionToken } from "@/lib/auth";

const PUBLIC_API_PATHS = new Set(["/api/auth/login"]);

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");

  if (PUBLIC_API_PATHS.has(pathname)) return NextResponse.next();

  // Cron / machine-to-machine access
  const cronSecret = process.env.CRON_SECRET;
  if (isApi && cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (safeEqual(auth, `Bearer ${cronSecret}`)) return NextResponse.next();
  }

  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    const body = { error: "Server auth is not configured (DASHBOARD_PASSWORD missing)." };
    return isApi
      ? NextResponse.json(body, { status: 503 })
      : new NextResponse(body.error, { status: 503 });
  }

  const cookie = req.cookies.get("dashboard_auth")?.value ?? "";
  if (cookie && safeEqual(cookie, await sessionToken(password))) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
