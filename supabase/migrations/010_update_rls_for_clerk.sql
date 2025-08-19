-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can select own or public user info" ON users;
DROP POLICY IF EXISTS "Users can create boards" ON boards;
DROP POLICY IF EXISTS "Users can view own or participant boards" ON boards;
DROP POLICY IF EXISTS "Users can update own boards" ON boards;
DROP POLICY IF EXISTS "Users can delete own boards" ON boards;
DROP POLICY IF EXISTS "View board participants" ON board_participants;
DROP POLICY IF EXISTS "Add board participants" ON board_participants;
DROP POLICY IF EXISTS "Remove board participants" ON board_participants;

-- Enable RLS on tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_participants ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can update own profile" ON users
FOR UPDATE TO authenticated
USING (clerk_id = auth.uid()::text)
WITH CHECK (clerk_id = auth.uid()::text);

CREATE POLICY "Users can select own or public user info" ON users
FOR SELECT TO authenticated
USING (
    clerk_id = auth.uid()::text OR 
    true -- all users can see basic info of other users
);

-- Boards policies
CREATE POLICY "Users can create boards" ON boards
FOR INSERT TO authenticated
WITH CHECK (
    owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
);

CREATE POLICY "Users can view own or participant boards" ON boards
FOR SELECT TO authenticated
USING (
    owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text) OR 
    EXISTS (
        SELECT 1 
        FROM board_participants 
        WHERE board_participants.board_id = boards.id 
        AND board_participants.user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
    )
);

CREATE POLICY "Users can update own boards" ON boards
FOR UPDATE TO authenticated
USING (owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text))
WITH CHECK (owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

CREATE POLICY "Users can delete own boards" ON boards
FOR DELETE TO authenticated
USING (owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

-- Board participants policies
CREATE POLICY "View board participants" ON board_participants
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM boards 
        WHERE boards.id = board_participants.board_id 
        AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
    ) OR
    board_participants.user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text) OR
    EXISTS (
        SELECT 1 
        FROM board_participants bp 
        WHERE bp.board_id = board_participants.board_id 
        AND bp.user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
    )
);

CREATE POLICY "Add board participants" ON board_participants
FOR INSERT TO authenticated
WITH CHECK (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text) OR 
    EXISTS (
        SELECT 1 FROM boards 
        WHERE boards.id = board_participants.board_id 
        AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
    )
);

CREATE POLICY "Remove board participants" ON board_participants
FOR DELETE TO authenticated
USING (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text) OR 
    EXISTS (
        SELECT 1 FROM boards 
        WHERE boards.id = board_participants.board_id 
        AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
    )
);

-- Linked cards policies (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'linked_cards') THEN
        -- Enable RLS on linked_cards
        ALTER TABLE linked_cards ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Users can view linked cards in their boards" ON linked_cards;
        DROP POLICY IF EXISTS "Users can create linked cards in their boards" ON linked_cards;
        DROP POLICY IF EXISTS "Users can update linked cards in their boards" ON linked_cards;
        DROP POLICY IF EXISTS "Users can delete linked cards in their boards" ON linked_cards;
        
        -- Create policies for linked_cards based on board ownership/participation
        CREATE POLICY "Users can view linked cards in their boards" ON linked_cards
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = linked_cards.board_id 
                AND (
                    boards.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text) OR
                    EXISTS (
                        SELECT 1 FROM board_participants 
                        WHERE board_participants.board_id = boards.id 
                        AND board_participants.user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
                    )
                )
            )
        );
        
        CREATE POLICY "Users can create linked cards in their boards" ON linked_cards
        FOR INSERT TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = linked_cards.board_id 
                AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
            )
        );
        
        CREATE POLICY "Users can update linked cards in their boards" ON linked_cards
        FOR UPDATE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = linked_cards.board_id 
                AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = linked_cards.board_id 
                AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
            )
        );
        
        CREATE POLICY "Users can delete linked cards in their boards" ON linked_cards
        FOR DELETE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = linked_cards.board_id 
                AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
            )
        );
    END IF;
END $$;

-- Anonymous users table policies
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'anonymous_users') THEN
        ALTER TABLE anonymous_users ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Anonymous users are public" ON anonymous_users;
        
        -- Anonymous users can be viewed by anyone (they're public by nature)
        CREATE POLICY "Anonymous users are public" ON anonymous_users
        FOR ALL USING (true);
    END IF;
END $$;

-- Board anonymous participants policies
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'board_anonymous_participants') THEN
        ALTER TABLE board_anonymous_participants ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Board anonymous participants are viewable by board members" ON board_anonymous_participants;
        
        -- Anyone can view anonymous participants in boards they have access to
        CREATE POLICY "Board anonymous participants are viewable by board members" ON board_anonymous_participants
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = board_anonymous_participants.board_id 
                AND (
                    boards.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text) OR
                    EXISTS (
                        SELECT 1 FROM board_participants 
                        WHERE board_participants.board_id = boards.id 
                        AND board_participants.user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
                    )
                )
            )
        );
        
        -- Board owners can manage anonymous participants
        CREATE POLICY "Board owners can manage anonymous participants" ON board_anonymous_participants
        FOR ALL TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = board_anonymous_participants.board_id 
                AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
            )
        );
    END IF;
END $$;

-- Poker anonymous participants policies
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_anonymous_participants') THEN
        ALTER TABLE poker_anonymous_participants ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Poker anonymous participants viewable by session members" ON poker_anonymous_participants;
        DROP POLICY IF EXISTS "Session owners can manage poker anonymous participants" ON poker_anonymous_participants;
        
        -- Anyone can view anonymous participants in poker sessions they have access to
        CREATE POLICY "Poker anonymous participants viewable by session members" ON poker_anonymous_participants
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM poker_sessions 
                WHERE poker_sessions.id = poker_anonymous_participants.session_id 
                AND (
                    poker_sessions.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text) OR
                    EXISTS (
                        SELECT 1 FROM poker_participants 
                        WHERE poker_participants.session_id = poker_sessions.id 
                        AND poker_participants.user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
                    )
                )
            )
        );
        
        -- Session owners can manage anonymous participants
        CREATE POLICY "Session owners can manage poker anonymous participants" ON poker_anonymous_participants
        FOR ALL TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM poker_sessions 
                WHERE poker_sessions.id = poker_anonymous_participants.session_id 
                AND poker_sessions.owner_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text)
            )
        );
    END IF;
END $$;