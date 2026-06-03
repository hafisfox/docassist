-- 20240101000010_add_profile_views_counter.sql
-- Adds a daily profile-view counter so the rate limiter can enforce
-- max_daily_profile_views the same way it tracks invites and messages.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS profile_views_today INTEGER DEFAULT 0;
