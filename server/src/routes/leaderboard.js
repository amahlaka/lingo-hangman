// Weekly leaderboards (docs/backend.md, "Leaderboards"). Signed-in learners
// only, and only once they join; leaving deletes their membership.

import { boardFor, freshNickname } from "../leaderboard/board.js";
import { requireSession } from "../sessions.js";

const HOUR = 3600_000;
const RENAMES_PER_HOUR = 20;

export default async function leaderboardRoutes(app, { db, limiter }) {
  app.addHook("preHandler", requireSession(db));

  app.get("/api/leaderboard", async (req) => boardFor(db, req.session.user_id));

  app.post("/api/leaderboard/join", async (req) => {
    const userId = req.session.user_id;
    db.prepare("INSERT INTO leaderboard_members (user_id, nickname) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING").run(userId, freshNickname(db));
    return boardFor(db, userId);
  });

  // A new random nickname. There are no typed names, so nothing to moderate.
  app.post("/api/leaderboard/nickname", async (req, reply) => {
    const userId = req.session.user_id;
    if (!limiter.allow(`nickname:${userId}`, RENAMES_PER_HOUR, HOUR)) return reply.code(429).send({ error: "too_many_requests" });
    const { changes } = db.prepare("UPDATE leaderboard_members SET nickname = ? WHERE user_id = ?").run(freshNickname(db), userId);
    if (!changes) return reply.code(404).send({ error: "not_joined" });
    return boardFor(db, userId);
  });

  app.delete("/api/leaderboard/join", async (req) => {
    db.prepare("DELETE FROM leaderboard_members WHERE user_id = ?").run(req.session.user_id);
    return boardFor(db, req.session.user_id);
  });
}
