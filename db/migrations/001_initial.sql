-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Clerk user data)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Boards table for retro boards
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Columns for retro boards (dynamic number of columns)
CREATE TABLE columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#gray',
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cards in retro board columns
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  column_id UUID NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES users(id),
  position INTEGER NOT NULL,
  is_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Votes on cards
CREATE TABLE card_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(card_id, user_id)
);

-- Board participants
CREATE TABLE board_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT CHECK (role IN ('owner', 'participant', 'observer')) DEFAULT 'participant',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(board_id, user_id)
);

-- Sprint poker sessions
CREATE TABLE poker_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES users(id),
  estimation_type TEXT CHECK (estimation_type IN ('fibonacci', 'tshirt', 'oneToTen')) NOT NULL,
  current_story_id UUID,
  is_active BOOLEAN DEFAULT true,
  reveal_votes BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stories for sprint poker
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES poker_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  final_estimate TEXT,
  position INTEGER NOT NULL,
  is_estimated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Votes for sprint poker
CREATE TABLE poker_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  vote_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(story_id, user_id)
);

-- Sprint poker participants
CREATE TABLE poker_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES poker_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT CHECK (role IN ('facilitator', 'voter', 'observer')) DEFAULT 'voter',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_boards_owner ON boards(owner_id);
CREATE INDEX idx_columns_board ON columns(board_id);
CREATE INDEX idx_cards_column ON cards(column_id);
CREATE INDEX idx_cards_author ON cards(author_id);
CREATE INDEX idx_board_participants_board ON board_participants(board_id);
CREATE INDEX idx_board_participants_user ON board_participants(user_id);
CREATE INDEX idx_poker_sessions_owner ON poker_sessions(owner_id);
CREATE INDEX idx_stories_session ON stories(session_id);
CREATE INDEX idx_poker_participants_session ON poker_participants(session_id);
CREATE INDEX idx_poker_participants_user ON poker_participants(user_id);


-- Add abstention tracking to poker participants
ALTER TABLE poker_participants
ADD COLUMN is_abstaining BOOLEAN DEFAULT false;

-- Add index for quick abstention lookups
CREATE INDEX idx_poker_participants_abstaining ON poker_participants(session_id, is_abstaining)
WHERE is_abstaining = true;
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


ALTER TABLE boards DROP CONSTRAINT boards_phase_check;
ALTER TABLE boards ADD CONSTRAINT boards_phase_check CHECK (phase IN ('setup','join','creation','reveal','voting','discussion','completed'));
ALTER TABLE boards ADD COLUMN highlighted_card_id UUID REFERENCES cards(id) ON DELETE SET NULL;
ALTER TABLE boards ADD COLUMN highlighted_at TIMESTAMPTZ;
CREATE INDEX idx_boards_highlighted_card_id ON boards(highlighted_card_id);

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


ALTER TABLE stories ADD COLUMN estimated_at TIMESTAMPTZ;
