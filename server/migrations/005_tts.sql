-- On-demand speech: how many new clips each learner made per day (cache hits
-- are free), and who asked for the extended daily limit. See docs/backend.md
-- ("On-demand speech").
CREATE TABLE tts_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- UTC date, YYYY-MM-DD.
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE users ADD COLUMN tts_requested_at TEXT;
