// The optional backend (server/, docs/backend.md), reached same-origin at
// /api. Everything here fails soft: when the API can't be reached the app
// works as before and account features stay hidden.

const HEALTH_TIMEOUT_MS = 4000;
const RETRY_AFTER_MS = 60_000;

let health = null; // { at, ok, promise }

// Whether the API answers. Cached: true for the visit, false for a minute.
export function backendAvailable() {
  const now = Date.now();
  if (health && (health.ok || now - health.at < RETRY_AFTER_MS)) return health.promise;
  // Started inside a promise, so a browser (or test) without fetch just gets false.
  const promise = Promise.resolve()
    .then(() => fetch("/api/health", { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS), credentials: "same-origin" }))
    .then(async (res) => res.ok && (await res.json()).ok === true)
    .catch(() => false)
    .then((ok) => {
      health = { at: Date.now(), ok, promise };
      return ok;
    });
  health = { at: now, ok: false, promise };
  return promise;
}

// For tests.
export function resetBackendCache() {
  health = null;
}

// Calls the API. Resolves to { ok, status, data }; status 0 means the API
// could not be reached. Writes send the header the API requires of the app.
// keepalive lets a call made as the page closes still go out.
export async function api(path, { method = "GET", body, keepalive = false } = {}) {
  const headers = { Accept: "application/json" };
  if (method !== "GET") headers["X-Lingo"] = "1";
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      ...(keepalive ? { keepalive: true } : {}),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      // empty or not JSON
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
