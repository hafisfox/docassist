-- 20240101000007_create_settings.sql

CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,

  -- Unipile Config
  unipile_account_id TEXT,
  unipile_account_status TEXT,

  -- Daily Limits
  max_daily_invites INTEGER DEFAULT 25,
  max_daily_messages INTEGER DEFAULT 50,
  max_daily_profile_views INTEGER DEFAULT 80,

  -- Timing
  outreach_start_hour INTEGER DEFAULT 9,
  outreach_end_hour INTEGER DEFAULT 18,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  min_delay_seconds INTEGER DEFAULT 30,
  max_delay_seconds INTEGER DEFAULT 120,

  -- Daily counters (reset at midnight)
  invites_sent_today INTEGER DEFAULT 0,
  messages_sent_today INTEGER DEFAULT 0,
  counters_reset_at DATE DEFAULT CURRENT_DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
