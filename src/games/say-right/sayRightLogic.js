// Pure helpers for "Say it right": which word bank words it asks, how a score
// is named, and which sound tip goes with a missed sound. No React here.

import { getItem, getPhoneTips } from "../../lib/words";
import { symbolKey } from "../../lib/phonemes";
import { shuffle, wordCount } from "../practice/practiceLogic";

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

// The best round average on this device.
export function loadBest(storage = globalThis.localStorage) {
  try {
    const n = Number(storage?.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// Saves `score` when it beats the best; true when it did.
export function saveBest(score, storage = globalThis.localStorage) {
  if (typeof score !== "number" || score <= loadBest(storage)) return false;
  try {
    storage?.setItem(BEST_KEY, String(score));
  } catch {
    // private mode
  }
  return true;
}
