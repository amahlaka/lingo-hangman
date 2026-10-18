-- Learners' own AI tools (/api/mcp/me, docs/backend.md "AI tools (MCP)"):
-- api_tokens rows with scope "learner", made on the Account page or through
-- OAuth. An OAuth code now carries the scope it was approved for.
ALTER TABLE oauth_codes ADD COLUMN scope TEXT NOT NULL DEFAULT 'admin';
