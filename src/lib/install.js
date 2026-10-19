// Installing Lingo as an app (PWA, from public/manifest.json). Chrome, Edge and
// Android browsers fire `beforeinstallprompt`, which we keep so a button can
// open their own install dialog later; Safari has no such event, so there the
// app shows the steps instead. startInstallWatch() runs from main.jsx, before
// React, because the event can fire as soon as the page loads.

const INSTALLED_KEY = "lingo.installed.v1";

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

function rememberInstalled() {
  try {
    localStorage.setItem(INSTALLED_KEY, new Date().toISOString());
  } catch {
    // Storage blocked: the app just can't tell next time.
  }
}

export function startInstallWatch() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep the browser's own mini-bar away; the menu and Home hint offer it.
    e.preventDefault();
    deferred = e;
    // Offered again, so the app was removed since it was installed.
    try {
      localStorage.removeItem(INSTALLED_KEY);
    } catch {
      // Storage blocked.
    }
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    rememberInstalled();
    notify();
  });
}

// Running as the installed app, or installed earlier from this browser.
export function isInstalled() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  if (standalone) return true;
  try {
    return Boolean(localStorage.getItem(INSTALLED_KEY));
  } catch {
    return false;
  }
}

// How this browser installs the app: "prompt" (its own dialog, ready now),
// "ios" (Share > Add to Home Screen), "android" (browser menu), "mac-safari"
// (File > Add to Dock), "desktop" (Chrome or Edge, from the address bar), or
// null when installed already or not possible here (e.g. Firefox on desktop).
export function installWay() {
  if (typeof navigator === "undefined" || isInstalled()) return null;
  if (deferred) return "prompt";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Edg\/|Chrome\//.test(ua)) return "desktop";
  if (/Macintosh/.test(ua) && ua.includes("Version/") && ua.includes("Safari/")) return "mac-safari";
  return null;
}

// Opens the browser's install dialog; resolves true when the learner accepts.
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  notify();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    if (choice?.outcome === "accepted") {
      rememberInstalled();
      notify();
      return true;
    }
  } catch {
    // The dialog could not open; nothing to undo.
  }
  return false;
}

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// For tests: forget a kept prompt.
export function resetInstall() {
  deferred = null;
  notify();
}
