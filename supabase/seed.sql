-- seed.sql
-- Default outreach sequence template
-- This seed requires a user to exist. It uses a placeholder user_id that should
-- be replaced with the actual user's UUID after first sign-up, or run via a
-- Supabase Edge Function that injects auth.uid().

-- To use: after creating your first user, replace the user_id below with your
-- actual user UUID, then run: npx supabase db seed

DO $$
DECLARE
  v_user_id UUID;
  v_sequence_id UUID;
  v_template_connect_id UUID;
  v_template_msg1_id UUID;
  v_template_followup_id UUID;
BEGIN
  -- Get the first user (adjust this query for your setup)
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  -- If no user exists, skip seeding
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No user found in auth.users. Skipping seed data. Create a user first, then re-run.';
    RETURN;
  END IF;

  -- Create message templates
  INSERT INTO templates (id, user_id, name, category, body, variables)
  VALUES (
    gen_random_uuid(),
    v_user_id,
    'Connection Request',
    'connection_request',
    'Hi {{first_name}}, I came across your work at {{company}} and thought it''d be worth connecting — we work with teams tackling similar problems. Would be glad to swap notes.',
    ARRAY['first_name', 'company']
  )
  RETURNING id INTO v_template_connect_id;

  INSERT INTO templates (id, user_id, name, category, body, variables)
  VALUES (
    gen_random_uuid(),
    v_user_id,
    'Intro Message',
    'message',
    'Thanks for connecting, {{first_name}}! Quick bit of context on why I reached out — teams in a {{job_title}} seat usually tell us the same few things are eating their week, and that''s the problem we work on. Worth a 15-minute call to see whether it maps to how {{company}} runs things?',
    ARRAY['first_name', 'job_title', 'company']
  )
  RETURNING id INTO v_template_msg1_id;

  INSERT INTO templates (id, user_id, name, category, body, variables)
  VALUES (
    gen_random_uuid(),
    v_user_id,
    'Follow-up',
    'follow_up',
    'Hi {{first_name}}, just following up on my note. Happy to put together a short walkthrough tailored to {{company}} if it''s useful — and equally happy to leave it if the timing''s wrong. Would Thursday or Friday work for 15 minutes?',
    ARRAY['first_name', 'company']
  )
  RETURNING id INTO v_template_followup_id;

  -- Create the default outreach sequence
  INSERT INTO sequences (id, user_id, name, description, is_default)
  VALUES (
    gen_random_uuid(),
    v_user_id,
    'Standard Outreach (5-step)',
    'Default outreach sequence: connect → intro message → follow-up',
    TRUE
  )
  RETURNING id INTO v_sequence_id;

  -- Step 1: Connection Request
  INSERT INTO sequence_steps (sequence_id, step_order, step_type, template_id, message_body)
  VALUES (
    v_sequence_id,
    1,
    'connection_request',
    v_template_connect_id,
    'Hi {{first_name}}, I came across your work at {{company}} and thought it''d be worth connecting — we work with teams tackling similar problems. Would be glad to swap notes.'
  );

  -- Step 2: Delay 2 days (wait for acceptance)
  INSERT INTO sequence_steps (sequence_id, step_order, step_type, delay_days)
  VALUES (
    v_sequence_id,
    2,
    'delay',
    2
  );

  -- Step 3: First message (after acceptance)
  INSERT INTO sequence_steps (sequence_id, step_order, step_type, template_id, message_body)
  VALUES (
    v_sequence_id,
    3,
    'message',
    v_template_msg1_id,
    'Thanks for connecting, {{first_name}}! Quick bit of context on why I reached out — teams in a {{job_title}} seat usually tell us the same few things are eating their week, and that''s the problem we work on. Worth a 15-minute call to see whether it maps to how {{company}} runs things?'
  );

  -- Step 4: Delay 3 days
  INSERT INTO sequence_steps (sequence_id, step_order, step_type, delay_days)
  VALUES (
    v_sequence_id,
    4,
    'delay',
    3
  );

  -- Step 5: Follow-up (if no reply)
  INSERT INTO sequence_steps (sequence_id, step_order, step_type, template_id, message_body)
  VALUES (
    v_sequence_id,
    5,
    'message',
    v_template_followup_id,
    'Hi {{first_name}}, just following up on my note. Happy to put together a short walkthrough tailored to {{company}} if it''s useful — and equally happy to leave it if the timing''s wrong. Would Thursday or Friday work for 15 minutes?'
  );

  RAISE NOTICE 'Seed data created successfully for user %', v_user_id;
END $$;
