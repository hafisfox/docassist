-- 20240101000016_extend_campaign_stat_fields.sql
-- The increment_campaign_stat whitelist omitted two columns that exist on the
-- campaigns table and are written by the app:
--
--   • positive_replies — /api/webhooks/n8n bumps this on every WARM/HOT
--     lead.warmth_changed event. Because the field was rejected, the function
--     raised, supabase-js returned it as `.error` (not a throw), and the call
--     site discarded the result — so the counter silently stayed at 0 forever.
--   • meetings_booked  — no caller yet, but it is the same shape and would
--     have failed identically.
--
-- Nothing else about the function changes; the dynamic-SQL whitelist is still
-- what prevents injection through p_field.

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
    'replies_received',
    'positive_replies',
    'meetings_booked'
  ) THEN
    RAISE EXCEPTION 'invalid campaign stat field: %', p_field;
  END IF;

  EXECUTE format(
    'UPDATE campaigns SET %I = COALESCE(%I, 0) + $1 WHERE id = $2',
    p_field, p_field
  ) USING p_delta, p_campaign_id;
END;
$$;
