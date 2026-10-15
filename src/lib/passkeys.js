// Passkey sign-in and registration in the browser, around
// @simplewebauthn/browser. The server side is server/src/routes/auth.js and
// account.js.

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "./backend";

export const passkeysSupported = () => {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
};

// The learner closed the browser's passkey dialog (or it timed out).
const cancelled = (err) => err?.name === "NotAllowedError" || err?.name === "AbortError";

// { ok } or { error }: "cancelled", a server error code, or "offline".
export async function signInWithPasskey() {
  const start = await api("/auth/passkey/options", { method: "POST" });
  if (!start.ok) return { error: start.data?.error || "offline" };
  let response;
  try {
    response = await startAuthentication({ optionsJSON: start.data.options });
  } catch (err) {
    return { error: cancelled(err) ? "cancelled" : "passkey_failed" };
  }
  const done = await api("/auth/passkey/verify", { method: "POST", body: { challengeId: start.data.challengeId, response } });
  return done.ok ? { ok: true } : { error: done.data?.error || "offline" };
}

export async function addPasskey() {
  const start = await api("/me/passkeys/options", { method: "POST" });
  if (!start.ok) return { error: start.data?.error || "offline" };
  let response;
  try {
    response = await startRegistration({ optionsJSON: start.data.options });
  } catch (err) {
    if (err?.name === "InvalidStateError") return { error: "passkey_exists" };
    return { error: cancelled(err) ? "cancelled" : "passkey_failed" };
  }
  const done = await api("/me/passkeys", { method: "POST", body: { response } });
  return done.ok ? { ok: true, passkey: done.data } : { error: done.data?.error || "offline" };
}
