// Shared progress for every game: points (XP), levels, daily goal, daily
// streak with a weekly rest day, learned words and achievements.
//
// Everything here is a pure function over a plain `state` object, so it is easy
// to test. ProgressProvider (src/app/ProgressContext.jsx) keeps the state in
// localStorage and exposes it to games through useProgress().
//
// Rules come from the Lingo design system ("Engagement"):
// - 10 XP for a solved word, +2 per try left over, +5 for a first-try solve
//   without a miss. A lost round still gives 2 XP for practising.
// - Every 250 XP is a level.
// - Daily goal: 5, 10 or 20 words a day (default 10).
// - Daily streak: days in a row with the goal met. One rest day per week is
//   used automatically so one busy day doesn't break the streak.
// - A word counts as learned after it is solved on 3 different days.
// - Gems, the shop currency, come from the daily goal, streak days and
//   milestones, see gemsForEvents below.
//
// It also keeps answer statistics, all on this device, so Quick play can
// adapt: how long answers take per game and per lesson, and for each word its
// misses, answer time and last few results (see `recent` below).

import { addGems, emptyShop } from "./cosmetics";

export const XP_PER_LEVEL = 250;
export const DAILY_GOAL_OPTIONS = [5, 10, 20];
export const DEFAULT_DAILY_GOAL = 10;
export const LEARNED_AFTER_DAYS = 3;

export function emptyProgress() {
  return {
    version: 1,
    xp: 0,
    dailyGoal: DEFAULT_DAILY_GOAL,
    // "YYYY-MM-DD" -> { words, solved, xp, goalMet, firstTry, ms, timed }
    days: {},
    // lastDay: the last day the goal was met.
    streak: { current: 0, best: 0, lastDay: null, restDays: [] },
    // word key -> { solved, lost, days: [up to 3 "YYYY-MM-DD"],
    //              ms, timed, recent, last }
    // ms / timed: total and count of timed answers; recent: the last few
    // results as a string, see answerMark(); last: day last practised.
    words: {},
    totals: { words: 0, solved: 0, perfect: 0 },
    // gameId -> rounds played
    games: {},
    // achievement id -> "YYYY-MM-DD" unlocked
    achievements: {},
    // Answer tallies (see addTally) per game id and per "gameId:lesson".
    stats: { games: {}, lessons: {} },
    // Cosmetics bought with points: { spent, owned, equipped }, see cosmetics.js.
    shop: emptyShop(),
  };
}

// ---- Dates (local time, as "YYYY-MM-DD") ----

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const date = parseDay(key);
  date.setDate(date.getDate() + n);
  return dayKey(date);
}

// Monday of the week the day falls in; one rest day is allowed per week.
function weekKey(key) {
  const date = parseDay(key);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return dayKey(date);
}

// ---- Points and levels ----

export function xpForWord({ solved, triesLeft = 0, perfect = false }) {
  if (!solved) return 2;
  return 10 + 2 * Math.max(0, triesLeft) + (perfect ? 5 : 0);
}

export function levelInfo(xp) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const into = xp - (level - 1) * XP_PER_LEVEL;
  return { level, into, toNext: XP_PER_LEVEL - into, perLevel: XP_PER_LEVEL };
}

// ---- Streak ----

function restDayAvailable(streak, day) {
  return !streak.restDays.some((d) => weekKey(d) === weekKey(day));
}

// The streak as it stands today: still alive if the goal was met today,
// yesterday, or the day before yesterday with this week's rest day free.
export function streakStatus(state, today = dayKey()) {
  const { streak } = state;
  const restDaysLeft = restDayAvailable(streak, today) ? 1 : 0;
  if (!streak.lastDay) return { current: 0, best: streak.best, restDaysLeft, alive: false };
  const yesterday = addDays(today, -1);
  const alive =
    streak.lastDay === today ||
    streak.lastDay === yesterday ||
    (streak.lastDay === addDays(today, -2) && restDayAvailable(streak, yesterday));
  return { current: alive ? streak.current : 0, best: streak.best, restDaysLeft, alive };
}

function advanceStreak(streak, today) {
  if (streak.lastDay === today) return { streak, change: null };
  const yesterday = addDays(today, -1);
  let current;
  let restDays = streak.restDays;
  let change;
  if (streak.lastDay === yesterday) {
    current = streak.current + 1;
    change = "extended";
  } else if (streak.lastDay === addDays(today, -2) && restDayAvailable(streak, yesterday)) {
    current = streak.current + 1;
    restDays = [...restDays, yesterday].slice(-8);
    change = "rest-day-used";
  } else {
    current = 1;
    change = streak.current > 0 ? "restarted" : "started";
  }
  return {
    streak: { ...streak, current, best: Math.max(streak.best, current), lastDay: today, restDays },
    change,
  };
}

// ---- Words ----

export function wordKey(word, lang = "en") {
  return `${lang}:${String(word).trim().toLowerCase()}`;
}

export function learnedWordCount(state) {
  return Object.values(state.words).filter((w) => w.days.length >= LEARNED_AFTER_DAYS).length;
}

export function dayStats(state, day = dayKey()) {
  return state.days[day] || { words: 0, solved: 0, xp: 0, goalMet: false };
}

// ---- Answer statistics ----

// Longer answers count as this long, so a learner who leaves the tab open
// doesn't skew their average.
export const MAX_ANSWER_MS = 60000;
// An answer counts as slow when it takes this many times the learner's own
// average for that game (once the game has MIN_TIMED timed answers).
export const SLOW_FACTOR = 1.6;
export const MIN_TIMED = 5;
// How many recent results each word remembers.
export const RECENT_LENGTH = 5;

const emptyTally = () => ({ n: 0, solved: 0, firstTry: 0, ms: 0, timed: 0 });

function timedMs(ms) {
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX_ANSWER_MS) : null;
}

export function addTally(tally, { solved, perfect, ms }) {
  const prev = tally || emptyTally();
  const t = timedMs(ms);
  return {
    n: prev.n + 1,
    solved: prev.solved + (solved ? 1 : 0),
    firstTry: prev.firstTry + (solved && perfect ? 1 : 0),
    ms: prev.ms + (t ?? 0),
    timed: prev.timed + (t === null ? 0 : 1),
  };
}

// Average answer time in ms, or null before anything was timed.
export function meanMs(tally) {
  return tally?.timed ? tally.ms / tally.timed : null;
}

export function isSlow(ms, gameTally) {
  const t = timedMs(ms);
  const mean = meanMs(gameTally);
  return t !== null && mean !== null && gameTally.timed >= MIN_TIMED && t > SLOW_FACTOR * mean;
}

// One result as a character in a word's `recent` string:
// "2" first try without hesitating, "1" solved after a miss or slowly, "0" missed.
export function answerMark({ solved, perfect, slow }) {
  if (!solved) return "0";
  return perfect && !slow ? "2" : "1";
}

// Overall numbers for the home screen: average answer time and every game and
// lesson with its average time and first-try share, slowest first.
export function answerSummary(state) {
  const stats = state.stats || emptyProgress().stats;
  const rows = (map) =>
    Object.entries(map)
      .map(([id, t]) => ({ id, n: t.n, meanMs: meanMs(t), firstTryRate: t.n ? t.firstTry / t.n : 0 }))
      .filter((r) => r.meanMs !== null)
      .sort((a, b) => b.meanMs - a.meanMs);
  const all = Object.values(stats.games).reduce((a, t) => ({ ms: a.ms + t.ms, timed: a.timed + t.timed }), { ms: 0, timed: 0 });
  return { timed: all.timed, meanMs: meanMs(all), games: rows(stats.games), lessons: rows(stats.lessons) };
}

// ---- Achievements ----
// `color` follows the design system: lingon for streaks, pine for word
// milestones, cloudberry for skill feats, lake for exploring.

export const ACHIEVEMENTS = [
  { id: "first-word", name: "First word", desc: "Solve your first word.", medal: "1", color: "pine",
    value: (s) => s.totals.solved, target: 1 },
  { id: "perfect-word", name: "Clean solve", desc: "Solve a word without a single miss.", medal: "✓", color: "cloudberry",
    value: (s) => s.totals.perfect, target: 1 },
  { id: "first-goal", name: "Goal reached", desc: "Reach your daily goal.", medal: "✓", color: "lingon",
    value: (s) => Object.values(s.days).filter((d) => d.goalMet).length, target: 1 },
  { id: "streak-3", name: "Three days", desc: "Reach your goal 3 days in a row.", medal: "3", color: "lingon",
    value: (s) => s.streak.best, target: 3 },
  { id: "streak-7", name: "Full week", desc: "Reach your goal 7 days in a row.", medal: "7", color: "lingon",
    value: (s) => s.streak.best, target: 7 },
  { id: "words-100", name: "100 words", desc: "Solve 100 words.", medal: "100", color: "pine",
    value: (s) => s.totals.solved, target: 100 },
  { id: "learned-25", name: "25 learned", desc: "Learn 25 words (each solved on 3 days).", medal: "25", color: "pine",
    value: (s) => learnedWordCount(s), target: 25 },
  { id: "all-games", name: "Explorer", desc: "Play every game.", medal: "↻", color: "lake",
    value: (s, ctx) => (ctx.gameIds || []).filter((id) => s.games[id]).length,
    target: (ctx) => Math.max(1, (ctx.gameIds || []).length) },
];

function targetOf(a, ctx) {
  return typeof a.target === "function" ? a.target(ctx) : a.target;
}

// Every achievement with its unlocked flag and progress, for display.
export function achievementList(state, ctx = {}) {
  return ACHIEVEMENTS.map((a) => {
    const target = targetOf(a, ctx);
    return {
      ...a,
      target,
      progress: Math.min(a.value(state, ctx), target),
      unlocked: Boolean(state.achievements[a.id]),
    };
  });
}

function unlockAchievements(state, day, ctx) {
  const unlocked = [];
  const achievements = { ...state.achievements };
  for (const a of ACHIEVEMENTS) {
    if (!achievements[a.id] && a.value(state, ctx) >= targetOf(a, ctx)) {
      achievements[a.id] = day;
      unlocked.push(a.id);
    }
  }
  return { state: { ...state, achievements }, unlocked };
}

// ---- Gems ----
// Gems pay for the shop (src/lib/cosmetics.js). A learner who reaches the
// daily goal earns about 10 a day, plus more for milestones.

export const GEMS = {
  goal: 5, // reaching the daily goal
  streakDayMax: 5, // +1 per day of the streak, up to this, when the goal is reached
  achievement: 15, // each new achievement
  levelUp: 10,
  wordLearned: 1,
};
// Streak length -> bonus gems on the day the streak reaches it.
export const STREAK_MILESTONE_GEMS = { 3: 10, 7: 20, 14: 30, 30: 50, 60: 75, 100: 100 };

// Gems for one recorded word, from what it unlocked. Returns
// { gems, reasons: [{ id, n }] } with id goal | streak | milestone |
// achievement | level | learned.
export function gemsForEvents(events, streakDays = 0) {
  const reasons = [];
  if (events.goalReached) {
    reasons.push({ id: "goal", n: GEMS.goal });
    if (streakDays > 0) reasons.push({ id: "streak", n: Math.min(streakDays, GEMS.streakDayMax) });
    if (STREAK_MILESTONE_GEMS[streakDays]) reasons.push({ id: "milestone", n: STREAK_MILESTONE_GEMS[streakDays] });
  }
  if (events.newAchievements?.length) reasons.push({ id: "achievement", n: GEMS.achievement * events.newAchievements.length });
  if (events.levelUp) reasons.push({ id: "level", n: GEMS.levelUp });
  if (events.wordLearned) reasons.push({ id: "learned", n: GEMS.wordLearned });
  return { gems: reasons.reduce((sum, r) => sum + r.n, 0), reasons };
}

// Gems for everything done before gems existed, for saves from older versions:
// every day the goal was met, achievements, levels, learned words and streak
// milestones reached. Streak-day bonuses are counted at the full rate.
export function backfillGems(state) {
  const goalDays = Object.values(state.days || {}).filter((d) => d.goalMet).length;
  const milestones = Object.entries(STREAK_MILESTONE_GEMS)
    .filter(([days]) => (state.streak?.best || 0) >= Number(days))
    .reduce((sum, [, n]) => sum + n, 0);
  return (
    goalDays * (GEMS.goal + GEMS.streakDayMax) +
    Object.keys(state.achievements || {}).length * GEMS.achievement +
    (levelInfo(state.xp || 0).level - 1) * GEMS.levelUp +
    learnedWordCount({ words: state.words || {} }) * GEMS.wordLearned +
    milestones
  );
}

// ---- Recording a round ----

// Record one finished word. Returns the new state and what happened, so the
// game can pick the right celebration.
//
// result: { gameId, word, lang, solved, triesLeft, perfect, ms, lesson }
//   ms: how long the answer took (optional); lesson: the lesson or topic id
//   inside the game, if it has them (optional).
// ctx: { gameIds } (all registered games, for the Explorer badge)
export function recordWord(state, result, { day = dayKey(), gameIds = [] } = {}) {
  const { gameId = "unknown", word, lang = "en", solved, triesLeft = 0, perfect = false, ms, lesson } = result;
  const xpGained = xpForWord({ solved, triesLeft, perfect });
  const levelBefore = levelInfo(state.xp).level;

  const prevDay = dayStats(state, day);
  const dayTime = timedMs(ms);
  const dayEntry = {
    ...prevDay,
    words: prevDay.words + 1,
    solved: prevDay.solved + (solved ? 1 : 0),
    xp: prevDay.xp + xpGained,
    firstTry: (prevDay.firstTry || 0) + (solved && perfect ? 1 : 0),
    ms: (prevDay.ms || 0) + (dayTime ?? 0),
    timed: (prevDay.timed || 0) + (dayTime === null ? 0 : 1),
  };
  // Every finished word counts towards the daily goal; practice is practice.
  const goalReached = !prevDay.goalMet && dayEntry.words >= state.dailyGoal;
  if (goalReached) dayEntry.goalMet = true;

  const prevStats = state.stats || emptyProgress().stats;
  const slow = isSlow(ms, prevStats.games[gameId]);
  const answer = { solved, perfect, ms };
  const stats = {
    games: { ...prevStats.games, [gameId]: addTally(prevStats.games[gameId], answer) },
    lessons: lesson
      ? { ...prevStats.lessons, [`${gameId}:${lesson}`]: addTally(prevStats.lessons[`${gameId}:${lesson}`], answer) }
      : prevStats.lessons,
  };

  const words = { ...state.words };
  if (word) {
    const key = wordKey(word, lang);
    const prev = words[key] || { solved: 0, lost: 0, days: [] };
    const days = solved && !prev.days.includes(day) ? [...prev.days, day].slice(-LEARNED_AFTER_DAYS) : prev.days;
    const t = timedMs(ms);
    words[key] = {
      solved: prev.solved + (solved ? 1 : 0),
      lost: prev.lost + (solved ? 0 : 1),
      days,
      ms: (prev.ms || 0) + (t ?? 0),
      timed: (prev.timed || 0) + (t === null ? 0 : 1),
      recent: ((prev.recent || "") + answerMark({ solved, perfect, slow })).slice(-RECENT_LENGTH),
      last: day,
    };
  }

  let next = {
    ...state,
    xp: state.xp + xpGained,
    days: { ...state.days, [day]: dayEntry },
    words,
    totals: {
      words: state.totals.words + 1,
      solved: state.totals.solved + (solved ? 1 : 0),
      perfect: state.totals.perfect + (solved && perfect ? 1 : 0),
    },
    games: { ...state.games, [gameId]: (state.games[gameId] || 0) + 1 },
    stats,
  };

  let streakChange = null;
  if (goalReached) {
    const advanced = advanceStreak(next.streak, day);
    next = { ...next, streak: advanced.streak };
    streakChange = advanced.change;
  }

  const unlocked = unlockAchievements(next, day, { gameIds });
  next = unlocked.state;

  const levelAfter = levelInfo(next.xp).level;
  const learnedNow =
    word && solved && words[wordKey(word, lang)].days.length === LEARNED_AFTER_DAYS &&
    (state.words[wordKey(word, lang)]?.days.length || 0) < LEARNED_AFTER_DAYS;

  const events = {
    xpGained,
    levelUp: levelAfter > levelBefore ? levelAfter : null,
    goalReached,
    streakChange,
    newAchievements: unlocked.unlocked,
    wordLearned: Boolean(learnedNow),
    slow,
  };
  const { gems, reasons } = gemsForEvents(events, goalReached ? next.streak.current : 0);
  next = addGems(next, gems);

  return { state: next, events: { ...events, gemsGained: gems, gemReasons: reasons } };
}

export function setDailyGoal(state, goal) {
  return { ...state, dailyGoal: DAILY_GOAL_OPTIONS.includes(goal) ? goal : DEFAULT_DAILY_GOAL };
}

// ---- Storage ----

export const STORAGE_KEY = "lingo.progress.v1";

export function loadProgress(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw);
    const base = emptyProgress();
    const loaded = {
      ...base,
      ...parsed,
      streak: { ...base.streak, ...parsed.streak },
      totals: { ...base.totals, ...parsed.totals },
      stats: { ...base.stats, ...parsed.stats },
      shop: { ...base.shop, ...parsed.shop, equipped: { ...base.shop.equipped, ...parsed.shop?.equipped } },
    };
    // Saves from before gems: items already bought stay, and the learner gets
    // the gems they would have earned so far. (The old `spent` was XP.)
    if (typeof parsed.shop?.gems !== "number") {
      const { spent, ...shop } = loaded.shop;
      loaded.shop = { ...shop, gems: backfillGems(loaded) };
    }
    return loaded;
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be full or blocked (private mode); progress then lives in memory only.
  }
}
