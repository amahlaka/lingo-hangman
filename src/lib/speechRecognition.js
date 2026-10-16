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

// Phones switch audio to "call" mode (quiet, from the earpiece) while the
// microphone is in use, and only switch back a moment after it is let go.
// Playback waits this long after listening ends (see afterListening).
const RELEASE_MS = 400;
let lastEnded = 0;
let listening = 0;

// The language recognition listens in. All English is listened to as US
// English, the variant the app teaches.
export function recognitionLang(code = "en") {
  return /^en(-|$)/i.test(code) ? "en-US" : speechLang(code);
}

// Safari's Audio Session API: "play-and-record" while listening, then back to
// "playback" so speech and sounds use the loudspeaker again. Elsewhere a no-op.
function setAudioSession(type) {
  try {
    const session = typeof navigator !== "undefined" ? navigator.audioSession : null;
    if (session && "type" in session) session.type = type;
  } catch {
    // not supported here
  }
}

// Resolves once the microphone has had time to be let go, so playback that
// follows listening isn't routed to the earpiece. Resolves at once when
// nothing was listening lately.
export function afterListening() {
  const wait = listening ? RELEASE_MS : lastEnded + RELEASE_MS - Date.now();
  return wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve();
}

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
    return await Ctor.available({ langs: [recognitionLang(lang)], processLocally: true });
  } catch {
    return "unknown";
  }
}

// Download the on-device language pack. Resolves true when it is ready.
export async function installOnDevice(lang) {
  const Ctor = recognitionCtor();
  if (!Ctor || typeof Ctor.install !== "function") return false;
  try {
    return Boolean(await Ctor.install({ langs: [recognitionLang(lang)], processLocally: true }));
  } catch {
    return false;
  }
}

// Listen for one utterance. Returns { done, stop }: `done` resolves to
// { alternatives: [text…], error } once the browser stops listening, where
// error is the browser's code ("no-speech", "not-allowed", "audio-capture" …)
// or null. `stop` ends listening early and keeps what was heard; `abort`
// throws it away.
export function listenOnce({ lang = "en", onDevice = false, onSound } = {}) {
  const Ctor = recognitionCtor();
  if (!Ctor) return { done: Promise.resolve({ alternatives: [], error: "unsupported" }), stop() {}, abort() {} };

  const rec = new Ctor();
  rec.lang = recognitionLang(lang);
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  if (onDevice) rec.processLocally = true;

  let alternatives = [];
  let error = null;
  let timer = null;
  let released = false;
  // Let go of the microphone completely: some browsers keep it open after a
  // result until the recogniser is aborted, which leaves the phone in call
  // audio and makes the next playback quiet and earpiece-only.
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    listening = Math.max(0, listening - 1);
    lastEnded = Date.now();
    rec.onresult = null;
    rec.onerror = null;
    rec.onsoundstart = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      // already stopped
    }
    if (!listening) setAudioSession("playback");
  };
  let settle = () => {};
  const done = new Promise((resolve) => {
    settle = resolve;
    rec.onresult = (event) => {
      const results = Array.from(event.results || []);
      const last = results[results.length - 1];
      if (last) alternatives = Array.from(last).map((a) => a.transcript).filter(Boolean);
    };
    rec.onerror = (event) => {
      error = event.error || "unknown";
    };
    rec.onsoundstart = () => onSound && onSound();
    rec.onend = () => {
      const heard = { alternatives, error: alternatives.length ? null : error };
      release();
      resolve(heard);
    };
  });

  listening += 1;
  setAudioSession("play-and-record");
  try {
    rec.start();
    timer = setTimeout(() => rec.stop(), LISTEN_TIMEOUT_MS);
  } catch {
    release();
    return { done: Promise.resolve({ alternatives: [], error: "start-failed" }), stop() {}, abort() {} };
  }
  return {
    done,
    stop: () => rec.stop(),
    abort: () => {
      release();
      settle({ alternatives: [], error: "aborted" });
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
