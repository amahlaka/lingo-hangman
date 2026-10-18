// How well the learner knows each word and lesson, from the answer statistics
// in progress state (src/lib/progress.js). Quick play uses this to mix easy
// wins with a few challenges. Pure functions, no React.

import { LEARNED_AFTER_DAYS, SLOW_FACTOR, meanMs } from "./progress.js";

// A lesson needs this many answers before its numbers mean anything.
export const MIN_LESSON_ANSWERS = 4;
// Below this share of first-try answers a lesson counts as a challenge.
export const CHALLENGE_FIRST_TRY = 0.6;

// "new"        never answered
// "known"      the last two answers were quick first tries (or, in saves from
//              before answer times were kept, solved on two days and never missed)
// "tricky"     missed in the last three answers, or the last three all took
//              a miss or a long think
// "practising" anything in between
export function wordStanding(entry) {
  if (!entry || !((entry.solved || 0) + (entry.lost || 0))) return "new";
  const recent = entry.recent || "";
  const last3 = recent.slice(-3);
  if (last3.includes("0")) return "tricky";
  if (!recent && entry.lost > entry.solved) return "tricky";
  if (last3.length === 3 && !last3.includes("2")) return "tricky";
  if (recent.endsWith("22")) return "known";
  if (!recent && entry.days?.length >= 2 && !entry.lost) return "known";
  if (entry.days?.length >= LEARNED_AFTER_DAYS && recent.endsWith("2")) return "known";
  return "practising";
}

// How much a tricky word wants practice: misses count double, hesitations once.
export function challengeScore(entry) {
  const recent = entry?.recent || "";
  let score = 0;
  for (const mark of recent) score += mark === "0" ? 2 : mark === "1" ? 1 : 0;
  return score + (recent ? 0 : entry?.lost || 0);
}

// Lessons ("gameId:lesson") that are a challenge for this learner: answered
// often enough, and either mostly not on the first try or clearly slower than
// the learner's own pace in that game.
export function challengeLessons(state) {
  const stats = state.stats || { games: {}, lessons: {} };
  const out = new Set();
  for (const [key, tally] of Object.entries(stats.lessons)) {
    if (tally.n < MIN_LESSON_ANSWERS) continue;
    const gameMean = meanMs(stats.games[key.split(":")[0]]);
    const mean = meanMs(tally);
    if (tally.firstTry / tally.n < CHALLENGE_FIRST_TRY || (gameMean && mean && mean > SLOW_FACTOR * gameMean)) {
      out.add(key);
    }
  }
  return out;
}
