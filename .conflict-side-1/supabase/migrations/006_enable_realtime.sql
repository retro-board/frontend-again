-- Enable realtime for poker-related tables
ALTER PUBLICATION supabase_realtime ADD TABLE poker_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE stories;
ALTER PUBLICATION supabase_realtime ADD TABLE poker_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE poker_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE poker_anonymous_participants;

-- Also enable for board-related tables
ALTER PUBLICATION supabase_realtime ADD TABLE boards;
ALTER PUBLICATION supabase_realtime ADD TABLE columns;
ALTER PUBLICATION supabase_realtime ADD TABLE cards;
ALTER PUBLICATION supabase_realtime ADD TABLE card_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE board_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE board_anonymous_participants;