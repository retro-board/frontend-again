-- Optimize RLS policies for better performance
-- This migration replaces multiple auth.uid() calls with a single subquery pattern
-- which significantly improves query performance in Supabase

-- Drop existing policies to replace with optimized versions
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can select own or public user info" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Users can create boards" ON boards;
DROP POLICY IF EXISTS "Users can view own or participant boards" ON boards;
DROP POLICY IF EXISTS "Users can update own boards" ON boards;
DROP POLICY IF EXISTS "Users can delete own boards" ON boards;
DROP POLICY IF EXISTS "View board participants" ON board_participants;
DROP POLICY IF EXISTS "Add board participants" ON board_participants;
DROP POLICY IF EXISTS "Remove board participants" ON board_participants;
DROP POLICY IF EXISTS "Board anonymous participants are viewable by board members" ON board_anonymous_participants;

-- Optimized Users policies
CREATE POLICY "Enable insert for authenticated users" ON users
FOR INSERT TO authenticated
WITH CHECK (clerk_id = (SELECT auth.uid()::text));

CREATE POLICY "Users can update own profile" ON users
FOR UPDATE TO authenticated
USING (clerk_id = (SELECT auth.uid()::text))
WITH CHECK (clerk_id = (SELECT auth.uid()::text));

CREATE POLICY "Users can select own or public user info" ON users
FOR SELECT TO authenticated
USING (
    clerk_id = (SELECT auth.uid()::text) OR 
    true -- all users can see basic info of other users
);

CREATE POLICY "Enable read access for all users" ON users
FOR SELECT USING (true);

-- Optimized Boards policies
CREATE POLICY "Users can create boards" ON boards
FOR INSERT TO authenticated
WITH CHECK (
    owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
);

CREATE POLICY "Users can view own or participant boards" ON boards
FOR SELECT TO authenticated
USING (
    owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)) OR 
    EXISTS (
        SELECT 1 
        FROM board_participants 
        WHERE board_participants.board_id = boards.id 
        AND board_participants.user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
    )
);

CREATE POLICY "Users can update own boards" ON boards
FOR UPDATE TO authenticated
USING (owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)))
WITH CHECK (owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)));

CREATE POLICY "Users can delete own boards" ON boards
FOR DELETE TO authenticated
USING (owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)));

-- Optimized Board participants policies
CREATE POLICY "View board participants" ON board_participants
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM boards 
        WHERE boards.id = board_participants.board_id 
        AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
    ) OR
    board_participants.user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)) OR
    EXISTS (
        SELECT 1 
        FROM board_participants bp 
        WHERE bp.board_id = board_participants.board_id 
        AND bp.user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
    )
);

CREATE POLICY "Add board participants" ON board_participants
FOR INSERT TO authenticated
WITH CHECK (
    user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)) OR 
    EXISTS (
        SELECT 1 FROM boards 
        WHERE boards.id = board_participants.board_id 
        AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
    )
);

CREATE POLICY "Remove board participants" ON board_participants
FOR DELETE TO authenticated
USING (
    user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)) OR 
    EXISTS (
        SELECT 1 FROM boards 
        WHERE boards.id = board_participants.board_id 
        AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
    )
);

-- Optimized Board anonymous participants policy
CREATE POLICY "Board anonymous participants are viewable by board members" ON board_anonymous_participants
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM boards 
        WHERE boards.id = board_anonymous_participants.board_id 
        AND (
            boards.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)) OR
            EXISTS (
                SELECT 1 FROM board_participants 
                WHERE board_participants.board_id = boards.id 
                AND board_participants.user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
            )
        )
    )
);

-- Optimize Cards policies if they exist
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cards' AND policyname = 'Anonymous users can view cards when unmasked') THEN
        DROP POLICY IF EXISTS "Anonymous users can view cards when unmasked" ON cards;
        
        CREATE POLICY "Anonymous users can view cards when unmasked" ON cards
        FOR SELECT USING (
            NOT is_masked 
            OR ((SELECT auth.uid()) IS NOT NULL AND author_id IN (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)))
        );
    END IF;
END $$;

-- Optimize linked_cards policies if table exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'linked_cards') THEN
        -- Drop existing policies
        DROP POLICY IF EXISTS "Users can view linked cards in their boards" ON linked_cards;
        DROP POLICY IF EXISTS "Users can create linked cards in their boards" ON linked_cards;
        DROP POLICY IF EXISTS "Users can update linked cards in their boards" ON linked_cards;
        DROP POLICY IF EXISTS "Users can delete linked cards in their boards" ON linked_cards;
        
        -- Create optimized policies
        CREATE POLICY "Users can view linked cards in their boards" ON linked_cards
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = linked_cards.board_id 
                AND (
                    boards.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)) OR
                    EXISTS (
                        SELECT 1 FROM board_participants 
                        WHERE board_participants.board_id = boards.id 
                        AND board_participants.user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
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
                AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
            )
        );
        
        CREATE POLICY "Users can update linked cards in their boards" ON linked_cards
        FOR UPDATE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = linked_cards.board_id 
                AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = linked_cards.board_id 
                AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
            )
        );
        
        CREATE POLICY "Users can delete linked cards in their boards" ON linked_cards
        FOR DELETE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM boards 
                WHERE boards.id = linked_cards.board_id 
                AND boards.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
            )
        );
    END IF;
END $$;

-- Optimize Columns policies
DROP POLICY IF EXISTS "Users can view columns of boards they participate in" ON columns;
DROP POLICY IF EXISTS "Board owners can manage columns" ON columns;
DROP POLICY IF EXISTS "Enable read for board participants" ON columns;
DROP POLICY IF EXISTS "Enable insert for board owners" ON columns;
DROP POLICY IF EXISTS "Enable update for board owners" ON columns;
DROP POLICY IF EXISTS "Enable delete for board owners" ON columns;

CREATE POLICY "Enable read for board participants" ON columns
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM boards b
        WHERE b.id = columns.board_id 
        AND (
            b.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)) OR
            EXISTS (
                SELECT 1 FROM board_participants bp 
                WHERE bp.board_id = b.id 
                AND bp.user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
            )
        )
    )
);

CREATE POLICY "Enable insert for board owners" ON columns
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM boards b
        WHERE b.id = columns.board_id
        AND b.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
    )
);

CREATE POLICY "Enable update for board owners" ON columns
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM boards b
        WHERE b.id = columns.board_id
        AND b.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM boards b
        WHERE b.id = columns.board_id
        AND b.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
    )
);

CREATE POLICY "Enable delete for board owners" ON columns
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM boards b
        WHERE b.id = columns.board_id
        AND b.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
    )
);

-- Optimize Card votes policies
DROP POLICY IF EXISTS "Enable all for authenticated users on votes" ON card_votes;

CREATE POLICY "Enable all for authenticated users on votes" ON card_votes
FOR ALL TO authenticated
USING (
    user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
)
WITH CHECK (
    user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
);

-- Optimize Poker policies if they exist
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_sessions') THEN
        -- Drop existing policies that might use inefficient auth.uid() pattern
        DROP POLICY IF EXISTS "Users can view their poker sessions" ON poker_sessions;
        DROP POLICY IF EXISTS "Users can create poker sessions" ON poker_sessions;
        DROP POLICY IF EXISTS "Users can update their poker sessions" ON poker_sessions;
        DROP POLICY IF EXISTS "Users can delete their poker sessions" ON poker_sessions;
        
        -- Create optimized policies
        CREATE POLICY "Users can view their poker sessions" ON poker_sessions
        FOR SELECT TO authenticated
        USING (
            owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)) OR
            EXISTS (
                SELECT 1 FROM poker_participants 
                WHERE poker_participants.session_id = poker_sessions.id 
                AND poker_participants.user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
            )
        );
        
        CREATE POLICY "Users can create poker sessions" ON poker_sessions
        FOR INSERT TO authenticated
        WITH CHECK (
            owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
        );
        
        CREATE POLICY "Users can update their poker sessions" ON poker_sessions
        FOR UPDATE TO authenticated
        USING (owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)))
        WITH CHECK (owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)));
        
        CREATE POLICY "Users can delete their poker sessions" ON poker_sessions
        FOR DELETE TO authenticated
        USING (owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)));
    END IF;
    
    -- Optimize poker_participants policies
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_participants') THEN
        DROP POLICY IF EXISTS "Enable insert for poker participants" ON poker_participants;
        DROP POLICY IF EXISTS "Enable read for all" ON poker_participants;
        
        CREATE POLICY "Enable insert for poker participants" ON poker_participants
        FOR INSERT TO authenticated
        WITH CHECK (
            user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
        );
        
        CREATE POLICY "Enable read for all" ON poker_participants
        FOR SELECT USING (true);
    END IF;
    
    -- Optimize stories policies
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stories') THEN
        DROP POLICY IF EXISTS "Enable read for session participants" ON stories;
        DROP POLICY IF EXISTS "Enable insert for session owners" ON stories;
        DROP POLICY IF EXISTS "Enable update for session owners" ON stories;
        
        CREATE POLICY "Enable read for session participants" ON stories
        FOR SELECT TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM poker_sessions ps
                WHERE ps.id = stories.session_id
                AND (
                    ps.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text)) OR
                    EXISTS (
                        SELECT 1 FROM poker_participants pp
                        WHERE pp.session_id = ps.id
                        AND pp.user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
                    )
                )
            )
        );
        
        CREATE POLICY "Enable insert for session owners" ON stories
        FOR INSERT TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM poker_sessions ps
                WHERE ps.id = stories.session_id
                AND ps.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
            )
        );
        
        CREATE POLICY "Enable update for session owners" ON stories
        FOR UPDATE TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM poker_sessions ps
                WHERE ps.id = stories.session_id
                AND ps.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM poker_sessions ps
                WHERE ps.id = stories.session_id
                AND ps.owner_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
            )
        );
    END IF;
    
    -- Optimize poker_votes policies
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_votes') THEN
        DROP POLICY IF EXISTS "Enable all for vote owners" ON poker_votes;
        
        CREATE POLICY "Enable all for vote owners" ON poker_votes
        FOR ALL TO authenticated
        USING (
            user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
        )
        WITH CHECK (
            user_id = (SELECT id FROM users WHERE clerk_id = (SELECT auth.uid()::text))
        );
    END IF;
END $$;