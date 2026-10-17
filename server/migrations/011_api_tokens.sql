-- Tokens for AI tools that reach the API through its MCP endpoint (/api/mcp,
-- docs/backend.md "AI tools (MCP)"). Made by an admin at /admin/ai; only a
-- hash is kept. `scope` picks the tools a token can use: "admin" now, and
-- room for a learner scope later.
CREATE TABLE api_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX api_tokens_user ON api_tokens(user_id);
