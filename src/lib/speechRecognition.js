// Thin wrapper over the browser's speech recognition (Web Speech API), used by
// "Say it". Lingo never records, uploads or stores audio itself: the browser
// turns speech into text and we only look at that text.
//
// Where the browser can recognise speech on the device (newer Chrome and Edge),
// we ask it to. Otherwise the browser uses its own online speech service, and
// the game says so next to the microphone.

import { speechLang } from "./speech";

// Give up on one attempt after this long, in case the browser never ends it.
const LISTEN_TIMEOUT_MS = 10000;

export function recognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function canRecognise() {
  return Boolean(recognitionCtor());
}

// "available": the browser can recognise this language on the device now.
// "downloadable" / "downloading": it can after downloading a language pack.
// "unavailable": only its online service can. "unknown": the browser can't say.
export async function onDeviceStatus(lang) {
  const Ctor = recognitionCtor();
  if (!Ctor || typeof Ctor.available !== "function") return "unknown";
  try {
    return await Ctor.available({ langs: [speechLang(lang)], processLocally: true });
  } catch {
    return "unknown";
  }
}

// Download the on-device language pack. Resolves true when it is ready.
export async function installOnDevice(lang) {
  const Ctor = recognitionCtor();
  if (!Ctor || typeof Ctor.install !== "function") return false;
  try {
    return Boolean(await Ctor.install({ langs: [speechLang(lang)], processLocally: true }));
  } catch {
    return false;
  }
}

// Listen for one utterance. Returns { done, stop }: `done` resolves to
// { alternatives: [text…], error } once the browser stops listening, where
// error is the browser's code ("no-speech", "not-allowed", "audio-capture" …)
// or null. `stop` ends listening early and keeps what was heard; `abort`
// throws it away. `onEvent(type, detail)`, used by the mic debug panel,
// hears every recogniser event.
export function listenOnce({ lang = "en-GB", onDevice = false, onSound, onEvent } = {}) {
  const Ctor = recognitionCtor();
  const log = (type, detail) => onEvent && onEvent(type, detail);
  if (!Ctor) return { done: Promise.resolve({ alternatives: [], error: "unsupported" }), stop() {}, abort() {} };

  const rec = new Ctor();
  rec.lang = speechLang(lang);
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  if (onDevice) rec.processLocally = true;

  let alternatives = [];
  let error = null;
  let timer = null;
  const done = new Promise((resolve) => {
    rec.onresult = (event) => {
      const results = Array.from(event.results || []);
      const last = results[results.length - 1];
      if (last) alternatives = Array.from(last).map((a) => a.transcript).filter(Boolean);
      if (last) log("result", { alternatives: Array.from(last).map((a) => ({ transcript: a.transcript, confidence: a.confidence })) });
    };
    rec.onerror = (event) => {
      error = event.error || "unknown";
      log("error", { error, message: event.message || "" });
    };
    rec.onsoundstart = () => {
      log("soundstart");
      if (onSound) onSound();
    };
    if (onEvent) {
      ["audiostart", "speechstart", "speechend", "soundend", "audioend", "nomatch"].forEach((type) => {
        rec[`on${type}`] = () => log(type);
      });
    }
    rec.onend = () => {
      clearTimeout(timer);
      log("end", { alternatives, error: alternatives.length ? null : error });
      resolve({ alternatives, error: alternatives.length ? null : error });
    };
  });

  try {
    log("start", { lang: rec.lang, onDevice });
    rec.start();
    timer = setTimeout(() => {
      log("timeout");
      rec.stop();
    }, LISTEN_TIMEOUT_MS);
  } catch (e) {
    log("error", { error: "start-failed", message: e?.message || "" });
    return { done: Promise.resolve({ alternatives: [], error: "start-failed" }), stop() {}, abort() {} };
  }
  return {
    done,
    stop: () => rec.stop(),
    abort: () => {
      clearTimeout(timer);
      rec.onresult = null;
      rec.abort();
    },
  };
}

// Errors that mean the microphone can't be used at all here, as opposed to
// one attempt that didn't catch anything.
export function isBlockingError(error) {
  return ["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported", "unsupported", "start-failed"].includes(error);
}

// Errors from an on-device attempt that the browser's online service may not
// have: the language pack or on-device service isn't really usable after all.
// Microphone errors are left out, as online recognition needs the mic too.
export function isOnDeviceFailure(error) {
  return ["language-not-supported", "service-not-allowed", "network", "start-failed", "unknown"].includes(error);
}
