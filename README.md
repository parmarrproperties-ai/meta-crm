# Meta Ads CRM

A dashboard and WhatsApp lead bot for **Parmar Properties**. It brings Meta
(Facebook/Instagram) ad performance and lead-form leads into one place, flags
wasted spend, and qualifies every new lead on WhatsApp automatically.

**Live:** https://meta-crm-phi.vercel.app · **Stack:** Next.js 16 · Supabase · Vercel ·
WhatsApp Cloud API · Gemini · Resend

---

## What it does

### Ads and leads
- **Daily Dashboard:** spend, results, cost per result, CTR and CPC per project
  and ad, matched to Ads Manager. Highlights ads wasting money.
- **Weekly Report:** week-over-week comparison with an optional AI summary.
- **Leads:** every lead-form submission, with status tracking, filters and CSV export.
- **Daily email:** yesterday's leads as a CSV, every morning at 9:00 AM.
- **Share:** dashboards can be shared as images, e.g. on WhatsApp.

### WhatsApp lead bot
- **Instant welcome:** a new lead gets a WhatsApp message within seconds of
  filling the form.
- **Button questions:** configuration, budget, purpose, timeline, next step
  and call time, answered by tapping buttons. Typed answers are understood too.
- **Scoring:** Hot / Warm / Cold. Hot leads and call or site-visit requests
  alert you on WhatsApp and email.
- **Follow-ups:** sent automatically. Day 1 and day 3 if the lead never
  replied; day 3, 7, 15 and 30 after they answered. They stop on reply, STOP,
  "not interested", or 3 unanswered messages.
- **Answers questions** only from your Knowledge Base. Anything else is passed
  to you.
- **Protected against misuse:** off-topic requests ("write code…"),
  prompt-injection attempts and made-up prices are blocked. The AI never
  decides what gets saved.
- **Pause WhatsApp** stops all automatic messages with one button. You can
  still reply manually.

### Dashboard pages

| Page | What it's for |
|---|---|
| **Daily Dashboard** | Ad performance by project, date range and ad |
| **Weekly Report** | Week-over-week trends |
| **Leads** | All lead-form leads, statuses and CSV export |
| **Qualified Leads** | Every lead's answers in one table, split into **From ads** (bot messaged them) and **Messaged us** (they messaged first) |
| **WhatsApp Bot** | Live chats, Pause / Resume WhatsApp, pause the bot per lead, reply manually, send pending welcomes |
| **Knowledge Base** | Project facts the bot may use to answer questions |

---

## How it works

```
Meta lead form ──webhook (instant)──┐
Meta Leads API ──nightly sync──────┼─▶ leads ─▶ WhatsApp bot ─▶ welcome template
                                    │                │
Customer replies on WhatsApp ──webhook──────────────┘ ─▶ questions ─▶ score ─▶ alerts
                                                       ─▶ Qualified Leads / Google Sheet

Meta Insights API ──nightly sync──▶ daily_ad_snapshots ─▶ dashboards / weekly report
```

1. **A lead comes in.** Meta calls `/api/webhooks/meta` instantly. The
   nightly sync is a backup.
2. **The bot sends the `lead_welcome` template.** WhatsApp requires an
   approved template to message someone first.
3. **The lead taps buttons.** Each reply arrives on the same webhook. The bot
   saves the answer and asks the next question. If someone messages the
   number first, no template is needed and the bot starts the questions directly.
4. **Typed messages** are matched to buttons and keywords first. Gemini is
   only used when that fails, and its output is checked before anything is sent.
5. **When the questions are done,** the lead is scored and you're alerted if
   it's Hot or wants a call or visit.
6. **Every day at 11:00 AM** the follow-ups go out and you get a
   "leads to follow up today" email.

**WhatsApp's 24-hour rule:** within 24 hours of the customer's last message,
anything can be sent for free. After that, only approved templates, which are
paid.

### Scheduled jobs (`vercel.json`, IST)

| Time | Job |
|---|---|
| 01:30 daily | Sync ad performance (trailing 7 days) |
| 07:30 daily | Sync leads (trailing 3 days) and greet any lead the webhook missed |
| 09:00 daily | Email yesterday's leads |
| 09:00 Tuesday | Build the weekly report |
| 11:00 daily | WhatsApp follow-ups, retry unsent welcomes, Sheet statuses, "to follow up" email |

---

## Setup

Full step-by-step guide (Meta app, templates, webhooks, Gemini, Google Sheet):
**[`docs/WHATSAPP_BOT_SETUP.md`](docs/WHATSAPP_BOT_SETUP.md)**

1. **Database:** in Supabase → SQL Editor, run in order:
   - `supabase/schema.sql`. ⚠️ It **drops and recreates** the snapshot and
     report tables, so only run it on a fresh project.
   - `supabase/setup_leads_table.sql`. Safe to re-run.
   - `supabase/setup_whatsapp_bot.sql`. Safe to re-run, and re-run it after
     updates because it adds new tables when needed.
2. **Environment variables:** add them in Vercel → Settings → Environment
   Variables (Production), then redeploy. See the table below.
3. **Meta webhook:** point both WhatsApp `messages` and Page `leadgen` at
   `https://<your-domain>/api/webhooks/meta`.
4. **Check:** open `/api/bot/status`, or **Check setup** on the WhatsApp Bot page.

### Run locally

```bash
npm install
npm run dev        # http://localhost:3000. The Agentation overlay loads only here.
npm run build      # production build
npm run lint
```

Put local settings in `.env.local`. It isn't committed.

---

## Environment variables

### Core

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Database (server-side only) |
| `META_ACCESS_TOKEN` | ✅ | Needs `ads_read` and `leads_retrieval`. Use a System User token (never expires) |
| `META_AD_ACCOUNTS` | ✅ | JSON, e.g. `[{"id":"act_123","name":"Project A"}]`. Optional per account: `"result_action_types"` |
| `RESEND_API_KEY`, `ALERT_EMAIL_ADDRESS` | for email | Daily lead email, bot alerts, "to follow up" email |
| `ALERT_EMAIL_FROM` | optional | Sender for alert emails |
| `ANTHROPIC_API_KEY` | optional | AI summary in the weekly report |
| `CRON_SECRET` | recommended | Protects the follow-up job; Vercel sends it automatically |
| `APP_TIMEZONE` | optional | Default `Asia/Kolkata` |
| `META_API_VERSION` | optional | Graph API version, default `v23.0` |
| `META_RESULT_ACTION_TYPES` | optional | What counts as a "result" (comma-separated priority list) |
| `META_SYNC_DAYS` | optional | Trailing days re-pulled on each ad sync (default 7) |

### WhatsApp bot

| Variable | Required | Purpose |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | ✅ | Permanent System User token with WhatsApp permissions |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ | The bot's number ID from WhatsApp Manager |
| `META_APP_SECRET` | ✅ | Verifies that webhooks really come from Meta |
| `META_WEBHOOK_VERIFY_TOKEN` | ✅ | Any text; also entered in Meta's webhook settings |
| `BOT_ADMIN_KEY` | ✅ | Password the dashboard asks for before pausing, replying or editing the Knowledge Base |
| `GEMINI_API_KEY` | recommended | Understands typed messages. Without it, the bot asks people to tap buttons |
| `BOT_ALERT_NUMBERS` | optional | WhatsApp number(s) for alerts, e.g. `919876543210`. These are never treated as leads |
| `WA_TEMPLATE_OWNER_ALERT` | optional | `lead_alert`, so alerts always reach you |
| `META_PAGE_ACCESS_TOKEN` | optional | Used instead of `META_ACCESS_TOKEN` to read leads from the webhook |
| `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | optional | Mirror every lead into a Google Sheet |
| `GOOGLE_SHEET_TAB` | optional | Sheet tab name (default `Leads`) |
| `WA_TEMPLATE_WELCOME`, `WA_TEMPLATE_NUDGE`, `WA_TEMPLATE_FOLLOWUP` | optional | Template names (default `lead_welcome`, `lead_nudge`, `lead_followup`) |
| `WHATSAPP_TEMPLATE_LANG` | optional | Template language code (default `en`) |
| `GEMINI_MODELS` | optional | Model order to rotate through when one is rate-limited |
| `LLM_DAILY_CAP` | optional | Max AI calls per day (default 1500) |
| `BOT_LIVE_FROM` | optional | ISO date; leads before it are never messaged |
| `WA_BOT_ENABLED` | optional | `false` turns the bot off entirely. The **Pause WhatsApp** button is the everyday switch |
| `BUSINESS_NAME` | optional | Default `Parmar Properties` |
| `DEFAULT_COUNTRY_CODE` | optional | Added to 10-digit numbers (default `91`) |

---

## Customising the bot

| To change… | Edit |
|---|---|
| Questions, buttons, scoring, follow-up days, fixed replies | `src/lib/bot/config.ts` |
| What the bot can answer | Dashboard → **Knowledge Base** (no code) |
| Message wording sent first or after 24 hours | The templates in WhatsApp Manager (needs re-approval) |

**Scoring today:** timeline (Immediately or within 3 months = 3, 3–6 months
= 2, later = 1), next step (site visit = 3, call = 2), budget shared = 1.
**5+ = Hot**, **3+ or any call/visit request = Warm**, otherwise Cold.

---

## Project structure

```
src/
  app/
    dashboard/            # Pages: daily, weekly, leads, qualified, conversations (WhatsApp Bot), knowledge
    api/
      webhooks/meta/      # Meta webhook: lead forms + WhatsApp messages (signature-checked)
      bot/                # Chats, qualified leads, knowledge base, pause setting, retries, status, Sheet setup
      cron/               # sync-leads, daily-report, lead-followups
      ads/, leads/, reports/
  lib/
    bot/                  # The WhatsApp bot
      config.ts           #   questions, scoring, follow-ups, fixed replies ← edit here
      engine.ts           #   conversation logic
      guard.ts            #   off-topic / injection filters, AI answer checks
      llm.ts              #   Gemini with model rotation
      followups.ts        #   daily follow-up job
      webhook.ts          #   parses Meta webhooks
      sheets.ts, alerts.ts, store.ts, settings.ts, phone.ts
    meta.ts               # Meta Marketing / Leads API
    whatsapp.ts           # WhatsApp Cloud API (text, buttons, lists, templates)
supabase/                 # SQL to create the tables
docs/WHATSAPP_BOT_SETUP.md
```

---

## Costs (approximate, ~600 leads a month)

| Service | Cost |
|---|---|
| WhatsApp: replies within 24h, chats the customer starts | Free |
| WhatsApp: marketing templates (welcome, nudges, follow-ups) | ~₹0.80–0.90 each → **~₹1,500–2,500 a month** |
| WhatsApp: utility templates (alerts to you) | ~₹0.12–0.15 each |
| Gemini | Free tier is enough; paid Flash-Lite ≈ ₹100–400 a month |
| Supabase, Resend, Google Sheets | Free tiers are enough |
| Vercel | Hobby is free but for non-commercial use; Pro ≈ $20 a month |

Meta changes WhatsApp prices; check WhatsApp Manager → Insights.

---

## Good to know

- **Templates need approval.** Until `lead_welcome` is approved, form leads
  show "Send failed". They're retried automatically every day, or immediately
  with **Send pending welcomes**.
- **Unpublished Meta app:** WhatsApp works, but instant lead webhooks for
  real customers need the app in **Live** mode.
- **Security:** the dashboard has no login. Anyone with the URL can view
  leads, so keep it private or turn on Vercel Deployment Protection. Actions
  that send messages or change the bot need `BOT_ADMIN_KEY`. Webhooks are
  checked against `META_APP_SECRET`.
- **Privacy:** on Gemini's free tier, Google may use prompts (lead messages)
  to improve its products. A paid key avoids this.
- **Matching Ads Manager:** syncs re-pull trailing days because Meta revises
  recent numbers. Totals can be checked with
  `GET /api/ads/reconcile?since=YYYY-MM-DD&until=YYYY-MM-DD`.
- **Backfills:** `POST /api/ads/fetch-today?since=…&until=…` (max 90 days)
  and `GET /api/cron/sync-leads?full=1`. If the response says `partial`,
  call again with `nextSince` / `nextOffset`.
