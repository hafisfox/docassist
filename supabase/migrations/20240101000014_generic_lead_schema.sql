-- 20240101000014_generic_lead_schema.sql
--
-- De-verticalises the lead schema. The original columns and ICP segments were
-- shaped around a healthcare ICP (specialty / hospital_type / hospital_name and
-- chemo/oncology segments); this makes them domain-neutral so the engine can be
-- pointed at any B2B ICP.
--
-- Field semantics after this migration (previously the two "segment"-ish fields
-- overlapped):
--   icp_segment  (enum) — company size tier: enterprise | mid_market | smb
--   account_type (text) — org category:     corporate | agency | nonprofit |
--                                            public_sector | startup
--
-- Every step is guarded, because the earlier migrations were also updated to
-- create the generic shape directly. On an existing database this migration
-- does the real work; on a fresh `supabase db reset` it is a no-op.
--
-- NOTE: /api/webhooks/n8n still accepts the legacy `hospital_name` / `specialty`
-- keys on the wire, because the live n8n workflows and their Google Sheets
-- columns are unchanged. See src/app/api/webhooks/n8n/route.ts.

-- ── Column renames ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'specialty'
  ) THEN
    ALTER TABLE leads RENAME COLUMN specialty TO industry;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'hospital_type'
  ) THEN
    ALTER TABLE leads RENAME COLUMN hospital_type TO account_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'hospital_name'
  ) THEN
    ALTER TABLE leads RENAME COLUMN hospital_name TO account_name;
  END IF;
END
$$;

-- ── icp_segment enum: healthcare segments → generic B2B size tiers ──────────
-- Postgres cannot rewrite an enum's labels in place while columns depend on it,
-- so the old type is renamed aside, a new one created, dependent columns
-- remapped, and the old type dropped.
DO $$
BEGIN
  -- Nothing to do if the enum already carries the generic labels.
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace ns ON ns.oid = t.typnamespace
    WHERE ns.nspname = 'public'
      AND t.typname = 'icp_segment'
      AND e.enumlabel = 'high_volume_chemo'
  ) THEN
    ALTER TYPE icp_segment RENAME TO icp_segment_old;

    CREATE TYPE icp_segment AS ENUM (
      'enterprise',   -- was high_volume_chemo     (Segment A)
      'mid_market',   -- was precision_oncology    (Segment B)
      'smb'           -- was insurance_heavy_urban (Segment C)
    );

    -- leads.icp_segment — scalar, so a CASE in USING is sufficient.
    ALTER TABLE leads
      ALTER COLUMN icp_segment TYPE icp_segment
      USING (
        CASE icp_segment::text
          WHEN 'high_volume_chemo'     THEN 'enterprise'
          WHEN 'precision_oncology'    THEN 'mid_market'
          WHEN 'insurance_heavy_urban' THEN 'smb'
        END
      )::icp_segment;

    -- campaigns.icp_segments — an array. ALTER ... USING forbids subqueries, so
    -- the remap goes via text[] with an UPDATE in between.
    ALTER TABLE campaigns
      ALTER COLUMN icp_segments TYPE text[]
      USING icp_segments::text[];

    UPDATE campaigns
    SET icp_segments = ARRAY(
      SELECT CASE s
               WHEN 'high_volume_chemo'     THEN 'enterprise'
               WHEN 'precision_oncology'    THEN 'mid_market'
               WHEN 'insurance_heavy_urban' THEN 'smb'
               ELSE s
             END
      FROM unnest(icp_segments) AS s
    )
    WHERE icp_segments IS NOT NULL;

    ALTER TABLE campaigns
      ALTER COLUMN icp_segments TYPE icp_segment[]
      USING icp_segments::icp_segment[];

    DROP TYPE icp_segment_old;
  END IF;
END
$$;
