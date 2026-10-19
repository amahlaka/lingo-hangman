// Pure helpers for Word rush: as many Finnish-to-English picks as you can in
// a minute, with a combo that multiplies the round's score and adds time.
// No React here so the rules are easy to test.

import { buildChoiceQuestion, isPairCandidate, shuffle } from "../practice/practiceLogic";
import { localChanged } from "../../lib/localSettings.js";

export const RUSH_SECONDS = 60;
// Round lengths a game card's menu offers. Each has its own best score.
export const RUSH_LENGTHS = [30, 60, 90];
// Every this many right answers in a row adds bonus time.
export const COMBO_BONUS_EVERY = 5;
export const COMBO_BONUS_SECONDS = 3;
// How long a missed question stays on screen with its answer shown.
export const MISS_PAUSE_MS = 700;
const BEST_KEY = "lingoRushBest";

// A round length the game plays: one of RUSH_LENGTHS, else the usual minute.
export function rushSeconds(asked) {
  return RUSH_LENGTHS.includes(asked) ? asked : RUSH_SECONDS;
}

// Where the best score of a `seconds` round is kept, and its synced record
// name (src/lib/accountSettings.js). The minute keeps the names it always had.
export function bestKeys(seconds = RUSH_SECONDS) {
  return seconds === RUSH_SECONDS
    ? { storage: BEST_KEY, record: "rushBest" }
    : { storage: `${BEST_KEY}${seconds}`, record: `rushBest${seconds}` };
}

// Score multiplier for a run of right answers: x1, then x2 from 3 in a row,
// x3 from 6 in a row.
export function comboMultiplier(combo) {
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

// Round points for a right answer that makes the combo `combo` long.
export function rushPoints(combo) {
  return 10 * comboMultiplier(combo);
}

// Bonus seconds for reaching `combo` right answers in a row.
export function comboBonus(combo) {
  return combo > 0 && combo % COMBO_BONUS_EVERY === 0 ? COMBO_BONUS_SECONDS : 0;
}

// Words short enough to read at a glance.
export function rushPool(pairs) {
  return pairs.filter((p) => isPairCandidate(p) && p.learning.split(/\s+/).length <= 2);
}

// The questions of a round in order, enough for anyone: every usable word
// once, each with three wrong options.
export function buildRushQuestions(pool, random = Math.random) {
  return shuffle(pool, random).map((w) => buildChoiceQuestion(w, pool, random));
}

export function readBest(seconds = RUSH_SECONDS, storage = globalThis.localStorage) {
  try {
    const n = Number(storage?.getItem(bestKeys(seconds).storage));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBest(score, seconds = RUSH_SECONDS, storage = globalThis.localStorage) {
  const keys = bestKeys(seconds);
  try {
    storage?.setItem(keys.storage, String(score));
    localChanged(keys.record);
  } catch {
    // ignore: the best score then lasts for this visit only
  }
}
