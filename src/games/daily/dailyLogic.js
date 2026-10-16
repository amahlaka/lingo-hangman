// Pure helpers for Daily word: one five-letter English word a day, the same
// for everyone, guessed in six tries with its Finnish meaning as the clue.
// Each guess colours its letters: right place, in the word, or not in it.
// No React here so the rules are easy to test.

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;
// After this many guesses the word can be heard for free.
export const HEAR_AFTER = 3;
const STORAGE_KEY = "lingoDaily";
// Day 0 of the word order.
const FIRST_DAY = Date.UTC(2026, 0, 1);

// Word bank words that can be a daily word: five plain letters with a Finnish meaning.
export function dailyCandidates(items) {
  return items
    .filter((i) => i.type === "word" && /^[a-z]{5}$/.test(i.text?.en || "") && i.text?.fi)
    .map((i) => ({ id: i.id, word: i.text.en.toUpperCase(), fi: i.text.fi, ipa: i.ipa?.en || "" }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Days since FIRST_DAY for a "YYYY-MM-DD" key.
export function dayNumber(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - FIRST_DAY) / 86400000);
}

// A small seeded random number generator, so everyone gets the same order.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The word for a day. The candidates go through the same shuffle for
// everyone, then each day takes the next one, starting over when they run out.
export function wordForDay(candidates, key) {
  if (!candidates.length) return null;
  const random = seeded(2026);
  const order = candidates.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const n = dayNumber(key);
  return order[((n % order.length) + order.length) % order.length];
}

// How each letter of `guess` matches `answer`: "hit" (right place), "near"
// (in the word somewhere else) or "miss". A letter that appears once in the
// answer is only marked once.
export function scoreGuess(guess, answer) {
  const out = Array(guess.length).fill("miss");
  const left = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) out[i] = "hit";
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (out[i] === "hit") continue;
    if (left[guess[i]] > 0) {
      out[i] = "near";
      left[guess[i]] -= 1;
    }
  }
  return out;
}

const RANK = { miss: 1, near: 2, hit: 3 };

// The best thing known about each letter guessed so far, for the keyboard.
export function letterStates(guesses, answer) {
  const states = {};
  for (const guess of guesses) {
    scoreGuess(guess, answer).forEach((s, i) => {
      const l = guess[i];
      if (!states[l] || RANK[s] > RANK[states[l]]) states[l] = s;
    });
  }
  return states;
}

export function isWon(guesses, answer) {
  return guesses.includes(answer);
}

export function isOver(guesses, answer) {
  return isWon(guesses, answer) || guesses.length >= MAX_GUESSES;
}

// Saved state: today's word and guesses (so the word stays the same all day
// even if the word bank changes) and the learner's record.
export function emptyDaily() {
  return { day: null, word: null, guesses: [], recorded: false, played: 0, won: 0, streak: 0, bestStreak: 0, lastWon: null };
}

export function loadDaily(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY));
    return saved && typeof saved === "object" ? { ...emptyDaily(), ...saved } : emptyDaily();
  } catch {
    return emptyDaily();
  }
}

export function saveDaily(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore: progress then lasts for this visit only
  }
}

// The saved state moved to `key`: a new day starts with no guesses and a new word.
export function dailyFor(state, key, candidates) {
  if (state.day === key && state.word) return state;
  const word = wordForDay(candidates, key);
  return { ...state, day: key, word, guesses: [], recorded: false };
}

// The record after today's game ends. `yesterday` is the day before `key`.
export function finishDaily(state, { won, key, yesterday }) {
  const streak = won ? (state.lastWon === yesterday ? state.streak + 1 : 1) : 0;
  return {
    ...state,
    recorded: true,
    played: state.played + 1,
    won: state.won + (won ? 1 : 0),
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    lastWon: won ? key : state.lastWon,
  };
}
