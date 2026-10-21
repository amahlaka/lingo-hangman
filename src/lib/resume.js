// Unfinished rounds, kept on this device so a back swipe, a reload or a closed
// tab doesn't lose a game. Each game page saves its round as it goes, under
// the address it was played at (path and query), and offers to continue it
// the next time that address opens; Home offers the latest one too
// (ResumeCard). A finished or restarted round removes its save.
//
// A round is saved as plain data. Questions often share objects (an option
// that is also the target, a result that holds its question), and games
// compare them by identity, so pack() keeps shared objects shared.

const KEY = "lingo.resume.v1";
// Raise when a saved round's shape changes, so older saves are dropped.
export const RESUME_VERSION = 1;
// Older rounds are dropped rather than offered.
export const RESUME_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_SAVED = 8;

// Router state for a link that continues the saved round without asking.
export const RESUME_STATE = { resume: true };

const listeners = new Set();

// fn(): a save was added, changed or removed.
export function onResumeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// value -> { root, nodes }: every object and array becomes one node, and a
// field holding one is { $ref: n }. Throws on anything that isn't plain data
// (a function, a React element, a Date), so such a round is just not saved.
export function pack(value) {
  const ids = new Map();
  const nodes = [];
  const walk = (v) => {
    if (typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") throw new Error("not data");
    if (v === null || typeof v !== "object") return v;
    if (ids.has(v)) return { $ref: ids.get(v) };
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) throw new Error("not plain data");
    const id = nodes.length;
    ids.set(v, id);
    nodes.push(null);
    nodes[id] = Array.isArray(v)
      ? v.map((x) => (x === undefined ? null : walk(x)))
      : Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, walk(x)]));
    return { $ref: id };
  };
  return { root: walk(value), nodes };
}

// The other way: inside a node every object is a reference, so plain values
// (a field that happens to be called $ref included) come back as they were.
// Keys that would reach an object's prototype are never copied back.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function unpack({ root, nodes }) {
  const made = nodes.map((n) => (Array.isArray(n) ? [] : {}));
  const get = (x) => (x !== null && typeof x === "object" ? made[x.$ref] : x);
  nodes.forEach((n, i) => {
    if (Array.isArray(n)) n.forEach((x) => made[i].push(get(x)));
    else {
      Object.entries(n)
        .filter(([k]) => !UNSAFE_KEYS.has(k))
        .forEach(([k, x]) => Object.defineProperty(made[i], k, { value: get(x), enumerable: true, writable: true, configurable: true }));
    }
  });
  return get(root);
}

function readAll() {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}");
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  try {
    if (Object.keys(all).length) localStorage.setItem(KEY, JSON.stringify(all));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full or blocked: the round just can't be continued later.
  }
  listeners.forEach((fn) => fn());
}

function fresh(entry, now) {
  return entry && entry.v === RESUME_VERSION && now - (entry.at || 0) < RESUME_MAX_AGE_MS;
}

// Saves a round played at `address` ("/meaning?rounds=5"). `meta` says what
// Home shows: { gameId, n, total } (question n of total, counted from 1), or
// for Word rush { gameId, n, left } (answered, seconds left).
// Returns false when the round isn't plain data.
export function saveRound(address, meta, data, now = Date.now()) {
  let packed;
  try {
    packed = pack(data);
  } catch {
    return false;
  }
  const all = readAll();
  all[address] = { ...meta, v: RESUME_VERSION, at: now, data: packed };
  // Keep the newest few; a round nobody came back to goes first.
  Object.keys(all)
    .filter((k) => !fresh(all[k], now))
    .forEach((k) => delete all[k]);
  Object.entries(all)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(MAX_SAVED)
    .forEach(([k]) => delete all[k]);
  writeAll(all);
  return true;
}

// The round saved at `address`, or null: { ...meta, at, data }.
export function loadRound(address, now = Date.now()) {
  const entry = readAll()[address];
  if (!fresh(entry, now)) return null;
  try {
    const { v, data, ...meta } = entry;
    return { ...meta, data: unpack(data) };
  } catch {
    return null;
  }
}

export function clearRound(address) {
  const all = readAll();
  if (!(address in all)) return;
  delete all[address];
  writeAll(all);
}

// The most recently saved round, for Home: { address, ...meta, at }.
export function latestRound(now = Date.now()) {
  const [address, entry] =
    Object.entries(readAll())
      .filter(([, e]) => fresh(e, now))
      .sort(([, a], [, b]) => b.at - a.at)[0] || [];
  if (!address) return null;
  const { v, data, ...meta } = entry;
  return { address, ...meta };
}
