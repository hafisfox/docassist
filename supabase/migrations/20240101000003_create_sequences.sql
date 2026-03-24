-- 20240101000003_create_sequences.sql
-- Note: sequence_steps.template_id FK added in 20240101000006 after templates table exists

CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE NOT NULL,
  step_order INTEGER NOT NULL,
  step_type sequence_step_type NOT NULL,

  -- For message/connection_request steps
  template_id UUID,  -- FK added after templates table is created
  message_body TEXT,

  -- For delay steps
  delay_hours INTEGER,
  delay_days INTEGER,

  -- For condition steps
  condition_field TEXT,
  condition_value TEXT,
  on_true_step INTEGER,
  on_false_step INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sequence_id, step_order)
);

-- Tracks each lead's progress through a sequence
CREATE TABLE sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) NOT NULL,
  sequence_id UUID REFERENCES sequences(id) NOT NULL,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  next_execution_at TIMESTAMPTZ,
  last_executed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lead_id, campaign_id)
);

CREATE INDEX idx_enrollments_next_exec ON sequence_enrollments(next_execution_at)
  WHERE status = 'active';

-- Now add the FK from campaigns -> sequences
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_sequence_id_fkey
  FOREIGN KEY (sequence_id) REFERENCES sequences(id);
