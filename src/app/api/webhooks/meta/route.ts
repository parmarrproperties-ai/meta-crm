/**
 * Meta webhook (lead forms + WhatsApp). Set this URL as the callback in your
 * Meta app for both the "Page → leadgen" and "WhatsApp → messages" webhooks:
 *   https://<your-domain>/api/webhooks/meta
 *
 * GET  — Meta's one-time verification (hub.verify_token must equal META_WEBHOOK_VERIFY_TOKEN).
 * POST — events. The signature is checked with META_APP_SECRET, we answer 200
 *        straight away (Meta retries slow responses) and do the work after.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { processWebhook, verifySignature } from "@/lib/bot/webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (expected && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === expected) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    console.warn("[webhook] rejected: bad or missing signature (check META_APP_SECRET)");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  after(() => processWebhook(payload).catch((err) => console.error("[webhook] processing failed:", err)));
  return NextResponse.json({ received: true });
}
