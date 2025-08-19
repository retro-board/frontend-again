-- Enable realtime for all necessary tables
-- We wrap each statement in a DO block to handle cases where tables might already be added

DO $$ 
BEGIN
    -- Poker-related tables
    ALTER PUBLICATION supabase_realtime ADD TABLE poker_sessions;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table poker_sessions already in publication';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE stories;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table stories already in publication';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE poker_votes;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table poker_votes already in publication';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE poker_participants;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table poker_participants already in publication';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE poker_anonymous_participants;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table poker_anonymous_participants already in publication';
END $$;

-- Board-related tables
DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE boards;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table boards already in publication';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE columns;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table columns already in publication';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE cards;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table cards already in publication';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE card_votes;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table card_votes already in publication';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_participants;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table board_participants already in publication';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_anonymous_participants;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table board_anonymous_participants already in publication';
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE anonymous_users;
EXCEPTION 
    WHEN duplicate_object THEN 
        RAISE NOTICE 'Table anonymous_users already in publication';
END $$;