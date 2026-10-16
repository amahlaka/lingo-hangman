// Reminders by web push (docs/backend.md, "Reminders"): the learner's
// reminder settings, and subscribing this device. Signed-in learners only,
// since a reminder is only useful when the server knows whether they played.

import { REMINDER_KINDS, localNow, reminderMessage, sendToUser, timeMinutes, validTimeZone } from "../push/reminders.js";
import { pushConfigured } from "../push/sender.js";
import { requireSession } from "../sessions.js";

const HOUR = 3600_000;
const MAX_DEVICES = 10;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const KEY_RE = /^[A-Za-z0-9_-]+=*$/;
// The browsers' own push services. Anything else is refused, so the server
// never posts to an address a client made up.
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.services\.mozilla\.com$/];

export function validEndpoint(value) {
  if (typeof value !== "string" || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

const validKey = (value, max) => typeof value === "string" && value.length >= 8 && value.length <= max && KEY_RE.test(value);

function settingsRow(db, userId) {
  return db.prepare("SELECT * FROM push_settings WHERE user_id = ?").get(userId);
}

export function pushView(db, config, session) {
  const row = settingsRow(db, session.user_id);
  const devices = db.prepare("SELECT session_hash FROM push_subscriptions WHERE user_id = ?").all(session.user_id);
  return {
    available: pushConfigured(config),
    publicKey: config.vapidPublicKey,
    enabled: Boolean(row?.enabled),
    time: row?.time || "18:00",
    timeZone: row?.tz || null,
    kinds: row ? JSON.parse(row.kinds) : [...REMINDER_KINDS],
    devices: devices.length,
    thisDevice: devices.some((d) => d.session_hash === session.id_hash),
  };
}

export default async function pushRoutes(app, { db, config, limiter, send }) {
  app.addHook("preHandler", requireSession(db));

  const unavailable = (reply) => reply.code(503).send({ error: "push_unavailable" });

  app.get("/api/push", async (req) => pushView(db, config, req.session));

  // { enabled?, time?, timeZone?, kinds?, lang? } -> the settings
  app.put("/api/push/settings", async (req, reply) => {
    const s = req.session;
    const body = req.body || {};
    const old = pushView(db, config, s);
    const next = {
      enabled: body.enabled === undefined ? old.enabled : body.enabled === true,
      time: body.time === undefined ? old.time : body.time,
      tz: body.timeZone === undefined ? old.timeZone || "Europe/Helsinki" : body.timeZone,
      kinds: body.kinds === undefined ? old.kinds : body.kinds,
      lang: body.lang === undefined ? settingsRow(db, s.user_id)?.lang || s.lang : body.lang,
    };
    if (typeof next.time !== "string" || !TIME_RE.test(next.time)) return reply.code(400).send({ error: "bad_time" });
    if (!validTimeZone(next.tz)) return reply.code(400).send({ error: "bad_time_zone" });
    if (!Array.isArray(next.kinds) || next.kinds.length > REMINDER_KINDS.length || !next.kinds.every((k) => REMINDER_KINDS.includes(k))) {
      return reply.code(400).send({ error: "bad_kinds" });
    }
    if (!["en", "fi"].includes(next.lang)) next.lang = "en";
    // Turned on (or moved) after today's time has passed: start tomorrow,
    // rather than a reminder a few minutes from now.
    const { day, minutes } = localNow(Date.now(), next.tz);
    const changed = next.enabled && (!old.enabled || next.time !== old.time || next.tz !== old.timeZone);
    const oldLast = settingsRow(db, s.user_id)?.last_day ?? null;
    const lastDay = changed && minutes >= timeMinutes(next.time) ? day : oldLast;
    db.prepare(
      `INSERT INTO push_settings (user_id, enabled, time, tz, kinds, lang, last_day, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, time = excluded.time, tz = excluded.tz,
         kinds = excluded.kinds, lang = excluded.lang, last_day = excluded.last_day, updated_at = excluded.updated_at`
    ).run(s.user_id, next.enabled ? 1 : 0, next.time, next.tz, JSON.stringify([...new Set(next.kinds)]), next.lang, lastDay);
    return pushView(db, config, s);
  });

  // { endpoint, keys: { p256dh, auth } }: this device's push subscription.
  app.post("/api/push/subscribe", async (req, reply) => {
    if (!pushConfigured(config)) return unavailable(reply);
    const s = req.session;
    const { endpoint, keys } = req.body || {};
    if (!validEndpoint(endpoint) || !validKey(keys?.p256dh, 200) || !validKey(keys?.auth, 100)) {
      return reply.code(400).send({ error: "bad_subscription" });
    }
    db.prepare(
      `INSERT INTO push_subscriptions (user_id, session_hash, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, session_hash = excluded.session_hash,
         p256dh = excluded.p256dh, auth = excluded.auth`
    ).run(s.user_id, s.id_hash, endpoint, keys.p256dh, keys.auth);
    // One subscription per device: an older one from this session is stale.
    db.prepare("DELETE FROM push_subscriptions WHERE session_hash = ? AND endpoint <> ?").run(s.id_hash, endpoint);
    db.prepare(
      `DELETE FROM push_subscriptions WHERE user_id = ? AND id NOT IN
         (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT ?)`
    ).run(s.user_id, s.user_id, MAX_DEVICES);
    return pushView(db, config, s);
  });

  // This device stops getting reminders.
  app.delete("/api/push/subscribe", async (req) => {
    const s = req.session;
    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND session_hash = ?").run(s.user_id, s.id_hash);
    return pushView(db, config, s);
  });

  // A reminder to this device now, to see that it works.
  app.post("/api/push/test", async (req, reply) => {
    if (!pushConfigured(config) || !send) return unavailable(reply);
    const s = req.session;
    if (!limiter.allow(`push-test:${s.user_id}`, 5, HOUR)) return reply.code(429).send({ error: "too_many_requests" });
    const here = db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE session_hash = ?").get(s.id_hash).n;
    if (!here) return reply.code(409).send({ error: "not_subscribed" });
    const lang = settingsRow(db, s.user_id)?.lang || s.lang;
    const sent = await sendToUser(db, send, s.user_id, reminderMessage({ kind: "test" }, lang), { log: req.log, sessionHash: s.id_hash });
    if (!sent) return reply.code(502).send({ error: "push_failed" });
    return { sent };
  });
}
