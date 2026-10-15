// Progress sync across devices. The app sends the events it recorded
// (answers, goal changes, purchases) and gets back the account's progress:
// all its events applied in time order, with the same code the app uses
// (src/lib/syncEvents.js, copied into the image). See docs/backend.md
// ("Progress sync").

import { applyEvents, cleanEvent } from "../../../src/lib/syncEvents.js";
import { emptyProgress, progressSummary } from "../../../src/lib/progress.js";
import { requireSession } from "../sessions.js";

const HOUR = 3600_000;
const MAX_EVENTS = 500;
const SYNCS_PER_HOUR = 300;
// Events can't claim to be from more than this far in the future.
const CLOCK_SKEW_MS = 10 * 60_000;
const BEGINNING = new Date(0).toISOString();

function stateRow(db, userId) {
  return db.prepare("SELECT * FROM account_state WHERE user_id = ?").get(userId);
}

export function accountProgress(db, userId) {
  const row = stateRow(db, userId);
  return row ? JSON.parse(row.state) : null;
}

// Fold the account's new events into its cached state. In-order events are
// applied on top; an event older than the last one applied (a device that
// was offline) means applying everything again from the start.
function fold(db, userId, gameIds) {
  const row = stateRow(db, userId);
  const ctx = { gameIds: gameIds || (row ? JSON.parse(row.game_ids) : []) };
  const lastAt = row?.last_at || "";
  const lastSeq = row?.last_seq || 0;
  const pending = db
    .prepare("SELECT * FROM sync_events WHERE user_id = ? AND seq > ? ORDER BY at, seq")
    .all(userId, lastSeq);
  const inOrder = row && pending.every((e) => e.at >= lastAt);
  const events = inOrder
    ? pending
    : db.prepare("SELECT * FROM sync_events WHERE user_id = ? ORDER BY at, seq").all(userId);
  const start = inOrder ? JSON.parse(row.state) : emptyProgress();
  const state = applyEvents(
    start,
    events.map((e) => ({ type: e.type, payload: JSON.parse(e.payload) })),
    ctx
  );
  const last = events.at(-1);
  const maxSeq = db.prepare("SELECT MAX(seq) AS s FROM sync_events WHERE user_id = ?").get(userId).s || 0;
  db.prepare(
    `INSERT INTO account_state (user_id, state, last_at, last_seq, game_ids, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, last_at = excluded.last_at,
       last_seq = excluded.last_seq, game_ids = excluded.game_ids, updated_at = excluded.updated_at`
  ).run(userId, JSON.stringify(state), last ? last.at : lastAt, maxSeq, JSON.stringify(ctx.gameIds));
  return state;
}

export default async function syncRoutes(app, { db, limiter }) {
  app.addHook("preHandler", requireSession(db));

  const status = (s) => {
    const state = accountProgress(db, s.user_id);
    return {
      email: s.email,
      hasProgress: Boolean(state && state.totals.words > 0),
      summary: state ? progressSummary(state) : null,
      state,
    };
  };

  app.get("/api/sync", async (req) => status(req.session));

  // { events: [...], reset?: true, gameIds?: [...] } -> { state }
  // reset starts the account over from this call's events ("use this
  // device's progress").
  app.post("/api/sync", { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
    const userId = req.session.user_id;
    const body = req.body || {};
    if (!limiter.allow(`sync:${userId}`, SYNCS_PER_HOUR, HOUR)) return reply.code(429).send({ error: "too_many_requests" });
    if (!Array.isArray(body.events) || body.events.length > MAX_EVENTS) return reply.code(400).send({ error: "bad_request" });
    const gameIds =
      Array.isArray(body.gameIds) && body.gameIds.length <= 100 && body.gameIds.every((id) => typeof id === "string" && id.length <= 40)
        ? body.gameIds
        : null;
    const events = body.events.map(cleanEvent);
    if (events.some((e) => !e)) return reply.code(400).send({ error: "bad_event" });
    const whole = events.filter((e) => e.type === "baseline" || e.type === "merge");
    if (whole.length > 1) return reply.code(400).send({ error: "bad_event" });
    const hasEvents = db.prepare("SELECT 1 FROM sync_events WHERE user_id = ? LIMIT 1").get(userId);
    // A baseline replaces everything, so only an empty account (or a reset) takes one.
    if (whole[0]?.type === "baseline" && hasEvents && !body.reset) return reply.code(409).send({ error: "account_has_progress" });

    const latest = new Date(Date.now() + CLOCK_SKEW_MS).toISOString();
    db.exec("BEGIN");
    try {
      if (body.reset === true) {
        db.prepare("DELETE FROM sync_events WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM account_state WHERE user_id = ?").run(userId);
      }
      const insert = db.prepare(
        "INSERT OR IGNORE INTO sync_events (user_id, id, at, type, payload) VALUES (?, ?, ?, ?, ?)"
      );
      for (const e of events) {
        // A baseline is where the account starts, before any other event,
        // even one from a device that was offline when it was made.
        const at = e.type === "baseline" ? BEGINNING : e.at > latest ? latest : e.at;
        insert.run(userId, e.id, at, e.type, JSON.stringify(e.payload));
      }
      const state = fold(db, userId, gameIds);
      db.exec("COMMIT");
      return { state };
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  });
}
