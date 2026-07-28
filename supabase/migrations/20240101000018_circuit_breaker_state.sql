-- 20240101000018_circuit_breaker_state.sql
-- Durable storage for the Unipile circuit-breaker state.
--
-- The breaker lived in a module-level singleton. On Vercel each serverless
-- invocation can be a fresh isolate, so the cron executor that trips the
-- breaker and the /api/circuit-breaker/status endpoint the dashboard polls are
-- routinely different instances. That meant the banner could read CLOSED while
-- sends were being rejected, "Reset" reset an unrelated instance, and the
-- executor's early-bail on an OPEN circuit was unreliable.
--
-- Single-row table (id is a fixed sentinel) — the breaker is per-deployment,
-- not per-user, because it models the health of the shared Unipile dependency.

CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  id TEXT PRIMARY KEY DEFAULT 'unipile',
  state TEXT NOT NULL DEFAULT 'CLOSED'
    CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failures INTEGER NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single row so readers never have to handle "no row yet".
INSERT INTO circuit_breaker_state (id)
VALUES ('unipile')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE circuit_breaker_state ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read the breaker (the dashboard banner shows it);
-- only the service role may write, since it reflects system-wide state rather
-- than anything a user owns.
CREATE POLICY "Authenticated users can read circuit breaker state"
  ON circuit_breaker_state FOR SELECT
  TO authenticated
  USING (true);
