/**
 * CSV helpers shared by the server (daily email) and the browser (export).
 */

const PHONE_LIKE = /^\+?[\d\s\-().]+$/;

/**
 * Quote one CSV cell and neutralise spreadsheet formula injection:
 * a value starting with = + - @ (or tab/CR) would be executed by Excel/Sheets,
 * so it is prefixed with an apostrophe. Plain phone numbers are left alone.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !PHONE_LIKE.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/** Escape text for safe interpolation into HTML (emails). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
