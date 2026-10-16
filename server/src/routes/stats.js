// /api/difficulty: how hard each word is for learners in general, for Quick
// play (signed in or not). Only words answered by several learners are in it
// (stats/aggregate.js).

import { cached } from "../stats/aggregate.js";

export default async function statsRoutes(app, { db }) {
  app.get("/api/difficulty", async (req, reply) => {
    const data = cached(db, "difficulty");
    reply.header("Cache-Control", "public, max-age=3600");
    return data ? data.value : { generatedAt: null, items: {} };
  });
}
