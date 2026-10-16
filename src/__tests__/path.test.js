import { fireEvent, screen } from "@testing-library/react";
import { emptyProgress, recordWord } from "../lib/progress";
import { buildInsights } from "../lib/insights";
import { cleanPath, currentPath, nextStep, pathFinished, planPath, stepDone, weekStart } from "../lib/path";
import { newerPath } from "../lib/pathStore";
import { renderApp } from "../test-utils";

const games = [
  { id: "quick-play", skill: "Mixed", featured: true },
  { id: "hangman", skill: "Vocabulary" },
  { id: "meaning", skill: "Vocabulary" },
  { id: "listening", skill: "Listening" },
  { id: "type-it", skill: "Spelling" },
  { id: "grammar", skill: "Grammar" },
  { id: "sounds", skill: "Pronunciation" },
];
const answer = (gameId, i, ok) => ({ gameId, word: `${gameId}${i}`, lang: "en", solved: ok, perfect: ok, triesLeft: ok ? 2 : 0, ms: 3000 });
const play = (state, gameId, n, okEvery = 1, day = "2026-10-14") => {
  for (let i = 0; i < n; i++) state = recordWord(state, answer(gameId, i, i % okEvery === 0), { day }).state;
  return state;
};
const plan = (state, today = "2026-10-14") => planPath(state, { games, insights: buildInsights(state, { games, today }), today });

test("weeks start on Monday", () => {
  expect(weekStart("2026-10-14")).toBe("2026-10-12");
  expect(weekStart("2026-10-12")).toBe("2026-10-12");
  expect(weekStart("2026-10-18")).toBe("2026-10-12");
});

test("a new learner starts with a placement round", () => {
  const p = plan(emptyProgress());
  expect(p.placement).toBe(true);
  expect(p.steps.map((s) => [s.game, s.reason, s.goal])).toEqual([
    ["quick-play", "placement", 10],
    ["meaning", "start", 10],
    ["listening", "start", 10],
  ]);
  // Answers in any game count towards placement.
  const s = play(emptyProgress(), "grammar", 4);
  expect(stepDone(p.steps[0], s)).toBe(4);
  expect(nextStep(p, s)).toBe(p.steps[0]);
});

test("a placed learner gets the weakest skill, something new, the next weakest and one going well", () => {
  let s = emptyProgress();
  s = play(s, "meaning", 12); // all right first time
  s = play(s, "listening", 10, 3); // a third right
  s = play(s, "grammar", 10, 2); // half right
  const p = plan(s);
  expect(p.placement).toBe(false);
  expect(p.steps.map((st) => [st.skill, st.reason])).toEqual([
    ["Listening", "practise"],
    ["Spelling", "new"],
    ["Grammar", "practise"],
    ["Vocabulary", "strength"],
  ]);
  // Vocabulary is practised with the game played least.
  expect(p.steps[3].game).toBe("hangman");
  expect(p.steps[0].base).toBe(10);
  const more = play(s, "listening", 10);
  expect(stepDone(p.steps[0], more)).toBe(10);
  expect(nextStep(p, more).skill).toBe("Spelling");
});

test("the path is planned again each week and after placement", () => {
  const s = play(play(emptyProgress(), "meaning", 15), "listening", 10, 2);
  const insights = buildInsights(s, { games, today: "2026-10-14" });
  const thisWeek = plan(s);
  expect(currentPath(thisWeek, s, { games, insights, today: "2026-10-16" }).replanned).toBe(false);
  expect(currentPath(thisWeek, s, { games, insights, today: "2026-10-19" })).toMatchObject({ replanned: true, path: { week: "2026-10-19" } });

  const placement = plan(emptyProgress());
  // 15 answers: not enough to place the learner yet, so the path stays.
  const early = play(emptyProgress(), "meaning", 15);
  expect(currentPath(placement, early, { games, insights: buildInsights(early, { games }), today: "2026-10-14" }).replanned).toBe(false);
  const placed = play(early, "listening", 10, 2);
  const next = currentPath(placement, placed, { games, insights: buildInsights(placed, { games }), today: "2026-10-14" });
  expect(next).toMatchObject({ replanned: true, path: { placement: false } });
  expect(next.path.steps[0].skill).toBe("Listening");
  expect(pathFinished(next.path, placed)).toBe(false);
});

test("stored paths are checked, and the newer one wins", () => {
  const p = plan(emptyProgress());
  expect(cleanPath(p)).toEqual(p);
  expect(cleanPath({ ...p, v: 2 })).toBeNull();
  expect(cleanPath({ ...p, steps: [{ game: "../x" }] })).toBeNull();
  const later = { ...p, planned: "2026-10-15" };
  expect(newerPath(p, later)).toBe(later);
  expect(newerPath(later, p)).toBe(later);
  expect(newerPath(p, { ...p })).not.toBe(p); // same day: the account's
  expect(newerPath(null, p)).toBe(p);
});

test("Home shows My path with the placement round first", async () => {
  renderApp("/");
  expect(await screen.findByRole("heading", { name: "My path" })).toBeInTheDocument();
  expect(screen.getByText("10 mixed questions, so Lingo can find your level")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("link", { name: "Play" })[0]);
  expect(await screen.findByText(/Quick play/)).toBeInTheDocument();
});
