/**
 * WhatsApp Cloud API client.
 * Sends template messages via the official Meta Cloud API.
 */

const BASE_URL = "https://graph.facebook.com/v20.0";

export interface WhatsAppTemplateParam {
  type: "text";
  text: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a WhatsApp template message.
 *
 * @param templateName - The approved template name (e.g. "daily_ads_summary")
 * @param params       - Array of text substitutions for {{1}}, {{2}}, etc.
 * @param recipientNumber - Phone number with country code, no + (e.g. "919876543210")
 */
export async function sendWhatsAppTemplate(
  templateName: string,
  params: string[],
  recipientNumber?: string
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient =
    recipientNumber ?? process.env.WHATSAPP_RECIPIENT_NUMBER;

  if (!token || !phoneNumberId || !recipient) {
    return {
      success: false,
      error:
        "Missing WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, or WHATSAPP_RECIPIENT_NUMBER",
    };
  }

  const components =
    params.length > 0
      ? [
          {
            type: "body",
            parameters: params.map((text) => ({ type: "text", text })),
          },
        ]
      : [];

  const payload = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components,
    },
  };

  try {
    const res = await fetch(
      `${BASE_URL}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const json = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: json.error?.message ?? `HTTP ${res.status}`,
      };
    }

    return {
      success: true,
      messageId: json.messages?.[0]?.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Send a raw text message (for testing — production must use approved templates).
 * Only works for numbers that have opted in / are in developer test mode.
 */
export async function sendWhatsAppText(
  text: string,
  recipientNumber?: string
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient =
    recipientNumber ?? process.env.WHATSAPP_RECIPIENT_NUMBER;

  if (!token || !phoneNumberId || !recipient) {
    return {
      success: false,
      error: "Missing WhatsApp environment variables",
    };
  }

  try {
    const res = await fetch(
      `${BASE_URL}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "text",
          text: { body: text },
        }),
      }
    );

    const json = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: json.error?.message ?? `HTTP ${res.status}`,
      };
    }

    return { success: true, messageId: json.messages?.[0]?.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
