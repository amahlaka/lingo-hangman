// Play statistics (docs/backend.md, "Play statistics").
//
// POST /api/play/count: a visit or a game started, from anyone. Only adds 1
// to a count for the current hour; nothing about the device or person is
// kept, and whether they had an account comes from their session cookie.
// Not every call is counted: not from known scanners and bots, not for a game
// the app doesn't have, and only so many from one address in an hour (a
// browser counts a visit once per tab), so a scan can't swell the numbers.
//
// POST /api/play/sessions: a signed-in learner's finished play sessions and
// the rounds they left unfinished.

import { findSession, requireSession, COOKIE } from "../sessions.js";
import { cleanGiveUp, cleanPlaySession, isGameId } from "../../../src/lib/playSession.js";
import { GAME_LIST } from "../../../src/lib/gameList.js";

const HOUR = 3600_000;
const COUNTS_PER_HOUR = 240;
// Counted from one address in an hour; past these the call is answered but
// not counted. Room for a few tabs, a shared connection and a lot of play.
const VISITS_COUNTED_PER_HOUR = 10;
const GAMES_COUNTED_PER_HOUR = 60;
const GAME_IDS = new Set(GAME_LIST.map((g) => g.id));
// Security scanners and crawlers that say who they are.
export const SCANNER =
  /burp|sqlmap|nikto|nuclei|nmap|zgrab|masscan|acunetix|nessus|openvas|qualys|netsparker|invicti|wpscan|dirbuster|gobuster|ffuf|wfuzz|owasp|zap\/|arachni|w3af|skipfish|headlesschrome|bot\/|crawler|spider|curl\/|wget\/|python-requests|python-urllib|go-http-client|httpx|aiohttp|okhttp|java\/|libwww|scrapy/i;
const SENDS_PER_HOUR = 60;
const MAX_ITEMS = 50;
// Older than this is not taken (a device that was away for weeks).
const MAX_AGE_MS = 14 * 86400_000;

export const hourKey = (ms) => new Date(ms).toISOString().slice(0, 13);

export function addCount(db, metric, key = "", now = Date.now()) {
  db.prepare(
    `INSERT INTO play_counts (hour, metric, key, value) VALUES (?, ?, ?, 1)
     ON CONFLICT(hour, metric, key) DO UPDATE SET value = value + 1`
  ).run(hourKey(now), metric, key);
}

export default async function playRoutes(app, { db, limiter }) {
  // { visit: true } or { game: "hangman" }
  app.post("/api/play/count", async (req, reply) => {
    const body = req.body || {};
    const visit = body.visit === true;
    const game = isGameId(body.game) && GAME_IDS.has(body.game) ? body.game : null;
    if (visit === Boolean(game)) return reply.code(400).send({ error: "bad_request" });
    if (!limiter.allow(`play:${req.ip}`, COUNTS_PER_HOUR, HOUR)) return reply.code(429).send({ error: "too_many_requests" });
    if (SCANNER.test(req.headers["user-agent"] || "")) return { ok: true };
    if (!limiter.allow(`play-counted:${visit ? "visit" : "game"}:${req.ip}`, visit ? VISITS_COUNTED_PER_HOUR : GAMES_COUNTED_PER_HOUR, HOUR)) return { ok: true };
    if (visit) addCount(db, "visits");
    else addCount(db, findSession(db, req.cookies[COOKIE]) ? "games_account" : "games_anon", game);
    return { ok: true };
  });

  app.post("/api/play/sessions", { preHandler: requireSession(db) }, async (req, reply) => {
    const userId = req.session.user_id;
    const body = req.body || {};
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    const giveUps = Array.isArray(body.giveUps) ? body.giveUps : [];
    if (sessions.length + giveUps.length === 0 || sessions.length > MAX_ITEMS || giveUps.length > MAX_ITEMS) {
      return reply.code(400).send({ error: "bad_request" });
    }
    if (!limiter.allow(`play-sessions:${userId}`, SENDS_PER_HOUR, HOUR)) return reply.code(429).send({ error: "too_many_requests" });
    const now = Date.now();
    const recent = (iso) => now - Date.parse(iso) < MAX_AGE_MS && Date.parse(iso) < now + HOUR;
    // Bad items are dropped, not refused, so one can't hold back the rest.
    const goodSessions = sessions.map(cleanPlaySession).filter((s) => s && recent(s.endedAt));
    const goodGiveUps = giveUps.map(cleanGiveUp).filter((g) => g && recent(g.at));
    const addSession = db.prepare(
      "INSERT OR IGNORE INTO play_sessions (user_id, client_id, day, started_at, ended_at, ms, games) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const addGiveUp = db.prepare(
      "INSERT OR IGNORE INTO give_ups (user_id, client_id, at, game, reason, how, answers, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    db.exec("BEGIN");
    try {
      for (const s of goodSessions) addSession.run(userId, s.id, s.day, s.startedAt, s.endedAt, s.ms, JSON.stringify(s.games));
      for (const g of goodGiveUps) addGiveUp.run(userId, g.id, g.at, g.game, g.reason, g.how, g.answers, g.ms);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return { sessions: goodSessions.length, giveUps: goodGiveUps.length };
  });
}
