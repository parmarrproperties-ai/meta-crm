/**
 * WhatsApp Cloud API client (official Meta API).
 *
 * Rules WhatsApp enforces:
 *  - A business may start a conversation (or write after 24h of silence) only
 *    with an approved template.
 *  - Within 24h of the customer's last message, free text, reply buttons and
 *    lists can be sent.
 */

const API_VERSION = process.env.META_API_VERSION || "v23.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: number;
}

export interface ButtonOption {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export function whatsappConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function post(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { success: false, error: "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID" };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt));
    try {
      const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return { success: true, messageId: json.messages?.[0]?.id };
      const retryable = res.status >= 500 || res.status === 429 || json.error?.is_transient;
      const result: WhatsAppSendResult = {
        success: false,
        error: json.error?.error_data?.details || json.error?.message || `HTTP ${res.status}`,
        errorCode: json.error?.code,
      };
      if (!retryable) return result;
      if (attempt === 2) return result;
    } catch (err) {
      if (attempt === 2) return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { success: false, error: "WhatsApp send failed" };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function sendText(to: string, text: string): Promise<WhatsAppSendResult> {
  return post({ to, type: "text", text: { body: clip(text, 4000), preview_url: false } });
}

/** Up to 3 reply buttons (titles max 20 chars). */
export function sendButtons(to: string, text: string, buttons: ButtonOption[]): Promise<WhatsAppSendResult> {
  return post({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: clip(text, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: clip(b.title, 20) } })),
      },
    },
  });
}

/** A list of up to 10 rows (titles max 24 chars) behind one button. */
export function sendList(to: string, text: string, buttonText: string, rows: ListRow[]): Promise<WhatsAppSendResult> {
  return post({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: clip(text, 1024) },
      action: {
        button: clip(buttonText, 20),
        sections: [
          {
            title: "Options",
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: clip(r.title, 24),
              ...(r.description ? { description: clip(r.description, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
}

/**
 * Send an approved template. `params` fill {{1}}, {{2}} … in the body.
 * Quick-reply buttons defined on the template need no parameters.
 */
export function sendTemplate(
  to: string,
  templateName: string,
  params: string[] = [],
  language = process.env.WHATSAPP_TEMPLATE_LANG || "en"
): Promise<WhatsAppSendResult> {
  return post({
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components:
        params.length > 0
          ? [
              {
                type: "body",
                // Template params can't contain newlines/tabs or 4+ spaces.
                parameters: params.map((text) => ({
                  type: "text",
                  text: clip(text.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   "), 1000) || "-",
                })),
              },
            ]
          : [],
    },
  });
}

/** Show blue ticks on the lead's message (best effort). */
export async function markRead(messageId: string): Promise<void> {
  await post({ status: "read", message_id: messageId }).catch(() => undefined);
}

// ── Older helpers kept for the reporting features ───────────────────────────

export async function sendWhatsAppTemplate(
  templateName: string,
  params: string[],
  recipientNumber?: string
): Promise<WhatsAppSendResult> {
  const to = recipientNumber ?? process.env.WHATSAPP_RECIPIENT_NUMBER;
  if (!to) return { success: false, error: "Missing WHATSAPP_RECIPIENT_NUMBER" };
  return sendTemplate(to, templateName, params);
}

export async function sendWhatsAppText(text: string, recipientNumber?: string): Promise<WhatsAppSendResult> {
  const to = recipientNumber ?? process.env.WHATSAPP_RECIPIENT_NUMBER;
  if (!to) return { success: false, error: "Missing WHATSAPP_RECIPIENT_NUMBER" };
  return sendText(to, text);
}
