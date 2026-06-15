-- 20240101000013_n8n_sync_columns.sql
-- Additive columns + index so the dashboard can mirror state produced by the
-- v2 n8n LinkedIn workflows (which store their data in Google Sheets) into
-- Supabase. See src/app/api/webhooks/n8n/route.ts and n8n/v2/README-cutover.md.
--
-- All columns are nullable; no backfill required. `source` and `country`
-- already exist on `leads` and are reused (source is set to 'n8n' for synced
-- leads).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS hospital_name TEXT,
  ADD COLUMN IF NOT EXISTS segment       TEXT,        -- n8n weekday segment (CMO/CIO/Doctor/Admin)
  ADD COLUMN IF NOT EXISTS region        TEXT,        -- derived region for send-window logic
  ADD COLUMN IF NOT EXISTS tier          TEXT,        -- qualifier tier (A/B)
  ADD COLUMN IF NOT EXISTS sequence_step INTEGER,     -- current nurture step in 3_CONNECTIONS
  ADD COLUMN IF NOT EXISTS next_touch_at TIMESTAMPTZ; -- when the next sequence touch is due

-- Upsert key for n8n-synced leads (which arrive without a session and are keyed
-- by LinkedIn provider_id). Partial so existing rows without a provider_id are
-- unaffected and don't collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS ux_leads_user_provider
  ON leads (user_id, linkedin_provider_id)
  WHERE linkedin_provider_id IS NOT NULL;
