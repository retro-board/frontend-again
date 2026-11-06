-- RB-4: how a session's result is worked out. Existing sessions keep the average.
ALTER TABLE poker_sessions ADD COLUMN result_method TEXT NOT NULL DEFAULT 'average'
  CHECK (result_method IN ('average', 'mode'));

-- How each story was scored, and the tied values when the facilitator had to pick.
ALTER TABLE stories ADD COLUMN result_method TEXT CHECK (result_method IN ('average', 'mode'));
ALTER TABLE stories ADD COLUMN tied_values TEXT[];
