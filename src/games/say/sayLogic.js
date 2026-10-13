// Pure helpers for "Say it": compare what the speech recogniser heard with the
// word the learner tried to say. The checks are forgiving on purpose: case,
// punctuation, numbers written as digits, contractions, homophones and extra
// words around the target never count against the learner. No React here.

// Speaking takes longer than tapping, so a round is a little shorter.
export const SAY_ROUND_LENGTH = 8;
// Heard attempts per word before it is left for later. Silence doesn't count.
// Points the "how to say it" reading costs, like the other one-off hints.
export const SAY_HINT_COST = 5;

export const MAX_SAY_TRIES = 3;
// Single words and short phrases; long sentences are a different exercise.
export const MAX_SAY_WORDS = 4;

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];

const CONTRACTIONS = {
  "i'm": "i am", "you're": "you are", "we're": "we are", "they're": "they are",
  "he's": "he is", "she's": "she is", "it's": "it is", "that's": "that is",
  "what's": "what is", "where's": "where is", "there's": "there is", "let's": "let us",
  "i've": "i have", "you've": "you have", "we've": "we have", "they've": "they have",
  "i'll": "i will", "you'll": "you will", "we'll": "we will", "it'll": "it will",
  "i'd": "i would", "you'd": "you would",
  "don't": "do not", "doesn't": "does not", "didn't": "did not", "isn't": "is not",
  "aren't": "are not", "wasn't": "was not", "weren't": "were not", "can't": "can not",
  "cannot": "can not", "won't": "will not", "couldn't": "could not", "shouldn't": "should not",
  "wouldn't": "would not", "haven't": "have not", "hasn't": "has not",
};

// Words that sound the same (or are the same word spelt the British or American
// way). The recogniser can't tell them apart, so neither should we.
const SOUND_ALIKE = [
  ["to", "too", "two"], ["for", "four"], ["i", "eye"], ["our", "hour"], ["no", "know"],
  ["right", "write"], ["see", "sea"], ["be", "bee"], ["by", "buy", "bye"],
  ["there", "their"], ["here", "hear"], ["one", "won"], ["sun", "son"], ["flower", "flour"],
  ["meet", "meat"], ["week", "weak"], ["new", "knew"], ["eight", "ate"], ["blue", "blew"],
  ["mail", "male"], ["tail", "tale"], ["wait", "weight"], ["road", "rode"], ["hole", "whole"],
  ["pear", "pair"], ["night", "knight"], ["deer", "dear"], ["where", "wear"], ["its", "it's"],
  ["ok", "okay"], ["hi", "high"], ["sale", "sail"], ["plain", "plane"], ["piece", "peace"],
  ["colour", "color"], ["favourite", "favorite"], ["centre", "center"], ["theatre", "theater"],
  ["grey", "gray"], ["metre", "meter"], ["litre", "liter"], ["neighbour", "neighbor"],
  ["travelling", "traveling"], ["cheque", "check"], ["jewellery", "jewelry"],
];
const CANON = new Map();
for (const group of SOUND_ALIKE) for (const w of group) CANON.set(w, group[0]);

const canon = (w) => CANON.get(w) || w;

// Text to comparable lowercase words.
export function speechTokens(text = "") {
  const words = String(text)
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
  const out = [];
  for (const w of words) {
    if (/^\d+$/.test(w) && Number(w) < NUMBER_WORDS.length) out.push(NUMBER_WORDS[Number(w)]);
    else if (CONTRACTIONS[w]) out.push(...CONTRACTIONS[w].split(" "));
    else out.push(w);
  }
  return out;
}

export function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

// 1 for the same word, 0 for nothing in common.
export function similarity(a, b) {
  if (canon(a) === canon(b)) return 1;
  const longest = Math.max(a.length, b.length);
  return longest ? 1 - editDistance(a, b) / longest : 1;
}

// How many target words a phrase may miss and still count: none up to three
// words, one in four.
export function allowedMisses(wordTotal) {
  return Math.floor(wordTotal / 4);
}

// Score one recognised transcript against the target words, in order: each
// target word may be found anywhere after the previous match, so "um, the dog"
// still matches "dog".
function scoreTranscript(targetTokens, transcript) {
  const heard = speechTokens(transcript);
  const hits = targetTokens.map(() => false);
  let from = 0;
  targetTokens.forEach((t, i) => {
    const at = heard.findIndex((h, j) => j >= from && similarity(h, t) === 1);
    if (at >= 0) {
      hits[i] = true;
      from = at + 1;
    }
  });
  // How near the closest heard word came to each missed target word (for "close").
  const nearest = targetTokens.map((t, i) =>
    hits[i] ? 1 : heard.reduce((best, h) => Math.max(best, similarity(h, t)), 0)
  );
  return { transcript, heard, hits, nearest, count: hits.filter(Boolean).length };
}

// Compare the recogniser's alternatives with the target text.
// Returns { matched, close, heard, words: [{ text, ok }] } where `heard` is the
// transcript to show and `words` are the target's own words marked as heard or not.
export function checkSaid(target, alternatives = []) {
  const displayWords = String(target).trim().split(/\s+/).filter(Boolean);
  const perWord = displayWords.map((w) => speechTokens(w));
  const targetTokens = perWord.flat();
  const said = (alternatives || []).map((a) => String(a || "").trim()).filter(Boolean);

  if (!said.length || !targetTokens.length) {
    return { matched: false, close: false, heard: "", words: displayWords.map((text) => ({ text, ok: false })) };
  }

  const best = said
    .map((t) => scoreTranscript(targetTokens, t))
    .reduce((a, b) => (b.count > a.count ? b : a));

  const misses = targetTokens.length - best.count;
  const matched = misses <= allowedMisses(targetTokens.length);
  // Not right, but most of the sounds were there: "tree" for "three".
  const close =
    !matched &&
    best.nearest.reduce((s, n) => s + n, 0) / targetTokens.length >= 0.6;

  let k = 0;
  const words = displayWords.map((text, i) => {
    const mine = best.hits.slice(k, k + perWord[i].length);
    k += perWord[i].length;
    return { text, ok: mine.every(Boolean) };
  });
  return { matched, close, heard: best.transcript, words };
}
