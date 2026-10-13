// Pure helpers shared by the practice games (pick the meaning, build the
// phrase, listen and choose). Words are pairs `{ learning, native, categories }`
// as returned by src/lib/words.js. No React here so the rules are easy to test.

import { DEFAULT_LEARNING_LANG, DEFAULT_NATIVE_LANG, decodeWords, filterCommonWords, getWordGroups } from "../../lib/words";

export const ROUND_LENGTH = 10;
// After this many misses on one question the answer is shown, so nobody gets stuck.
export const MAX_MISSES = 2;
// Points from this round it costs to see a question's rule before answering.
export const RULE_PEEK_COST = 5;

// The pairs a practice game draws from: a shared `?words=...` link if there is
// one, otherwise every built-in word in the chosen languages.
export function practicePool(params) {
  const learningLang = params.get("learningLang") || DEFAULT_LEARNING_LANG;
  const nativeLang = params.get("nativeLang") || DEFAULT_NATIVE_LANG;
  const encoded = params.get("words");
  const fromLink = encoded ? decodeWords(encoded) : null;
  const pairs = fromLink || filterCommonWords({ learningLang, nativeLang, preferences: true });
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

// --- Word pairs -------------------------------------------------------------

export const PAIRS_PER_BOARD = 5;
export const PAIR_BOARDS = 2;

// Short enough to sit on a tile; longer phrases belong to Build the phrase.
export function isPairCandidate(pair) {
  return wordCount(pair.learning) <= 3 && pair.learning.length <= 24 && pair.native.length <= 24;
}

// Boards of pairs for one round. No word repeats in the round, and no two
// pairs on a board share their text in either language (so "hän" can't belong
// to both "he" and "she"). Each side is shuffled on its own.
export function buildPairBoards(pool, { boards = PAIR_BOARDS, size = PAIRS_PER_BOARD } = {}, random = Math.random) {
  const picked = [];
  const seenLearning = new Set();
  const seenNative = new Set();
  for (const p of shuffle(pool, random)) {
    if (picked.length >= boards * size) break;
    if (seenLearning.has(norm(p.learning)) || seenNative.has(norm(p.native))) continue;
    seenLearning.add(norm(p.learning));
    seenNative.add(norm(p.native));
    picked.push(p);
  }
  // A board of fewer than three pairs is no puzzle; fold a short tail into the board before it.
  const out = [];
  for (let i = 0; i < picked.length; i += size) out.push(picked.slice(i, i + size));
  if (out.length > 1 && out[out.length - 1].length < 3) out[out.length - 2].push(...out.pop());
  return out
    .filter((board) => board.length >= 3)
    .map((board) => {
      const items = board.map((pair, id) => ({ id, pair }));
      return { items, learning: shuffle(items, random), native: shuffle(items, random) };
    });
}

// --- Fill the gap -----------------------------------------------------------

// Small English words that are easy to mix up (is / are / am …) come from the
// word bank's "group" items. When the gap is one of these the other options
// come from the same group, so the question is about grammar ("Where ___ the
// toilet?" is / are / am / was), not about spotting a stranger.
const groupOf = (word, groups) => groups.find((g) => g.some((w) => w.toLowerCase() === word.toLowerCase()));
const gapKey = (w) => (w === "I" ? "I" : w.toLowerCase());

export function isGapCandidate(pair) {
  return phraseTokens(pair.learning).length >= 3;
}

// Words that can be the gap: letters only (no "it's", no "o'clock") and not a
// single letter other than "I" or "a".
function gapTokens(text) {
  return phraseTokens(text).filter((w) => /^\p{L}+$/u.test(w) && (w.length > 1 || w === "I" || w === "a"));
}

// Every option starts with a capital when the gap starts the sentence, so the
// capital doesn't give the answer away; elsewhere only "I" keeps one.
function asOption(word, first) {
  if (word === "I") return word;
  return first ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase();
}

// Wrong options for `answer` in `sentence`. Grammar words draw from their
// group; other words draw from the vocabulary in `pool`. Nothing that already
// appears in the sentence is offered.
export function pickGapOptions(answer, sentenceWords, pool, count = 3, random = Math.random, groups = getWordGroups()) {
  const used = new Set(sentenceWords.map(gapKey));
  const group = groupOf(answer, groups);
  let candidates;
  if (group) {
    candidates = group;
  } else {
    const vocab = pool.flatMap((p) => gapTokens(p.learning));
    candidates = vocab.filter((w) => !groupOf(w, groups) && w.length > 2);
  }
  const seen = new Set(used);
  const out = [];
  for (const w of shuffle(candidates, random)) {
    const key = gapKey(w);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
    if (out.length >= count) break;
  }
  return out;
}

// One fill-the-gap question from a sentence pair, or null if no word in it has
// enough sensible alternatives. The sentence is split around the gap:
// `before` is the text in front of it and `after` the text behind it, where
// `after` starts with any punctuation stuck to the gapped word ("toilet?").
export function buildGapQuestion(target, pool, random = Math.random, groups = getWordGroups()) {
  const raw = target.learning.trim().split(/\s+/);
  const split = raw.map((r) => r.match(/^([^\p{L}\p{N}']*)(.*?)([^\p{L}\p{N}']*)$/u));
  const sentenceWords = split.map((m) => m[2]);
  const spots = shuffle(
    // Not names, days or places in mid-sentence ("Wednesday"): the capital would give them away.
    sentenceWords
      .map((w, i) => ({ w, i }))
      .filter(({ w, i }) => gapTokens(w).length === 1 && !/^\p{Lu}{2,}$/u.test(w) && (i === 0 || w === "I" || !/^\p{Lu}/u.test(w))),
    random
  );
  for (const { w: answer, i } of spots) {
    const others = pickGapOptions(answer, sentenceWords, pool, 3, random, groups);
    if (others.length < 3) continue;
    const [, lead, , trail] = split[i];
    // Options start with a capital only where the sentence itself has one.
    const first = i === 0 && /^\p{Lu}/u.test(answer);
    return {
      target,
      options: shuffle([answer, ...others].map((o) => asOption(o, first)), random),
      answer: asOption(answer, first),
      before: [...raw.slice(0, i), lead].filter(Boolean).join(" ").trimEnd(),
      after: trail + (i + 1 < raw.length ? " " + raw.slice(i + 1).join(" ") : ""),
    };
  }
  return null;
}

// A question from a hand-written gap item in the word bank (`type: "gap"`):
// its own wrong options, and its explanation for after the answer. Items with
// one distractor (a / an, borrow / lend) stay two-way choices.
export function gapItemQuestion(item, nativeLang = DEFAULT_NATIVE_LANG, random = Math.random) {
  const [before, after] = item.sentence.split("___");
  const answer = item.answers[0];
  const native = item.translation?.[nativeLang];
  if (after === undefined || !native) return null;
  const options = [answer, ...item.distractors.filter((d) => !item.answers.includes(d))].slice(0, 4);
  return {
    target: { learning: `${before}${answer}${after}`, native, id: item.id },
    answer,
    options: shuffle(options, random),
    before: before.trimEnd(),
    after,
    explanation: item.explanation,
  };
}

// A round of gap questions. Hand-written items and sentences from `sentences`
// (gapped automatically) are mixed, skipping sentences that can't make a question
// and any sentence a hand-written item already covers.
export function buildGapRound(sentences, pool, length = ROUND_LENGTH, random = Math.random, { items = [], nativeLang } = {}) {
  const fromItems = items.map((item) => () => gapItemQuestion(item, nativeLang, random));
  const covered = new Set(items.map((i) => i.id));
  const fromSentences = sentences
    .filter((s) => !covered.has(s.id))
    .map((s) => () => buildGapQuestion(s, pool, random));
  const out = [];
  const seen = new Set();
  for (const make of shuffle([...fromItems, ...fromSentences], random)) {
    if (out.length >= length) break;
    const q = make();
    if (!q || seen.has(q.target.learning.toLowerCase())) continue;
    seen.add(q.target.learning.toLowerCase());
    out.push(q);
  }
  return out;
}
