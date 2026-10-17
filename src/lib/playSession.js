// Play sessions and unfinished rounds: the rules shared by the app
// (src/lib/playTracker.js) and the API (server/src/routes/play.js, copied into
// its image). See docs/backend.md ("Play statistics").
//
// A play session starts with the first game opened and lasts while games are
// played, from one game to the next, until SESSION_GAP_MS passes without play
// or the app is closed. A round is one go at a game, from its first answer to
// its end screen; leaving before the end screen is giving up.

export const SESSION_GAP_MS = 30 * 60_000;
// Longer than this without an answer before leaving counts as stuck.
export const STUCK_MS = 60_000;
// Opening a game and leaving sooner, without answering, isn't giving up.
export const PEEK_MS = 5_000;
// A session can't be longer than this (a tab left open overnight).
export const MAX_SESSION_MS = 12 * 3600_000;

// Why a round was left unfinished, guessed from how it was going. In the
// order they are checked.
export const GIVE_UP_REASONS = ["before_first", "stuck", "many_wrong", "after_wrong", "after_skip", "mid_round"];
export const GIVE_UP_HOW = ["left", "closed"];

// round: { startedAt, lastAt, answers, recent: ["right" | "wrong" | "skip", ...] (latest last) }
export function giveUpReason(round, now) {
  if (!round.answers) return "before_first";
  if (now - (round.lastAt || round.startedAt) >= STUCK_MS) return "stuck";
  const recent = round.recent.slice(-3);
  if (recent.filter((r) => r === "wrong").length >= 2) return "many_wrong";
  const last = recent.at(-1);
  if (last === "wrong") return "after_wrong";
  if (last === "skip") return "after_skip";
  return "mid_round";
}

// "right" | "wrong" | "skip" for a result passed to recordWord.
export const answerOutcome = (result) => (result.skipped ? "skip" : result.solved ? "right" : "wrong");

// ---- Checking what the app sends (server side) ----

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const GAME = /^[a-z0-9-]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_GAMES = 40;
const isTime = (s) => typeof s === "string" && s.length <= 30 && !Number.isNaN(Date.parse(s));
const count = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;

export const isGameId = (id) => typeof id === "string" && GAME.test(id);

// A session as stored, or null when it doesn't look like one.
export function cleanPlaySession(s) {
  if (!s || typeof s !== "object" || !ID.test(s.id) || !DAY.test(s.day) || !isTime(s.startedAt) || !isTime(s.endedAt)) return null;
  const start = Date.parse(s.startedAt);
  const ms = Date.parse(s.endedAt) - start;
  if (ms < 0 || ms > MAX_SESSION_MS) return null;
  if (!s.games || typeof s.games !== "object" || Array.isArray(s.games)) return null;
  const entries = Object.entries(s.games);
  if (entries.length === 0 || entries.length > MAX_GAMES) return null;
  const games = {};
  for (const [id, g] of entries) {
    if (!isGameId(id) || !g || !count(g.rounds, 1000) || !count(g.finished, 1000)) return null;
    games[id] = { rounds: g.rounds, finished: g.finished };
  }
  return { id: s.id, day: s.day, startedAt: new Date(start).toISOString(), endedAt: new Date(start + ms).toISOString(), ms, games };
}

export function cleanGiveUp(g) {
  if (!g || typeof g !== "object" || !ID.test(g.id) || !isTime(g.at) || !isGameId(g.game)) return null;
  if (!GIVE_UP_REASONS.includes(g.reason) || !GIVE_UP_HOW.includes(g.how)) return null;
  if (!count(g.answers, 1000) || !count(g.ms, MAX_SESSION_MS)) return null;
  return { id: g.id, at: new Date(Date.parse(g.at)).toISOString(), game: g.game, reason: g.reason, how: g.how, answers: g.answers, ms: g.ms };
}
