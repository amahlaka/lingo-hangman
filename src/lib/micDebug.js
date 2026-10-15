// Microphone debug mode for "Say it": a settings toggle (Practice settings)
// that shows a panel under the game with the input level, the recogniser's
// events and results, and manual overrides for how and in which language the
// browser listens. Off by default; normal play never sees it.
//
// - `on`: show the panel.
// - `detection`: "auto" (normal rule: on-device when it works, else online),
//   "local" (on-device only, no fallback), "online" (browser's online
//   service) or "self" (the "I said it" self check).
// - `lang`: "auto" (the word list's language) or a speech language tag;
//   "browser" uses the browser's own language.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "lingoMicDebug";
export const DETECTIONS = ["auto", "local", "online", "self"];
export const DEBUG_LANGS = ["auto", "browser", "en-GB", "en-US", "fi-FI"];
const DEFAULTS = { on: false, detection: "auto", lang: "auto" };

let current = read();
const listeners = new Set();

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      on: stored?.on === true,
      detection: DETECTIONS.includes(stored?.detection) ? stored.detection : DEFAULTS.detection,
      lang: typeof stored?.lang === "string" && stored.lang ? stored.lang : DEFAULTS.lang,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getMicDebug() {
  return current;
}

export function setMicDebug(next) {
  current = { ...current, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore: then it lasts for this visit only
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useMicDebug() {
  return useSyncExternalStore(subscribe, getMicDebug, getMicDebug);
}

// The speech language tag to listen in, given the word list's language.
export function debugListenLang(settings, learningLang) {
  if (!settings.on || settings.lang === "auto") return learningLang;
  if (settings.lang === "browser") return (typeof navigator !== "undefined" && navigator.language) || learningLang;
  return settings.lang;
}

// The recogniser's events while debug mode is on, for the panel's log.
const eventListeners = new Set();

export function logMicEvent(type, detail) {
  const event = { type, detail, at: Date.now() };
  eventListeners.forEach((fn) => fn(event));
}

export function onMicEvent(fn) {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}
