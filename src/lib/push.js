// Reminders by web push (docs/backend.md, "Reminders"): this device's push
// subscription and the learner's reminder settings, kept by the backend.
// Signed-in learners only; everything fails soft like the rest of the API.

import { api, backendAvailable } from "./backend";

export const DEFAULT_REMINDER_TIME = "18:00";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// iPhone and iPad only allow push for apps added to the Home Screen.
export function needsHomeScreen() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  return ios && !standalone;
}

export const permission = () => (pushSupported() ? Notification.permission : "unsupported");

export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Helsinki";
  } catch {
    return "Europe/Helsinki";
  }
}

function keyBytes(base64url) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function sameKey(subscription, bytes) {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
}

async function registration() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error("no service worker")), 10000)),
  ]);
}

async function browserSubscription() {
  if (!pushSupported()) return null;
  try {
    return await (await registration()).pushManager.getSubscription();
  } catch {
    return null;
  }
}

const send = (sub) => {
  const { endpoint, keys } = sub.toJSON();
  return api("/push/subscribe", { method: "POST", body: { endpoint, keys } });
};

// Asks the browser for permission (only call from a tap) and subscribes this
// device. Resolves to { ok, view } or { ok: false, error }.
export async function subscribeDevice(publicKey) {
  if (!pushSupported()) return { ok: false, error: "unsupported" };
  const asked = await Notification.requestPermission();
  if (asked !== "granted") return { ok: false, error: asked === "denied" ? "denied" : "dismissed" };
  try {
    const reg = await registration();
    const key = keyBytes(publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub = sub || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    const res = await send(sub);
    return res.ok ? { ok: true, view: res.data } : { ok: false, error: res.data?.error || "offline" };
  } catch {
    return { ok: false, error: "subscribe_failed" };
  }
}

// This device stops getting reminders; the others keep them.
export async function unsubscribeDevice() {
  const res = await api("/push/subscribe", { method: "DELETE", body: {} });
  await forgetDevice();
  return res;
}

// After signing out: the server already dropped this device's subscription.
export async function forgetDevice() {
  try {
    await (await browserSubscription())?.unsubscribe();
  } catch {
    // nothing to undo
  }
}

export async function saveReminders(changes) {
  return api("/push/settings", { method: "PUT", body: changes });
}

// Turns reminders on and subscribes this device in one go.
export async function enableReminders({ publicKey, time = DEFAULT_REMINDER_TIME, lang }) {
  const sub = await subscribeDevice(publicKey);
  if (!sub.ok) return sub;
  const res = await saveReminders({ enabled: true, time, timeZone: localTimeZone(), lang });
  return res.ok ? { ok: true, view: res.data } : { ok: false, error: res.data?.error || "offline" };
}

// At start, signed in: send this device's subscription again (browsers
// replace them now and then) and follow the learner to a new time zone.
export async function refreshReminders() {
  if (permission() !== "granted") return;
  const sub = await browserSubscription();
  if (!sub || !(await backendAvailable())) return;
  const res = await send(sub);
  const tz = localTimeZone();
  if (res.ok && res.data.enabled && res.data.timeZone !== tz) await saveReminders({ timeZone: tz });
}
