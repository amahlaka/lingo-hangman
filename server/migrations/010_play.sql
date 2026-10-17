-- Play statistics (docs/backend.md, "Play statistics").
--
-- Signed-in learners: their play sessions (from the first game until 30
-- minutes without play or closing the app) and the rounds they left
-- unfinished, with a reason guessed from how the round was going.
CREATE TABLE play_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The app's own id for the session, so a resend is not counted twice.
  client_id TEXT NOT NULL,
  -- The learner's own day (YYYY-MM-DD) when it started.
  day TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  ms INTEGER NOT NULL,
  -- { gameId: { rounds, finished } }
  games TEXT NOT NULL,
  UNIQUE (user_id, client_id)
);
CREATE INDEX play_sessions_started ON play_sessions(started_at);

CREATE TABLE give_ups (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  at TEXT NOT NULL,
  game TEXT NOT NULL,
  -- before_first | stuck | many_wrong | after_wrong | after_skip | mid_round
  reason TEXT NOT NULL,
  -- left (went elsewhere in the app) | closed (closed or left the app)
  how TEXT NOT NULL,
  -- Answers given in the round, and how long the round had lasted.
  answers INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  UNIQUE (user_id, client_id)
);
CREATE INDEX give_ups_at ON give_ups(at);

-- Everyone, with or without an account: plain counts per hour (UTC,
-- "YYYY-MM-DDTHH"). Nothing here says which device or person they came from.
CREATE TABLE play_counts (
  hour TEXT NOT NULL,
  -- visits | games_anon | games_account
  metric TEXT NOT NULL,
  -- A game id for games_*, '' for visits.
  key TEXT NOT NULL DEFAULT '',
  value INTEGER NOT NULL,
  PRIMARY KEY (hour, metric, key)
);
