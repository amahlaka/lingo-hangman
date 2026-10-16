// On-demand speech from the optional backend (POST /api/tts, docs/backend.md):
// English without a recorded clip is made with the same voice for signed-in
// learners, within a daily limit. Off when the API, the TTS service or the
// account is missing; src/lib/speech.js then uses the browser voice.

import { api, backendAvailable } from "./backend";
import { setOnDemandSpeech } from "./speech";

// { blob, left, error }: the clip, how many new ones are left today, or why
// there is none ("tts_limit", "tts_busy", "signed_out", "network", ...).
export async function fetchSpeech(text, voice) {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Lingo": "1" },
      body: JSON.stringify({ text, voice }),
      credentials: "same-origin",
    });
    const left = res.headers.get("X-TTS-Left");
    if (res.ok) return { blob: await res.blob(), left: left === null ? null : Number(left), error: null };
    let error = "failed";
    try {
      const data = await res.json();
      error = data.error || error;
      if (res.status === 401 || error === "tts_unavailable") setOnDemandSpeech(null);
      return { blob: null, left: typeof data.left === "number" ? data.left : null, error };
    } catch {
      return { blob: null, left: null, error };
    }
  } catch {
    return { blob: null, left: null, error: "network" };
  }
}

// The learner's speech allowance ({ available, tier, limit, used, left,
// requested }), or null when signed out or the API is unreachable.
export async function speechStatus() {
  if (!(await backendAvailable())) return null;
  const res = await api("/tts/status");
  return res.ok ? res.data : null;
}

// Turns on-demand speech on when the account can use it, else off. Called at
// start and after signing in or out.
export async function refreshOnDemandSpeech() {
  const status = await speechStatus();
  setOnDemandSpeech(status?.available ? fetchSpeech : null);
  return status;
}

export async function askForMoreSpeech() {
  const res = await api("/tts/request", { method: "POST" });
  return res.ok ? res.data : null;
}
