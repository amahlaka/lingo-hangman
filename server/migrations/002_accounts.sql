-- Accounts: passkeys first, a one-time email code as the fallback and for
-- signing up. See docs/backend.md ("Accounts").
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  -- learner | verified | admin
  role TEXT NOT NULL DEFAULT 'learner',
  -- Random handle given to authenticators instead of the email or row id.
  webauthn_id TEXT NOT NULL UNIQUE,
  lang TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE passkeys (
  -- The credential id, base64url.
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  device_type TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT
);
CREATE INDEX passkeys_user ON passkeys(user_id);

-- One-time codes: only a hash is kept.
CREATE TABLE login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
);

-- Sessions: the cookie holds a random id; only its hash is kept.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- A short public id, so a session can be named in the API without its secret.
  public_id TEXT NOT NULL UNIQUE,
  device TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  -- How the learner last proved who they are (passkey | code), and when.
  auth_method TEXT NOT NULL,
  auth_at INTEGER NOT NULL,
  -- Pending passkey registration for this session.
  reg_challenge TEXT,
  reg_challenge_expires INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Pending passkey sign-ins (no session exists yet).
CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Outgoing mail, sent by a background worker with retries.
CREATE TABLE mail_queue (
  id INTEGER PRIMARY KEY,
  to_addr TEXT NOT NULL,
  template TEXT NOT NULL,
  -- Template values; cleared once sent or given up.
  data TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  next_try_at INTEGER NOT NULL,
  -- Mail that is useless after this time (a sign-in code) is dropped instead.
  drop_after INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE INDEX mail_queue_due ON mail_queue(status, next_try_at);
