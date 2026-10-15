// The app's side of progress sync (docs/backend.md, "Progress sync"). While
// this device is linked to an account, every change is also kept here as an
// event (src/lib/syncEvents.js) until the API has it. Nothing here runs
// without an account.

export const SYNC_KEY = "lingo.sync.v1";
export const MAX_BATCH = 500;

export function emptySync() {
  // user: the linked account's email; reset: the next send starts the
  // account over from this device's progress; paused: signed out, so events
  // wait here until the same account signs in again.
  return { user: null, outbox: [], reset: false, paused: false };
}

export function loadSync(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(SYNC_KEY) || "null");
    if (!parsed || !Array.isArray(parsed.outbox)) return emptySync();
    return { ...emptySync(), ...parsed };
  } catch {
    return emptySync();
  }
}

export function saveSync(sync, storage) {
  try {
    if (!sync.user && !sync.outbox.length) storage?.removeItem(SYNC_KEY);
    else storage?.setItem(SYNC_KEY, JSON.stringify(sync));
  } catch {
    /* private mode: events are sent now or rebuilt at the next sign-in */
  }
}
