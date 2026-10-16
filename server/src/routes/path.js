// "My path": keeps each learner's current plan (planned in the app,
// src/lib/path.js) so all their devices show the same one. Signed in only.

import { cleanPath } from "../../../src/lib/pathFormat.js";
import { requireSession } from "../sessions.js";

const HOUR = 3600_000;
const SAVES_PER_HOUR = 60;

export function storedPath(db, userId) {
  const row = db.prepare("SELECT plan, updated_at FROM paths WHERE user_id = ?").get(userId);
  return row ? { path: JSON.parse(row.plan), updatedAt: row.updated_at } : { path: null, updatedAt: null };
}

export default async function pathRoutes(app, { db, limiter }) {
  app.addHook("preHandler", requireSession(db));

  app.get("/api/path", async (req) => storedPath(db, req.session.user_id));

  // { path } -> the stored path
  app.put("/api/path", async (req, reply) => {
    const userId = req.session.user_id;
    if (!limiter.allow(`path:${userId}`, SAVES_PER_HOUR, HOUR)) return reply.code(429).send({ error: "too_many_requests" });
    const path = cleanPath(req.body?.path);
    if (!path) return reply.code(400).send({ error: "bad_path" });
    db.prepare(
      `INSERT INTO paths (user_id, plan, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, updated_at = excluded.updated_at`
    ).run(userId, JSON.stringify(path));
    return storedPath(db, userId);
  });
}
