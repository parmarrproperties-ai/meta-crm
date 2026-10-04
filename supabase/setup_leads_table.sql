-- Leads table. Safe to re-run: every statement is idempotent.
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL UNIQUE,
  created_time timestamp with time zone NOT NULL,
  ad_id text,
  ad_name text,
  campaign_name text,
  project_name text,
  form_id text,
  field_data jsonb,
  status text NOT NULL DEFAULT 'New',
  created_at timestamp with time zone DEFAULT now()
);

-- Existing deployments created before `status` was tracked in this file.
-- The sync never writes `status`, so statuses set in the CRM survive re-syncs.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'New';

-- Indexes for performance filtering
CREATE INDEX IF NOT EXISTS idx_leads_created_time ON public.leads(created_time);
CREATE INDEX IF NOT EXISTS idx_leads_ad_id ON public.leads(ad_id);
CREATE INDEX IF NOT EXISTS idx_leads_project_name ON public.leads(project_name);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
