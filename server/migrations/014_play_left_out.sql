-- Hours left out of the visit and game counts (docs/backend.md, "Play
-- statistics"): a security scan or other test traffic that would make the
-- numbers misleading. The counts themselves are kept; the admin Statistics
-- page lists these ranges and can remove them again.
CREATE TABLE play_left_out (
  id INTEGER PRIMARY KEY,
  -- First and last hour left out, UTC "YYYY-MM-DDTHH", both included.
  from_hour TEXT NOT NULL,
  to_hour TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Arttu's Burp scan of the live site, 2026-10-19 15:00–16:59 Finnish time.
INSERT INTO play_left_out (from_hour, to_hour, note) VALUES ('2026-10-19T12', '2026-10-19T13', 'Burp security scan');
