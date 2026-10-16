-- "My path" (docs/backend.md, "My path"): the learner's current weekly plan,
-- so every device shows the same one. The app plans it; this only keeps it.
CREATE TABLE paths (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
