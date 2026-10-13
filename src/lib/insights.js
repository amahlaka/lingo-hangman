// What Lingo has worked out about the learner from their answers on this
// device: a level per skill and overall, what is going well, what is worth
// practising, suggested focus areas and difficulty, and the detailed numbers
// behind them. Pure functions over progress state (src/lib/progress.js).

import { SLOW_FACTOR, addDays, answerSummary, dayKey, meanMs } from "./progress";
import { wordStanding } from "./adaptive";

// Levels from the share of first-try answers. Named to encourage, never to rank.
export const LEVELS = ["starting", "building", "confident", "strong"];
const LEVEL_FROM = [0, 0.5, 0.7, 0.85];

// Answers needed before a skill, lesson or topic gets a verdict.
export const MIN_SKILL_ANSWERS = 8;
export const MIN_LESSON_ANSWERS = 4;
export const MIN_TOPIC_WORDS = 3;
// Answers needed before the overall level and suggestions show.
export const MIN_ANSWERS = 20;

const GOING_WELL = 0.8;
const TO_PRACTISE = 0.65;
const DIFFICULTY_FOR_LEVEL = ["easy", "normal", "hard", "hard"];

// 1-4 for a first-try share.
export function levelFor(rate) {
  let level = 1;
  LEVEL_FROM.forEach((from, i) => {
    if (rate >= from) level = i + 1;
  });
  return level;
}

// How sure the learner is of a word, 0-1, from its recent results
// ("2" = 1, "1" = 0.5, "0" = 0), or solved / answered for older saves.
export function wordScore(entry) {
  const recent = entry?.recent || "";
  if (recent) return [...recent].reduce((n, m) => n + (m === "2" ? 1 : m === "1" ? 0.5 : 0), 0) / recent.length;
  const n = (entry?.solved || 0) + (entry?.lost || 0);
  return n ? entry.solved / n : 0;
}

const rate = (t) => (t.n ? t.firstTry / t.n : 0);

// games: registry entries ({ id, skill }); categoryOf: Map word key -> categories;
// lessonLabel(key) -> { en, fi } for "gameId:lesson" keys.
export function buildInsights(state, { games = [], categoryOf = new Map(), today = dayKey() } = {}) {
  const stats = state.stats || { games: {}, lessons: {} };
  const summary = answerSummary(state);
  const answered = Object.values(stats.games).reduce((n, t) => n + t.n, 0);

  // Skills: every game's answers added up under its registry skill.
  const bySkill = new Map();
  for (const [id, t] of Object.entries(stats.games)) {
    const skill = games.find((g) => g.id === id)?.skill;
    if (!skill) continue;
    const s = bySkill.get(skill) || { n: 0, firstTry: 0, ms: 0, timed: 0 };
    bySkill.set(skill, { n: s.n + t.n, firstTry: s.firstTry + t.firstTry, ms: s.ms + t.ms, timed: s.timed + t.timed });
  }
  const skills = [...bySkill.entries()]
    .map(([skill, t]) => ({
      id: skill,
      n: t.n,
      firstTryRate: rate(t),
      meanMs: meanMs(t),
      level: t.n >= MIN_SKILL_ANSWERS ? levelFor(rate(t)) : null,
    }))
    .sort((a, b) => b.n - a.n);

  // Overall: the first-try share over every answer.
  const all = Object.values(stats.games).reduce((a, t) => ({ n: a.n + t.n, firstTry: a.firstTry + t.firstTry }), { n: 0, firstTry: 0 });
  const overall = answered >= MIN_ANSWERS ? { level: levelFor(rate(all)), firstTryRate: rate(all), n: answered } : null;

  // Words by standing.
  const words = { known: 0, practising: 0, tricky: 0 };
  for (const entry of Object.values(state.words)) {
    const standing = wordStanding(entry);
    if (standing in words) words[standing] += 1;
  }

  // Topics (word bank categories): how sure the learner is of the words they practised in each.
  const byTopic = new Map();
  for (const [key, entry] of Object.entries(state.words)) {
    for (const cat of categoryOf.get(key) || []) {
      const t = byTopic.get(cat) || { n: 0, score: 0, known: 0, tricky: 0 };
      const standing = wordStanding(entry);
      byTopic.set(cat, {
        n: t.n + 1,
        score: t.score + wordScore(entry),
        known: t.known + (standing === "known" ? 1 : 0),
        tricky: t.tricky + (standing === "tricky" ? 1 : 0),
      });
    }
  }
  const topics = [...byTopic.entries()]
    .map(([id, t]) => ({ id, n: t.n, known: t.known, tricky: t.tricky, score: t.score / t.n }))
    .filter((t) => t.n >= MIN_TOPIC_WORDS)
    .sort((a, b) => b.score - a.score);

  const lessons = summary.lessons.map((l) => ({ ...l, game: l.id.split(":")[0] }));
  const gameRows = summary.games.filter((g) => g.id !== "unknown");

  // Going well / worth practising, over skills, lessons and topics.
  const overallMs = summary.meanMs;
  const candidates = [
    ...skills.filter((s) => s.level).map((s) => ({ kind: "skill", id: s.id, score: s.firstTryRate })),
    ...lessons
      .filter((l) => l.n >= MIN_LESSON_ANSWERS)
      .map((l) => {
        const gameMean = meanMs(stats.games[l.game]);
        const slow = Boolean(gameMean && l.meanMs > SLOW_FACTOR * gameMean);
        return { kind: "lesson", id: l.id, score: l.firstTryRate, slow };
      }),
    ...topics.map((t) => ({ kind: "topic", id: t.id, score: t.score })),
  ];
  const goingWell = candidates
    .filter((c) => c.score >= GOING_WELL && !c.slow)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const toPractise = candidates
    .filter((c) => c.score < TO_PRACTISE || c.slow)
    .map((c) => ({ ...c, reason: c.score < TO_PRACTISE ? "tries" : "time" }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 4);

  const suggestedFocus = overall
    ? topics
        .filter((t) => t.score < 0.75)
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map((t) => t.id)
    : [];
  const suggestedDifficulty = overall ? DIFFICULTY_FOR_LEVEL[overall.level - 1] : null;

  // The last 7 days, oldest first.
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    const d = state.days[day] || {};
    return {
      day,
      words: d.words || 0,
      firstTry: d.firstTry || 0,
      meanMs: d.timed ? d.ms / d.timed : null,
    };
  });

  return {
    answered,
    meanMs: overallMs,
    overall,
    skills,
    words,
    topics,
    goingWell,
    toPractise,
    suggestedFocus,
    suggestedDifficulty,
    days,
    games: gameRows,
    lessons,
  };
}
