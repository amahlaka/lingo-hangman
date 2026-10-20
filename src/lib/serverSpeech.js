// Lingo's own speech-to-text for "Say it", for verified learners who turn it
// on in Practice settings: the clip is recorded here (src/lib/micRecorder.js),
// the API passes it to the Whistle recogniser on Lingo's server
// (server/src/routes/transcribe.js) and answers the words it heard. Nothing
// is kept. The choice is this device's own, like the microphone.

import { api, backendAvailable } from "./backend";
import { canRecord } from "./micRecorder";

const STORAGE_KEY = "lingoServerSpeech";
const listeners = new Set();

export function serverSpeechOn() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setServerSpeech(on) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode: lasts for this visit only
  }
  status = null;
  listeners.forEach((fn) => fn(on));
}

export function onServerSpeechChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// { available, allowed, limit, left }, or { signedOut: true } / { offline: true }.
// Asked once a visit (again after the setting changes).
let status = null;
export function transcribeStatus() {
  if (!status) {
    status = (async () => {
      if (!(await backendAvailable())) return { offline: true };
      const res = await api("/transcribe/status");
      if (res.status === 401) return { signedOut: true };
      return res.ok ? res.data : { offline: true };
    })();
    status.then((s) => {
      if (s.offline) status = null;
    });
  }
  return status;
}

// Whether Say it should send clips to Lingo's recogniser now.
export async function serverSpeechReady() {
  if (!serverSpeechOn() || !canRecord()) return false;
  const s = await transcribeStatus();
  return Boolean(s.available && s.allowed);
}

// { text, left } or { error } ("not_verified", "transcribe_limit",
// "transcribe_busy", "transcribe_queue_full", "bad_audio", "network", ...).
export async function transcribeClip(wav) {
  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "audio/wav", Accept: "application/json", "X-Lingo": "1" },
      body: wav,
      credentials: "same-origin",
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      // empty
    }
    if (res.ok && typeof data?.text === "string") return { text: data.text, left: data.left ?? null };
    return { error: data?.error || (res.status === 401 ? "signed_out" : "failed") };
  } catch {
    return { error: "network" };
  }
}

// Test hook: forget the cached status.
export function resetTranscribeStatus() {
  status = null;
}
