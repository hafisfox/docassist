-- 20240101000019_updated_at_triggers.sql
-- Every table with an updated_at column had `DEFAULT NOW()` and nothing else:
-- no trigger, and only one write anywhere in the application code. So
-- updated_at equalled created_at in perpetuity.
--
-- That silently broke ordering, because several read paths sort by it:
--   • GET /api/templates   → .order("updated_at", { ascending: false })
--   • GET /api/sequences   → .order("updated_at", { ascending: false })
--   • listLeadsQuerySchema / listCampaignsQuerySchema expose it as a sort key
-- Editing a template or sequence did not move it in the list.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON leads;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON campaigns;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON sequences;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON sequences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON sequence_enrollments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON templates;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
