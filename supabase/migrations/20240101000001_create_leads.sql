-- 20240101000001_create_leads.sql
-- Note: campaign_id FK added in 20240101000002 after campaigns table exists

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,

  -- LinkedIn Identity
  linkedin_public_id TEXT,
  linkedin_provider_id TEXT,
  linkedin_member_urn TEXT,
  linkedin_profile_url TEXT,
  linkedin_profile_picture_url TEXT,

  -- Personal Info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  headline TEXT,
  email TEXT,
  phone TEXT,

  -- Professional Info
  job_title TEXT,
  company TEXT,
  company_linkedin_id TEXT,
  location TEXT,
  city TEXT,
  country TEXT,
  specialty TEXT,
  experience_years INTEGER,

  -- ICP Classification
  icp_segment icp_segment,
  icp_score INTEGER DEFAULT 0,
  hospital_type TEXT,
  target_region TEXT,

  -- Outreach Status
  status lead_status DEFAULT 'new',
  campaign_id UUID,  -- FK added after campaigns table is created

  -- Unipile Chat Tracking
  unipile_chat_id TEXT,

  -- Enrichment Data (from Apify)
  enrichment_data JSONB DEFAULT '{}',
  skills TEXT[],
  education JSONB DEFAULT '[]',
  experience JSONB DEFAULT '[]',

  -- Metadata
  source TEXT DEFAULT 'linkedin_search',
  tags TEXT[] DEFAULT '{}',
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE(user_id, linkedin_public_id)
);

CREATE INDEX idx_leads_user_status ON leads(user_id, status);
CREATE INDEX idx_leads_user_campaign ON leads(user_id, campaign_id);
CREATE INDEX idx_leads_linkedin_provider ON leads(linkedin_provider_id);
CREATE INDEX idx_leads_unipile_chat ON leads(unipile_chat_id);
