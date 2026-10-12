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

export const XP_PER_LEVEL = 250;
export const DAILY_GOAL_OPTIONS = [5, 10, 20];
export const DEFAULT_DAILY_GOAL = 10;
export const LEARNED_AFTER_DAYS = 3;

export function emptyProgress() {
  return {
    version: 1,
    xp: 0,
    dailyGoal: DEFAULT_DAILY_GOAL,
    // "YYYY-MM-DD" -> { words, solved, xp, goalMet }
    days: {},
    // lastDay: the last day the goal was met.
    streak: { current: 0, best: 0, lastDay: null, restDays: [] },
    // word key -> { solved, lost, days: [up to 3 "YYYY-MM-DD"] }
    words: {},
    totals: { words: 0, solved: 0, perfect: 0 },
    // gameId -> rounds played
    games: {},
    // achievement id -> "YYYY-MM-DD" unlocked
    achievements: {},
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

// ---- Recording a round ----

// Record one finished word. Returns the new state and what happened, so the
// game can pick the right celebration.
//
// result: { gameId, word, lang, solved, triesLeft, perfect }
// ctx: { gameIds } (all registered games, for the Explorer badge)
export function recordWord(state, result, { day = dayKey(), gameIds = [] } = {}) {
  const { gameId = "unknown", word, lang = "en", solved, triesLeft = 0, perfect = false } = result;
  const xpGained = xpForWord({ solved, triesLeft, perfect });
  const levelBefore = levelInfo(state.xp).level;

  const prevDay = dayStats(state, day);
  const dayEntry = {
    ...prevDay,
    words: prevDay.words + 1,
    solved: prevDay.solved + (solved ? 1 : 0),
    xp: prevDay.xp + xpGained,
  };
  // Every finished word counts towards the daily goal; practice is practice.
  const goalReached = !prevDay.goalMet && dayEntry.words >= state.dailyGoal;
  if (goalReached) dayEntry.goalMet = true;

  const words = { ...state.words };
  if (word) {
    const key = wordKey(word, lang);
    const prev = words[key] || { solved: 0, lost: 0, days: [] };
    const days = solved && !prev.days.includes(day) ? [...prev.days, day].slice(-LEARNED_AFTER_DAYS) : prev.days;
    words[key] = {
      solved: prev.solved + (solved ? 1 : 0),
      lost: prev.lost + (solved ? 0 : 1),
      days,
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

  return {
    state: next,
    events: {
      xpGained,
      levelUp: levelAfter > levelBefore ? levelAfter : null,
      goalReached,
      streakChange,
      newAchievements: unlocked.unlocked,
      wordLearned: Boolean(learnedNow),
    },
  };
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
    return {
      ...base,
      ...parsed,
      streak: { ...base.streak, ...parsed.streak },
      totals: { ...base.totals, ...parsed.totals },
    };
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
