import {
  addDays,
  achievementList,
  emptyProgress,
  learnedWordCount,
  levelInfo,
  recordWord,
  setDailyGoal,
  streakStatus,
  xpForWord,
} from "../lib/progress";

const solved = (word = "cat", extra = {}) => ({ gameId: "hangman", word, solved: true, triesLeft: 4, ...extra });

function playDay(state, day, words = 10) {
  let s = state;
  for (let i = 0; i < words; i++) s = recordWord(s, solved(`w${i}`), { day }).state;
  return s;
}

describe("progress rules", () => {
  it("gives XP per the design system", () => {
    expect(xpForWord({ solved: true, triesLeft: 2 })).toBe(14);
    expect(xpForWord({ solved: true, triesLeft: 6, perfect: true })).toBe(27);
    expect(xpForWord({ solved: false })).toBe(2);
  });

  it("makes a level every 250 XP", () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, into: 0, toNext: 250 });
    expect(levelInfo(830)).toMatchObject({ level: 4, into: 80, toNext: 170 });
  });

  it("reports goal, level and achievements when a word is recorded", () => {
    let s = setDailyGoal(emptyProgress(), 5);
    const day = "2026-10-12";
    let events;
    for (let i = 0; i < 5; i++) ({ state: s, events } = recordWord(s, solved(`w${i}`), { day }));
    expect(events.goalReached).toBe(true);
    expect(s.streak).toMatchObject({ current: 1, best: 1, lastDay: day });
    expect(s.achievements["first-word"]).toBe(day);
    expect(s.achievements["first-goal"]).toBe(day);
    // Later words the same day don't reach the goal again.
    expect(recordWord(s, solved("x"), { day }).events.goalReached).toBe(false);
  });

  it("counts a lost round towards the goal and gives 2 XP", () => {
    const { state, events } = recordWord(emptyProgress(), { word: "cat", solved: false }, { day: "2026-10-12" });
    expect(events.xpGained).toBe(2);
    expect(state.days["2026-10-12"].words).toBe(1);
    expect(state.totals.solved).toBe(0);
  });

  it("extends the streak on consecutive days and uses one rest day per week", () => {
    // 2026-10-12 is a Monday.
    let s = playDay(emptyProgress(), "2026-10-12");
    s = playDay(s, "2026-10-13");
    expect(s.streak.current).toBe(2);
    // Skip Wednesday: the rest day keeps the streak.
    const { state: after, events } = recordWord(playDay(s, "2026-10-15", 9), solved("last"), { day: "2026-10-15" });
    expect(events.streakChange).toBe("rest-day-used");
    expect(after.streak.current).toBe(3);
    // A second missed day in the same week restarts it, keeping the best.
    const restarted = playDay(after, "2026-10-17");
    expect(restarted.streak).toMatchObject({ current: 1, best: 3 });
  });

  it("shows a streak as alive until it can no longer be kept", () => {
    const s = playDay(emptyProgress(), "2026-10-12");
    expect(streakStatus(s, "2026-10-13")).toMatchObject({ current: 1, alive: true, restDaysLeft: 1 });
    expect(streakStatus(s, "2026-10-14")).toMatchObject({ current: 1, alive: true });
    expect(streakStatus(s, "2026-10-15")).toMatchObject({ current: 0, alive: false, best: 1 });
  });

  it("learns a word after solving it on 3 different days", () => {
    let s = emptyProgress();
    let events;
    for (const day of ["2026-10-12", "2026-10-12", "2026-10-14"]) ({ state: s } = recordWord(s, solved("dog"), { day }));
    expect(learnedWordCount(s)).toBe(0);
    ({ state: s, events } = recordWord(s, solved("Dog "), { day: "2026-10-20" }));
    expect(events.wordLearned).toBe(true);
    expect(learnedWordCount(s)).toBe(1);
  });

  it("lists locked achievements with progress", () => {
    const s = playDay(emptyProgress(), "2026-10-12", 3);
    const words100 = achievementList(s).find((a) => a.id === "words-100");
    expect(words100).toMatchObject({ unlocked: false, progress: 3, target: 100 });
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
