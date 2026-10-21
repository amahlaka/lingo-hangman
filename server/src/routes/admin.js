// The admin pages' API: the report and suggestion queue (/admin/reports),
// recorded clips (/admin/clips), users, statistics, and the tokens for AI
// tools (/admin/ai). Needs an admin
// account (ADMIN_EMAILS) and a sign-in within the last day.

import { requireSession } from "../sessions.js";
import { ttsDay, ttsText } from "./tts.js";
import {
  MAX_ROWS,
  REPORT_STATUSES,
  SUGGESTION_STATUSES,
  adminStats,
  idList,
  learnerView,
  reportGroups,
  setStatus,
  suggestionList,
} from "../adminData.js";
import { createToken, listTokens, revokeToken } from "../mcp/tokens.js";
import { addLeftOut, removeLeftOut } from "../stats/play.js";
import { reportedTexts } from "../../../src/lib/reportSpeech.js";

const RECENT_SIGN_IN_MS = 24 * 3600_000;
// An edited clip, as base64 in JSON: clips are 5 to 50 KB.
const MAX_CLIP_BYTES = 1024 * 1024;
const CLIP_KEY = /^[0-9a-z]{1,16}$/;
const CLIP_ERRORS = { bad_voice: 400, not_word_base: 404, not_live: 409, no_such_version: 404 };
// What an edit did, kept in the clip's history: seconds and decibels.
const EDIT_FIELDS = ["start", "end", "fadeIn", "fadeOut", "gain"];

// An MP3 file: an ID3 tag or an MPEG audio frame first.
const isMp3 = (buf) =>
  buf.length > 4 && ((buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));

// Whether this session's account is an admin. ADMIN_EMAILS can be set after
// the account was made, so it is checked here too.
export function isAdmin(db, config, user) {
  if (user.role === "admin") return true;
  if (!config.adminEmails.includes(user.email)) return false;
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
  user.role = "admin";
  return true;
}

export default async function adminRoutes(app, { db, config, wordClips }) {
  const session = requireSession(db);
  app.addHook("preHandler", async (req, reply) => {
    await session(req, reply);
    if (reply.sent) return reply;
    const s = req.session;
    if (!isAdmin(db, config, { id: s.user_id, email: s.email, role: s.role })) return reply.code(403).send({ error: "not_admin" });
    s.role = "admin";
    if (Date.now() - s.auth_at > RECENT_SIGN_IN_MS) return reply.code(401).send({ error: "sign_in_again" });
  });

  app.get("/api/admin/reports", async (req, reply) => {
    const status = req.query.status || "open";
    if (!REPORT_STATUSES.includes(status)) return reply.code(400).send({ error: "bad_request" });
    return { groups: reportGroups(db, status) };
  });

  app.post("/api/admin/reports/status", async (req, reply) => {
    const ids = idList(req.body?.ids);
    const status = req.body?.status;
    if (!ids || !REPORT_STATUSES.includes(status)) return reply.code(400).send({ error: "bad_request" });
    return { changed: setStatus(db, "reports", ids, status) };
  });

  // A bad recorded clip: { text } -> { keys }. The clip leaves the live list
  // now and the next Content publish makes it again (lib/wordClips.js).
  app.post("/api/admin/clips/remake", async (req, reply) => {
    if (!wordClips) return reply.code(503).send({ error: "clips_unavailable" });
    const text = ttsText(req.body?.text);
    if (!text) return reply.code(400).send({ error: "bad_request" });
    const keys = await wordClips.remake(text);
    if (!keys) return reply.code(404).send({ error: "not_word_base" });
    req.log.info({ keys }, "clip remake");
    return { text, keys };
  });

  // The Recordings page: every clip in both voices, each with the open
  // reports whose question said its text (lib/wordClips.js list()).
  app.get("/api/admin/clips", async (req, reply) => {
    if (!wordClips) return reply.code(503).send({ error: "clips_unavailable" });
    const data = await wordClips.list();
    const byKey = new Map();
    const rows = db
      .prepare("SELECT id, game, item_ref, reason, comment, context, created_at FROM reports WHERE status = 'open' ORDER BY id")
      .all();
    for (const r of rows) {
      let context = {};
      try {
        context = JSON.parse(r.context);
      } catch {
        // An unreadable context links to no clip.
      }
      const report = { id: r.id, game: r.game, itemRef: r.item_ref, reason: r.reason, comment: r.comment, createdAt: r.created_at };
      for (const key of await wordClips.keysForTexts(reportedTexts(context, r.item_ref))) {
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(report);
      }
    }
    for (const clip of data.clips) if (byKey.has(clip.key)) clip.reports = byKey.get(clip.key);
    return data;
  });

  // An edited clip: { folder, key, audio: base64 MP3, changes } -> { revision }.
  // It becomes that voice's live clip; the earlier ones stay on disk.
  app.post("/api/admin/clips/edit", { bodyLimit: Math.ceil(MAX_CLIP_BYTES * 1.4) }, async (req, reply) => {
    if (!wordClips) return reply.code(503).send({ error: "clips_unavailable" });
    const { folder, key, audio, changes } = req.body || {};
    if (typeof folder !== "string" || typeof key !== "string" || !CLIP_KEY.test(key) || typeof audio !== "string") return reply.code(400).send({ error: "bad_request" });
    const buf = Buffer.from(audio, "base64");
    if (buf.length > MAX_CLIP_BYTES || !isMp3(buf)) return reply.code(400).send({ error: "bad_audio" });
    const kept = {};
    for (const f of EDIT_FIELDS) if (Number.isFinite(changes?.[f])) kept[f] = Math.round(changes[f] * 1000) / 1000;
    const res = await wordClips.saveEdit(folder, key, buf, kept);
    if (res.error) return reply.code(CLIP_ERRORS[res.error] || 400).send(res);
    req.log.info({ folder, key, revision: res.revision }, "clip edit");
    return { folder, key, revision: res.revision };
  });

  // Put an earlier version back: { folder, key, revision } (0 is the first).
  app.post("/api/admin/clips/use", async (req, reply) => {
    if (!wordClips) return reply.code(503).send({ error: "clips_unavailable" });
    const { folder, key, revision } = req.body || {};
    if (typeof folder !== "string" || typeof key !== "string" || !CLIP_KEY.test(key) || !Number.isInteger(revision) || revision < 0) return reply.code(400).send({ error: "bad_request" });
    const res = await wordClips.useVersion(folder, key, revision);
    if (res.error) return reply.code(CLIP_ERRORS[res.error] || 400).send(res);
    req.log.info({ folder, key, revision }, "clip version");
    return { folder, key, revision };
  });

  app.get("/api/admin/suggestions", async (req, reply) => {
    const status = req.query.status || "open";
    if (!SUGGESTION_STATUSES.includes(status)) return reply.code(400).send({ error: "bad_request" });
    return { suggestions: suggestionList(db, status) };
  });

  app.post("/api/admin/suggestions/status", async (req, reply) => {
    const ids = idList(req.body?.ids);
    const status = req.body?.status;
    if (!ids || !SUGGESTION_STATUSES.includes(status)) return reply.code(400).send({ error: "bad_request" });
    return { changed: setStatus(db, "suggestions", ids, status) };
  });

  // Learners, for granting the extended speech limit: those who asked first.
  app.get("/api/admin/users", async (req, reply) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase().slice(0, 100) : "";
    const rows = db
      .prepare(
        `SELECT u.id, u.email, u.role, u.created_at, u.tts_requested_at, COALESCE(t.count, 0) AS tts_today,
           (SELECT MAX(at) FROM sync_events e WHERE e.user_id = u.id AND e.type = 'answer') AS last_answer_at
         FROM users u LEFT JOIN tts_usage t ON t.user_id = u.id AND t.day = ?
         WHERE (? = '' OR instr(u.email, ?) > 0)
         ORDER BY (u.tts_requested_at IS NULL AND u.role = 'learner') OR u.role <> 'learner', u.tts_requested_at, u.id DESC
         LIMIT ?`
      )
      .all(ttsDay(), q, q, MAX_ROWS);
    return {
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        createdAt: r.created_at,
        ttsRequestedAt: r.role === "learner" ? r.tts_requested_at : null,
        ttsToday: r.tts_today,
        lastAnswerAt: r.last_answer_at,
      })),
      limits: { basic: config.ttsDailyLimit, extended: config.ttsVerifiedLimit },
    };
  });

  // Verify a learner (the extended speech limit and Say it right) or take it back. Admins
  // come from ADMIN_EMAILS and are not changed here.
  app.post("/api/admin/users/role", async (req, reply) => {
    const id = req.body?.id;
    const role = req.body?.role;
    if (!Number.isInteger(id) || id <= 0 || !["learner", "verified"].includes(role)) return reply.code(400).send({ error: "bad_request" });
    const { changes } = db
      .prepare("UPDATE users SET role = ?, tts_requested_at = NULL WHERE id = ? AND role <> 'admin'")
      .run(role, id);
    return changes ? { ok: true } : reply.code(404).send({ error: "not_found" });
  });

  // The Statistics page (adminData.js).
  app.get("/api/admin/stats", async () => adminStats(db));

  // Hours left out of the visit and game counts (a security scan, test
  // traffic): { from, to, note } -> the range. The counts stay; removing the
  // range brings them back.
  app.post("/api/admin/play/left-out", async (req, reply) => {
    const range = addLeftOut(db, req.body || {});
    return range ? reply.code(201).send(range) : reply.code(400).send({ error: "bad_request" });
  });

  app.post("/api/admin/play/left-out/remove", async (req, reply) => {
    const id = req.body?.id;
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "bad_request" });
    return removeLeftOut(db, id) ? { ok: true } : reply.code(404).send({ error: "not_found" });
  });

  // One learner's own progress and account details. Read only.
  app.get("/api/admin/users/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "bad_request" });
    return learnerView(db, id) || reply.code(404).send({ error: "not_found" });
  });

  // Tokens for AI tools (the MCP endpoint, routes/mcp.js). The secret is
  // shown once, when it is made.
  app.get("/api/admin/tokens", async (req) => ({ tokens: listTokens(db, req.session.user_id, "admin") }));

  app.post("/api/admin/tokens", async (req, reply) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const days = req.body?.days ?? 90;
    if (!name || name.length > 60 || ![30, 90, 365].includes(days)) return reply.code(400).send({ error: "bad_request" });
    return reply.code(201).send(createToken(db, { userId: req.session.user_id, name, scope: "admin", days }));
  });

  app.post("/api/admin/tokens/revoke", async (req, reply) => {
    const id = req.body?.id;
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "bad_request" });
    return revokeToken(db, req.session.user_id, id, "admin") ? { ok: true } : reply.code(404).send({ error: "not_found" });
  });
}
