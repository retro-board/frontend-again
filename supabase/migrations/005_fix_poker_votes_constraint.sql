-- Fix poker_votes to properly handle anonymous users
-- First, make user_id nullable since anonymous users won't have a user_id
ALTER TABLE poker_votes ALTER COLUMN user_id DROP NOT NULL;

-- Drop the existing constraint
ALTER TABLE poker_votes DROP CONSTRAINT IF EXISTS poker_votes_unique;

-- Add new constraint that properly handles NULL values
-- This creates a partial unique index for when user_id is NOT NULL
CREATE UNIQUE INDEX poker_votes_user_unique 
  ON poker_votes (story_id, user_id) 
  WHERE user_id IS NOT NULL;

-- And another partial unique index for when anonymous_user_id is NOT NULL
CREATE UNIQUE INDEX poker_votes_anonymous_unique 
  ON poker_votes (story_id, anonymous_user_id) 
  WHERE anonymous_user_id IS NOT NULL;

-- Add check constraint to ensure exactly one of user_id or anonymous_user_id is set
ALTER TABLE poker_votes ADD CONSTRAINT poker_votes_user_xor_anonymous 
  CHECK (
    (user_id IS NOT NULL AND anonymous_user_id IS NULL) OR 
    (user_id IS NULL AND anonymous_user_id IS NOT NULL)
  );

-- Add RLS policy for anonymous users
CREATE POLICY "Anonymous users can manage their votes" ON poker_votes
  FOR ALL USING (
    anonymous_user_id IS NOT NULL
  );

-- Also fix card_votes for consistency
ALTER TABLE card_votes ALTER COLUMN user_id DROP NOT NULL;

-- Drop the existing constraint for card_votes
ALTER TABLE card_votes DROP CONSTRAINT IF EXISTS card_votes_unique;

-- Add similar constraints for card_votes
CREATE UNIQUE INDEX card_votes_user_unique 
  ON card_votes (card_id, user_id) 
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX card_votes_anonymous_unique 
  ON card_votes (card_id, anonymous_user_id) 
  WHERE anonymous_user_id IS NOT NULL;

-- Add check constraint for card_votes
ALTER TABLE card_votes ADD CONSTRAINT card_votes_user_xor_anonymous 
  CHECK (
    (user_id IS NOT NULL AND anonymous_user_id IS NULL) OR 
    (user_id IS NULL AND anonymous_user_id IS NOT NULL)
  );

-- Add RLS policy for anonymous users on card_votes
CREATE POLICY "Anonymous users can manage their card votes" ON card_votes
  FOR ALL USING (
    anonymous_user_id IS NOT NULL
  );