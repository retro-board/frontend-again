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

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_participants ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile and other participants
CREATE POLICY "Users can view profiles" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid()::text = clerk_id);

-- Board policies
CREATE POLICY "Users can view boards they participate in" ON boards
  FOR SELECT USING (
    owner_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
    OR id IN (SELECT board_id FROM board_participants WHERE user_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text))
  );

CREATE POLICY "Board owners can update their boards" ON boards
  FOR UPDATE USING (owner_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

CREATE POLICY "Users can create boards" ON boards
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

-- Columns policies
CREATE POLICY "Users can view columns of boards they participate in" ON columns
  FOR SELECT USING (
    board_id IN (
      SELECT id FROM boards WHERE 
      owner_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
      OR id IN (SELECT board_id FROM board_participants WHERE user_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text))
    )
  );

CREATE POLICY "Board owners can manage columns" ON columns
  FOR ALL USING (
    board_id IN (SELECT id FROM boards WHERE owner_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text))
  );

-- Cards policies
CREATE POLICY "Participants can view cards" ON cards
  FOR SELECT USING (
    column_id IN (
      SELECT id FROM columns WHERE board_id IN (
        SELECT board_id FROM board_participants WHERE user_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
      )
    )
  );

CREATE POLICY "Participants can create cards" ON cards
  FOR INSERT WITH CHECK (
    author_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
    AND column_id IN (
      SELECT id FROM columns WHERE board_id IN (
        SELECT board_id FROM board_participants WHERE user_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
      )
    )
  );

CREATE POLICY "Authors can update own cards" ON cards
  FOR UPDATE USING (author_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

-- Similar policies for poker tables
CREATE POLICY "Users can view poker sessions they participate in" ON poker_sessions
  FOR SELECT USING (
    owner_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
    OR id IN (SELECT session_id FROM poker_participants WHERE user_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text))
  );

CREATE POLICY "Session owners can update their sessions" ON poker_sessions
  FOR UPDATE USING (owner_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

CREATE POLICY "Users can create poker sessions" ON poker_sessions
  FOR INSERT WITH CHECK (owner_id IN (SELECT id FROM users WHERE clerk_id = auth.uid()::text));