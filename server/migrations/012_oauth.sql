-- OAuth for AI connectors such as claude.ai's (docs/backend.md, "AI tools
-- (MCP)"): clients register themselves, an admin approves one in the browser,
-- and the client gets an access token in api_tokens that it renews with a
-- refresh token. Only hashes of secrets, codes and tokens are kept.
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  -- Only for clients that asked for a secret (client_secret_post/basic).
  secret_hash TEXT,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- An approval page that is open: what the client asked for, for the signed-in
-- admin who opened it. The page's form sends back only the random id.
CREATE TABLE oauth_requests (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  params TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Approved, not yet exchanged for tokens. Used once.
CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- A token made through OAuth: the client, and the refresh token that renews
-- the short-lived access token in place (one row per approval, so /admin/ai
-- lists and revokes it like a hand-made token).
ALTER TABLE api_tokens ADD COLUMN client_id TEXT REFERENCES oauth_clients(id) ON DELETE CASCADE;
ALTER TABLE api_tokens ADD COLUMN refresh_hash TEXT;
ALTER TABLE api_tokens ADD COLUMN refresh_expires_at TEXT;
CREATE UNIQUE INDEX api_tokens_refresh ON api_tokens(refresh_hash);
