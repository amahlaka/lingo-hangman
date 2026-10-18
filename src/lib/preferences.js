// The learner's practice preferences, shared by every game:
// - `focus`: word bank categories to practise ([] = every everyday topic;
//   hobby topics in `optIn` groups only when picked, see applyPreferences).
// - `difficulty`: "any", "easy", "normal" or "hard".
// - `typeColors`: colour words by their word type (src/lib/wordTypes.js).
// - `typeHelp`: show word types by themselves on easy sentences the learner
//   has found hard lately.
// - `pathCollapsed`: the My path card on Home shows only the current step.
// All are optional. Games pass their word bank items through
// applyPreferences(); when too few items match, a preference is ignored for
// that pool so no game runs out of questions.

import { getContent } from "./content";

const STORAGE_KEY = "lingoPreferences";

// Categories of the word bank groups marked `optIn` (hobbies, special fields).
export function optInCategories() {
  const groups = getContent()?.categoryGroups || [];
  return groups.filter((g) => g?.optIn === true).flatMap((g) => (Array.isArray(g.categories) ? g.categories : []));
}

export const DIFFICULTIES = ["any", "easy", "normal", "hard"];
const DEFAULTS = { focus: [], difficulty: "any", typeColors: false, typeHelp: true, pathCollapsed: false };

// A pool smaller than this ignores the preference that shrank it.
export const MIN_POOL = 6;

// Item levels (1-3) each difficulty draws from.
const LEVELS = { easy: [1], normal: [1, 2], hard: [2, 3] };

let current = read();
const listeners = new Set();

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      focus: Array.isArray(stored?.focus) ? stored.focus.filter((c) => typeof c === "string") : [],
      difficulty: DIFFICULTIES.includes(stored?.difficulty) ? stored.difficulty : "any",
      typeColors: typeof stored?.typeColors === "boolean" ? stored.typeColors : DEFAULTS.typeColors,
      typeHelp: typeof stored?.typeHelp === "boolean" ? stored.typeHelp : DEFAULTS.typeHelp,
      pathCollapsed: typeof stored?.pathCollapsed === "boolean" ? stored.pathCollapsed : DEFAULTS.pathCollapsed,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getPreferences() {
  return current;
}

export function setPreferences(next) {
  current = { ...current, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore: preferences then last for this visit only
  }
  listeners.forEach((fn) => fn(current));
}

// Clears the focus areas and difficulty; the word-type settings stay.
export function resetPreferences() {
  setPreferences({ focus: DEFAULTS.focus, difficulty: DEFAULTS.difficulty });
}

// Calls `fn(preferences)` on every change; returns an unsubscribe function.
export function onPreferencesChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// An item's level: its own `level`, or for words without one a guess from
// the English text (short single words are easy, long phrases are hard).
export function itemLevel(item, text) {
  if (item.level) return item.level;
  const t = (text || "").trim();
  if (!t) return 1;
  const words = t.split(/\s+/).length;
  if (words === 1) return t.length <= 5 ? 1 : 2;
  return words <= 2 && t.length <= 12 ? 2 : 3;
}

// `items` narrowed to the focus areas and difficulty, each step skipped if it
// would leave fewer than `min` items. `textOf(item)` gives the English text
// used to guess a level for items without one.
//
// `optIn` lists the hobby and niche categories (word bank groups marked
// `optIn`): their items only come up when the learner picks one of them. They
// add to the mix: with only opt-in focus areas the everyday topics stay in.
export function applyPreferences(items, { prefs = current, min = MIN_POOL, textOf = () => "", optIn = optInCategories() } = {}) {
  let pool = items;
  const hidden = new Set(optIn.filter((c) => !prefs.focus.includes(c)));
  const everyday = prefs.focus.filter((c) => !optIn.includes(c));
  const cats = (i) => i.categories || [];
  const keep = everyday.length
    ? (i) => cats(i).some((c) => prefs.focus.includes(c))
    : (i) => !cats(i).every((c) => hidden.has(c)) || !cats(i).length;
  if (prefs.focus.length > 0 || hidden.size > 0) {
    const focused = pool.filter(keep);
    if (focused.length >= min) pool = focused;
  }
  const levels = LEVELS[prefs.difficulty];
  if (levels) {
    const leveled = pool.filter((i) => levels.includes(itemLevel(i, textOf(i))));
    if (leveled.length >= min) pool = leveled;
  }
  return pool;
}
