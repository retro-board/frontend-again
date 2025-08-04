-- Add indexes for better real-time and query performance

-- Cards indexes
CREATE INDEX IF NOT EXISTS idx_cards_column_id ON cards(column_id);
CREATE INDEX IF NOT EXISTS idx_cards_author_id ON cards(author_id) WHERE author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_anonymous_author_id ON cards(anonymous_author_id) WHERE anonymous_author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at DESC);

-- Card votes indexes
CREATE INDEX IF NOT EXISTS idx_card_votes_card_id ON card_votes(card_id);
CREATE INDEX IF NOT EXISTS idx_card_votes_user_id ON card_votes(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_votes_anonymous_user_id ON card_votes(anonymous_user_id) WHERE anonymous_user_id IS NOT NULL;

-- Poker votes indexes
CREATE INDEX IF NOT EXISTS idx_poker_votes_story_id ON poker_votes(story_id);
CREATE INDEX IF NOT EXISTS idx_poker_votes_user_id ON poker_votes(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_poker_votes_anonymous_user_id ON poker_votes(anonymous_user_id) WHERE anonymous_user_id IS NOT NULL;

-- Stories indexes
CREATE INDEX IF NOT EXISTS idx_stories_session_id ON stories(session_id);
CREATE INDEX IF NOT EXISTS idx_stories_position ON stories(position);

-- Columns indexes
CREATE INDEX IF NOT EXISTS idx_columns_board_id ON columns(board_id);
CREATE INDEX IF NOT EXISTS idx_columns_position ON columns(position);

-- Participants indexes
CREATE INDEX IF NOT EXISTS idx_board_participants_board_user ON board_participants(board_id, user_id);
CREATE INDEX IF NOT EXISTS idx_board_anonymous_participants_board_user ON board_anonymous_participants(board_id, anonymous_user_id);
CREATE INDEX IF NOT EXISTS idx_poker_participants_session_user ON poker_participants(session_id, user_id);
CREATE INDEX IF NOT EXISTS idx_poker_anonymous_participants_session_user ON poker_anonymous_participants(session_id, anonymous_user_id);

-- Anonymous users index
CREATE INDEX IF NOT EXISTS idx_anonymous_users_session_id ON anonymous_users(session_id);