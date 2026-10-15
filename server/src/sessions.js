// Sessions: a random id in an HttpOnly cookie (path /api); the database keeps
// only its hash. Sessions last 180 days and are extended while in use.

import { randomToken, sha256 } from "./lib/crypto.js";
import { describeDevice } from "./lib/userAgent.js";

export const COOKIE = "lingo_session";
export const SESSION_MS = 180 * 86400_000;
const TOUCH_EVERY_MS = 3600_000;

export function cookieOptions(config) {
  return { path: "/api", httpOnly: true, secure: config.cookieSecure, sameSite: "lax", maxAge: SESSION_MS / 1000 };
}

export function createSession(db, { userId, method, userAgent }, now = Date.now()) {
  const secret = randomToken();
  db.prepare(
    `INSERT INTO sessions (id_hash, user_id, public_id, device, created_at, last_seen_at, expires_at, auth_method, auth_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sha256(secret), userId, randomToken(9), describeDevice(userAgent), now, now, now + SESSION_MS, method, now);
  return secret;
}

// The session (with its user) for a cookie value, or null. Extends it at
// most once an hour.
export function findSession(db, secret, now = Date.now()) {
  if (!secret || typeof secret !== "string" || secret.length > 100) return null;
  const idHash = sha256(secret);
  const row = db
    .prepare(
      `SELECT s.*, u.email, u.role, u.lang, u.webauthn_id, u.created_at AS user_created_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`
    )
    .get(idHash);
  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(idHash);
    return null;
  }
  if (now - row.last_seen_at > TOUCH_EVERY_MS) {
    db.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?").run(now, now + SESSION_MS, idHash);
  }
  return row;
}

export function deleteExpired(db, now = Date.now()) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  db.prepare("DELETE FROM login_codes WHERE expires_at <= ?").run(now);
  db.prepare("DELETE FROM webauthn_challenges WHERE expires_at <= ?").run(now);
}
