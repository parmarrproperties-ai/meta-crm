-- WhatsApp lead bot tables. Safe to re-run: every statement is idempotent.
-- Run this in the Supabase SQL Editor after setup_leads_table.sql.

-- One row per lead the bot is (or was) talking to. This is the bot's memory;
-- the Google Sheet is the human-friendly view of the same data.
CREATE TABLE IF NOT EXISTS public.wa_conversations (
  lead_id text PRIMARY KEY REFERENCES public.leads(lead_id) ON DELETE CASCADE,
  phone text,                       -- digits only, with country code (e.g. 919876543210)
  name text,
  project_name text,
  -- no_phone | duplicate | awaiting_start | in_progress | completed |
  -- not_interested | opted_out | no_response | undeliverable | failed
  state text NOT NULL DEFAULT 'awaiting_start',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score text,                       -- Hot | Warm | Cold
  summary text,
  lead_questions text,              -- free-text questions the lead asked
  bot_paused boolean NOT NULL DEFAULT false,
  needs_attention boolean NOT NULL DEFAULT false,
  attention_reason text,
  off_topic_count integer NOT NULL DEFAULT 0,
  llm_calls_date date,
  llm_calls_count integer NOT NULL DEFAULT 0,
  alerts_sent jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  followup_track text,              -- nudge | nurture
  followup_stage integer NOT NULL DEFAULT 0,
  followups_sent integer NOT NULL DEFAULT 0,
  unanswered_followups integer NOT NULL DEFAULT 0,
  next_followup_at timestamptz,
  sheet_status text,                -- last value read from the Sheet's "Your Status" column
  sheet_dirty boolean NOT NULL DEFAULT true,
  sheet_error text,
  locked_until timestamptz,         -- serialises processing of one lead's messages
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON public.wa_conversations(phone, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_next_followup ON public.wa_conversations(next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conv_updated ON public.wa_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_dirty ON public.wa_conversations(sheet_dirty) WHERE sheet_dirty;

-- Every WhatsApp message in and out. The unique message id also stops a
-- message that Meta delivers twice from being processed twice.
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text REFERENCES public.leads(lead_id) ON DELETE CASCADE,
  phone text NOT NULL,
  direction text NOT NULL,          -- in | out
  wa_message_id text UNIQUE,
  msg_type text,
  body text,
  payload jsonb,
  status text,                      -- out: sent | delivered | read | failed
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_lead ON public.wa_messages(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_messages_phone ON public.wa_messages(phone, created_at);

-- Project fact sheets the bot may answer questions from.
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL UNIQUE, -- 'General' applies to every project
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Which AI models are cooling down after a rate limit (shared by all requests).
CREATE TABLE IF NOT EXISTS public.llm_model_state (
  model text PRIMARY KEY,
  cooldown_until timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per AI call, for the daily cap and for debugging.
CREATE TABLE IF NOT EXISTS public.llm_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text,
  lead_id text,
  ok boolean NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON public.llm_usage(created_at DESC);

-- These tables are only accessed with the service role key from the server.
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_model_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_usage ENABLE ROW LEVEL SECURITY;
