// The report and suggestion queue for the app's /admin/reports page. Needs an
// admin account (ADMIN_EMAILS) and a sign-in within the last day.

import { requireSession } from "../sessions.js";
import { reportView, suggestionView } from "./feedback.js";
import { ttsDay } from "./tts.js";
import { DAILY_DAYS, MIN_ANSWERS, MIN_LEARNERS, cached } from "../stats/aggregate.js";

const RECENT_SIGN_IN_MS = 24 * 3600_000;
const REPORT_STATUSES = ["open", "fixed", "dismissed"];
const SUGGESTION_STATUSES = ["open", "accepted", "dismissed"];
const MAX_ROWS = 500;

const idList = (ids) =>
  Array.isArray(ids) && ids.length > 0 && ids.length <= MAX_ROWS && ids.every((id) => Number.isInteger(id) && id > 0) ? ids : null;

export default async function adminRoutes(app, { db, config }) {
  const session = requireSession(db);
  app.addHook("preHandler", async (req, reply) => {
    await session(req, reply);
    if (reply.sent) return reply;
    const s = req.session;
    // ADMIN_EMAILS can be set after the account was made.
    if (s.role !== "admin" && config.adminEmails.includes(s.email)) {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(s.user_id);
      s.role = "admin";
    }
    if (s.role !== "admin") return reply.code(403).send({ error: "not_admin" });
    if (Date.now() - s.auth_at > RECENT_SIGN_IN_MS) return reply.code(401).send({ error: "sign_in_again" });
  });

  // Reports grouped by question, so ten reports of one question are one row.
  app.get("/api/admin/reports", async (req, reply) => {
    const status = req.query.status || "open";
    if (!REPORT_STATUSES.includes(status)) return reply.code(400).send({ error: "bad_request" });
    const rows = db.prepare("SELECT * FROM reports WHERE status = ? ORDER BY id DESC LIMIT ?").all(status, MAX_ROWS);
    const groups = new Map();
    for (const row of rows) {
      const key = `${row.game}\u0000${row.item_ref}`;
      if (!groups.has(key)) groups.set(key, { game: row.game, itemRef: row.item_ref, reports: [] });
      groups.get(key).reports.push(reportView(row));
    }
    return {
      groups: [...groups.values()]
        .map((g) => ({ ...g, count: g.reports.length, latestAt: g.reports[0].createdAt }))
        .sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt)),
    };
  });

  app.post("/api/admin/reports/status", async (req, reply) => {
    const ids = idList(req.body?.ids);
    const status = req.body?.status;
    if (!ids || !REPORT_STATUSES.includes(status)) return reply.code(400).send({ error: "bad_request" });
    const update = db.prepare(
      "UPDATE reports SET status = ?, resolved_at = CASE WHEN ? = 'open' THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END WHERE id = ?"
    );
    let changed = 0;
    for (const id of ids) changed += Number(update.run(status, status, id).changes);
    return { changed };
  });

  app.get("/api/admin/suggestions", async (req, reply) => {
    const status = req.query.status || "open";
    if (!SUGGESTION_STATUSES.includes(status)) return reply.code(400).send({ error: "bad_request" });
    const rows = db.prepare("SELECT * FROM suggestions WHERE status = ? ORDER BY id DESC LIMIT ?").all(status, MAX_ROWS);
    return { suggestions: rows.map(suggestionView) };
  });

  app.post("/api/admin/suggestions/status", async (req, reply) => {
    const ids = idList(req.body?.ids);
    const status = req.body?.status;
    if (!ids || !SUGGESTION_STATUSES.includes(status)) return reply.code(400).send({ error: "bad_request" });
    const update = db.prepare(
      "UPDATE suggestions SET status = ?, resolved_at = CASE WHEN ? = 'open' THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END WHERE id = ?"
    );
    let changed = 0;
    for (const id of ids) changed += Number(update.run(status, status, id).changes);
    return { changed };
  });

  // Learners, for granting the extended speech limit: those who asked first.
  app.get("/api/admin/users", async (req, reply) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase().slice(0, 100) : "";
    const rows = db
      .prepare(
        `SELECT u.id, u.email, u.role, u.created_at, u.tts_requested_at, COALESCE(t.count, 0) AS tts_today
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

  // The Statistics page: numbers over all learners, recomputed a few times a
  // day (stats/aggregate.js), plus live account totals.
  app.get("/api/admin/stats", async () => {
    const rows = db.prepare("SELECT * FROM stats_daily ORDER BY day").all();
    const byDay = new Map();
    for (const r of rows) {
      const d = byDay.get(r.day) || { day: r.day, learners: 0, answers: 0, firstTry: 0, accounts: 0 };
      if (r.metric === "learners") d.learners = r.value;
      else if (r.metric === "accounts") d.accounts = r.value;
      else if (r.metric === "answers") d.answers += r.value;
      else if (r.metric === "first_try") d.firstTry += r.value;
      byDay.set(r.day, d);
    }
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const words = cached(db, "words");
    return {
      updatedAt: words?.updatedAt || null,
      days: [...byDay.values()],
      games: cached(db, "games")?.value || [],
      words: words?.value || { hardest: [], slowest: [], tracked: 0 },
      totals: {
        accounts: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
        activeWeek: db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM sync_events WHERE type = 'answer' AND at >= ?").get(weekAgo).n,
        reminders: db.prepare("SELECT COUNT(*) AS n FROM push_settings WHERE enabled = 1").get().n,
        openReports: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").get().n,
      },
      rules: { dailyDays: DAILY_DAYS, minAnswers: MIN_ANSWERS, minLearners: MIN_LEARNERS },
    };
  });
}
