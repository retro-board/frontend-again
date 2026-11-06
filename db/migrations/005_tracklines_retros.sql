-- RB-5: a user's sprint has one retro, including across disconnect/reconnect.
CREATE TABLE tracklines_retros (
  board_id UUID PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES tracklines_connections(id) ON DELETE SET NULL,
  sprint_id UUID NOT NULL,
  tracklines_board_id UUID NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  refreshed_at TIMESTAMPTZ,
  UNIQUE(user_id, sprint_id)
);
CREATE TABLE card_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL,
  ticket_key TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  UNIQUE(card_id, ticket_id)
);
CREATE INDEX idx_card_items_card ON card_items(card_id);
