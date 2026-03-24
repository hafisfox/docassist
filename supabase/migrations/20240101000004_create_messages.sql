-- 20240101000004_create_messages.sql

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES leads(id),
  campaign_id UUID REFERENCES campaigns(id),

  -- Unipile References
  unipile_chat_id TEXT,
  unipile_message_id TEXT,

  -- Content
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',

  -- Status
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  is_automated BOOLEAN DEFAULT TRUE,

  -- Metadata
  sequence_step_id UUID REFERENCES sequence_steps(id),
  personalization_variables JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_lead ON messages(lead_id, created_at DESC);
CREATE INDEX idx_messages_chat ON messages(unipile_chat_id, created_at DESC);
