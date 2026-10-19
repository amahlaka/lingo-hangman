// Pure helpers for "Type it": see the Finnish and type the English word, or
// hear an English sentence and type it (dictation). The check is strict about
// spelling, since that is what the game practises, but not about capitals,
// punctuation, contractions ("I'm" / "I am"), numbers and times written with
// digits ("6" / "six", "6:30" / "six thirty") or the other right spelling of a
// word (the word bank's "alike" items).
// No React here.

import { CONTRACTIONS, editDistance, numberWords } from "../say/sayLogic";
import { shuffle, usableWords, wordCount } from "../practice/practiceLogic";
import { alikeWords } from "../../lib/words";

export const TYPE_ROUND = 10;
// Dictation sentences in a round, when the browser can read them aloud.
export const TYPE_SENTENCES = 4;

// Dictation sentences in a round of `length`: the same share as a full round,
// so a one-question round is a word.
export function typeSentences(length) {
  return Math.min(TYPE_SENTENCES, Math.floor((length * TYPE_SENTENCES) / TYPE_ROUND));
}
// Checked attempts per question before the answer is shown.
export const MAX_TYPE_TRIES = 3;
// Longest dictation sentence, in words.
export const MAX_DICTATION_WORDS = 8;
// Points from this round each paid hint costs.
export const TYPE_HINT_COSTS = { shape: 2, letter: 3, word: 4, hear: 4 };

// Words with two right spellings (color / colour), from the word bank's
// "alike" items: the learner may well have learned the other one.
const canon = (w) => alikeWords(["spelling"]).get(w) || w;

const APOSTROPHES = /[‘’ʼ`´]/g;

// One display word to its comparable form: lowercase, straight apostrophes,
// no punctuation around it.
export function normWord(word = "") {
  const w = String(word)
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  return canon(w);
}

const MERIDIEM = { "a.m": "am", "p.m": "pm" };

// A number or time typed with digits, as words: "6" -> "six", "6:30" -> "six
// thirty", "6:05" -> "six oh five", "6:00" -> "six o'clock", "6pm" -> "six pm".
// Null when `w` isn't one.
function digitsAsWords(w) {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/.exec(w);
  if (!m) return null;
  const hour = numberWords(Number(m[1]));
  if (!hour) return null;
  const out = [hour];
  if (m[2] !== undefined) {
    const min = Number(m[2]);
    if (min > 59) return null;
    if (min === 0) out.push("o'clock");
    else out.push(min < 10 ? `oh ${numberWords(min)}` : numberWords(min));
  }
  if (m[3]) out.push(m[3]);
  return out.join(" ");
}

// Text to comparable words, with contractions, numbers and times spelt out.
export function typeTokens(text = "") {
  const out = [];
  for (const raw of String(text).replace(/[–—/]|-(?!\d)/g, " ").split(/\s+/)) {
    let w = normWord(raw);
    if (!w) continue;
    w = MERIDIEM[w] || w;
    const spelt = digitsAsWords(w);
    if (spelt) out.push(...spelt.split(" "));
    else if (CONTRACTIONS[w]) out.push(...CONTRACTIONS[w].split(" "));
    else out.push(...w.split("-"));
  }
  return out;
}

const sameTokens = (a, b) => a.length === b.length && a.every((w, i) => w === b[i]);

// Which of `typed` are also in `target`, in order (longest common subsequence).
function matchedIndexes(typed, target) {
  const n = typed.length;
  const m = target.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = typed[i] === target[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hits = new Set();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (typed[i] === target[j]) {
      hits.add(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return hits;
}

// Compare what the learner typed with the answer (and any other right answers).
// Returns {
//   correct,
//   close:   not right, but only a letter or two off ("recieve")
//   words:   the learner's own words, each { text, ok } where ok means the
//            word is in the answer in that order
//   missing: how many answer words are not in what was typed
// }
export function checkTyped(target, typed, alternatives = []) {
  const typedTokens = typeTokens(typed);
  const answers = [target, ...alternatives].filter(Boolean);
  const correct = typedTokens.length > 0 && answers.some((a) => sameTokens(typeTokens(a), typedTokens));

  // Word by word, each spelt out the same way ("6" and "six" match).
  const wordKey = (w) => typeTokens(w).join(" ");
  const shown = String(typed).trim().split(/\s+/).filter(Boolean);
  const targetWords = String(target).trim().split(/\s+/).map(wordKey).filter(Boolean);
  const hits = matchedIndexes(shown.map(wordKey), targetWords);
  const words = shown.map((text, i) => ({ text, ok: correct || hits.has(i) }));

  const joined = (list) => list.join(" ");
  const targetText = joined(typeTokens(target));
  const distance = editDistance(joined(typedTokens), targetText);
  const close = !correct && typedTokens.length > 0 && distance <= (targetText.length <= 6 ? 1 : 2);
  return { correct, close, words, missing: correct ? 0 : Math.max(0, targetWords.length - hits.size) };
}

const isLetter = (ch) => /[\p{L}\p{N}]/u.test(ch);
const sameChar = (a, b) => a.toLowerCase().replace(APOSTROPHES, "'") === b.toLowerCase().replace(APOSTROPHES, "'");

// How many characters from the start of `typed` already match the answer.
export function correctPrefix(typed, target) {
  let n = 0;
  while (n < typed.length && n < target.length && sameChar(typed[n], target[n])) n++;
  return n;
}

// Where the last letter of the answer is; hints never give that one away.
function lastLetterAt(target) {
  for (let i = target.length - 1; i >= 0; i--) if (isLetter(target[i])) return i;
  return 0;
}

// The "next letter" hint: the answer up to and including the letter after the
// part already right (or already revealed). Null when only the last letter is left.
export function revealNextLetter(target, typed, revealed = 0) {
  let n = Math.max(revealed, correctPrefix(typed, target));
  while (n < target.length && !isLetter(target[n])) n++;
  if (n >= lastLetterAt(target)) return null;
  return target.slice(0, n + 1);
}

// The "next word" hint for sentences: the answer up to the end of the next
// word not yet right, with the space after it. Null when only the last word is left.
export function revealNextWord(target, typed, revealed = 0) {
  let n = Math.max(revealed, correctPrefix(typed, target));
  // Back to the start of the word the learner is in, then to its end.
  while (n > 0 && !/\s/.test(target[n - 1])) n--;
  let end = n;
  while (end < target.length && /\s/.test(target[end])) end++;
  while (end < target.length && !/\s/.test(target[end])) end++;
  if (end >= target.length || !/[\p{L}\p{N}]/u.test(target.slice(end))) return null;
  return target.slice(0, end + 1);
}

// The answer's shape for the hint: one entry per character, `letter: true`
// for letters (shown as a blank unless revealed) and the rest as they are.
// With `firstLetters` the first letter of every word is shown too.
export function answerShape(target, { revealed = 0, firstLetters = false } = {}) {
  return Array.from(target).map((ch, i) => {
    if (!isLetter(ch)) return { ch, letter: false, shown: true };
    const wordStart = i === 0 || !isLetter(target[i - 1]) && target[i - 1] !== "'";
    return { ch, letter: true, shown: i < revealed || (firstLetters && wordStart) };
  });
}

// --- Rounds ---------------------------------------------------------------

const PLAIN = /^[A-Za-z][A-Za-z' -]*$/;

// Words and short phrases to type from their Finnish meaning.
export function isTypeWord(pair) {
  const text = pair.learning.trim();
  return wordCount(text) <= 3 && text.length <= 24 && PLAIN.test(text);
}

// Sentences to type from hearing them: everyday words only, so no numbers,
// names or letters outside English (a capital is fine only first and in "I").
export function isDictationSentence(pair) {
  const text = pair.learning.trim();
  const n = wordCount(text);
  if (n < 3 || n > MAX_DICTATION_WORDS || !/^[A-Za-z][A-Za-z' ,.?!-]*$/.test(text)) return false;
  return text
    .split(/\s+/)
    .slice(1)
    .every((w) => !/^[A-Z]/.test(w) || /^I('|$|[,.?!])/.test(w));
}

const key = (s) => s.trim().toLowerCase();

// One question. Words accept every English word in the pool with the same
// Finnish meaning ("auto" is "car"), since the prompt can't tell them apart.
export function typeQuestion(pair, pool = [], mode = "word") {
  const alternatives =
    mode === "word"
      ? pool.filter((p) => p !== pair && key(p.native) === key(pair.native) && key(p.learning) !== key(pair.learning)).map((p) => p.learning)
      : [];
  return { target: pair, mode, alternatives };
}

// A round: `sentences` dictation questions (none when the browser can't
// speak) and words for the rest, in random order, no text twice.
export function buildTypeRound(
  pairs,
  sentenceList,
  { length = TYPE_ROUND, sentences = TYPE_SENTENCES, random = Math.random } = {}
) {
  const pool = usableWords(pairs);
  const seen = new Set();
  const fresh = (p) => {
    if (seen.has(key(p.learning))) return false;
    seen.add(key(p.learning));
    return true;
  };
  const said = shuffle(usableWords(sentenceList).filter(isDictationSentence), random)
    .filter(fresh)
    .slice(0, Math.max(0, sentences));
  const typed = shuffle(pool.filter(isTypeWord), random)
    .filter(fresh)
    .slice(0, length - said.length);
  return shuffle(
    [...said.map((s) => typeQuestion(s, pool, "dictation")), ...typed.map((w) => typeQuestion(w, pool, "word"))],
    random
  );
}
