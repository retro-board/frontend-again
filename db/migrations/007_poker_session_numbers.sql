-- Keep numbering per user and TrackLin.es board, including after a session is deleted.
CREATE TABLE tracklines_poker_counters (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_id UUID NOT NULL,
  last_number BIGINT NOT NULL CHECK (last_number > 0),
  PRIMARY KEY (user_id, board_id)
);
ALTER TABLE poker_sessions ADD COLUMN tracklines_session_number BIGINT;

-- Reserve numbers for existing sessions without changing their chosen names.
WITH numbered AS (
  SELECT id, row_number() OVER (
    PARTITION BY owner_id, tracklines_board_id ORDER BY created_at, id
  ) AS session_number
  FROM poker_sessions WHERE tracklines_board_id IS NOT NULL
)
UPDATE poker_sessions AS ps SET tracklines_session_number = numbered.session_number
FROM numbered WHERE ps.id = numbered.id;

INSERT INTO tracklines_poker_counters (user_id, board_id, last_number)
SELECT owner_id, tracklines_board_id, max(tracklines_session_number)
FROM poker_sessions WHERE tracklines_board_id IS NOT NULL
GROUP BY owner_id, tracklines_board_id;

CREATE UNIQUE INDEX idx_poker_tracklines_session_number
ON poker_sessions(owner_id, tracklines_board_id, tracklines_session_number)
WHERE tracklines_session_number IS NOT NULL;
