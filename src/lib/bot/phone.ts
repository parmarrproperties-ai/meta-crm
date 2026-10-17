/** Phone and name helpers for Meta lead-form data. */

const DEFAULT_CC = (process.env.DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "");

/**
 * Normalise a phone number to the digits-only international form WhatsApp
 * uses (e.g. "+91 98765-43210" → "919876543210"). Returns null if it can't be
 * a valid number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  const hadPlus = s.startsWith("+") || s.startsWith("00");
  let d = s.replace(/\D/g, "");
  if (s.startsWith("00")) d = d.slice(2);
  if (!d) return null;

  if (!hadPlus) {
    if (d.length === 11 && d.startsWith("0")) d = DEFAULT_CC + d.slice(1);
    else if (d.length === 10) d = DEFAULT_CC + d;
  }
  if (d.length < 10 || d.length > 15) return null;
  // Indian mobile numbers start with 6-9.
  if (d.startsWith("91") && d.length === 12 && !/^91[6-9]/.test(d)) return null;
  s = d;
  return s;
}

function pick(fields: Record<string, string>, test: (key: string) => boolean): string {
  for (const [k, v] of Object.entries(fields)) {
    if (v && test(k.toLowerCase())) return v;
  }
  return "";
}

export function leadPhone(fields: Record<string, string> | null | undefined): string | null {
  const f = fields || {};
  const raw =
    f["phone_number"] ||
    f["phone"] ||
    f["whatsapp_number"] ||
    pick(f, (k) => k.includes("whatsapp")) ||
    pick(f, (k) => k.includes("phone") || k.includes("mobile") || k.includes("contact_number"));
  return normalizePhone(raw);
}

export function leadName(fields: Record<string, string> | null | undefined): string {
  const f = fields || {};
  const full =
    f["full_name"] ||
    f["name"] ||
    [f["first_name"], f["last_name"]].filter(Boolean).join(" ") ||
    pick(f, (k) => k.includes("name") && !k.includes("company"));
  return full.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Numbers that receive alerts and must never be treated as leads. */
export function ownerNumbers(): string[] {
  const raw = process.env.BOT_ALERT_NUMBERS || process.env.WHATSAPP_RECIPIENT_NUMBER || "";
  return raw
    .split(",")
    .map((n) => {
      const d = n.replace(/\D/g, "");
      // Stored without "+" by convention; 10 digits means no country code yet.
      return d.length === 10 ? normalizePhone(d) : normalizePhone(`+${d}`);
    })
    .filter((n): n is string => !!n);
}
