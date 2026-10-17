/**
 * Alerts to you (the owner) when a lead needs attention: a Hot lead, a call or
 * site-visit request, or a question the bot couldn't answer.
 *
 * Channels (each optional):
 *  - Email via Resend (RESEND_API_KEY + ALERT_EMAIL_ADDRESS).
 *  - WhatsApp to BOT_ALERT_NUMBERS. With WA_TEMPLATE_OWNER_ALERT set this uses
 *    an approved template, which always delivers. Without it a plain message
 *    is tried, which WhatsApp only delivers if that number messaged the bot
 *    number in the last 24 hours.
 */

import { Resend } from "resend";
import { escapeHtml } from "@/lib/csv";
import { TEMPLATES } from "@/lib/bot/config";
import { ownerNumbers } from "@/lib/bot/phone";
import type { Conversation } from "@/lib/bot/store";
import { sendTemplate, sendText } from "@/lib/whatsapp";

export async function notifyOwner(title: string, c: Conversation, detail?: string): Promise<void> {
  const lines = [
    `${c.name || "Lead"} · ${c.phone ? `+${c.phone}` : "no phone"}`,
    c.project_name ? `Project: ${c.project_name}` : "",
    c.score && c.state === "completed" ? `Score: ${c.score}` : "",
    c.summary ? `Wants: ${c.summary}` : "",
    detail ?? "",
  ].filter(Boolean);
  const text = `🔔 ${title}\n${lines.join("\n")}`;

  const tasks: Promise<unknown>[] = [];

  for (const to of ownerNumbers()) {
    tasks.push(
      (TEMPLATES.ownerAlert
        ? sendTemplate(to, TEMPLATES.ownerAlert, [title, lines.join(" | ")])
        : sendText(to, text)
      ).then((r) => {
        if (!r.success) console.warn(`[alerts] WhatsApp alert to ${to} failed: ${r.error}`);
      })
    );
  }

  if (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_ADDRESS) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    tasks.push(
      resend.emails
        .send({
          from: process.env.ALERT_EMAIL_FROM || "Meta Ads CRM <onboarding@resend.dev>",
          to: process.env.ALERT_EMAIL_ADDRESS,
          subject: `${title}: ${c.name || (c.phone ? `+${c.phone}` : "lead")}`,
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">
            <h2 style="margin:0 0 12px">${escapeHtml(title)}</h2>
            ${lines.map((l) => `<p style="margin:0 0 6px">${escapeHtml(l)}</p>`).join("")}
          </div>`,
        })
        .catch((err) => console.warn("[alerts] email failed:", err))
    );
  }

  await Promise.allSettled(tasks);
}
