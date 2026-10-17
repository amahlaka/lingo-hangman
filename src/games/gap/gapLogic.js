// Pure helpers for the gap games (Grammar check, Mixed-up words). Content
// comes from the word bank (src/lib/words.js): "rule" or "confusable" topics
// explained in English and Finnish, and "gap" sentences with one "___" that
// point at a topic. No React here so the rules are easy to test.

import { MAX_MISSES, ROUND_LENGTH, shuffle } from "../practice/practiceLogic";
import { gapItemChoices } from "../../lib/decoys";

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

// The gap sentences of `topics` as questions, each with its topic's title and
// explanation. Sentences on other topics are left out. Options are the item's
// own decoys, topped up from the topic's decoy pool (src/lib/decoys.js), so
// they can differ each time the questions are made.
export function gapQuestions({ topics = [], gaps = [] } = {}, random = Math.random) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  return gaps
    .filter((g) => byId.has(g.topic) && g.answers?.length)
    .map((item) => {
      const topic = byId.get(item.topic);
      const { answer, options } = gapItemChoices(item, topic, { random });
      return {
        id: item.id,
        setId: topic.id,
        title: topic.title.en,
        titleFi: topic.title.fi,
        rule: topic.explanation,
        text: item.sentence,
        answer,
        options,
        fi: item.translation?.fi || "",
        why: item.explanation?.en && item.explanation?.fi ? item.explanation : null,
        sentence: fillGap(item.sentence, answer),
      };
    });
}

// One round: `count` questions spread over as many sets as possible, so a
// round of Mixed-up words isn't ten borrow-or-lend sentences. `setId` limits
// the round to one set (a `?set=` link) and `setIds` to the sets the learner
// picked; when none of them has sentences any more, every set is used.
// Options come in random order.
export function buildGapRound(content, { count = ROUND_LENGTH, setId = null, setIds = [], random = Math.random } = {}) {
  let all = gapQuestions(content, random);
  if (setIds.length) {
    const picked = all.filter((q) => setIds.includes(q.setId));
    if (picked.length) all = picked;
  }
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

// The topics that have gap sentences, in word bank order: [{ id, title: { en, fi } }].
export function gapTopics({ topics = [], gaps = [] } = {}) {
  const used = new Set(gaps.filter((g) => g.answers?.length).map((g) => g.topic));
  return topics.filter((t) => used.has(t.id)).map((t) => ({ id: t.id, title: t.title }));
}
