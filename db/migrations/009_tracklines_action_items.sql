-- One external backlog task per retro action card, including across retries/reconnects.
CREATE TABLE tracklines_action_items (
  card_id UUID PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  ticket_id UUID,
  ticket_key TEXT,
  sync_error TEXT,
  synced_at TIMESTAMPTZ
);
