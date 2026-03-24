-- 20240101000006_create_templates.sql

CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'message',
  subject TEXT,
  body TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  is_ai_generated BOOLEAN DEFAULT FALSE,
  performance_score NUMERIC(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Now add the FK from sequence_steps -> templates
ALTER TABLE sequence_steps
  ADD CONSTRAINT sequence_steps_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES templates(id);
