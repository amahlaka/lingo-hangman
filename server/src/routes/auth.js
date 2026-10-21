// Signing in: a passkey, or a one-time code sent by email (which also creates
// the account on first use). See docs/backend.md ("Accounts").

import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { randomToken, safeEqual, sha256, sixDigitCode } from "../lib/crypto.js";
import { enqueueMail } from "../mail/queue.js";
import { COOKIE, cookieOptions, createSession, findSession } from "../sessions.js";

const CODE_MS = 10 * 60_000;
const CODE_TRIES = 5;
const CHALLENGE_MS = 5 * 60_000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : "");
const validEmail = (email) => email.length <= 254 && EMAIL_RE.test(email);
const pickLang = (lang) => (lang === "fi" ? "fi" : "en");

export function findOrCreateUser(db, config, email, lang) {
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  const admin = config.adminEmails.includes(email);
  if (existing) {
    // ADMIN_EMAILS can be set after the account was made.
    if (admin && existing.role !== "admin") {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
      existing.role = "admin";
    }
    return { user: existing, created: false };
  }
  const role = admin ? "admin" : "learner";
  db.prepare("INSERT INTO users (email, role, webauthn_id, lang) VALUES (?, ?, ?, ?)").run(email, role, randomToken(32), lang);
  return { user: db.prepare("SELECT * FROM users WHERE email = ?").get(email), created: true };
}

// Signing in again on a device already signed in to the same account (the
// admin pages ask for that daily) renews this session's sign-in time instead
// of starting a second one, so the device list and reminders stay as they are.
function startSession(db, config, req, reply, userId, method) {
  const current = findSession(db, req.cookies[COOKIE]);
  if (current && current.user_id === userId) {
    db.prepare("UPDATE sessions SET auth_method = ?, auth_at = ? WHERE id_hash = ?").run(method, Date.now(), current.id_hash);
    return;
  }
  const secret = createSession(db, { userId, method, userAgent: req.headers["user-agent"] });
  reply.setCookie(COOKIE, secret, cookieOptions(config));
}

export default async function authRoutes(app, { db, config, limiter }) {
  const tooMany = (reply) => reply.code(429).send({ error: "too_many_requests" });

  // Ask for a code. Always answers the same way, so it can't be used to find
  // out which emails have accounts.
  app.post("/api/auth/code", async (req, reply) => {
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email)) return reply.code(400).send({ error: "invalid_email" });
    const lang = pickLang(req.body?.lang);
    if (
      !limiter.allow(`code-ip:${req.ip}`, 20, HOUR) ||
      !limiter.allow(`code-email-h:${email}`, 5, HOUR) ||
      !limiter.allow(`code-email-d:${email}`, 20, DAY)
    ) {
      return tooMany(reply);
    }
    // Overall cap protecting the mail server's reputation.
    if (!limiter.allow("mail-all", 200, HOUR)) return reply.code(503).send({ error: "busy" });

    const code = sixDigitCode();
    const now = Date.now();
    db.prepare(
      `INSERT INTO login_codes (email, code_hash, expires_at, tries) VALUES (?, ?, ?, 0)
       ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0`
    ).run(email, sha256(code), now + CODE_MS);
    enqueueMail(db, { to: email, template: "code", lang, data: { code }, dropAfter: now + CODE_MS }, now);
    return reply.code(202).send({ sent: true });
  });

  app.post("/api/auth/verify", async (req, reply) => {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code ?? "").replace(/\s/g, "");
    if (!limiter.allow(`verify-ip:${req.ip}`, 30, HOUR)) return tooMany(reply);
    const row = db.prepare("SELECT * FROM login_codes WHERE email = ?").get(email);
    if (!row || row.expires_at <= Date.now() || row.tries >= CODE_TRIES) {
      return reply.code(400).send({ error: "code_expired" });
    }
    if (!/^\d{6}$/.test(code) || !safeEqual(sha256(code), row.code_hash)) {
      db.prepare("UPDATE login_codes SET tries = tries + 1 WHERE email = ?").run(email);
      return reply.code(400).send({ error: row.tries + 1 >= CODE_TRIES ? "code_expired" : "wrong_code" });
    }
    db.prepare("DELETE FROM login_codes WHERE email = ?").run(email);
    const { user, created } = findOrCreateUser(db, config, email, pickLang(req.body?.lang));
    startSession(db, config, req, reply, user.id, "code");
    const passkeys = db.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?").get(user.id).n;
    return { created, passkeys };
  });

  // Passkey sign-in, without typing anything: the browser offers the
  // passkeys it has for this site (discoverable credentials).
  app.post("/api/auth/passkey/options", async (req, reply) => {
    if (!limiter.allow(`pk-ip:${req.ip}`, 60, HOUR)) return tooMany(reply);
    const options = await generateAuthenticationOptions({ rpID: config.rpId, userVerification: "preferred" });
    const challengeId = randomToken(16);
    db.prepare("INSERT INTO webauthn_challenges (id, challenge, expires_at) VALUES (?, ?, ?)").run(
      challengeId,
      options.challenge,
      Date.now() + CHALLENGE_MS
    );
    return { challengeId, options };
  });

  app.post("/api/auth/passkey/verify", async (req, reply) => {
    const { challengeId, response } = req.body || {};
    if (typeof challengeId !== "string" || !response || typeof response.id !== "string") {
      return reply.code(400).send({ error: "bad_request" });
    }
    const challenge = db.prepare("SELECT * FROM webauthn_challenges WHERE id = ?").get(challengeId);
    db.prepare("DELETE FROM webauthn_challenges WHERE id = ?").run(challengeId);
    if (!challenge || challenge.expires_at <= Date.now()) return reply.code(400).send({ error: "challenge_expired" });

    const passkey = db.prepare("SELECT * FROM passkeys WHERE id = ?").get(response.id);
    if (!passkey) return reply.code(400).send({ error: "unknown_passkey" });
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpId,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(passkey.public_key),
          counter: passkey.counter,
          transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
        },
        requireUserVerification: false,
      });
    } catch (err) {
      req.log.warn({ err: err.message }, "passkey sign-in rejected");
      return reply.code(400).send({ error: "passkey_failed" });
    }
    if (!result.verified) return reply.code(400).send({ error: "passkey_failed" });
    // The user handle must belong to the passkey's own account.
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(passkey.user_id);
    if (response.response?.userHandle && response.response.userHandle !== Buffer.from(user.webauthn_id).toString("base64url")) {
      return reply.code(400).send({ error: "passkey_failed" });
    }
    db.prepare("UPDATE passkeys SET counter = ?, last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(
      result.authenticationInfo.newCounter,
      passkey.id
    );
    startSession(db, config, req, reply, user.id, "passkey");
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const secret = req.cookies[COOKIE];
    if (secret) db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(sha256(secret));
    reply.clearCookie(COOKIE, { path: "/api" });
    return { ok: true };
  });
}
