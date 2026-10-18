/* eslint-disable @typescript-eslint/no-explicit-any -- untyped JSON from Meta/Google APIs */
/**
 * Google Sheets sync: one row per lead, updated as the bot learns more.
 *
 * Auth: a Google Cloud service account (no extra npm package; the JWT is
 * signed with Node's crypto). Share the Sheet with the service account's
 * email as an Editor.
 *
 * Every column except the last two belongs to the bot and is overwritten on
 * each update. The last two ("Your Status", "Notes") belong to you and are
 * never written after a row is created. Rows are found by Lead ID (column A), so sorting
 * and filtering the Sheet is safe, but don't insert or move columns.
 *
 * Values are written with valueInputOption=RAW so text a lead types (e.g.
 * "=IMPORTXML(...)") is stored as plain text and never runs as a formula.
 */

import crypto from "crypto";
import { QUESTIONS, SHEET_STATUSES, optionTitle } from "@/lib/bot/config";
import type { Conversation } from "@/lib/bot/store";
import { APP_TIMEZONE } from "@/lib/dates";

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "";
const TAB = process.env.GOOGLE_SHEET_TAB || "Leads";

export const SHEET_HEADERS = [
  "Lead ID",
  "Created",
  "Name",
  "Phone",
  "Project",
  "Ad",
  ...QUESTIONS.map((q) => q.label),
  "Score",
  "Summary",
  "Lead's questions",
  "Bot status",
  "Last message",
  "Last activity",
  "Follow-ups sent",
  "Next auto follow-up",
  "Your Status",
  "Notes",
];
const BOT_COLS = SHEET_HEADERS.length - 2;
const col = (n: number) => {
  let s = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};
const LAST_BOT_COL = col(BOT_COLS);
const STATUS_COL = col(BOT_COLS + 1);
const LAST_COL = col(SHEET_HEADERS.length);

export function sheetsConfigured(): boolean {
  return !!(SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

let cachedToken: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google auth failed: ${json.error_description || json.error || res.status}`);
  cachedToken = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const token = await accessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${json.error?.message ?? "request failed"}`);
  return json;
}

const range = (r: string) => encodeURIComponent(`'${TAB.replace(/'/g, "''")}'!${r}`);

const fmtTime = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: APP_TIMEZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "";

const BOT_STATUS: Record<string, string> = {
  no_phone: "No phone number",
  duplicate: "Duplicate enquiry",
  awaiting_start: "Waiting for reply",
  in_progress: "Answering questions",
  completed: "Qualified",
  not_interested: "Not interested",
  opted_out: "Unsubscribed",
  no_response: "No response",
  undeliverable: "Not on WhatsApp",
  failed: "Send failed",
};

export interface SheetLeadInfo {
  created_time?: string | null;
  ad_name?: string | null;
}

function botRow(c: Conversation, lead: SheetLeadInfo): string[] {
  let status = BOT_STATUS[c.state] ?? c.state;
  if (c.bot_paused) status += " · bot paused";
  if (c.needs_attention) status += ` · needs you${c.attention_reason ? `: ${c.attention_reason}` : ""}`;
  return [
    c.lead_id,
    fmtTime(lead.created_time ?? c.started_at),
    c.name ?? "",
    c.phone ? `+${c.phone}` : "",
    c.project_name ?? "",
    lead.ad_name ?? "",
    ...QUESTIONS.map((q) => optionTitle(q.id, c.answers?.[q.id])),
    c.score ?? "",
    c.summary ?? "",
    c.lead_questions ?? "",
    status,
    (c.last_message ?? "").slice(0, 300),
    fmtTime(c.last_inbound_at ?? c.last_outbound_at),
    String(c.followups_sent ?? 0),
    fmtTime(c.next_followup_at),
  ];
}

async function findRow(leadId: string): Promise<number | null> {
  const json = await api(`/values/${range("A:A")}?majorDimension=COLUMNS`);
  const ids: string[] = json.values?.[0] ?? [];
  const idx = ids.indexOf(leadId);
  return idx >= 1 ? idx + 1 : null; // row 1 is the header
}

/** Create or update the lead's row (bot columns only). */
export async function upsertLeadRow(c: Conversation, lead: SheetLeadInfo): Promise<void> {
  const values = botRow(c, lead);
  const row = await findRow(c.lead_id);
  if (row) {
    await api(`/values/${range(`A${row}:${LAST_BOT_COL}${row}`)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [values] }),
    });
  } else {
    await api(`/values/${range(`A:${LAST_COL}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values: [[...values, "New", ""]] }),
    });
  }
}

/** Lead ID → "Your Status" for every row. */
export async function readStatuses(): Promise<Map<string, string>> {
  const json = await api(`/values/${range(`A:${STATUS_COL}`)}`);
  const out = new Map<string, string>();
  for (const r of (json.values ?? []).slice(1)) {
    const id = r[0];
    if (id) out.set(String(id), String(r[BOT_COLS] ?? "").trim());
  }
  return out;
}

/** Create the tab if needed, write headers, freeze them and add the status dropdown. */
export async function setupSheet(): Promise<{ created: boolean }> {
  const meta = await api(`?fields=sheets.properties`);
  let sheet = (meta.sheets ?? []).find((s: any) => s.properties?.title === TAB)?.properties;
  let created = false;
  if (!sheet) {
    const res = await api(`:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] }),
    });
    sheet = res.replies?.[0]?.addSheet?.properties;
    created = true;
  }
  await api(`/values/${range(`A1:${LAST_COL}1`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [SHEET_HEADERS] }),
  });
  const sheetId = sheet.sheetId;
  await api(`:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.95, blue: 0.98 } } },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
        {
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: BOT_COLS, endColumnIndex: BOT_COLS + 1 },
            rule: {
              condition: { type: "ONE_OF_LIST", values: SHEET_STATUSES.map((v) => ({ userEnteredValue: v })) },
              showCustomUi: true,
              strict: false,
            },
          },
        },
      ],
    }),
  });
  return { created };
}
