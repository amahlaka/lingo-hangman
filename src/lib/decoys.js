// Wrong options ("decoys") for choice questions on word bank gap items.
// An item's own `distractors` always come first. When there are fewer than
// the question has room for, the rest are drawn from a larger `decoyPool`:
// the item's own, or else its topic's (a rule or mixed-up words set). A
// different draw each time keeps rounds from showing the same options again
// and again. An empty `decoyPool: []` on an item keeps it to its own decoys.

// Options in a question: the answer and three decoys.
export const CHOICES = 4;

const norm = (s) => s.trim().toLowerCase();

// Words of a sentence as lowercase keys, for leaving out decoys it already has.
function sentenceKeys(sentence = "") {
  return new Set(
    sentence
      .replace(/_+/g, " ")
      .split(/\s+/)
      .map((w) => norm(w.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, "")))
      .filter(Boolean)
  );
}

// The pool that fills an item's free option slots.
export function decoyPoolFor(item, topic) {
  if (Array.isArray(item?.decoyPool)) return item.decoyPool;
  return Array.isArray(topic?.decoyPool) ? topic.decoyPool : [];
}

// A pool word written to fit the gap: with a capital when the gap starts a
// sentence (like the answer), otherwise as the pool has it.
function fitCase(word, atStart) {
  return atStart ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

// The options for one question, answer first: { answer, options }.
//   answers:  every word that fits the gap; none of them is ever a decoy
//   decoys:   the item's own wrong options, always shown (up to the slots)
//   pool:     words to fill the remaining slots from, picked at random
//   sentence: the gap sentence, so a decoy it already contains is skipped
export function pickChoices({ answers, decoys = [], pool = [], sentence = "" }, { choices = CHOICES, random = Math.random } = {}) {
  const answer = answers[0];
  const seen = new Set(answers.map(norm));
  const options = [answer];
  for (const d of decoys) {
    if (options.length >= choices) break;
    if (seen.has(norm(d))) continue;
    seen.add(norm(d));
    options.push(d);
  }
  const inSentence = sentenceKeys(sentence);
  const before = sentence.split(/_{3}/)[0];
  const atStart = /^\s*$|[.!?]\s*$/.test(before);
  const free = pool.filter((w) => !seen.has(norm(w)) && !inSentence.has(norm(w)));
  while (options.length < choices && free.length) {
    const [w] = free.splice(Math.floor(random() * free.length), 1);
    if (seen.has(norm(w))) continue;
    seen.add(norm(w));
    options.push(fitCase(w, atStart));
  }
  return { answer, options };
}

// pickChoices for a word bank gap item and its topic.
export function gapItemChoices(item, topic, opts) {
  return pickChoices(
    { answers: item.answers, decoys: item.distractors || [], pool: decoyPoolFor(item, topic), sentence: item.sentence },
    opts
  );
}
