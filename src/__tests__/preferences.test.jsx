import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { applyPreferences, getPreferences, itemLevel, resetPreferences, setPreferences } from "../lib/preferences";
import { ALL_CATEGORIES, categoryGroups, filterCommonWords, getSentences } from "../lib/words";

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

  it("leaves hobby topics out until the learner picks one, and then adds them to the mix", () => {
    const hobby = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, categories: ["games"], level: 1 }));
    const all = [...items, ...hobby, { id: "both", categories: ["games", "food"] }];
    const ids = (prefs) => applyPreferences(all, { prefs: { difficulty: "any", ...prefs }, optIn: ["games"] }).map((i) => i.id);
    expect(ids({ focus: [] })).not.toContain("g0");
    expect(ids({ focus: [] })).toEqual(expect.arrayContaining(["f0", "m0", "x", "both"]));
    // Picking only a hobby keeps the everyday topics too.
    expect(ids({ focus: ["games"] })).toEqual(expect.arrayContaining(["g0", "f0", "m0"]));
    // With an everyday focus as well, it narrows to the picked topics.
    expect(ids({ focus: ["games", "food"] }).sort()).toEqual([...hobby.map((h) => h.id), "both", "f0", "f1", "f2", "f3", "f4", "f5"].sort());
  });

  it("marks the word bank's hobby groups as opt-in", () => {
    const groups = categoryGroups("en");
    expect(groups.find((g) => g.categories.includes("video-games")).optIn).toBe(true);
    expect(groups.find((g) => g.categories.includes("food")).optIn).toBe(false);
    setPreferences({ focus: [] });
    expect(filterCommonWords({ preferences: true }).some((w) => w.categories.includes("video-games"))).toBe(false);
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
    expect(getPreferences()).toMatchObject({ focus: ["food"], difficulty: "hard" });
    expect(JSON.parse(localStorage.getItem("lingoPreferences")).focus).toEqual(["food"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear choices" }));
    expect(getPreferences()).toMatchObject({ focus: [], difficulty: "any" });
  });

  it("groups the focus areas under headings", () => {
    renderApp("/preferences");
    const groups = categoryGroups("en", "Other");
    const grouped = groups.flatMap((g) => g.categories);
    expect([...grouped].sort()).toEqual([...ALL_CATEGORIES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    const media = groups.find((g) => g.categories.includes("video-editing"));
    expect(screen.getByRole("heading", { name: media.label })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Pick all: ${media.label}` }));
    expect(getPreferences().focus).toEqual(media.categories);
    fireEvent.click(screen.getByRole("button", { name: `Clear: ${media.label}` }));
    expect(getPreferences().focus).toEqual([]);
  });

  it("lists the opt-in topics apart, under Extra topics", () => {
    renderApp("/preferences");
    const extra = screen.getByRole("heading", { name: "Extra topics" }).closest("section");
    for (const group of categoryGroups("en", "Other")) {
      const heading = screen.getByRole("heading", { name: group.label });
      expect(extra.contains(heading)).toBe(group.optIn);
    }
  });

  it("is linked from the settings menu", () => {
    renderApp("/hangman");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("link", { name: "Practice settings" }));
    expect(screen.getByRole("heading", { name: "Focus areas" })).toBeInTheDocument();
  });
});
