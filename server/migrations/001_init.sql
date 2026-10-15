-- First migration: a small key/value table for the service's own settings
-- (for example when the nightly jobs last ran). Feature tables come with the
-- phases that need them; see docs/backend.md.
CREATE TABLE service_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
