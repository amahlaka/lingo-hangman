import { backfillGems, emptyProgress, gemsForEvents, loadProgress, mergeProgress, normalizeProgress, recordWord, setDailyGoal } from "../lib/progress";
import {
  EXTRA_TRY, accentVars, addGems, buyExtraTry, buyItem, equipItem, equippedValues, extraTryCount, gemBalance, ownsItem, useExtraTry,
} from "../lib/cosmetics";
import { applyEvents, cleanEvent, makeEvent } from "../lib/syncEvents";
import { memoryStorage } from "../test-utils";

const withGems = (gems) => addGems(emptyProgress(), gems);
const solved = (word) => ({ gameId: "hangman", word, solved: true, triesLeft: 4 });

describe("cosmetics shop", () => {
  it("starts with the free items in use and no gems", () => {
    expect(equippedValues(emptyProgress())).toEqual({ accent: "lake", confetti: "classic", figure: "none" });
    expect(ownsItem(emptyProgress(), "accent-lake")).toBe(true);
    expect(ownsItem(emptyProgress(), "accent-fjord")).toBe(false);
    expect(gemBalance(emptyProgress())).toBe(0);
  });

  it("pays with gems and leaves XP alone", () => {
    const start = { ...withGems(50), xp: 300 };
    const { state, ok } = buyItem(start, "accent-fjord");
    expect(ok).toBe(true);
    expect(state.xp).toBe(300);
    expect(gemBalance(state)).toBe(10);
    expect(equippedValues(state).accent).toBe("fjord");
  });

  it("refuses items you can't afford or already own", () => {
    expect(buyItem(withGems(10), "accent-fjord")).toMatchObject({ ok: false, reason: "gems" });
    const { state } = buyItem(withGems(100), "figure-glasses");
    expect(buyItem(state, "figure-glasses")).toMatchObject({ ok: false, reason: "owned" });
    expect(buyItem(state, "nope")).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("switches between owned items only", () => {
    let { state } = buyItem(withGems(100), "confetti-snow");
    state = equipItem(state, "confetti-classic");
    expect(equippedValues(state).confetti).toBe("classic");
    state = equipItem(state, "confetti-snow");
    expect(equippedValues(state).confetti).toBe("snow");
    expect(equipItem(state, "confetti-stars")).toBe(state);
  });

  it("gives accent tokens for light and dark", () => {
    expect(accentVars("aurora", false)["--lake"]).toBe("#5b3fa0");
    expect(accentVars("aurora", true)["--on-lake"]).toBe("#150b2a");
  });
});

describe("gems", () => {
  it("earns nothing for an ordinary word", () => {
    // The first word unlocks the "First word" badge; the second is ordinary.
    const first = recordWord(emptyProgress(), solved("cat"), { day: "2026-10-12" });
    expect(first.events.gemsGained).toBe(15);
    const { state, events } = recordWord(first.state, solved("dog"), { day: "2026-10-12" });
    expect(events.gemsGained).toBe(0);
    expect(gemBalance(state)).toBe(15);
  });

  it("earns gems for the daily goal and the streak day", () => {
    let s = setDailyGoal(emptyProgress(), 5);
    let events;
    for (let i = 0; i < 5; i++) ({ state: s, events } = recordWord(s, solved(`w${i}`), { day: "2026-10-12" }));
    expect(events.goalReached).toBe(true);
    // Goal 5 + streak day 1, plus the "Goal reached" badge 15.
    expect(events.gemReasons).toEqual(expect.arrayContaining([{ id: "goal", n: 5 }, { id: "streak", n: 1 }]));
    expect(gemBalance(s)).toBeGreaterThanOrEqual(6);
  });

  it("adds streak milestones and caps streak days", () => {
    const day3 = gemsForEvents({ goalReached: true, newAchievements: [] }, 3);
    expect(day3.reasons).toEqual([{ id: "goal", n: 5 }, { id: "streak", n: 3 }, { id: "milestone", n: 10 }]);
    expect(gemsForEvents({ goalReached: true, newAchievements: [] }, 40).gems).toBe(10);
    expect(gemsForEvents({ goalReached: false, newAchievements: ["a", "b"], levelUp: 2 }, 0).gems).toBe(40);
  });

  it("gives older saves gems for what they did and keeps their items", () => {
    const old = {
      xp: 600, // level 3
      days: { "2026-10-10": { words: 10, goalMet: true }, "2026-10-11": { words: 10, goalMet: true }, "2026-10-12": { words: 3 } },
      streak: { current: 2, best: 3, lastDay: "2026-10-11", restDays: [] },
      achievements: { "first-word": "2026-10-10", "first-goal": "2026-10-10" },
      shop: { spent: 250, owned: ["accent-fjord"], equipped: { accent: "accent-fjord" } },
    };
    const storage = memoryStorage({ "lingo.progress.v1": JSON.stringify(old) });
    const state = loadProgress(storage);
    // 2 goal days * 10 + 2 badges * 15 + 2 levels * 10 + 3-day streak 10
    expect(backfillGems(state)).toBe(80);
    expect(gemBalance(state)).toBe(80);
    expect(state.shop.spent).toBeUndefined();
    expect(equippedValues(state).accent).toBe("fjord");
  });

  it("starts new players with no gems", () => {
    expect(gemBalance(loadProgress(memoryStorage()))).toBe(0);
    const saved = memoryStorage({ "lingo.progress.v1": JSON.stringify({ xp: 999, shop: { gems: 7, owned: [] } }) });
    expect(gemBalance(loadProgress(saved))).toBe(7);
  });
});

describe("extra tries", () => {
  it("are bought into a capped stock with gems and used one at a time", () => {
    let state = withGems(60);
    for (let i = 0; i < EXTRA_TRY.max; i++) state = buyItem(state, EXTRA_TRY.id).state;
    expect(extraTryCount(state)).toBe(EXTRA_TRY.max);
    expect(gemBalance(state)).toBe(60 - EXTRA_TRY.max * EXTRA_TRY.price);
    expect(buyItem(state, EXTRA_TRY.id)).toMatchObject({ ok: false, reason: "full" });
    state = useExtraTry(state).state;
    expect(extraTryCount(state)).toBe(EXTRA_TRY.max - 1);
    expect(buyExtraTry(withGems(EXTRA_TRY.price - 1))).toMatchObject({ ok: false, reason: "gems" });
    expect(useExtraTry(emptyProgress())).toMatchObject({ ok: false });
  });

  it("survive buying cosmetics, saving, merging and sync events", () => {
    let state = buyItem(withGems(100), EXTRA_TRY.id).state;
    state = buyItem(state, "accent-fjord").state;
    expect(extraTryCount(state)).toBe(1);
    expect(extraTryCount(normalizeProgress(JSON.parse(JSON.stringify(state))))).toBe(1);
    expect(extraTryCount(mergeProgress(state, state))).toBe(2);
    const events = [makeEvent("buy", { id: EXTRA_TRY.id }), makeEvent("buy", { id: EXTRA_TRY.id }), makeEvent("use", { id: EXTRA_TRY.id })];
    const synced = applyEvents(withGems(30), events.map(cleanEvent));
    expect(extraTryCount(synced)).toBe(1);
    expect(gemBalance(synced)).toBe(30 - 2 * EXTRA_TRY.price);
  });
});
