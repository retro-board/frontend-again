-- Add abstention tracking to poker participants
ALTER TABLE poker_participants
ADD COLUMN is_abstaining BOOLEAN DEFAULT false;

-- Add index for quick abstention lookups
CREATE INDEX idx_poker_participants_abstaining ON poker_participants(session_id, is_abstaining)
WHERE is_abstaining = true;