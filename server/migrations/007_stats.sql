-- Statistics: numbers over everyone's answers, never about one learner. A
-- job in the API recomputes them from sync_events a few times a day. See
-- docs/backend.md ("Statistics").
CREATE TABLE stats_daily (
  -- The learners' own day key (YYYY-MM-DD), as answers are recorded.
  day TEXT NOT NULL,
  -- learners | answers | first_try | accounts
  metric TEXT NOT NULL,
  -- A game id, or '' for the whole app.
  key TEXT NOT NULL DEFAULT '',
  value INTEGER NOT NULL,
  PRIMARY KEY (day, metric, key)
);

-- Results too big for rows: the difficulty list and the admin word lists.
CREATE TABLE stats_cache (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
