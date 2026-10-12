// Pure helpers for the gap games (Grammar check, Mixed-up words). Content
// comes from src/content/*.json: topics with a rule explained in English and
// Finnish, and sentences with one "___" gap and words to choose from (see
// src/content/README.md). No React here so the rules are easy to test.

import { MAX_MISSES, ROUND_LENGTH, shuffle } from "../practice/practiceLogic";

export const GAP = "___";

// The sentence with `word` in the gap. An empty word ("no article") closes up
// the space, and a gap at the start gets a capital letter.
export function fillGap(text, word) {
  const filled = text.replace(GAP, word).replace(/\s{2,}/g, " ").trim();
  return filled.charAt(0).toUpperCase() + filled.slice(1);
}

// Text before and after the gap, for drawing the sentence with a slot in it.
export function splitGap(text) {
  const at = text.indexOf(GAP);
  return { before: text.slice(0, at), after: text.slice(at + GAP.length) };
}

// How many misses a question allows before the answer is shown. With two
// options one miss already leaves only the answer, so that ends it.
export function maxMissesFor(options) {
  return Math.max(1, Math.min(MAX_MISSES, options.length - 1));
}

// Every gap item of a content file as a question, with its topic's title and
// explanation. Items follow the word database's shapes: topics are "rule" or
// "confusable" items, sentences are "gap" items pointing at a topic.
export function gapQuestions(content) {
  const items = content?.items || [];
  const topics = new Map(items.filter((i) => i.type !== "gap").map((t) => [t.id, t]));
  return items
    .filter((i) => i.type === "gap" && topics.has(i.topic))
    .map((item) => {
      const topic = topics.get(item.topic);
      const answer = item.answers[0];
      return {
        id: item.id,
        setId: topic.id,
        title: topic.title.en,
        titleFi: topic.title.fi,
        rule: topic.explanation,
        text: item.sentence,
        answer,
        options: [answer, ...item.distractors],
        fi: item.translation.fi,
        why: item.explanation || null,
        sentence: fillGap(item.sentence, answer),
      };
    });
}

// One round: `count` questions spread over as many sets as possible, so a
// round of Mixed-up words isn't ten borrow-or-lend sentences. `setId` limits
// the round to one set (a `?set=` link). Options come in random order.
export function buildGapRound(content, { count = ROUND_LENGTH, setId = null, random = Math.random } = {}) {
  let all = gapQuestions(content);
  if (setId) {
    const one = all.filter((q) => q.setId === setId);
    if (one.length) all = one;
  }
  const bySet = new Map();
  for (const q of shuffle(all, random)) {
    if (!bySet.has(q.setId)) bySet.set(q.setId, []);
    bySet.get(q.setId).push(q);
  }
  const queues = shuffle([...bySet.values()], random);
  const round = [];
  while (round.length < count && queues.some((q) => q.length)) {
    for (const queue of queues) {
      if (round.length >= count) break;
      if (queue.length) round.push(queue.shift());
    }
  }
  return round.map((q) => ({ ...q, options: shuffle(q.options, random) }));
}
