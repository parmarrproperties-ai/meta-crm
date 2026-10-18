"use client";

/** Browser-side helper: remembers the admin key and adds it to write requests. */

const STORAGE_KEY = "bot_admin_key";

export function getAdminKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAdminKey(key: string) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* private mode: ask again next time */
  }
}

/** fetch() with the admin key; asks for it once if missing or wrong. */
export async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let key = getAdminKey();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!key) {
      key = window.prompt("Enter your BOT_ADMIN_KEY (set in Vercel environment variables):")?.trim() ?? "";
      if (!key) break;
      setAdminKey(key);
    }
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}), "x-admin-key": key },
    });
    if (res.status !== 401) return res;
    key = "";
    setAdminKey("");
  }
  return new Response(JSON.stringify({ success: false, error: "Admin key required" }), { status: 401 });
}
