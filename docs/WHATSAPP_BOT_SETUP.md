# WhatsApp Lead Bot: Setup Guide

The code is done. What's left is creating accounts and keys and pasting them
into Vercel. Do the steps in order; each one says where to click.

## What the bot does

1. A lead fills your Meta lead form → within seconds the bot sends a WhatsApp
   welcome with buttons.
2. The lead taps buttons to answer 5–6 questions (configuration, budget,
   purpose, timeline, next step, best time to call). Typed replies are
   understood too; Gemini is only used when a typed message isn't a simple match.
3. The lead is scored **Hot / Warm / Cold** and a row is filled in your
   **Google Sheet**. Hot leads and call/site-visit requests alert you on
   WhatsApp and email.
4. Follow-ups go out automatically: Day 1 and Day 3 if they never reply, and
   Day 3 / 7 / 15 / 30 after they've answered. They stop when the lead replies
   STOP, says not interested, ignores 3 in a row, or you set a status like
   *Booked* or *Not interested* in the Sheet.
5. The **WhatsApp Bot** page in the dashboard shows every chat. You can pause
   the bot for a lead and reply yourself.

Off-topic or trick messages ("write a linked list in C", "ignore your
instructions…") get a fixed polite reply and never reach the AI. After 3 such
messages the bot stops answering them.

---

## Step 1: Database (2 minutes)

Supabase → **SQL Editor** → paste and run `supabase/setup_whatsapp_bot.sql`.
It's safe to run again.

## Step 2: WhatsApp Cloud API number

1. Go to <https://developers.facebook.com/apps> → **Create app** → type
   **Business** → link your Meta Business portfolio.
2. In the app, add the **WhatsApp** product. Under **WhatsApp → API Setup**,
   add your business phone number and verify it by SMS/call.
   - The number must not be logged in to the normal WhatsApp app. Either use a
     fresh number, or use Meta's "coexistence" option if you want to keep the
     WhatsApp Business app on the same number.
3. Copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
4. Create a permanent token: **Business Settings → Users → System users → Add**
   (Admin) → **Assign assets**: this app, your WhatsApp account and your
   Facebook Page (full control) → **Generate token** for the app with these
   permissions: `whatsapp_business_messaging`, `whatsapp_business_management`,
   `leads_retrieval`, `pages_show_list`, `pages_read_engagement`,
   `pages_manage_metadata`, `pages_manage_ads`, `ads_read`, `business_management`.
   - Use it as `WHATSAPP_ACCESS_TOKEN`. It can also replace `META_ACCESS_TOKEN`.
5. Add a payment method in WhatsApp Manager (template messages are paid).
6. **App settings → Basic** → copy **App secret** → `META_APP_SECRET`.
7. Switch the app to **Live** mode (top of the app dashboard). Live webhooks
   only arrive in Live mode.

## Step 3: Message templates (WhatsApp Manager → Message templates → Create)

Create these exactly. Choose category **Marketing** and language **English**.
If you pick "English (US)" instead, set `WHATSAPP_TEMPLATE_LANG=en_US`. Add
the buttons as **Quick reply** buttons. Button text must match exactly.
Sample values for review: `Rahul`, `Worli Towers`.

**`lead_welcome`**
> Hi {{1}}, thank you for your interest in {{2}} with Parmar Properties 🙏
>
> To share the options that suit you best, may I ask a few quick questions? It takes less than a minute.

Buttons: `Yes, let's start` · `Call me instead` · `Not interested`

**`lead_nudge`**
> Hi {{1}}, just following up on your enquiry for {{2}}. Shall we continue? It takes less than a minute.

Buttons: `Yes, let's start` · `Call me instead` · `Not interested`

**`lead_followup`**
> Hi {{1}}, hope you're doing well. Are you still exploring {{2}}? Our advisor would be happy to share details or arrange a private site visit.

Buttons: `Book site visit` · `Request a call` · `Not interested`

**`lead_alert`** (optional, category **Utility**). This makes owner alerts always
reach your phone. Without it, WhatsApp alerts only arrive if your number
messaged the bot number in the last 24 hours. Email alerts work either way.
> Lead alert: {{1}}. Details: {{2}}. Please follow up from your CRM.

Then set `WA_TEMPLATE_OWNER_ALERT=lead_alert`.

Approval usually takes minutes to a few hours. You can use other names; set
`WA_TEMPLATE_WELCOME`, `WA_TEMPLATE_NUDGE`, `WA_TEMPLATE_FOLLOWUP`.

## Step 4: Webhooks (one URL for everything)

Callback URL: `https://<your-vercel-domain>/api/webhooks/meta`
Verify token: any long random text you choose → also set it as `META_WEBHOOK_VERIFY_TOKEN`.

> Set the Vercel environment variables (Step 7) and redeploy **before** this
> step, otherwise Meta's verification fails.

1. **WhatsApp:** app → **WhatsApp → Configuration → Webhook → Edit** → paste URL and
   token → **Verify and save** → under webhook fields, **Subscribe** to `messages`.
2. **Lead forms:** app → **Webhooks** (add the product if missing) → pick
   **Page** → **Subscribe to this object** with the same URL and token → subscribe
   to the `leadgen` field.
3. Connect your Page to the app: open <https://developers.facebook.com/tools/explorer>,
   pick your app, **Get Page Access Token** for your Page, then run
   `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`. It should
   return `{"success": true}`.
4. **Business Settings → Integrations → Leads access** → your Page → allow this app.
5. Test: <https://developers.facebook.com/tools/lead-ads-testing> → pick your
   Page and form → enter **your own phone number** → **Create lead**. You
   should get the welcome WhatsApp within seconds.

If the webhook is missed for any reason, the nightly lead sync and the 11 AM
follow-up job greet any lead from the last 24 hours that hasn't been messaged.

## Step 5: Gemini (free)

1. <https://aistudio.google.com/apikey> → **Create API key** → `GEMINI_API_KEY`.
2. Models used in order (each has its own free limit; a rate-limited model
   rests while the next one answers):
   `gemini-2.5-flash-lite, gemini-flash-lite-latest, gemini-2.5-flash, gemini-flash-latest, gemma-3-27b-it, gemma-3-12b-it`.
   To change them, set `GEMINI_MODELS` (comma-separated). Check the current
   list in AI Studio, because Google renames and retires models.
3. If every model is busy, the bot just asks the lead to tap a button.
   Taps never use the AI.

> **Privacy:** on the free tier Google may use prompts to improve its
> products, and prompts include the lead's messages. Turning on billing for
> the key (Flash-Lite costs a few dollars a month at your volume) stops that.

## Step 6: Google Sheet

1. <https://console.cloud.google.com> → create a project → **APIs & Services →
   Library** → enable **Google Sheets API**.
2. **IAM & Admin → Service accounts → Create** (no roles needed) → open it →
   **Keys → Add key → JSON**. From the downloaded file:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Paste the whole value,
     including `-----BEGIN PRIVATE KEY-----`; keeping the `\n` sequences is fine.
3. Create a Google Sheet → **Share** it with the `client_email` as **Editor**.
4. Copy the Sheet ID from its URL (`docs.google.com/spreadsheets/d/<THIS PART>/edit`)
   → `GOOGLE_SHEET_ID`.
5. After deploying, open the dashboard → **WhatsApp Bot** → **Set up Sheet**.
   This creates the `Leads` tab, the headers and the **Your Status** dropdown.

**Using the Sheet:** sort and filter freely, but don't insert or move columns.
The bot only writes its own columns; **Your Status** and **Notes** are yours.
Statuses that stop follow-ups: *Site visit booked, Negotiation, Booked, Not
interested, Handled by me, Junk*. *Handled by me* and *Junk* also stop the bot
from replying. The Sheet is read once a day, at 11 AM, so for an instant stop
use **Pause bot** on the dashboard's WhatsApp Bot page.

## Step 7: Vercel environment variables

Vercel → your project → **Settings → Environment Variables**, then **Redeploy**.

| Variable | Value |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | System user token (Step 2) |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID (Step 2) |
| `META_APP_SECRET` | App secret (Step 2). Several apps: comma-separated |
| `META_WEBHOOK_VERIFY_TOKEN` | Your random verify text (Step 4) |
| `META_ACCESS_TOKEN` | Already set. Must include `leads_retrieval` (or set `META_PAGE_ACCESS_TOKEN`) |
| `GEMINI_API_KEY` | Step 5 |
| `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Step 6 |
| `BOT_ADMIN_KEY` | A password you choose; the dashboard asks for it before sending replies, pausing the bot or editing the Knowledge Base |
| `BOT_ALERT_NUMBERS` | Your WhatsApp number(s) for alerts, e.g. `919876543210` (comma-separated). These numbers are never treated as leads |
| `RESEND_API_KEY`, `ALERT_EMAIL_ADDRESS` | Already used for reports; also used for alerts and the daily "leads to follow up" email |
| `CRON_SECRET` | Recommended: any random text. Vercel sends it to cron jobs automatically |
| `WA_TEMPLATE_OWNER_ALERT` | Optional: `lead_alert` (Step 3) |
| `BOT_LIVE_FROM` | Optional: e.g. `2026-10-20T00:00:00+05:30`; leads before this are never messaged |
| `WA_BOT_ENABLED` | Optional: `false` switches off all new messages |
| `BUSINESS_NAME` | Optional, default `Parmar Properties` |
| `WHATSAPP_TEMPLATE_LANG` | Optional, default `en` |
| `GEMINI_MODELS`, `LLM_DAILY_CAP` | Optional. Model order (Step 5); max AI calls per day (default 1500) |

**Check:** open `https://<your-domain>/api/bot/status` (or **Check setup** on the
WhatsApp Bot page). Every checklist item should be `true` and `database` should be `ok`.

---

## Changing things later

- **Questions, buttons, scoring, follow-up days, fixed replies:** all in
  `src/lib/bot/config.ts`.
- **What the bot may answer:** dashboard → **Knowledge Base**. Add facts per
  project (price ranges, sizes, possession, RERA, amenities). The bot answers
  only from this text. Any number it mentions must appear there, otherwise the
  answer is blocked and the question is passed to you.
- **Scoring:** points. Timeline: Immediately or within 3 months = 3,
  3–6 months = 2, after 6 months = 1. Next step: site visit = 3, call = 2.
  Sharing a budget = 1. **5+ = Hot**, **3+ or any call/visit request = Warm**,
  otherwise Cold. Example: "within 3 months + call me" is Hot. Once you have a
  budget cut-off, add it to `scoreLead()` in `config.ts`.

## Timing and costs

- The welcome message is instant. Follow-ups go out once a day at **11:00 AM
  IST**, so a "Day 1" nudge lands at the first 11 AM after 24 hours.
- WhatsApp charges per template message (welcome and follow-ups). Bot replies
  inside the 24-hour chat window are free. Check Meta's current India rates.
- Gemini's free tier is enough for ~600 leads a month, because most answers
  are button taps.
