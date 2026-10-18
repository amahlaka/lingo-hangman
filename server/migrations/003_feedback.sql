-- Reports of problems in games and suggestions for new content, sent by
-- signed-in learners and handled in the app's /admin/reports page. See
-- docs/backend.md ("Reports and suggestions").
CREATE TABLE reports (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Made by the app, so a report resent after a dropped connection is stored once.
  client_id TEXT NOT NULL,
  game TEXT NOT NULL,
  -- Word base item id when the question has one, else what the question asked.
  item_ref TEXT NOT NULL,
  -- wrong_answer | typo | bad_audio | confusing | other
  reason TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  -- What the question showed, the answer, app version: JSON.
  context TEXT NOT NULL DEFAULT '{}',
  -- open | fixed | dismissed
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT,
  UNIQUE (user_id, client_id)
);
CREATE INDEX reports_status ON reports(status, game, item_ref);

CREATE TABLE suggestions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  -- word | phrase | sentence
  kind TEXT NOT NULL,
  -- English; '' when the learner only knew the Finnish (meaning).
  text TEXT NOT NULL,
  meaning TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  -- open | accepted | dismissed
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT,
  UNIQUE (user_id, client_id)
);
CREATE INDEX suggestions_status ON suggestions(status);
