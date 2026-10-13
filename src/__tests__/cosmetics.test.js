import { emptyProgress, loadProgress, recordWord } from "../lib/progress";
import { accentVars, buyItem, equipItem, equippedValues, ownsItem, shopBalance } from "../lib/cosmetics";
import { memoryStorage } from "../test-utils";

const withXp = (xp) => ({ ...emptyProgress(), xp });

describe("cosmetics shop", () => {
  it("starts with the free items in use", () => {
    expect(equippedValues(emptyProgress())).toEqual({ accent: "lake", confetti: "classic", figure: "none" });
    expect(ownsItem(emptyProgress(), "accent-lake")).toBe(true);
    expect(ownsItem(emptyProgress(), "accent-fjord")).toBe(false);
  });

  it("pays from lifetime points without lowering XP", () => {
    const { state, ok } = buyItem(withXp(300), "accent-fjord");
    expect(ok).toBe(true);
    expect(state.xp).toBe(300);
    expect(shopBalance(state)).toBe(50);
    expect(equippedValues(state).accent).toBe("fjord");
    // Points earned later add to the balance.
    const after = recordWord(state, { gameId: "hangman", word: "cat", solved: true, triesLeft: 0 }).state;
    expect(shopBalance(after)).toBe(60);
  });

  it("refuses items you can't afford or already own", () => {
    expect(buyItem(withXp(100), "accent-fjord")).toMatchObject({ ok: false, reason: "points" });
    const { state } = buyItem(withXp(500), "figure-glasses");
    expect(buyItem(state, "figure-glasses")).toMatchObject({ ok: false, reason: "owned" });
    expect(buyItem(state, "nope")).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("switches between owned items only", () => {
    let { state } = buyItem(withXp(500), "confetti-snow");
    state = equipItem(state, "confetti-classic");
    expect(equippedValues(state).confetti).toBe("classic");
    state = equipItem(state, "confetti-snow");
    expect(equippedValues(state).confetti).toBe("snow");
    expect(equipItem(state, "confetti-stars")).toBe(state);
  });

  it("loads older saves without a shop", () => {
    const storage = memoryStorage({ "lingo.progress.v1": JSON.stringify({ xp: 40 }) });
    const state = loadProgress(storage);
    expect(shopBalance(state)).toBe(40);
    expect(equippedValues(state).figure).toBe("none");
  });

  it("gives accent tokens for light and dark", () => {
    expect(accentVars("aurora", false)["--lake"]).toBe("#5b3fa0");
    expect(accentVars("aurora", true)["--on-lake"]).toBe("#150b2a");
  });
});
