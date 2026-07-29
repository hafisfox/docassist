-- 20240101000020_claim_due_enrollments.sql
-- Atomic claim for the sequence executor's work batch.
--
-- fetchDueEnrollments ran a SELECT of due rows followed by a separate UPDATE
-- that pushed next_execution_at into the future to "claim" them. Between those
-- two statements another executor run — the cron fires every 5 minutes and a
-- run may take up to 300 s, so overlap is the normal case, not the edge case —
-- could SELECT the same rows. Both runs then executed the same enrollment and
-- sent the same LinkedIn invitation or DM twice, which is the one failure mode
-- this system exists to prevent (duplicate outreach gets accounts restricted).
--
-- Doing the select and the claim in a single UPDATE ... FROM (SELECT ... FOR
-- UPDATE SKIP LOCKED) closes the window: the row locks are held for the whole
-- statement, and a concurrent caller skips locked rows rather than blocking on
-- them or duplicating them. Each due enrollment is handed to exactly one run.
--
-- RETURNING e.* yields the post-update row, so `next_execution_at` on the
-- returned record is the claim deadline rather than the original due time. The
-- executor does not read that field off the enrollment (it reads created_at and
-- current_step), and it overwrites it on every step outcome.
--
-- SECURITY INVOKER to match increment_settings_counter / increment_campaign_stat:
-- RLS still scopes any user-context call, and the service-role cron client
-- bypasses RLS as it already does elsewhere.

CREATE OR REPLACE FUNCTION claim_due_enrollments(
  p_limit INTEGER,
  p_claim_until TIMESTAMPTZ
)
RETURNS SETOF sequence_enrollments
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE sequence_enrollments e
  SET next_execution_at = p_claim_until
  FROM (
    SELECT id
    FROM sequence_enrollments
    WHERE status = 'active'
      AND next_execution_at IS NOT NULL
      AND next_execution_at <= NOW()
    ORDER BY next_execution_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) due
  WHERE e.id = due.id
  RETURNING e.*;
$$;

-- Only the cron executor (service role) should be able to claim work. Left
-- callable by `authenticated`, any signed-in user could reschedule every
-- enrollment in their tenant out of the executor's reach.
REVOKE ALL ON FUNCTION claim_due_enrollments(INTEGER, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_due_enrollments(INTEGER, TIMESTAMPTZ) TO service_role;
