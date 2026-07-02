-- ============================================================
-- Meta Ads Dashboard — Supabase Schema (V2 - Multi-Account)
-- Run this in the Supabase SQL Editor to set up all tables.
-- ============================================================

drop table if exists daily_ad_snapshots cascade;
drop table if exists weekly_reports cascade;
drop table if exists whatsapp_sends cascade;

-- One row per ad, per day
create table daily_ad_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  account_id text not null,
  project_name text not null,
  ad_id text not null,
  ad_name text not null,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  spend numeric not null default 0,
  impressions integer default 0,
  clicks integer default 0,
  ctr numeric,
  cpc numeric,
  cpm numeric,
  results integer default 0,
  cost_per_result numeric,
  created_at timestamptz default now(),
  unique (snapshot_date, account_id, ad_id)
);

create index idx_daily_ad_snapshots_date on daily_ad_snapshots(snapshot_date desc);
create index idx_daily_ad_snapshots_ad on daily_ad_snapshots(ad_id);
create index idx_daily_ad_snapshots_project on daily_ad_snapshots(project_name);

-- One row per week, per project (optional) or overall portfolio
create table weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  project_name text not null default 'Portfolio', -- 'Portfolio' for all accounts aggregated
  total_spend numeric,
  total_results integer,
  avg_ctr numeric,
  avg_cpa numeric,
  spend_change_pct numeric,
  cpa_change_pct numeric,
  results_change_pct numeric,
  top_ads jsonb,
  bottom_ads jsonb,
  ai_summary text,
  created_at timestamptz default now(),
  unique (week_start, project_name)
);

-- Log of every WhatsApp send (for dedup + debugging)
create table whatsapp_sends (
  id uuid primary key default gen_random_uuid(),
  send_type text not null,
  sent_for_date date not null,
  message_body text,
  status text,
  error text,
  sent_at timestamptz default now()
);

create index idx_whatsapp_sends_date on whatsapp_sends(sent_for_date desc);
