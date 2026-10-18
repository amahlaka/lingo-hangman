// Pure helpers for "Say it right": which word bank words it asks, how a score
// is named, and which sound tip goes with a missed sound. No React here.

import { getItem, getPhoneTips } from "../../lib/words";
import { symbolKey } from "../../lib/phonemes";
import { shuffle, wordCount } from "../practice/practiceLogic";
import { localChanged } from "../../lib/localSettings.js";

// Every word is recorded and scored on the server, so a round is short.
export const SAY_RIGHT_ROUND_LENGTH = 6;
// Recordings per word; the best one counts.
export const MAX_SAY_RIGHT_TRIES = 3;
// Single words and short phrases: the recogniser takes a few seconds a clip.
export const MAX_SAY_RIGHT_WORDS = 3;
// A word counts as said right from this score.
export const PASS_SCORE = 60;
// No need to try again from this score.
export const GREAT_SCORE = 90;

// Word bank features about sounds Finnish speakers find hard; a round has
// some of these words in it.
export const SOUND_FEATURES = [
  "th-sound", "w-v-sound", "z-sound", "sh-ch-j-sound", "voiced-consonant", "schwa", "vowel-length", "diphthong", "word-stress",
];

// The US IPA of a pair's word bank item, or null.
export function ipaOf(pair) {
  const ipa = getItem(pair?.id)?.ipa;
  return ipa?.en || null;
}

// Words from `pairs` this game can ask: a word bank item with US IPA, short.
export function sayRightPool(pairs) {
  return (pairs || []).filter((p) => ipaOf(p) && wordCount(p.learning) <= MAX_SAY_RIGHT_WORDS);
}

// A round: about half words with a hard sound, the rest anything.
export function buildSayRightRound(pool, length = SAY_RIGHT_ROUND_LENGTH, random = Math.random) {
  const hard = (p) => (getItem(p.id)?.features || []).some((f) => SOUND_FEATURES.includes(f));
  const tricky = shuffle(pool.filter(hard), random).slice(0, Math.ceil(length / 2));
  const taken = new Set(tricky.map((p) => p.id));
  const rest = shuffle(pool.filter((p) => !taken.has(p.id)), random).slice(0, length - tricky.length);
  return shuffle([...tricky, ...rest], random);
}

// The name of a score: a key of t.practice.
export function rankKey(score) {
  if (score >= GREAT_SCORE) return "sayRightRankGreat";
  if (score >= 75) return "sayRightRankVeryGood";
  if (score >= PASS_SCORE) return "sayRightRankGood";
  if (score >= 40) return "sayRightRankClose";
  return "sayRightRankTry";
}

// The word bank tip ("phone" item) for one sound ("θ", "tʃ", "iː"), or null.
export function tipFor(symbol) {
  const key = symbolKey(symbol);
  if (!key) return null;
  return getPhoneTips().find((tip) => (tip.symbols || []).some((s) => symbolKey(s) === key)) || null;
}

// The first sound worth practising that has a tip: { sound, tip } or null.
export function firstTip(practise) {
  for (const s of practise || []) {
    const tip = tipFor(s.symbol);
    if (tip) return { sound: s, tip };
  }
  return null;
}

// The round's average of each word's best score.
export function roundAverage(results) {
  const scores = (results || []).map((r) => r.score).filter((s) => typeof s === "number");
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
}

// Sounds missed or nearly said across a round, most often first: [{ symbol, n }].
export function roundSounds(results, max = 3) {
  const counts = new Map();
  for (const r of results || []) {
    for (const s of r.practise || []) counts.set(s.symbol, (counts.get(s.symbol) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([symbol, n]) => ({ symbol, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, max);
}

const BEST_KEY = "lingoSayRightBest";
const bestKey = (mode) => (mode === "read" ? `${BEST_KEY}Read` : BEST_KEY);

// The best round average on this device, for "words" or "read" (Read aloud).
export function loadBest(mode = "words", storage = globalThis.localStorage) {
  try {
    const n = Number(storage?.getItem(bestKey(mode)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// Saves `score` when it beats the best; true when it did.
export function saveBest(score, mode = "words", storage = globalThis.localStorage) {
  if (typeof score !== "number" || score <= loadBest(mode, storage)) return false;
  try {
    storage?.setItem(bestKey(mode), String(score));
    localChanged(mode === "read" ? "sayRightReadBest" : "sayRightBest");
  } catch {
    // private mode
  }
  return true;
}

const SOUNDS_KEY = "lingoSayRightSounds";
// Older tries count a little less each time, so the list follows the learner.
const SOUNDS_FADE = 0.97;

// How each sound has gone on this device: { [symbol]: { seen, missed } }, with
// a nearly said sound counting half a miss.
export function loadSoundHistory(storage = globalThis.localStorage) {
  try {
    const data = JSON.parse(storage?.getItem(SOUNDS_KEY) || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

// Adds a scored try (a scorePronunciation result) to the history and saves it.
export function recordSounds(result, storage = globalThis.localStorage) {
  const history = loadSoundHistory(storage);
  for (const entry of Object.values(history)) {
    entry.seen *= SOUNDS_FADE;
    entry.missed *= SOUNDS_FADE;
  }
  for (const s of result?.sounds || []) {
    const entry = history[s.symbol] || (history[s.symbol] = { seen: 0, missed: 0 });
    entry.seen += 1;
    entry.missed += s.status === "miss" ? 1 : s.status === "close" ? 0.5 : 0;
  }
  try {
    storage?.setItem(SOUNDS_KEY, JSON.stringify(history));
    localChanged("sayRightSounds");
  } catch {
    // private mode
  }
  return history;
}

// The learner's weakest sounds so far, worst first: [{ symbol, rate }], each
// heard at least a few times and missed about a third of the time or more.
export function weakestSounds(history = loadSoundHistory(), max = 3) {
  return Object.entries(history)
    .filter(([, e]) => e.seen >= 2.5 && e.missed / e.seen >= 0.3)
    .map(([symbol, e]) => ({ symbol, rate: e.missed / e.seen }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, max);
}
