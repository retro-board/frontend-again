-- Fix cards table to support anonymous authors
-- Add anonymous_author_id column
ALTER TABLE cards ADD COLUMN IF NOT EXISTS anonymous_author_id UUID REFERENCES anonymous_users(id);

-- Make author_id nullable since anonymous users won't have a user_id
ALTER TABLE cards ALTER COLUMN author_id DROP NOT NULL;

-- Add check constraint to ensure exactly one of author_id or anonymous_author_id is set
ALTER TABLE cards ADD CONSTRAINT cards_author_xor_anonymous 
  CHECK (
    (author_id IS NOT NULL AND anonymous_author_id IS NULL) OR 
    (author_id IS NULL AND anonymous_author_id IS NOT NULL)
  );

-- Update RLS policies to handle anonymous authors
CREATE POLICY "Anonymous users can create their own cards" ON cards
  FOR INSERT WITH CHECK (
    anonymous_author_id IS NOT NULL
  );

CREATE POLICY "Anonymous users can update their own cards" ON cards
  FOR UPDATE USING (
    anonymous_author_id IS NOT NULL
  );

CREATE POLICY "Anonymous users can delete their own cards" ON cards
  FOR DELETE USING (
    anonymous_author_id IS NOT NULL
  );