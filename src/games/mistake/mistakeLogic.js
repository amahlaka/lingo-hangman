// Pure helpers for Spot the mistake: a word bank gap sentence with one of its
// wrong options put in the gap. The learner taps the wrong word, then picks
// the word that fixes it. The wrong options of grammar and mixed-up words
// sentences are the mistakes Finnish speakers really make ("Tetris has come
// out in 1984"), so no new content is needed. No React here so the rules are
// easy to test.

import { ROUND_LENGTH, shuffle } from "../practice/practiceLogic";
import { GAP, buildGapRound } from "../gap/gapLogic";

// Words offered to fix the mistake: the right one, the mistake itself and one more.
export const FIX_CHOICES = 3;

const norm = (s) => s.trim().toLowerCase();
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The sentence as tiles to tap, `{ text, wrong }`, with `word` in the gap.
// Punctuation stuck to the gap ("___?", "___-playing") stays on the gap's tile.
export function mistakeTiles(sentence, word) {
  const at = sentence.indexOf(GAP);
  const before = sentence.slice(0, at).trim();
  const after = sentence.slice(at + GAP.length);
  const stuck = after.match(/^\S*/)[0];
  const rest = after.slice(stuck.length).trim();
  const atStart = before === "" || /[.!?]$/.test(before);
  const words = (text) => (text ? text.split(/\s+/).map((w) => ({ text: w, wrong: false })) : []);
  return [...words(before), { text: (atStart ? capitalize(word) : word) + stuck, wrong: true }, ...words(rest)];
}

// One question from a gap question (gapLogic's gapQuestions) and its word bank
// item, or null when the item has no usable mistake. Sentences whose answer
// is "no word" are left out: with an extra "the" they are often still fine.
export function mistakeQuestion(q, item, random = Math.random) {
  if (!item || !q.answer) return null;
  const answers = new Set((item.answers || []).map(norm));
  const mistakes = (item.distractors || []).filter((d) => d.trim() && !answers.has(norm(d)));
  if (!mistakes.length) return null;
  const mistake = mistakes[Math.floor(random() * mistakes.length)];
  const atStart = q.text.startsWith(GAP);
  const fit = (w) => (atStart && w ? capitalize(w) : w);
  const extra = shuffle(
    q.options.filter((o) => o && norm(o) !== norm(q.answer) && norm(o) !== norm(mistake)),
    random
  ).slice(0, FIX_CHOICES - 2);
  return {
    id: q.id,
    setId: q.setId,
    title: q.title,
    titleFi: q.titleFi,
    rule: q.rule,
    why: q.why,
    fi: q.fi,
    sentence: q.sentence,
    tiles: mistakeTiles(q.text, mistake),
    mistake: fit(mistake),
    answer: fit(q.answer),
    fixes: shuffle([q.answer, mistake, ...extra].map(fit), random),
  };
}

// A round of mistakes spread over the grammar and mixed-up words topics.
export function buildMistakeRound({ topics = [], gaps = [] }, { count = ROUND_LENGTH, random = Math.random } = {}) {
  const byId = new Map(gaps.map((g) => [g.id, g]));
  return buildGapRound({ topics, gaps }, { count: count * 3, random })
    .map((q) => mistakeQuestion(q, byId.get(q.id), random))
    .filter(Boolean)
    .slice(0, count);
}
