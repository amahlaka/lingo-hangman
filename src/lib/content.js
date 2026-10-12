// The word bank the games read from: words, fill-the-gap sentences, grammar
// rules and mixed-up words, in packs downloaded into content/ from the
// amahlaka/lingo-wordbase repository (format: its README).
//
// The app starts with the copy built into it, then main.jsx asks the server for
// the newest published copy (/content/...), so words added by an admin show up
// without a new release. Items that fail the checks in ./contentSchema.js are
// skipped, so one bad entry never breaks a game.

import bundled from "./bundledContent";
import { contentContext, validateItem } from "./contentSchema";

let current;
const listeners = new Set();

// Index the raw files: { index, languages, packs } -> what the games use.
export function buildContent(raw) {
  const packs = (raw.packs || []).filter((p) => p && Array.isArray(p.items));
  const ctx = contentContext({ languages: raw.languages || [], packs });
  const order = raw.index?.packs || [];
  const rank = (p) => (order.includes(p.id) ? order.indexOf(p.id) : order.length);
  const sorted = [...packs].sort((a, b) => rank(a) - rank(b));

  const items = [];
  const skipped = [];
  const seen = new Set();
  for (const pack of sorted) {
    if (!order.includes(pack.id)) continue;
    for (const item of pack.items) {
      const problems = validateItem(item, ctx);
      if (problems.length || seen.has(item.id)) {
        skipped.push({ pack: pack.id, id: item?.id, problems: problems.length ? problems : ["duplicate id"] });
        continue;
      }
      seen.add(item.id);
      items.push({ ...item, pack: pack.id });
    }
  }
  return {
    raw,
    languages: raw.languages || [],
    categories: raw.index?.categories || {},
    packs: sorted,
    items,
    byId: new Map(items.map((i) => [i.id, i])),
    skipped,
  };
}

export function getContent() {
  return current;
}

export function setContent(raw) {
  current = buildContent(raw);
  if (current.skipped.length && typeof console !== "undefined") {
    console.warn(`Skipped ${current.skipped.length} content item(s) with problems`, current.skipped);
  }
  listeners.forEach((fn) => fn(current));
  return current;
}

// Calls fn(content) after every setContent. Returns an unsubscribe function.
export function onContentChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Fetch the published word bank and switch to it. Keeps the built-in copy when
// anything is missing, unreadable or slower than timeoutMs (e.g. offline).
// Resolves to true when the published copy is in use.
export async function loadPublishedContent({ base = "/content/", fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {}) {
  if (typeof fetchImpl !== "function") return false;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  const get = async (file) => {
    const res = await fetchImpl(`${base}${file}`, { signal: controller?.signal, cache: "no-cache" });
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    return res.json();
  };
  try {
    const [index, languages] = await Promise.all([get("index.json"), get("languages.json")]);
    const packs = await Promise.all((index.packs || []).map((id) => get(`packs/${id}.json`)));
    setContent({ index, languages, packs });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

setContent(bundled);
