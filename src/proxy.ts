/**
 * Next.js Proxy — password-gate the /dashboard routes.
 *
 * Set DASHBOARD_PASSWORD in .env.local to enable.
 * If not set, the dashboard is open (useful for local dev).
 */

import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;

  // No password set = open access (dev mode)
  if (!password) return NextResponse.next();

  const pathname = req.nextUrl.pathname;

  // Only protect dashboard routes
  if (!pathname.startsWith("/dashboard")) return NextResponse.next();

  // Check the auth cookie
  const authCookie = req.cookies.get("dashboard_auth");
  if (authCookie?.value === password) return NextResponse.next();

  // Redirect to login page
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
