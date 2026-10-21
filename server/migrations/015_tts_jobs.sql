-- Requests to the Kokoro TTS service per day and kind, for the admin Speech
-- server page (/admin/tts, server/src/lib/ttsService.js). Counts and times
-- only, never the text.
CREATE TABLE tts_jobs_daily (
  -- UTC date, YYYY-MM-DD.
  day TEXT NOT NULL,
  -- speech (on-demand, typed or new sentences) | clip (a word-base clip saved
  -- for everyone) | remake (an admin's "Make it again")
  kind TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  -- Milliseconds the service took, and spent waiting in the queue first.
  total_ms INTEGER NOT NULL DEFAULT 0,
  max_ms INTEGER NOT NULL DEFAULT 0,
  wait_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);
