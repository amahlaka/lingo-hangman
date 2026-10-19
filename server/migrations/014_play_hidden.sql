-- Hours left out of the visit and game counts (docs/backend.md, "Play
-- statistics"): a security scan or other traffic that wasn't people. The
-- counts stay in play_counts; the admin page leaves these hours out and says
-- so.
CREATE TABLE play_hidden_hours (
  -- "YYYY-MM-DDTHH" (UTC), like play_counts.hour.
  hour TEXT PRIMARY KEY,
  note TEXT NOT NULL
);

-- Arttu's Burp scan of the app, 2026-10-19 15:00–16:59 Finnish time.
INSERT INTO play_hidden_hours (hour, note) VALUES
  ('2026-10-19T12', 'Burp security scan'),
  ('2026-10-19T13', 'Burp security scan');
