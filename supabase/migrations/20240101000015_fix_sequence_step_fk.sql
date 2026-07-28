-- 20240101000015_fix_sequence_step_fk.sql
-- messages.sequence_step_id was declared as a plain REFERENCES with no ON
-- DELETE clause, which defaults to NO ACTION. The sequence editor updates
-- steps by deleting every row for the sequence and re-inserting, and the
-- executor stamps sequence_step_id on every automated send — so as soon as one
-- message had been sent through a sequence, editing or deleting it raised
-- foreign-key violation 23503 and the route returned a 500.
--
-- SET NULL is the right semantics: the message genuinely was sent, it just no
-- longer maps to a step that exists. The column is already nullable.

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_sequence_step_id_fkey;

ALTER TABLE messages
  ADD CONSTRAINT messages_sequence_step_id_fkey
  FOREIGN KEY (sequence_step_id)
  REFERENCES sequence_steps(id)
  ON DELETE SET NULL;
