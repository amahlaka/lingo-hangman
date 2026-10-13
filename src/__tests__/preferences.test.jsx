import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { applyPreferences, getPreferences, itemLevel, resetPreferences, setPreferences } from "../lib/preferences";
import { filterCommonWords, getSentences } from "../lib/words";

afterEach(() => resetPreferences());

const items = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, categories: ["food"], level: 1 })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, categories: ["money"], level: 3 })),
  { id: "x", level: 2 },
];

describe("practice preferences", () => {
  it("leaves the pool alone by default", () => {
    expect(applyPreferences(items)).toHaveLength(items.length);
  });

  it("narrows to focus areas and difficulty", () => {
    expect(applyPreferences(items, { prefs: { focus: ["food"], difficulty: "any" } }).map((i) => i.id)).toEqual(
      ["f0", "f1", "f2", "f3", "f4", "f5"]
    );
    expect(applyPreferences(items, { prefs: { focus: [], difficulty: "hard" } })).toHaveLength(7);
  });

  it("ignores a preference that leaves too few items", () => {
    expect(applyPreferences(items, { prefs: { focus: ["food"], difficulty: "hard" } })).toHaveLength(6);
    expect(applyPreferences(items, { prefs: { focus: ["nothing"], difficulty: "any" } })).toHaveLength(items.length);
  });

  it("guesses a level for words without one", () => {
    expect(itemLevel({}, "cat")).toBe(1);
    expect(itemLevel({}, "kitchen")).toBe(2);
    expect(itemLevel({}, "Where is the bathroom?")).toBe(3);
    expect(itemLevel({ level: 1 }, "Where is the bathroom?")).toBe(1);
  });

  it("applies to word bank words and sentences only when asked", () => {
    setPreferences({ focus: ["food"] });
    const all = filterCommonWords();
    const focused = filterCommonWords({ preferences: true });
    expect(focused.length).toBeLessThan(all.length);
    expect(focused.every((w) => w.categories.includes("food"))).toBe(true);
    expect(getSentences({ preferences: true }).length).toBeLessThanOrEqual(getSentences().length);
  });

  it("is set from the focus and difficulty page", () => {
    renderApp("/preferences");
    fireEvent.click(screen.getByRole("button", { name: "Hard" }));
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(getPreferences()).toEqual({ focus: ["food"], difficulty: "hard" });
    expect(JSON.parse(localStorage.getItem("lingoPreferences")).focus).toEqual(["food"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear choices" }));
    expect(getPreferences()).toEqual({ focus: [], difficulty: "any" });
  });

  it("is linked from the settings menu", () => {
    renderApp("/hangman");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("link", { name: "Focus and difficulty" }));
    expect(screen.getByRole("heading", { name: "Focus areas" })).toBeInTheDocument();
  });
});
