// Pure helpers for Say it right's Read aloud mode: a learner reads one or two
// word bank sentences ("passage" items) aloud, and the result is looked at
// word by word and sound by sound to find what to practise. No React here.

import { getPassages } from "../../lib/words";
import { ipaWords, sentenceWords } from "../../lib/contentSchema";
import { shuffle } from "../practice/practiceLogic";

// Each passage is recorded and scored on the server, so a round is short.
export const READ_ROUND_LENGTH = 3;
// Readings per passage; the best one counts.
export const MAX_READ_TRIES = 2;
// Two sentences read slowly fit in this.
export const READ_MAX_MS = 15000;
// A breath between the sentences must not end the recording.
export const READ_PAUSE_MS = 1800;

// A word counts as said well from this score, and as nearly from CLOSE_WORD.
const GOOD_WORD = 75;
const CLOSE_WORD = 40;

// The passages Read aloud can ask: with US IPA, one IPA word for every word.
export function readPool(passages = getPassages()) {
  return passages.filter((p) => p?.text?.en && p.ipa?.en && ipaWords(p.ipa.en).length === sentenceWords(p.text.en).length);
}

// A round of passages, easier ones first.
export function buildReadRound(pool = readPool(), length = READ_ROUND_LENGTH, random = Math.random) {
  return shuffle(pool, random)
    .slice(0, length)
    .sort((a, b) => (a.level || 1) - (b.level || 1));
}

// The passage's words, each with its own IPA: [{ text, ipa }].
export function passageWords(passage) {
  const words = sentenceWords(passage?.text?.en);
  const ipa = ipaWords(passage?.ipa?.en);
  return words.map((text, i) => ({ text, ipa: ipa[i] ? `/${ipa[i]}/` : "" }));
}

// How each word was read, from a scorePronunciation result of the whole
// passage: [{ text, ipa, score, status: "ok" | "close" | "miss", skipped, sounds }].
// `skipped` when nothing at all was heard in the word's place.
export function wordResults(result, words) {
  return words.map((word, w) => {
    const sounds = (result?.sounds || []).filter((s) => s.word === w);
    const cost = sounds.length ? sounds.reduce((a, s) => a + (s.cost ?? (s.status === "ok" ? 0 : s.status === "close" ? 0.5 : 1)), 0) / sounds.length : 1;
    const score = Math.round(100 * Math.max(0, 1 - cost));
    const skipped = sounds.length > 0 && sounds.every((s) => !s.heard);
    // A word with a missed sound needs practice, however good the rest was.
    const missed = sounds.some((s) => s.status === "miss");
    const status = skipped ? "miss" : score >= GOOD_WORD && !missed ? "ok" : score >= CLOSE_WORD ? "close" : "miss";
    return { ...word, score, status, skipped, sounds };
  });
}

// The words worth practising, weakest first: at most `max`, each once.
export function wordsToPractise(words, max = 4) {
  const seen = new Set();
  return words
    .filter((w) => w.status !== "ok")
    .sort((a, b) => a.score - b.score)
    .filter((w) => {
      const key = w.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

// The sounds that went wrong in the reading, worst first: [{ symbol, total,
// missed, close, words }]. A sound counts as weak when about a third or more
// of its times in the passage were missed (close counts half).
export function weakSounds(result, words = [], max = 3) {
  const by = new Map();
  for (const s of result?.sounds || []) {
    const entry = by.get(s.symbol) || { symbol: s.symbol, total: 0, missed: 0, close: 0, words: [] };
    entry.total += 1;
    if (s.status === "miss") entry.missed += 1;
    if (s.status === "close") entry.close += 1;
    const word = words[s.word]?.text;
    if (s.status !== "ok" && word && !entry.words.includes(word)) entry.words.push(word);
    by.set(s.symbol, entry);
  }
  const weakness = (e) => (e.missed + e.close / 2) / e.total;
  return [...by.values()]
    .filter((e) => e.missed + e.close > 0 && weakness(e) >= 1 / 3)
    .sort((a, b) => weakness(b) * Math.min(b.total, 3) - weakness(a) * Math.min(a.total, 3) || b.total - a.total)
    .slice(0, max);
}

// Reading speed in words a minute, with a name: "slow" | "steady" | "quick".
// null without a length.
export function readingPace(wordCount, seconds) {
  if (!wordCount || !seconds) return null;
  const wpm = Math.round((wordCount / seconds) * 60);
  return { wpm, band: wpm < 70 ? "slow" : wpm < 150 ? "steady" : "quick" };
}
