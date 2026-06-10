-- 20240101000012_enable_realtime.sql
-- Adds the tables the dashboard subscribes to (postgres_changes in
-- useLeads, useCampaigns, useLeadDetail, useRealtimeMessages) to the
-- supabase_realtime publication. Without this, realtime subscriptions
-- connect but never receive events on a fresh database.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads', 'messages', 'campaigns', 'activities']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
