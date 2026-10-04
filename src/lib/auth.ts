/**
 * Shared auth helpers. Edge-runtime safe (Web Crypto only) because the
 * proxy imports this file.
 */

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive the session cookie value from the dashboard password.
 * The raw password never goes into the cookie. Set AUTH_SECRET to rotate
 * all sessions without changing the password.
 */
export async function sessionToken(password: string): Promise<string> {
  const keyMaterial = process.env.AUTH_SECRET || password;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(keyMaterial),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`meta-crm:dashboard-session:${password}`)
  );
  return toHex(sig);
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Only allow same-site relative redirects after login. */
export function safeRedirectPath(from: string | null | undefined): string {
  if (!from || !from.startsWith("/") || from.startsWith("//") || from.includes("\\")) {
    return "/dashboard";
  }
  return from;
}
