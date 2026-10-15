-- Progress sync: each account's progress is its events applied in time
-- order (src/lib/syncEvents.js). account_state caches the result. See
-- docs/backend.md ("Progress sync").
CREATE TABLE sync_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Made by the app, so an event sent twice is stored once.
  id TEXT NOT NULL,
  -- When it happened on the device (ISO), the order events are applied in.
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, id)
);
CREATE INDEX sync_events_order ON sync_events(user_id, at, seq);

CREATE TABLE account_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  -- The latest event folded in, by (at, seq).
  last_at TEXT NOT NULL DEFAULT '',
  last_seq INTEGER NOT NULL DEFAULT 0,
  -- The app's game list, for the "play every game" badge.
  game_ids TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
