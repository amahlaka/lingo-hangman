// "My path": a short plan for the week, picked from the learner's own
// answers (src/lib/insights.js). Pure functions, so the path works offline
// from this device's progress; signed in, the backend only keeps the current
// path so every device shows the same one (src/lib/pathStore.js).
//
// A new learner (fewer than MIN_ANSWERS answers) starts with a placement
// round: 10 mixed questions in Quick play, then two games to get going. Once
// placed, a path has four steps: the weakest skill, a skill not tried yet,
// the next weakest, and one going well, for an easy win. Each step is
// STEP_ANSWERS answers in one game. The path is planned again each Monday,
// once a new learner has answered enough to be placed, or when the learner asks after finishing it.

import { addDays, dayKey } from "./progress";
import { MIN_ANSWERS } from "./insights";
import { PATH_VERSION, STEP_ANSWERS } from "./pathFormat.js";

export { cleanPath } from "./pathFormat.js";
export const PLACEMENT_ANSWERS = 10;
const STARTERS = ["meaning", "listening"];

// Monday of the week `day` falls in.
export function weekStart(day = dayKey()) {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

const answersIn = (state, gameId) => state.stats?.games?.[gameId]?.n || 0;
const allAnswers = (state) => Object.values(state.stats?.games || {}).reduce((n, t) => n + (t.n || 0), 0);

// How many answers count towards `step` so far.
export function stepDone(step, state) {
  const now = step.game === "quick-play" ? allAnswers(state) : answersIn(state, step.game);
  return Math.max(0, Math.min(step.goal, now - step.base));
}

// The game to practise a skill with: the one played least.
function gameFor(skill, games, state, used) {
  const options = games.filter((g) => g.skill === skill && !used.has(g.id));
  options.sort((a, b) => answersIn(state, a.id) - answersIn(state, b.id) || games.indexOf(a) - games.indexOf(b));
  return options[0] || null;
}

const step = (game, reason, state, skill = game.skill) => ({
  game: game.id,
  skill,
  reason,
  goal: game.id === "quick-play" ? PLACEMENT_ANSWERS : STEP_ANSWERS,
  base: game.id === "quick-play" ? allAnswers(state) : answersIn(state, game.id),
});

// games: playable registry entries ({ id, skill }); insights: buildInsights().
export function planPath(state, { games, insights, today = dayKey() }) {
  // A game played once a day (`noPath`) can't fill a step's answers.
  const playable = games.filter((g) => !g.soon && !g.featured && !g.noPath);
  const base = { v: PATH_VERSION, week: weekStart(today), planned: today };

  if (!insights.overall || allAnswers(state) < MIN_ANSWERS) {
    const quick = { id: "quick-play", skill: "Mixed" };
    const starters = STARTERS.map((id) => playable.find((g) => g.id === id)).filter(Boolean);
    return { ...base, placement: true, steps: [step(quick, "placement", state), ...starters.map((g) => step(g, "start", state))] };
  }

  const used = new Set();
  const steps = [];
  const add = (skill, reason) => {
    const game = gameFor(skill, playable, state, used);
    if (!game) return false;
    used.add(game.id);
    steps.push(step(game, reason, state));
    return true;
  };
  // Skills with a verdict, weakest first.
  const rated = insights.skills.filter((s) => s.level).sort((a, b) => a.firstTryRate - b.firstTryRate);
  const tried = new Set(insights.skills.map((s) => s.id));
  const untried = [...new Set(playable.map((g) => g.skill))].filter((s) => !tried.has(s));

  const weak = rated.filter((s) => s.firstTryRate < 0.85);
  if (weak[0]) add(weak[0].id, "practise");
  if (untried[0]) add(untried[0], "new");
  if (weak[1]) add(weak[1].id, "practise");
  const strong = [...rated].reverse().find((s) => !steps.some((st) => st.skill === s.id));
  if (strong) add(strong.id, "strength");
  // Fewer than four: fill with more of the weakest skills, then anything.
  for (const s of [...rated, ...insights.skills]) {
    if (steps.length >= 4) break;
    add(s.id, "practise");
  }
  for (const g of playable) {
    if (steps.length >= 4) break;
    add(g.skill, "new");
  }
  return { ...base, placement: false, steps };
}

// The path to show: the stored one while it still fits, else a new one.
// Returns { path, replanned }.
export function currentPath(stored, state, { games, insights, today = dayKey() }) {
  const valid = stored && stored.v === PATH_VERSION && Array.isArray(stored.steps) && stored.steps.length > 0;
  const stale =
    !valid ||
    stored.week !== weekStart(today) ||
    // Enough answers to place the learner: plan from the results.
    (stored.placement && Boolean(insights.overall) && allAnswers(state) >= MIN_ANSWERS);
  if (!stale) return { path: stored, replanned: false };
  return { path: planPath(state, { games, insights, today }), replanned: true };
}

export function pathFinished(path, state) {
  return path.steps.every((s) => stepDone(s, state) >= s.goal);
}

// The first step not done yet, or null.
export function nextStep(path, state) {
  return path.steps.find((s) => stepDone(s, state) < s.goal) || null;
}
