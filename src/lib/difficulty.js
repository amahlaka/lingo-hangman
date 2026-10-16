// How hard each word is for learners in general, from the backend's
// statistics (/api/difficulty, docs/backend.md "Statistics"). Quick play uses
// it to spot words that trip most people up before this learner has met them.
// Kept on the device for a day; without the backend there is simply none.

import { backendAvailable } from "./backend";

export const DIFFICULTY_KEY = "lingo.difficulty.v1";
const MAX_AGE_MS = 24 * 3600_000;

let items = null;

function readStored(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(DIFFICULTY_KEY) || "null");
    return saved && typeof saved.items === "object" ? saved : null;
  } catch {
    return null;
  }
}

// { "en-GB:word": { n, firstTry, ms } } or null.
export function getDifficulty(storage = globalThis.localStorage) {
  if (!items) items = readStored(storage)?.items || null;
  return items;
}

export async function loadDifficulty(storage = globalThis.localStorage, now = Date.now()) {
  const saved = readStored(storage);
  if (saved && now - saved.fetchedAt < MAX_AGE_MS) {
    items = saved.items;
    return items;
  }
  if (!(await backendAvailable())) return getDifficulty(storage);
  try {
    const res = await fetch("/api/difficulty", { credentials: "same-origin" });
    if (!res.ok) return getDifficulty(storage);
    const data = await res.json();
    items = data.items && typeof data.items === "object" ? data.items : {};
    try {
      storage?.setItem(DIFFICULTY_KEY, JSON.stringify({ fetchedAt: now, items }));
    } catch {
      // Storage full or blocked: keep it for this visit only.
    }
  } catch {
    // offline
  }
  return getDifficulty(storage);
}

// For tests.
export function resetDifficulty() {
  items = null;
}
