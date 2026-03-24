-- 20240101000002_create_campaigns.sql
-- Note: sequence_id FK added in 20240101000003 after sequences table exists

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status campaign_status DEFAULT 'draft',
  sequence_id UUID,  -- FK added after sequences table is created

  -- Targeting
  search_query JSONB,
  icp_segments icp_segment[],
  target_titles TEXT[],
  target_locations TEXT[],
  target_companies TEXT[],

  -- Limits
  daily_invite_limit INTEGER DEFAULT 25,
  daily_message_limit INTEGER DEFAULT 50,

  -- Stats (denormalized for fast reads)
  total_leads INTEGER DEFAULT 0,
  invites_sent INTEGER DEFAULT 0,
  invites_accepted INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  positive_replies INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Now add the FK from leads -> campaigns
ALTER TABLE leads
  ADD CONSTRAINT leads_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id);
