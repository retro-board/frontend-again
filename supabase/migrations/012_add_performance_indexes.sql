-- Add performance indexes to support optimized RLS policies
-- These indexes will significantly improve query performance for auth lookups

-- Index for users table clerk_id lookups (most common auth operation)
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);

-- Index for board ownership lookups
CREATE INDEX IF NOT EXISTS idx_boards_owner_id ON boards(owner_id);

-- Composite index for board participants lookups
CREATE INDEX IF NOT EXISTS idx_board_participants_board_user ON board_participants(board_id, user_id);
CREATE INDEX IF NOT EXISTS idx_board_participants_user_board ON board_participants(user_id, board_id);

-- Index for board anonymous participants
CREATE INDEX IF NOT EXISTS idx_board_anon_participants_board ON board_anonymous_participants(board_id);

-- Index for cards author lookups
CREATE INDEX IF NOT EXISTS idx_cards_author_id ON cards(author_id);
CREATE INDEX IF NOT EXISTS idx_cards_column_id ON cards(column_id);
CREATE INDEX IF NOT EXISTS idx_cards_column_author ON cards(column_id, author_id);

-- Index for card votes
CREATE INDEX IF NOT EXISTS idx_card_votes_card_user ON card_votes(card_id, user_id);
CREATE INDEX IF NOT EXISTS idx_card_votes_user_card ON card_votes(user_id, card_id);

-- Index for columns
CREATE INDEX IF NOT EXISTS idx_columns_board_id ON columns(board_id);

-- Indexes for poker sessions if table exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_sessions') THEN
        CREATE INDEX IF NOT EXISTS idx_poker_sessions_owner ON poker_sessions(owner_id);
        CREATE INDEX IF NOT EXISTS idx_poker_sessions_share ON poker_sessions(share_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_participants') THEN
        CREATE INDEX IF NOT EXISTS idx_poker_participants_session_user ON poker_participants(session_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_poker_participants_user_session ON poker_participants(user_id, session_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_anonymous_participants') THEN
        CREATE INDEX IF NOT EXISTS idx_poker_anon_participants_session ON poker_anonymous_participants(session_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stories') THEN
        CREATE INDEX IF NOT EXISTS idx_stories_session ON stories(session_id);
        CREATE INDEX IF NOT EXISTS idx_stories_session_position ON stories(session_id, position);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_votes') THEN
        CREATE INDEX IF NOT EXISTS idx_poker_votes_story_user ON poker_votes(story_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_poker_votes_user_story ON poker_votes(user_id, story_id);
        CREATE INDEX IF NOT EXISTS idx_poker_votes_story ON poker_votes(story_id);
    END IF;
END $$;

-- Partial indexes for common query patterns
-- Index for unmasked cards (common in anonymous viewing)
CREATE INDEX IF NOT EXISTS idx_cards_unmasked ON cards(column_id) WHERE is_masked = false;

-- Index for active board phases
CREATE INDEX IF NOT EXISTS idx_boards_active_phase ON boards(id, phase) WHERE phase != 'completed';

-- Analyze tables to update statistics for query planner
ANALYZE users;
ANALYZE boards;
ANALYZE board_participants;
ANALYZE board_anonymous_participants;
ANALYZE cards;
ANALYZE card_votes;
ANALYZE columns;

-- Analyze poker tables if they exist
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_sessions') THEN
        ANALYZE poker_sessions;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_participants') THEN
        ANALYZE poker_participants;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stories') THEN
        ANALYZE stories;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'poker_votes') THEN
        ANALYZE poker_votes;
    END IF;
END $$;