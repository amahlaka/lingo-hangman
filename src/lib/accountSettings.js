// Settings and game records that follow a signed-in learner to every device
// (docs/backend.md, "Progress sync"). They live in the progress state as
// `settings` and `records`, changed by `setting` and `record` events
// (src/lib/syncEvents.js), so the app and the API fold them the same way.
// The app keeps its own copy in localStorage (src/lib/localSettings.js).
//
// settings: the last change wins, per setting.
//   lang, theme, sound, voice                  (src/app/SettingsContext.jsx)
//   focus, difficulty, typeColors, typeHelp,
//   pathCollapsed                              (src/lib/preferences.js)
//   topics  { [gameId]: [topic ids] }          (src/games/practice/topicChoice.js)
// records: each has its own rule, see RECORDS.
//   rushBest, sayRightBest, sayRightReadBest   the best score wins
//   sayRightSounds  { [sound]: { seen, missed } } the last change wins
//   daily   the Daily word record of the latest day played wins
//
// Only imports speechClips.js, which the API's image copies too.

import { VOICES } from "./speechClips.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_:.-]{1,80}$/;
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const bool = (v) => (typeof v === "boolean" ? v : undefined);
const oneOf = (list) => (v) => (list.includes(v) ? v : undefined);
const ids = (max) => (v) =>
  Array.isArray(v) && v.length <= max && v.every((id) => typeof id === "string" && ID_RE.test(id)) ? v : undefined;
const score = (v) => (Number.isFinite(v) && v > 0 && v <= 100000 ? Math.round(v) : undefined);
const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 100000 ? v : 0);

function topics(v) {
  if (!isObj(v)) return undefined;
  const entries = Object.entries(v);
  if (entries.length > 40) return undefined;
  const out = {};
  for (const [game, list] of entries) {
    if (!ID_RE.test(game) || !ids(100)(list)) return undefined;
    out[game] = list;
  }
  return out;
}

// Setting -> cleaner: the value as stored, or undefined when invalid.
export const SETTINGS = {
  lang: oneOf(["en", "fi"]),
  theme: oneOf(["light", "dark", "system"]),
  sound: bool,
  voice: oneOf(VOICES.map((v) => v.id)),
  focus: ids(200),
  difficulty: oneOf(["any", "easy", "normal", "hard"]),
  typeColors: bool,
  typeHelp: bool,
  pathCollapsed: bool,
  topics,
};

const SYMBOL = /^[^\s/[\]]{1,4}$/u;
function sounds(v) {
  if (!isObj(v)) return undefined;
  const out = {};
  for (const [symbol, c] of Object.entries(v).slice(0, 120)) {
    if (!SYMBOL.test(symbol) || !isObj(c)) continue;
    const seen = Number(c.seen);
    const missed = Number(c.missed);
    if (!Number.isFinite(seen) || !Number.isFinite(missed) || seen < 0 || missed < 0 || seen > 1e5) continue;
    out[symbol] = { seen: Math.round(seen * 1000) / 1000, missed: Math.round(Math.min(missed, seen) * 1000) / 1000 };
  }
  return out;
}

const WORD_RE = /^[A-Z]{5}$/;
function daily(v) {
  if (!isObj(v) || !DAY_RE.test(v.day || "")) return undefined;
  const out = {
    day: v.day,
    played: count(v.played),
    won: count(v.won),
    streak: count(v.streak),
    bestStreak: count(v.bestStreak),
    lastWon: DAY_RE.test(v.lastWon || "") ? v.lastWon : null,
  };
  // That day's word and guesses, so another device shows the finished board.
  if (isObj(v.word) && WORD_RE.test(v.word.word || "") && typeof v.word.id === "string" && v.word.id.length <= 80) {
    out.word = {
      id: v.word.id,
      word: v.word.word,
      fi: typeof v.word.fi === "string" ? v.word.fi.slice(0, 200) : "",
      ipa: typeof v.word.ipa === "string" ? v.word.ipa.slice(0, 80) : "",
    };
    out.guesses = Array.isArray(v.guesses) ? v.guesses.filter((g) => typeof g === "string" && WORD_RE.test(g)).slice(0, 6) : [];
  }
  return out;
}

const higher = (current, next) => (current !== undefined && current >= next ? current : next);

// Record -> { clean, merge(current, next) }: merge gives the stored value.
export const RECORDS = {
  rushBest: { clean: score, merge: higher },
  sayRightBest: { clean: score, merge: higher },
  sayRightReadBest: { clean: score, merge: higher },
  sayRightSounds: { clean: sounds, merge: (current, next) => next },
  // The same day from two devices: the first one folded in counts.
  daily: { clean: daily, merge: (current, next) => (current && current.day >= next.day ? current : next) },
};

// A `setting` / `record` event payload as stored, or null when invalid.
export function cleanSettingPayload(p) {
  if (!isObj(p) || !Object.hasOwn(SETTINGS, p.key || "")) return null;
  const value = SETTINGS[p.key](p.value);
  return value === undefined ? null : { key: p.key, value };
}

export function cleanRecordPayload(p) {
  if (!isObj(p) || !Object.hasOwn(RECORDS, p.key || "")) return null;
  const value = RECORDS[p.key].clean(p.value);
  return value === undefined ? null : { key: p.key, value };
}

// (A state cached by the API before these existed has neither field.)
export function applySetting(state, { key, value }) {
  return { ...state, settings: { ...state.settings, [key]: value } };
}

export function applyRecord(state, { key, value }) {
  const current = state.records?.[key];
  const merged = RECORDS[key].merge(current, value);
  return merged === current ? state : { ...state, records: { ...state.records, [key]: merged } };
}

// Only known, valid settings and records (loading a saved state).
export function cleanSettings(v) {
  const out = {};
  for (const [key, value] of Object.entries(isObj(v) ? v : {})) {
    const p = cleanSettingPayload({ key, value });
    if (p) out[key] = p.value;
  }
  return out;
}

export function cleanRecords(v) {
  const out = {};
  for (const [key, value] of Object.entries(isObj(v) ? v : {})) {
    const p = cleanRecordPayload({ key, value });
    if (p) out[key] = p.value;
  }
  return out;
}

// Two learners' settings and records combined (mergeProgress): `newer`'s
// settings win; records follow their own rules.
export function mergeSettings(older, newer) {
  return { ...older, ...newer };
}

export function mergeRecords(a, b) {
  let state = { records: { ...a } };
  for (const [key, value] of Object.entries(b)) state = applyRecord(state, { key, value });
  return state.records;
}
