-- Drop existing user policies
DROP POLICY IF EXISTS "Users can view profiles" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Create new user policies that allow creation
CREATE POLICY "Enable insert for authenticated users" ON users
  FOR INSERT WITH CHECK (auth.uid()::text = clerk_id);

CREATE POLICY "Enable read access for all users" ON users
  FOR SELECT USING (true);

CREATE POLICY "Enable update for users based on clerk_id" ON users
  FOR UPDATE USING (auth.uid()::text = clerk_id);

-- Fix board policies to check authenticated user
DROP POLICY IF EXISTS "Users can view boards they participate in" ON boards;
DROP POLICY IF EXISTS "Board owners can update their boards" ON boards;
DROP POLICY IF EXISTS "Users can create boards" ON boards;

CREATE POLICY "Enable read for users who participate" ON boards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM board_participants bp
      JOIN users u ON bp.user_id = u.id
      WHERE bp.board_id = boards.id
      AND u.clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable insert for authenticated users" ON boards
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = owner_id
      AND clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable update for board owners" ON boards
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = owner_id
      AND clerk_id = auth.uid()::text
    )
  );

-- Fix board_participants policies
DROP POLICY IF EXISTS "Participants can view cards" ON cards;
DROP POLICY IF EXISTS "Participants can create cards" ON cards;
DROP POLICY IF EXISTS "Authors can update own cards" ON cards;

CREATE POLICY "Enable insert for board participants" ON board_participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = user_id
      AND clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable read for participants" ON board_participants
  FOR SELECT USING (true);

-- Fix columns policies
DROP POLICY IF EXISTS "Users can view columns of boards they participate in" ON columns;
DROP POLICY IF EXISTS "Board owners can manage columns" ON columns;

CREATE POLICY "Enable read for board participants" ON columns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM boards b
      JOIN board_participants bp ON b.id = bp.board_id
      JOIN users u ON bp.user_id = u.id
      WHERE b.id = board_id
      AND u.clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable insert for board owners" ON columns
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM boards b
      JOIN users u ON b.owner_id = u.id
      WHERE b.id = board_id
      AND u.clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable update for board owners" ON columns
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM boards b
      JOIN users u ON b.owner_id = u.id
      WHERE b.id = board_id
      AND u.clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable delete for board owners" ON columns
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM boards b
      JOIN users u ON b.owner_id = u.id
      WHERE b.id = board_id
      AND u.clerk_id = auth.uid()::text
    )
  );

-- Fix cards policies
CREATE POLICY "Enable read for board participants" ON cards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM columns c
      JOIN boards b ON c.board_id = b.id
      JOIN board_participants bp ON b.id = bp.board_id
      JOIN users u ON bp.user_id = u.id
      WHERE c.id = column_id
      AND u.clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable insert for board participants" ON cards
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM columns c
      JOIN boards b ON c.board_id = b.id
      JOIN board_participants bp ON b.id = bp.board_id
      JOIN users u ON bp.user_id = u.id
      WHERE c.id = column_id
      AND u.clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable update for card authors" ON cards
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = author_id
      AND clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable delete for card authors" ON cards
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = author_id
      AND clerk_id = auth.uid()::text
    )
  );

-- Fix card_votes policies
CREATE POLICY "Enable all for authenticated users on votes" ON card_votes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = user_id
      AND clerk_id = auth.uid()::text
    )
  );

-- Fix poker session policies
DROP POLICY IF EXISTS "Users can view poker sessions they participate in" ON poker_sessions;
DROP POLICY IF EXISTS "Session owners can update their sessions" ON poker_sessions;
DROP POLICY IF EXISTS "Users can create poker sessions" ON poker_sessions;

CREATE POLICY "Enable read for participants" ON poker_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM poker_participants pp
      JOIN users u ON pp.user_id = u.id
      WHERE pp.session_id = poker_sessions.id
      AND u.clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable insert for authenticated users" ON poker_sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = owner_id
      AND clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable update for session owners" ON poker_sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = owner_id
      AND clerk_id = auth.uid()::text
    )
  );

-- Fix poker_participants policies
CREATE POLICY "Enable insert for poker participants" ON poker_participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = user_id
      AND clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable read for all" ON poker_participants
  FOR SELECT USING (true);

-- Fix stories policies
CREATE POLICY "Enable read for session participants" ON stories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM poker_sessions ps
      JOIN poker_participants pp ON ps.id = pp.session_id
      JOIN users u ON pp.user_id = u.id
      WHERE ps.id = session_id
      AND u.clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable insert for session owners" ON stories
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM poker_sessions ps
      JOIN users u ON ps.owner_id = u.id
      WHERE ps.id = session_id
      AND u.clerk_id = auth.uid()::text
    )
  );

CREATE POLICY "Enable update for session owners" ON stories
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM poker_sessions ps
      JOIN users u ON ps.owner_id = u.id
      WHERE ps.id = session_id
      AND u.clerk_id = auth.uid()::text
    )
  );

-- Fix poker_votes policies
CREATE POLICY "Enable all for vote owners" ON poker_votes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = user_id
      AND clerk_id = auth.uid()::text
    )
  );