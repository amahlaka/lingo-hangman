-- Reminders by web push: each learner's reminder settings, and the devices
-- that receive them. A subscription belongs to the session that made it, so
-- signing a device out (or the session expiring) stops its reminders. See
-- docs/backend.md ("Reminders").
CREATE TABLE push_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  -- Local time of day, HH:MM, in the time zone below (IANA name).
  time TEXT NOT NULL DEFAULT '18:00',
  tz TEXT NOT NULL DEFAULT 'Europe/Helsinki',
  -- JSON list: goal | streak
  kinds TEXT NOT NULL DEFAULT '["goal","streak"]',
  lang TEXT NOT NULL DEFAULT 'en',
  -- The learner's local day a reminder was last handled (sent, or skipped
  -- because they had already played), so there is at most one a day.
  last_day TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_sent_at TEXT
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);
