// Tokens for the MCP endpoint (routes/mcp.js): a random secret the AI tool
// sends as "Authorization: Bearer <token>". The database keeps only its hash.
// A token works only while its account still has the token's scope (an admin
// token stops working when the account stops being an admin).

import { randomToken, sha256 } from "../lib/crypto.js";

export const TOKEN_PREFIX = "lingo_mcp_";
const TOUCH_EVERY_MS = 10 * 60_000;

export function createToken(db, { userId, name, scope, days }, now = Date.now()) {
  const secret = TOKEN_PREFIX + randomToken();
  const expiresAt = new Date(now + days * 86400_000).toISOString();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO api_tokens (user_id, token_hash, name, scope, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(userId, sha256(secret), name, scope, expiresAt);
  return { id: Number(lastInsertRowid), name, scope, expiresAt, token: secret };
}

// A connector's token (OAuth) works as long as its refresh token does.
export function listTokens(db, userId) {
  return db
    .prepare(
      "SELECT id, name, scope, created_at, expires_at, refresh_expires_at, last_used_at, client_id FROM api_tokens WHERE user_id = ? ORDER BY id DESC"
    )
    .all(userId)
    .map((t) => ({
      id: t.id,
      name: t.name,
      scope: t.scope,
      connector: Boolean(t.client_id),
      createdAt: t.created_at,
      expiresAt: t.refresh_expires_at || t.expires_at,
      lastUsedAt: t.last_used_at,
    }));
}

export function revokeToken(db, userId, id) {
  return Number(db.prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?").run(id, userId).changes) > 0;
}

// The token row with its account, or null when the secret is unknown or
// expired. Notes the use at most every few minutes.
export function findToken(db, secret, now = Date.now()) {
  if (typeof secret !== "string" || !secret.startsWith(TOKEN_PREFIX) || secret.length > 120) return null;
  const row = db
    .prepare(
      `SELECT t.id, t.user_id, t.name, t.scope, t.expires_at, t.last_used_at, u.email, u.role
       FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`
    )
    .get(sha256(secret));
  if (!row || Date.parse(row.expires_at) <= now) return null;
  if (!row.last_used_at || now - Date.parse(row.last_used_at) > TOUCH_EVERY_MS) {
    db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(new Date(now).toISOString(), row.id);
  }
  return row;
}

export function deleteExpiredTokens(db, now = Date.now()) {
  const iso = new Date(now).toISOString();
  db.prepare("DELETE FROM api_tokens WHERE expires_at <= ? AND (refresh_expires_at IS NULL OR refresh_expires_at <= ?)").run(iso, iso);
}
