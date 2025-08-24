-- Add 'join' phase to the boards phase column check constraint
-- This allows a new phase between 'setup' and 'creation' where users can join before the timer starts

-- First, drop the existing constraint
ALTER TABLE boards 
DROP CONSTRAINT IF EXISTS boards_phase_check;

-- Add the new constraint with 'join' phase included
ALTER TABLE boards 
ADD CONSTRAINT boards_phase_check 
CHECK (phase IN ('setup', 'join', 'creation', 'voting', 'discussion', 'completed'));

-- Update any existing boards that might be affected (optional, for safety)
-- This ensures no boards are stuck in an invalid state
UPDATE boards 
SET phase = 'join' 
WHERE phase = 'setup' 
  AND id IN (
    SELECT board_id 
    FROM board_participants 
    GROUP BY board_id 
    HAVING COUNT(*) > 1
  )
  AND created_at > NOW() - INTERVAL '1 hour';

-- Note: The above UPDATE is optional and only affects recently created boards
-- in setup phase that already have multiple participants (shouldn't happen normally)