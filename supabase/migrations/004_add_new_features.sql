-- Add share URLs and timer settings to boards
ALTER TABLE boards ADD COLUMN IF NOT EXISTS share_id UUID DEFAULT uuid_generate_v4() UNIQUE;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS creation_time_minutes INTEGER DEFAULT 5;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS voting_time_minutes INTEGER DEFAULT 5;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS votes_per_user INTEGER DEFAULT 3;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS phase TEXT CHECK (phase IN ('setup', 'creation', 'voting', 'discussion', 'completed')) DEFAULT 'setup';
ALTER TABLE boards ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS phase_ends_at TIMESTAMP WITH TIME ZONE;

-- Add share URLs to poker sessions
ALTER TABLE poker_sessions ADD COLUMN IF NOT EXISTS share_id UUID DEFAULT uuid_generate_v4() UNIQUE;
ALTER TABLE poker_sessions ADD COLUMN IF NOT EXISTS timer_seconds INTEGER DEFAULT 60;
ALTER TABLE poker_sessions ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE poker_sessions ADD COLUMN IF NOT EXISTS timer_ends_at TIMESTAMP WITH TIME ZONE;

-- Add masked field to cards
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_masked BOOLEAN DEFAULT true;

-- Add anonymous users table
CREATE TABLE IF NOT EXISTS anonymous_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT UNIQUE NOT NULL, -- Browser session ID
  display_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add anonymous participants for boards
CREATE TABLE IF NOT EXISTS board_anonymous_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  anonymous_user_id UUID NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(board_id, anonymous_user_id)
);

-- Add anonymous participants for poker
CREATE TABLE IF NOT EXISTS poker_anonymous_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES poker_sessions(id) ON DELETE CASCADE,
  anonymous_user_id UUID NOT NULL REFERENCES anonymous_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, anonymous_user_id)
);

-- Modify card_votes to support anonymous users
ALTER TABLE card_votes ADD COLUMN IF NOT EXISTS anonymous_user_id UUID REFERENCES anonymous_users(id);
ALTER TABLE card_votes DROP CONSTRAINT IF EXISTS card_votes_card_id_user_id_key;
ALTER TABLE card_votes ADD CONSTRAINT card_votes_unique UNIQUE (card_id, user_id, anonymous_user_id);

-- Modify poker_votes to support anonymous users
ALTER TABLE poker_votes ADD COLUMN IF NOT EXISTS anonymous_user_id UUID REFERENCES anonymous_users(id);
ALTER TABLE poker_votes DROP CONSTRAINT IF EXISTS poker_votes_story_id_user_id_key;
ALTER TABLE poker_votes ADD CONSTRAINT poker_votes_unique UNIQUE (story_id, user_id, anonymous_user_id);

-- Add linked cards table for grouping similar items
CREATE TABLE IF NOT EXISTS linked_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  primary_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  linked_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(primary_card_id, linked_card_id)
);

-- Add is_action flag to columns
ALTER TABLE columns ADD COLUMN IF NOT EXISTS is_action BOOLEAN DEFAULT false;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_boards_share_id ON boards(share_id);
CREATE INDEX IF NOT EXISTS idx_poker_sessions_share_id ON poker_sessions(share_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_users_session_id ON anonymous_users(session_id);
CREATE INDEX IF NOT EXISTS idx_linked_cards_board ON linked_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_linked_cards_primary ON linked_cards(primary_card_id);

-- Update RLS policies for anonymous access
-- Allow anonymous users to view boards via share_id
CREATE POLICY "Anonymous users can view boards via share_id" ON boards
  FOR SELECT USING (true);

CREATE POLICY "Anonymous users can view columns" ON columns
  FOR SELECT USING (true);

CREATE POLICY "Anonymous users can view cards when unmasked" ON cards
  FOR SELECT USING (
    NOT is_masked 
    OR (auth.uid() IS NOT NULL AND author_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text))
  );

-- Allow anonymous users to create cards in non-action columns
CREATE POLICY "Anonymous users can create cards in non-action columns" ON cards
  FOR INSERT WITH CHECK (
    column_id IN (SELECT id FROM columns WHERE is_action = false)
  );

-- Allow anonymous voting
CREATE POLICY "Anonymous users can vote" ON card_votes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anonymous users can view votes" ON card_votes
  FOR SELECT USING (true);