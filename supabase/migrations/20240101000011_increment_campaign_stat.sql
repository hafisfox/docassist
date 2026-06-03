-- 20240101000011_increment_campaign_stat.sql
-- Atomic increment for denormalized campaign counters. Replaces the
-- read-then-write pattern in the app, which can lose concurrent increments
-- (e.g. a webhook and the sequence executor bumping the same field at once).
--
-- SECURITY INVOKER so row-level security still applies for normal user calls;
-- the service-role webhook client bypasses RLS as it already does elsewhere.

CREATE OR REPLACE FUNCTION increment_campaign_stat(
  p_campaign_id UUID,
  p_field TEXT,
  p_delta INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Whitelist columns to prevent dynamic-SQL injection via p_field.
  IF p_field NOT IN (
    'total_leads',
    'invites_sent',
    'messages_sent',
    'invites_accepted',
    'replies_received'
  ) THEN
    RAISE EXCEPTION 'invalid campaign stat field: %', p_field;
  END IF;

  EXECUTE format(
    'UPDATE campaigns SET %I = COALESCE(%I, 0) + $1 WHERE id = $2',
    p_field, p_field
  ) USING p_delta, p_campaign_id;
END;
$$;
