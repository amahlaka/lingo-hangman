// Pure helpers shared by the practice games (pick the meaning, build the
// phrase, listen and choose). Words are pairs `{ learning, native, categories }`
// as returned by src/lib/words.js. No React here so the rules are easy to test.

import { DEFAULT_LEARNING_LANG, DEFAULT_NATIVE_LANG, decodeWords, filterCommonWords } from "../../lib/words";

export const ROUND_LENGTH = 10;
// After this many misses on one question the answer is shown, so nobody gets stuck.
export const MAX_MISSES = 2;

// The pairs a practice game draws from: a shared `?words=...` link if there is
// one, otherwise every built-in word in the chosen languages.
export function practicePool(params) {
  const learningLang = params.get("learningLang") || DEFAULT_LEARNING_LANG;
  const nativeLang = params.get("nativeLang") || DEFAULT_NATIVE_LANG;
  const encoded = params.get("words");
  const fromLink = encoded ? decodeWords(encoded) : null;
  const pairs = fromLink || filterCommonWords({ learningLang, nativeLang });
  return { pairs: usableWords(pairs), learningLang, nativeLang, fromLink: Boolean(fromLink) };
}

export function shuffle(list, random = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isPhrase(pair) {
  return wordCount(pair.learning) > 1;
}

// Entries with an unfinished ending ("My name is...") don't work as answers.
export function usableWords(pairs) {
  return (pairs || []).filter((p) => p && p.learning && p.native && !/\.\.\.|…/.test(p.learning));
}

function sharesCategory(a, b) {
  const cats = a.categories || [];
  return (b.categories || []).some((c) => cats.includes(c));
}

const norm = (s) => s.trim().toLowerCase();

// Pick `count` wrong options for `target`. Options never share the target's
// text in either language (so "hän" never offers both "he" and "she"), match
// its shape (single word vs phrase), and prefer the same category so the
// choice is about meaning, not about spotting the odd one out.
export function pickDistractors(target, pool, count = 3, random = Math.random) {
  const seenLearning = new Set([norm(target.learning)]);
  const seenNative = new Set([norm(target.native)]);
  const candidates = shuffle(
    pool.filter((p) => p !== target),
    random
  ).filter((p) => {
    if (seenLearning.has(norm(p.learning)) || seenNative.has(norm(p.native))) return false;
    seenLearning.add(norm(p.learning));
    seenNative.add(norm(p.native));
    return true;
  });

  const sameShape = candidates.filter((p) => isPhrase(p) === isPhrase(target));
  const otherShape = candidates.filter((p) => isPhrase(p) !== isPhrase(target));
  const ranked = [
    ...sameShape.filter((p) => sharesCategory(p, target)),
    ...sameShape.filter((p) => !sharesCategory(p, target)),
    ...otherShape,
  ];
  return ranked.slice(0, count);
}

// One multiple-choice question: the target plus distractors in random order.
export function buildChoiceQuestion(target, pool, random = Math.random) {
  const options = shuffle([target, ...pickDistractors(target, pool, 3, random)], random);
  return { target, options };
}

// A round of questions, with no word repeated inside the round.
export function buildRound(pool, length = ROUND_LENGTH, random = Math.random) {
  return shuffle(pool, random).slice(0, Math.min(length, pool.length));
}

// --- Build the phrase ----------------------------------------------------

const EDGE_PUNCT = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu;

// Words the learner arranges. Punctuation is dropped and capitals are lowered
// (except "I", "I'm" …) so neither gives away the first or last word.
export function phraseTokens(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((raw) => raw.replace(EDGE_PUNCT, ""))
    .filter(Boolean)
    .map((tok) => (/^I('|$)/.test(tok) ? tok : tok.toLowerCase()));
}

// The punctuation at the end of the sentence, shown after the built phrase.
export function phraseEnding(text) {
  const m = text.trim().match(/[?.!]+$/);
  return m ? m[0] : "";
}

export function isPhraseCandidate(pair) {
  const n = phraseTokens(pair.learning).length;
  return n >= 3 && n <= 9;
}

// Chips with stable ids so repeated words ("the … the") stay distinct.
export function buildPhrasePuzzle(target, random = Math.random) {
  const text = target.learning;
  const answer = phraseTokens(text);
  const chips = answer.map((word, id) => ({ id, word }));
  const inOrder = (list) => list.every((c, i) => c.word === answer[i]);
  let shuffled = shuffle(chips, random);
  // Never hand out the answer already in order.
  for (let tries = 0; tries < 5 && inOrder(shuffled); tries++) shuffled = shuffle(chips, random);
  if (inOrder(shuffled) && shuffled.length > 1) shuffled = [...shuffled.slice(1), shuffled[0]];
  return { target, text, answer, ending: phraseEnding(text), chips: shuffled };
}

export function checkPhrase(placedWords, answer) {
  return (
    placedWords.length === answer.length &&
    placedWords.every((w, i) => w.toLowerCase() === answer[i].toLowerCase())
  );
}

// How many words from the start are already in the right place; used to give
// a specific hint instead of a bare "not yet".
export function correctPrefixLength(placedWords, answer) {
  let n = 0;
  while (n < placedWords.length && n < answer.length && placedWords[n].toLowerCase() === answer[n].toLowerCase()) n++;
  return n;
}

// --- Round summary --------------------------------------------------------

export function emptyTally() {
  return { answered: 0, correct: 0, firstTry: 0, xp: 0, run: 0, bestRun: 0 };
}

// result: { solved, firstTry, xp }
export function addResult(tally, result) {
  const run = result.solved ? tally.run + 1 : 0;
  return {
    answered: tally.answered + 1,
    correct: tally.correct + (result.solved ? 1 : 0),
    firstTry: tally.firstTry + (result.solved && result.firstTry ? 1 : 0),
    xp: tally.xp + (result.xp || 0),
    run,
    bestRun: Math.max(tally.bestRun, run),
  };
}
