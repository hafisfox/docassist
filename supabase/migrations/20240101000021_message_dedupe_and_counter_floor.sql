-- 20240101000021_message_dedupe_and_counter_floor.sql
--
-- Two independent hardening changes to the webhook write path.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enforce inbound/outbound message de-duplication in the database.
--
-- recordInboundMessage / recordOutboundMessage guard against replayed webhook
-- deliveries with a SELECT on unipile_message_id followed by an INSERT. That is
-- a check-then-act race, and webhook providers retry aggressively: two
-- deliveries of the same message can both read "not found" and both insert.
-- The duplicate row is not just cosmetic — recordInboundMessage also bumps the
-- campaign's replies_received counter and re-pauses enrollments, so a replay
-- corrupts the funnel analytics the operator steers on.
--
-- There was also no index on unipile_message_id at all, so the dedupe SELECT
-- was a sequential scan over `messages` on every single webhook. This index
-- serves that lookup and enforces the constraint in one object.
--
-- Partial (WHERE NOT NULL) because dashboard-originated sends legitimately
-- carry a NULL unipile_message_id and must not collide with each other. Not
-- scoped by user_id: unipile_message_id is a provider-global identifier, and
-- the dedupe lookup in leadSync is likewise unscoped — the index has to match
-- the query it backs.

-- Collapse any duplicates already present, keeping the earliest row, so the
-- unique index can be created on an existing database.
DELETE FROM messages m
USING messages keep
WHERE m.unipile_message_id IS NOT NULL
  AND m.unipile_message_id = keep.unipile_message_id
  AND (keep.created_at, keep.id) < (m.created_at, m.id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_messages_unipile_message_id
  ON messages (unipile_message_id)
  WHERE unipile_message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Floor the daily rate-limit counters at zero.
--
-- increment_settings_counter is called with p_delta = -1 on two paths: the
-- lost-race rollback in checkAndIncrementLimit, and releaseLimitSlot handing
-- back a slot for a send the circuit breaker rejected before it reached
-- LinkedIn. Either can fire more often than the matching increment if a write
-- is retried, and an unclamped counter then goes negative — which silently
-- grants quota *above* the configured daily limit. These counters are the only
-- thing bounding the send rate, so erring downward is not acceptable.
--
-- Replaces the body from 20240101000017; the signature is unchanged.

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
    'UPDATE settings SET %I = GREATEST(COALESCE(%I, 0) + $1, 0) WHERE user_id = $2 RETURNING %I',
    p_field, p_field, p_field
  )
  INTO v_new_value
  USING p_delta, p_user_id;

  RETURN v_new_value;
END;
$$;
