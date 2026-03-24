-- 20240101000000_create_enums.sql

CREATE TYPE lead_status AS ENUM (
  'new',              -- Just scraped/imported, not contacted
  'enriched',         -- Profile enriched with Apify data
  'invite_sent',      -- Connection request sent
  'invite_accepted',  -- They accepted the connection
  'invite_expired',   -- Invitation expired/withdrawn
  'message_sent',     -- First DM sent
  'replied',          -- They replied to our message
  'interested',       -- Positive reply / showed interest
  'not_interested',   -- Negative reply / declined
  'meeting_booked',   -- Demo/call scheduled
  'converted',        -- Became a customer/trial user
  'do_not_contact'    -- Opted out or marked DNC
);

CREATE TYPE campaign_status AS ENUM (
  'draft', 'active', 'paused', 'completed', 'archived'
);

CREATE TYPE sequence_step_type AS ENUM (
  'connection_request',   -- Send LinkedIn invite (with optional note)
  'wait_for_acceptance',  -- Wait until invite is accepted
  'message',              -- Send LinkedIn DM
  'delay',                -- Wait N hours/days
  'condition'             -- Branch based on reply status
);

CREATE TYPE activity_type AS ENUM (
  'lead_created',
  'lead_enriched',
  'invite_sent',
  'invite_accepted',
  'invite_expired',
  'message_sent',
  'message_received',
  'reply_detected',
  'status_changed',
  'campaign_started',
  'campaign_paused',
  'error'
);

CREATE TYPE icp_segment AS ENUM (
  'high_volume_chemo',       -- Segment A
  'precision_oncology',      -- Segment B
  'insurance_heavy_urban'    -- Segment C
);
