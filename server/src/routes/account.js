// The signed-in learner's own account: passkeys, sessions, data export and
// deleting the account.

import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { describeDevice } from "../lib/userAgent.js";
import { enqueueMail } from "../mail/queue.js";
import { COOKIE, requireSession } from "../sessions.js";
import { reportView, suggestionView } from "./feedback.js";
import { accountProgress } from "./sync.js";

const CHALLENGE_MS = 5 * 60_000;
const MAX_PASSKEYS = 20;

const passkeyView = (p) => ({
  id: p.id,
  name: p.name,
  synced: Boolean(p.backed_up),
  createdAt: p.created_at,
  lastUsedAt: p.last_used_at,
});

const sessionView = (s, current) => ({
  id: s.public_id,
  device: s.device,
  createdAt: new Date(s.created_at).toISOString(),
  lastSeenAt: new Date(s.last_seen_at).toISOString(),
  current: s.id_hash === current,
});

export default async function accountRoutes(app, { db, config }) {
  // Every route here needs a session.
  app.addHook("preHandler", requireSession(db));

  const passkeysOf = (userId) =>
    db.prepare("SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at").all(userId);

  app.get("/api/me", async (req) => {
    const s = req.session;
    const sessions = db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC").all(s.user_id);
    return {
      user: { email: s.email, role: s.role, lang: s.lang, createdAt: s.user_created_at },
      passkeys: passkeysOf(s.user_id).map(passkeyView),
      sessions: sessions.map((row) => sessionView(row, s.id_hash)),
    };
  });

  app.post("/api/me/passkeys/options", async (req, reply) => {
    const s = req.session;
    const existing = passkeysOf(s.user_id);
    if (existing.length >= MAX_PASSKEYS) return reply.code(400).send({ error: "too_many_passkeys" });
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpId,
      userName: s.email,
      userDisplayName: s.email,
      userID: Buffer.from(s.webauthn_id),
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports ? JSON.parse(p.transports) : undefined })),
      // Discoverable, so signing in needs no email.
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });
    db.prepare("UPDATE sessions SET reg_challenge = ?, reg_challenge_expires = ? WHERE id_hash = ?").run(
      options.challenge,
      Date.now() + CHALLENGE_MS,
      s.id_hash
    );
    return { options };
  });

  app.post("/api/me/passkeys", async (req, reply) => {
    const s = req.session;
    const response = req.body?.response;
    db.prepare("UPDATE sessions SET reg_challenge = NULL, reg_challenge_expires = NULL WHERE id_hash = ?").run(s.id_hash);
    if (!s.reg_challenge || s.reg_challenge_expires <= Date.now()) return reply.code(400).send({ error: "challenge_expired" });
    if (!response || typeof response.id !== "string") return reply.code(400).send({ error: "bad_request" });
    let result;
    try {
      result = await verifyRegistrationResponse({
        response,
        expectedChallenge: s.reg_challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpId,
        requireUserVerification: false,
      });
    } catch (err) {
      req.log.warn({ err: err.message }, "passkey registration rejected");
      return reply.code(400).send({ error: "passkey_failed" });
    }
    if (!result.verified) return reply.code(400).send({ error: "passkey_failed" });
    const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
    if (db.prepare("SELECT 1 FROM passkeys WHERE id = ?").get(credential.id)) {
      return reply.code(409).send({ error: "passkey_exists" });
    }
    const name = describeDevice(req.headers["user-agent"]);
    db.prepare(
      `INSERT INTO passkeys (id, user_id, public_key, counter, transports, device_type, backed_up, name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      credential.id,
      s.user_id,
      Buffer.from(credential.publicKey),
      credential.counter,
      credential.transports ? JSON.stringify(credential.transports) : null,
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
      name
    );
    enqueueMail(db, { to: s.email, template: "passkeyAdded", lang: s.lang, data: { name } });
    return passkeyView(db.prepare("SELECT * FROM passkeys WHERE id = ?").get(credential.id));
  });

  app.delete("/api/me/passkeys/:id", async (req, reply) => {
    const { changes } = db.prepare("DELETE FROM passkeys WHERE id = ? AND user_id = ?").run(req.params.id, req.session.user_id);
    return changes ? { ok: true } : reply.code(404).send({ error: "not_found" });
  });

  // Sign out another device (or this one).
  app.delete("/api/me/sessions/:id", async (req, reply) => {
    const { changes } = db
      .prepare("DELETE FROM sessions WHERE public_id = ? AND user_id = ?")
      .run(req.params.id, req.session.user_id);
    return changes ? { ok: true } : reply.code(404).send({ error: "not_found" });
  });

  app.get("/api/me/export", async (req, reply) => {
    const s = req.session;
    const sessions = db.prepare("SELECT * FROM sessions WHERE user_id = ?").all(s.user_id);
    reply.header("Content-Disposition", 'attachment; filename="lingo-account.json"');
    return {
      exportedAt: new Date().toISOString(),
      account: { email: s.email, role: s.role, language: s.lang, createdAt: s.user_created_at },
      passkeys: passkeysOf(s.user_id).map(({ id, name, created_at, last_used_at, backed_up }) => ({
        id,
        name,
        synced: Boolean(backed_up),
        createdAt: created_at,
        lastUsedAt: last_used_at,
      })),
      sessions: sessions.map((row) => {
        const { current, ...rest } = sessionView(row, s.id_hash);
        return rest;
      }),
      reports: db.prepare("SELECT * FROM reports WHERE user_id = ? ORDER BY id").all(s.user_id).map(reportView),
      suggestions: db.prepare("SELECT * FROM suggestions WHERE user_id = ? ORDER BY id").all(s.user_id).map(suggestionView),
      progress: accountProgress(db, s.user_id),
    };
  });

  // Delete the account and everything linked to it. The learner confirms by
  // typing their email.
  app.delete("/api/me", async (req, reply) => {
    const s = req.session;
    const confirm = typeof req.body?.confirm === "string" ? req.body.confirm.trim().toLowerCase() : "";
    if (confirm !== s.email) return reply.code(400).send({ error: "confirm_email" });
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM login_codes WHERE email = ?").run(s.email);
      db.prepare("DELETE FROM users WHERE id = ?").run(s.user_id);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    enqueueMail(db, { to: s.email, template: "accountDeleted", lang: s.lang, data: {} });
    reply.clearCookie(COOKIE, { path: "/api" });
    return { ok: true };
  });
}
