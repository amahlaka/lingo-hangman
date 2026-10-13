// Quick play: one round that mixes questions from several games, built from
// what the learner already knows. A few easy wins (words they answer quickly
// and right), a few challenges (words they missed lately or think long about,
// and lessons that take them longer) and the rest new or still-practising
// words, spread over words, sentences, grammar and sounds.
// Pure helpers, no React.

import { wordKey } from "../../lib/progress";
import { challengeLessons, challengeScore, wordStanding } from "../../lib/adaptive";
import {
  buildChoiceQuestion,
  buildGapQuestion,
  buildPhrasePuzzle,
  gapItemQuestion,
  isGapCandidate,
  isPhraseCandidate,
  shuffle,
  usableWords,
  wordCount,
} from "../practice/practiceLogic";
import { gapQuestions } from "../gap/gapLogic";
import { BY_EAR, lessonQuestions } from "../sounds/soundsLogic";

export const QUICK_ROUND = 10;
export const QUICK_QUOTA = { easy: 3, challenge: 3 };
// Most questions from one group in a round, so it stays a mix. Sounds has a
// single game, so it gets fewer.
const GROUP_CAP = { sounds: 3, other: 4 };
// Listening uses short items only, as in Listen and choose.
const MAX_LISTEN_WORDS = 4;

// Games whose question already shows the meaning or its own explanation.
const NO_MEANING_IN_FEEDBACK = ["grammar", "mixed-up", "sounds"];

// Everything Quick play can ask, one target per word or sentence (by progress
// word key), each with the games that can ask it:
//   { key, group, kinds: [{ game, lesson, make(random) -> question | null }] }
// `group` is "word", "sentence", "grammar" or "sounds", for variety.
export function quickTargets({
  pairs = [],
  sentences = [],
  gapItems = [],
  topics = { rule: [], confusable: [] },
  lessons = [],
  groups = [],
  learningLang = "en-GB",
  nativeLang = "fi",
  withSound = true,
}) {
  const byKey = new Map();
  const add = (text, group, kind) => {
    const key = wordKey(text, learningLang);
    if (!byKey.has(key)) byKey.set(key, { key, group, kinds: [] });
    const target = byKey.get(key);
    // Grammar sentences are rarer than plain ones, so grammar names the group.
    // Sounds names it only for words no other game asks (most lesson words
    // are everyday words too).
    if (group === "grammar" || (target.group === "sounds" && group !== "sounds")) target.group = group;
    if (!target.kinds.some((k) => k.game === kind.game)) target.kinds.push(kind);
  };

  const pool = usableWords(pairs);
  if (pool.length >= 4) {
    for (const pair of pool) {
      const group = wordCount(pair.learning) > 1 ? "sentence" : "word";
      add(pair.learning, group, { game: "meaning", make: (r) => buildChoiceQuestion(pair, pool, r) });
      if (withSound && wordCount(pair.learning) <= MAX_LISTEN_WORDS) {
        add(pair.learning, group, { game: "listening", make: (r) => buildChoiceQuestion(pair, pool, r) });
      }
    }
  }

  // Gap sentences on a grammar or mixed-up-words topic belong to those games.
  const onTopic = new Set(gapItems.filter((g) => g.topic).map((g) => g.id));
  const everyday = new Map(gapItems.filter((g) => !g.topic).map((g) => [g.id, g]));
  for (const s of usableWords([...pool.filter((p) => wordCount(p.learning) > 1), ...sentences])) {
    if (isPhraseCandidate(s)) add(s.learning, "sentence", { game: "phrase", make: (r) => buildPhrasePuzzle(s, r) });
    if (onTopic.has(s.id)) continue;
    const item = everyday.get(s.id);
    if (item) add(s.learning, "sentence", { game: "fill-the-gap", make: (r) => gapItemQuestion(item, nativeLang, r) });
    else if (isGapCandidate(s)) {
      add(s.learning, "sentence", { game: "fill-the-gap", make: (r) => buildGapQuestion(s, pool, r, groups) });
    }
  }

  const topicGames = [["grammar", topics.rule || []], ["mixed-up", topics.confusable || []]];
  for (const [game, list] of topicGames) {
    for (const q of gapQuestions({ topics: list, gaps: gapItems })) {
      add(q.sentence, "grammar", { game, lesson: q.setId, make: (r) => ({ ...q, options: shuffle(q.options, r) }) });
    }
  }

  for (const lesson of lessons) {
    if (!withSound && BY_EAR.includes(lesson.kind)) continue;
    for (const q of lessonQuestions(lesson)) {
      // Sound-alike and letter questions draw their options when made, so build them fresh each time.
      const make = (r) => lessonQuestions(lesson, r).find((x) => x.id === q.id) || null;
      add(q.word.text, "sounds", { game: "sounds", lesson: lesson.id, make });
    }
  }

  return [...byKey.values()].filter((t) => t.kinds.length);
}

// Take from each group in turn, so a few picks still cover words, sentences,
// grammar and sounds.
function roundRobin(targets, n, random) {
  const byGroup = new Map();
  for (const t of shuffle(targets, random)) {
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group).push(t);
  }
  const queues = shuffle([...byGroup.values()], random);
  const out = [];
  while (out.length < n && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (out.length >= n) break;
      if (q.length) out.push(q.shift());
    }
  }
  return out;
}

// Which targets go in the round, and in what role: "easy", "challenge" or "fresh".
export function pickQuickTargets(targets, state, { count = QUICK_ROUND, quota = QUICK_QUOTA, random = Math.random } = {}) {
  const words = state?.words || {};
  const weakLessons = challengeLessons(state || {});
  const known = [];
  const tricky = [];
  const stretch = [];
  const fresh = [];
  for (const target of targets) {
    const entry = words[target.key];
    const standing = wordStanding(entry);
    if (standing === "known") known.push(target);
    else if (standing === "tricky") tricky.push({ target, score: challengeScore(entry) + random() });
    else {
      fresh.push(target);
      if (target.kinds.some((k) => k.lesson && weakLessons.has(`${k.game}:${k.lesson}`))) stretch.push(target);
    }
  }

  const used = new Set();
  const perGroup = {};
  const take = (list, n, role, capped = true) => {
    const out = [];
    for (const target of list) {
      if (out.length >= n) break;
      const full = (perGroup[target.group] || 0) >= (GROUP_CAP[target.group] || GROUP_CAP.other);
      if (used.has(target.key) || (capped && full)) continue;
      used.add(target.key);
      perGroup[target.group] = (perGroup[target.group] || 0) + 1;
      out.push({ target, role });
    }
    return out;
  };

  // Challenges: the words that want practice most, then new words from
  // lessons that take longer. Group limits apply to challenges and easy wins too, so a learner who has
  // mostly played one game still gets a mix; the quota left over goes to new words.
  const challenges = take(
    [...tricky.sort((a, b) => b.score - a.score).map((t) => t.target), ...shuffle(stretch, random)],
    quota.challenge,
    "challenge"
  );
  const easy = take(roundRobin(known, known.length, random), quota.easy, "easy");
  const restCount = count - challenges.length - easy.length;
  const unused = fresh.filter((t) => !used.has(t.key));
  const rest = take(roundRobin(unused, unused.length, random), restCount, "fresh");
  // Too few new words left: top up with more of what the learner knows, then more challenges.
  const extra = take(roundRobin(known, known.length, random), count - challenges.length - easy.length - rest.length, "easy");
  const filled = challenges.length + easy.length + rest.length + extra.length;
  const moreChallenges = take(tricky.map((t) => t.target), count - filled, "challenge");
  // Still short (a small word set): drop the group limit for new words.
  const left = count - filled - moreChallenges.length;
  const uncapped = take(shuffle(fresh, random), left, "fresh", false);
  return orderRound([...easy, ...extra], [...challenges, ...moreChallenges], [...rest, ...uncapped], random);
}

// Start and end with an easy win when there is one, and never put two
// challenges next to each other.
export function orderRound(easy, challenges, fresh, random = Math.random) {
  const first = easy[0] ? [easy[0]] : [];
  const last = easy.length > 1 ? [easy[easy.length - 1]] : [];
  const middle = shuffle([...easy.slice(first.length, easy.length - last.length), ...fresh], random);
  const out = [...first];
  // Spread the challenges evenly through the middle.
  const gap = (middle.length + 1) / (challenges.length + 1);
  let next = 0;
  challenges.forEach((c, i) => {
    const until = Math.round(gap * (i + 1));
    while (next < until && next < middle.length) out.push(middle[next++]);
    out.push(c);
  });
  while (next < middle.length) out.push(middle[next++]);
  return [...out, ...last];
}

// Turn the picks into questions, choosing for each the game used least so far
// in the round (and never the same game twice in a row when there is a
// choice). For a challenge from a lesson that takes longer, that lesson's
// game comes first.
export function buildQuickQuestions(picks, state, random = Math.random) {
  const weakLessons = challengeLessons(state || {});
  const counts = {};
  let previous = null;
  const out = [];
  for (const { target, role } of picks) {
    const ranked = shuffle(target.kinds, random).sort((a, b) => {
      const weak = (k) => (role === "challenge" && k.lesson && weakLessons.has(`${k.game}:${k.lesson}`) ? 0 : 1);
      return (
        weak(a) - weak(b) ||
        (a.game === previous) - (b.game === previous) ||
        (counts[a.game] || 0) - (counts[b.game] || 0)
      );
    });
    for (const kind of ranked) {
      const q = kind.make(random);
      if (!q) continue;
      counts[kind.game] = (counts[kind.game] || 0) + 1;
      previous = kind.game;
      out.push({
        ...q,
        gameId: kind.game,
        lesson: kind.lesson,
        meaningInFeedback: !NO_MEANING_IN_FEEDBACK.includes(kind.game),
        quick: { game: kind.game, role },
      });
      break;
    }
  }
  return separateGames(out);
}

// A word that only one game can ask (a sounds word) can still land next to
// the same game. Swap it with another question, as long as the round still
// starts and ends the same way and no two challenges end up side by side.
export function separateGames(questions) {
  const out = questions.slice();
  const last = out.length - 1;
  const game = (i) => out[i]?.quick.game;
  const role = (i) => out[i]?.quick.role;
  const challengesApart = () => out.every((q, i) => i === 0 || !(role(i) === "challenge" && role(i - 1) === "challenge"));
  const repeats = () => out.filter((q, i) => i > 0 && game(i) === game(i - 1)).length;
  for (let i = 1; i < last; i++) {
    if (game(i) !== game(i - 1)) continue;
    const before = repeats();
    for (let j = 1; j < last; j++) {
      if (j === i || j === i - 1) continue;
      [out[i], out[j]] = [out[j], out[i]];
      if (challengesApart() && repeats() < before) break;
      [out[i], out[j]] = [out[j], out[i]];
    }
  }
  return out;
}

export function buildQuickRound(targets, state, options = {}) {
  const random = options.random || Math.random;
  return buildQuickQuestions(pickQuickTargets(targets, state, { ...options, random }), state, random);
}

// How the round went, by role, for the end screen.
export function quickSummary(results) {
  const by = (role) => results.filter((r) => r.question?.quick?.role === role);
  const easy = by("easy");
  const challenge = by("challenge");
  return {
    easy: { total: easy.length, solved: easy.filter((r) => r.solved).length },
    challenge: { total: challenge.length, solved: challenge.filter((r) => r.solved).length },
  };
}
