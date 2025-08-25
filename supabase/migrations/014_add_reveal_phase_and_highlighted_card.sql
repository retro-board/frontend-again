-- Add 'reveal' to the allowed phases
ALTER TABLE boards 
DROP CONSTRAINT IF EXISTS boards_phase_check;

ALTER TABLE boards 
ADD CONSTRAINT boards_phase_check 
CHECK (phase IN ('setup', 'join', 'creation', 'reveal', 'voting', 'discussion', 'completed'));

-- Add columns for card highlighting
ALTER TABLE boards
ADD COLUMN IF NOT EXISTS highlighted_card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS highlighted_at TIMESTAMPTZ;

-- Create index for highlighted card lookup
CREATE INDEX IF NOT EXISTS idx_boards_highlighted_card_id ON boards(highlighted_card_id);

-- Update any boards that were in 'voting' phase back to 'reveal' if they haven't started voting yet
-- (This is optional and can be removed if not needed)
UPDATE boards 
SET phase = 'reveal' 
WHERE phase = 'voting' 
  AND phase_started_at IS NULL;

COMMENT ON COLUMN boards.highlighted_card_id IS 'The currently highlighted card for discussion';
COMMENT ON COLUMN boards.highlighted_at IS 'When the current card was highlighted';