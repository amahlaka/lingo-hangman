-- Weekly leaderboards (docs/backend.md, "Leaderboards"): opt-in, under a
-- random nickname. Only membership is stored; each week's XP is read from
-- the account's synced progress, so leaving removes the learner entirely.
CREATE TABLE leaderboard_members (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL UNIQUE,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
