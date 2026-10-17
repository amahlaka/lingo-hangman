// The admin pages' API: the report and suggestion queue (/admin/reports),
// users, statistics, and the tokens for AI tools (/admin/ai). Needs an admin
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

const RECENT_SIGN_IN_MS = 24 * 3600_000;

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

  // Verify a learner (the extended speech limit) or take it back. Admins
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

  // One learner's own progress and account details. Read only.
  app.get("/api/admin/users/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "bad_request" });
    return learnerView(db, id) || reply.code(404).send({ error: "not_found" });
  });

  // Tokens for AI tools (the MCP endpoint, routes/mcp.js). The secret is
  // shown once, when it is made.
  app.get("/api/admin/tokens", async (req) => ({ tokens: listTokens(db, req.session.user_id) }));

  app.post("/api/admin/tokens", async (req, reply) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const days = req.body?.days ?? 90;
    if (!name || name.length > 60 || ![30, 90, 365].includes(days)) return reply.code(400).send({ error: "bad_request" });
    return reply.code(201).send(createToken(db, { userId: req.session.user_id, name, scope: "admin", days }));
  });

  app.post("/api/admin/tokens/revoke", async (req, reply) => {
    const id = req.body?.id;
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: "bad_request" });
    return revokeToken(db, req.session.user_id, id) ? { ok: true } : reply.code(404).send({ error: "not_found" });
  });
}
