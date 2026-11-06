ALTER TABLE poker_sessions ADD COLUMN is_voting BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE poker_anonymous_participants ADD COLUMN is_abstaining BOOLEAN NOT NULL DEFAULT false;
