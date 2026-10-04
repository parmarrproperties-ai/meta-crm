# Meta Ads CRM

Next.js dashboard that syncs Meta (Facebook/Instagram) ad performance and lead-gen
leads into Supabase, flags wasted spend, and emails/WhatsApps reports.
See `PRODUCT.md` for the product intent.

## Setup

1. Create the tables: run `supabase/schema.sql` (⚠️ it **drops and recreates** the
   snapshot/report tables – only for a fresh project) and `supabase/setup_leads_table.sql`
   (idempotent, safe to re-run; adds the `status` column to existing databases).
2. Set the environment variables below (Vercel → Settings → Environment Variables).
3. `npm install && npm run dev`

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Database (server-side only) |
| `META_ACCESS_TOKEN` | ✅ | Needs `ads_read` and `leads_retrieval`. Prefer a System User token (does not expire) |
| `META_AD_ACCOUNTS` | ✅ | JSON: `[{"id":"act_123","name":"Project A"}]`. Optional per-account `"result_action_types":"onsite_conversion.messaging_conversation_started_7d"` |
| `RESEND_API_KEY`, `ALERT_EMAIL_ADDRESS` | for email | Daily lead report |
| `ANTHROPIC_API_KEY` | optional | AI narrative in the weekly report |
| `WHATSAPP_*` | optional | WhatsApp sends |
| `APP_TIMEZONE` | optional | Business timezone for "today"/"yesterday" (default `Asia/Kolkata`) |
| `META_API_VERSION` | optional | Graph API version (default `v23.0`). Bump when Meta retires it |
| `META_RESULT_ACTION_TYPES` | optional | Comma-separated priority list that defines a "result" (default `lead,onsite_conversion.lead_grouped,offsite_conversion.fb_pixel_lead,onsite_conversion.messaging_conversation_started_7d`) |
| `META_SYNC_DAYS` | optional | Trailing days re-pulled on each ad sync (default 7) |

## How data flows

```
Meta Insights API ──(cron 01:30 IST + Refresh button, trailing 7 days)──▶ daily_ad_snapshots ──▶ dashboard / weekly report
Meta Leads API    ──(cron 07:30 IST + Sync button, trailing 3/7 days)──▶ leads ──▶ Leads page / daily email (09:00 IST)
```

* **Why trailing days:** Meta keeps revising a day's numbers after it ends (late
  conversions, attribution window). Each sync re-pulls recent days and upserts them,
  so stored figures converge on what Ads Manager shows.
* **Metrics match Ads Manager** when: attribution uses each ad set's own setting
  (`use_unified_attribution_setting`), clicks/CTR/CPC are *link* clicks, and the
  result action type matches your campaign objective (see `META_RESULT_ACTION_TYPES`).
* **Auth:** none. The dashboard and every `/api/*` route are open to anyone who has the URL (including lead names, phones and emails). Keep the URL private or add protection (e.g. Vercel Deployment Protection) if that matters.
* **Manual backfills:**
  `POST /api/ads/fetch-today?since=2026-09-01&until=2026-09-30`,
  `GET /api/cron/sync-leads?full=1` (entire lead history; follow `nextOffset` if `partial`).
* On Vercel Pro you can run `sync-leads` hourly by changing its schedule in `vercel.json`.
