// Reports of problems in games and suggestions for new content. Signed-in
// learners only (Arttu's decision): linking them to accounts lets a learner
// see "fixed, thanks" later and keeps abuse to per-account limits.

import { requireSession } from "../sessions.js";

const DAY = 24 * 3600_000;
export const REPORT_REASONS = ["wrong_answer", "typo", "bad_audio", "confusing", "misheard", "other"];
export const SUGGESTION_KINDS = ["word", "phrase", "sentence"];
const REPORTS_PER_DAY = 30;
const SUGGESTIONS_PER_DAY = 20;
const MAX_CONTEXT = 4000;
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// A trimmed string of at most `max` characters, "" when missing, or null when
// it isn't text or is too long.
export function text(value, max) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s.length > max ? null : s;
}

export const reportView = (r) => ({
  id: r.id,
  game: r.game,
  itemRef: r.item_ref,
  reason: r.reason,
  comment: r.comment,
  context: JSON.parse(r.context),
  status: r.status,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
});

// Which of the English (text) and Finnish (meaning) the learner gave. A
// learner may not know the English word, so a Finnish-only suggestion is
// fine: "fi" tells the admin (or the AI) to find the English for it.
export const givenIn = (s) => (s.text && s.meaning ? "both" : s.text ? "en" : "fi");

export const suggestionView = (s) => ({
  id: s.id,
  kind: s.kind,
  text: s.text,
  meaning: s.meaning,
  given: givenIn(s),
  note: s.note,
  status: s.status,
  createdAt: s.created_at,
  resolvedAt: s.resolved_at,
});

export default async function feedbackRoutes(app, { db, limiter }) {
  app.addHook("preHandler", requireSession(db));

  app.post("/api/reports", async (req, reply) => {
    const b = req.body || {};
    const clientId = typeof b.clientId === "string" && CLIENT_ID_RE.test(b.clientId) ? b.clientId : null;
    const game = text(b.game, 40);
    const itemRef = text(b.itemRef, 200);
    const comment = text(b.comment, 1000);
    const context = b.context && typeof b.context === "object" && !Array.isArray(b.context) ? JSON.stringify(b.context) : "{}";
    if (!clientId || !game || !itemRef || comment === null || !REPORT_REASONS.includes(b.reason) || context.length > MAX_CONTEXT) {
      return reply.code(400).send({ error: "bad_request" });
    }
    const userId = req.session.user_id;
    const existing = db.prepare("SELECT id FROM reports WHERE user_id = ? AND client_id = ?").get(userId, clientId);
    if (existing) return { id: existing.id };
    if (!limiter.allow(`reports:${userId}`, REPORTS_PER_DAY, DAY)) return reply.code(429).send({ error: "too_many_requests" });
    const { lastInsertRowid } = db
      .prepare("INSERT INTO reports (user_id, client_id, game, item_ref, reason, comment, context) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId, clientId, game, itemRef, b.reason, comment, context);
    return reply.code(201).send({ id: Number(lastInsertRowid) });
  });

  app.post("/api/suggestions", async (req, reply) => {
    const b = req.body || {};
    const clientId = typeof b.clientId === "string" && CLIENT_ID_RE.test(b.clientId) ? b.clientId : null;
    const body = text(b.text, 300);
    const meaning = text(b.meaning, 300);
    const note = text(b.note, 1000);
    // English or Finnish, at least one of them.
    if (!clientId || body === null || meaning === null || note === null || !(body || meaning) || !SUGGESTION_KINDS.includes(b.kind)) {
      return reply.code(400).send({ error: "bad_request" });
    }
    const userId = req.session.user_id;
    const existing = db.prepare("SELECT id FROM suggestions WHERE user_id = ? AND client_id = ?").get(userId, clientId);
    if (existing) return { id: existing.id };
    if (!limiter.allow(`suggestions:${userId}`, SUGGESTIONS_PER_DAY, DAY)) return reply.code(429).send({ error: "too_many_requests" });
    const { lastInsertRowid } = db
      .prepare("INSERT INTO suggestions (user_id, client_id, kind, text, meaning, note) VALUES (?, ?, ?, ?, ?, ?)")
      .run(userId, clientId, b.kind, body, meaning, note);
    return reply.code(201).send({ id: Number(lastInsertRowid) });
  });

  // What I've sent, newest first, with whether it was fixed.
  app.get("/api/me/feedback", async (req) => {
    const userId = req.session.user_id;
    return {
      reports: db.prepare("SELECT * FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 50").all(userId).map(reportView),
      suggestions: db.prepare("SELECT * FROM suggestions WHERE user_id = ? ORDER BY id DESC LIMIT 50").all(userId).map(suggestionView),
    };
  });
}
