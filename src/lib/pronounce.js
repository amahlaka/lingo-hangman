// Pronunciation scoring from the optional backend (server/src/routes/pronounce.js):
// a recorded clip goes to POST /api/pronounce and comes back as the IPA sounds
// the recogniser heard. Verified learners and admins only.

import { api, backendAvailable } from "./backend";

// { available, allowed, limit, left, requested }, or { signedOut: true } when
// there is no account on this device, or { offline: true } without the API.
export async function pronounceStatus() {
  if (!(await backendAvailable())) return { offline: true };
  const res = await api("/pronounce/status");
  if (res.status === 401) return { signedOut: true };
  return res.ok ? res.data : { offline: true };
}

// Puts the learner on the admin's list of learners asking to be verified.
export async function askToBeVerified() {
  const res = await api("/pronounce/request", { method: "POST" });
  return res.ok ? res.data : null;
}

// { phones, left } or { error } ("not_verified", "pronounce_limit",
// "pronounce_busy", "pronounce_queue_full", "bad_audio", "network", ...).
export async function scoreClip(wav) {
  try {
    const res = await fetch("/api/pronounce", {
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
    if (res.ok && typeof data?.phones === "string") return { phones: data.phones, left: data.left ?? null };
    return { error: data?.error || (res.status === 401 ? "signed_out" : "failed") };
  } catch {
    return { error: "network" };
  }
}
