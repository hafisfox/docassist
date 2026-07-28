-- 20240101000017_increment_settings_counter.sql
-- Atomic increment for the daily rate-limit counters on `settings`.
--
-- checkAndIncrementLimit read the counter, compared it to the limit, then wrote
-- back `current + 1` in a separate statement. Two concurrent sends both read
-- 24 and both wrote 25 — two LinkedIn actions taken, one increment recorded.
-- Since these counters are the only thing standing between the app and an
-- account-threatening send rate, losing increments is the failure that matters.
--
-- This is the same fix migration 20240101000011 applied to campaign stats.
-- Returning the post-increment value lets the caller compute `remaining`
-- without a second read.
--
-- SECURITY INVOKER so RLS still scopes normal user calls; the service-role
-- executor bypasses RLS as it already does elsewhere.

CREATE OR REPLACE FUNCTION increment_settings_counter(
  p_user_id UUID,
  p_field TEXT,
  p_delta INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_new_value INTEGER;
BEGIN
  -- Whitelist columns to prevent dynamic-SQL injection via p_field.
  IF p_field NOT IN (
    'invites_sent_today',
    'messages_sent_today',
    'profile_views_today'
  ) THEN
    RAISE EXCEPTION 'invalid settings counter field: %', p_field;
  END IF;

  -- PL/pgSQL requires INTO before USING:
  --   EXECUTE command [ INTO [STRICT] target ] [ USING expr [, ...] ]
  EXECUTE format(
    'UPDATE settings SET %I = COALESCE(%I, 0) + $1 WHERE user_id = $2 RETURNING %I',
    p_field, p_field, p_field
  )
  INTO v_new_value
  USING p_delta, p_user_id;

  RETURN v_new_value;
END;
$$;
