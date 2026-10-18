// This device's copy of the settings and records that follow a signed-in
// learner (src/lib/accountSettings.js). Each is still kept where it always
// was in localStorage; this module reads and writes them by their synced
// name, so ProgressProvider can send changes and take in the account's.
//
// The places that change one call localChanged(key); ProgressProvider
// listens (onLocalChange) and sends it while signed in. When the account's
// values arrive, writeLocal() stores the ones that differ and tells the
// places that keep a copy in memory (onRemoteChange).

import { DEFAULT_VOICE } from "./speechClips.js";
import { RECORDS, SETTINGS } from "./accountSettings.js";

// Storage keys, kept in step with the modules named.
const LANG_KEY = "lingoHangmanLang"; // src/app/SettingsContext.jsx
const THEME_KEY = "theme";
const SOUND_KEY = "lingoSound";
const VOICE_KEY = "lingoVoice";
const PREFS_KEY = "lingoPreferences"; // src/lib/preferences.js
const TOPICS_KEY = "lingo.gapTopics.v1"; // src/games/practice/topicChoice.js
const RUSH_KEY = "lingoRushBest"; // src/games/rush/rushLogic.js
const SAY_RIGHT_KEY = "lingoSayRightBest"; // src/games/say-right/sayRightLogic.js
const SOUNDS_KEY = "lingoSayRightSounds";
const DAILY_KEY = "lingoDaily"; // src/games/daily/dailyLogic.js

const PREFERENCE_DEFAULTS = { focus: [], difficulty: "any", typeColors: false, typeHelp: true, pathCollapsed: false };

const localListeners = new Set();
const remoteListeners = new Set();

// A synced setting or record changed on this device.
export function localChanged(key) {
  localListeners.forEach((fn) => fn(key));
}

export function onLocalChange(fn) {
  localListeners.add(fn);
  return () => localListeners.delete(fn);
}

// fn(keys): the account's values replaced these on this device.
export function onRemoteChange(fn) {
  remoteListeners.add(fn);
  return () => remoteListeners.delete(fn);
}

function get(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(storage, key, value) {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // private mode: the value then lasts for this visit only
  }
}

function json(storage, key) {
  try {
    const v = JSON.parse(get(storage, key) || "null");
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const number = (raw) => (raw !== null && Number(raw) > 0 ? Number(raw) : undefined);

// The Daily word record of the last day finished on this device.
function readDaily(storage) {
  const d = json(storage, DAILY_KEY);
  const day = d?.finishedDay || (d?.recorded ? d.day : null);
  if (!day) return undefined;
  const out = { day, played: d.played, won: d.won, streak: d.streak, bestStreak: d.bestStreak, lastWon: d.lastWon };
  if (d.day === day && d.word) Object.assign(out, { word: d.word, guesses: d.guesses });
  return out;
}

function writeDaily(storage, v) {
  const d = json(storage, DAILY_KEY) || {};
  const local = readDaily(storage);
  if (local && local.day > v.day) return false;
  const next = { guesses: [], recorded: false, ...d, finishedDay: v.day };
  for (const f of ["played", "won", "streak", "bestStreak", "lastWon"]) next[f] = v[f];
  if (v.word && (!d.day || d.day <= v.day)) Object.assign(next, { day: v.day, word: v.word, guesses: v.guesses || [], recorded: true });
  set(storage, DAILY_KEY, JSON.stringify(next));
  return true;
}

// key -> { read(storage, explicit), write(storage, value) }. read gives the
// value in use (with its default) or, with `explicit`, only one the learner set.
const PLACES = {
  lang: {
    read: (s) => get(s, LANG_KEY) ?? undefined,
    write: (s, v) => set(s, LANG_KEY, v),
  },
  theme: {
    read: (s, explicit) => get(s, THEME_KEY) ?? (explicit ? undefined : "system"),
    write: (s, v) => set(s, THEME_KEY, v === "system" ? null : v),
  },
  sound: {
    read: (s, explicit) => (get(s, SOUND_KEY) === "off" ? false : explicit ? undefined : true),
    write: (s, v) => set(s, SOUND_KEY, v ? null : "off"),
  },
  voice: {
    read: (s, explicit) => get(s, VOICE_KEY) ?? (explicit ? undefined : DEFAULT_VOICE),
    write: (s, v) => set(s, VOICE_KEY, v === DEFAULT_VOICE ? null : v),
  },
  topics: {
    read: (s, explicit) => json(s, TOPICS_KEY) ?? (explicit ? undefined : {}),
    write: (s, v) => set(s, TOPICS_KEY, JSON.stringify(v)),
  },
  rushBest: { read: (s) => number(get(s, RUSH_KEY)), write: (s, v) => set(s, RUSH_KEY, String(v)) },
  sayRightBest: { read: (s) => number(get(s, SAY_RIGHT_KEY)), write: (s, v) => set(s, SAY_RIGHT_KEY, String(v)) },
  sayRightReadBest: {
    read: (s) => number(get(s, `${SAY_RIGHT_KEY}Read`)),
    write: (s, v) => set(s, `${SAY_RIGHT_KEY}Read`, String(v)),
  },
  sayRightSounds: {
    read: (s) => json(s, SOUNDS_KEY) ?? undefined,
    write: (s, v) => set(s, SOUNDS_KEY, JSON.stringify(v)),
  },
  daily: { read: readDaily, write: writeDaily },
};
for (const key of Object.keys(PREFERENCE_DEFAULTS)) {
  PLACES[key] = {
    read: (s, explicit) => json(s, PREFS_KEY)?.[key] ?? (explicit ? undefined : PREFERENCE_DEFAULTS[key]),
    write: (s, v) => set(s, PREFS_KEY, JSON.stringify({ ...PREFERENCE_DEFAULTS, ...json(s, PREFS_KEY), [key]: v })),
  };
}

export const isSetting = (key) => Object.hasOwn(SETTINGS, key);
export const isRecord = (key) => Object.hasOwn(RECORDS, key);

// The value this device uses now, or undefined when it has none.
export function readLocal(key, storage = globalThis.localStorage) {
  return PLACES[key]?.read(storage, false);
}

// What the learner has set or played on this device: { settings, records }.
export function explicitLocal(storage = globalThis.localStorage) {
  const out = { settings: {}, records: {} };
  for (const [key, place] of Object.entries(PLACES)) {
    const value = place.read(storage, true);
    if (value !== undefined) out[isSetting(key) ? "settings" : "records"][key] = value;
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Store the account's settings and records where they differ from this
// device's. Returns the keys changed.
export function writeLocal({ settings = {}, records = {} }, storage = globalThis.localStorage) {
  const changed = [];
  for (const [key, value] of Object.entries({ ...settings, ...records })) {
    const place = PLACES[key];
    if (!place || same(place.read(storage, false), value)) continue;
    if (place.write(storage, value) !== false) changed.push(key);
  }
  if (changed.length) remoteListeners.forEach((fn) => fn(changed));
  return changed;
}
