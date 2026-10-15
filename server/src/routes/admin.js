// The report and suggestion queue for the app's /admin/reports page. Needs an
// admin account (ADMIN_EMAILS) and a sign-in within the last day.

import { requireSession } from "../sessions.js";
import { reportView, suggestionView } from "./feedback.js";

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
}
