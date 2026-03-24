-- 20240101000009_rls_policies.sql

-- Enable RLS on all tables
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Leads: users can only access their own leads
CREATE POLICY "Users can only access own leads"
  ON leads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Campaigns: users can only access their own campaigns
CREATE POLICY "Users can only access own campaigns"
  ON campaigns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sequences: users can only access their own sequences
CREATE POLICY "Users can only access own sequences"
  ON sequences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sequence steps: users can access steps of their own sequences
CREATE POLICY "Users can only access own sequence steps"
  ON sequence_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sequences
      WHERE sequences.id = sequence_steps.sequence_id
        AND sequences.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sequences
      WHERE sequences.id = sequence_steps.sequence_id
        AND sequences.user_id = auth.uid()
    )
  );

-- Sequence enrollments: users can access enrollments of their own campaigns
CREATE POLICY "Users can only access own sequence enrollments"
  ON sequence_enrollments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = sequence_enrollments.campaign_id
        AND campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = sequence_enrollments.campaign_id
        AND campaigns.user_id = auth.uid()
    )
  );

-- Messages: users can only access their own messages
CREATE POLICY "Users can only access own messages"
  ON messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Activities: users can only access their own activities
CREATE POLICY "Users can only access own activities"
  ON activities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Templates: users can only access their own templates
CREATE POLICY "Users can only access own templates"
  ON templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Settings: users can only access their own settings
CREATE POLICY "Users can only access own settings"
  ON settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Webhook logs: service role only (for edge functions)
CREATE POLICY "Service role only for webhook_logs"
  ON webhook_logs FOR ALL
  USING (auth.role() = 'service_role');
