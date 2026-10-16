// Where "My path" (src/lib/path.js) is kept: on this device always, and on
// the account when signed in, so every device shows the same path.

import { api } from "./backend";
import { cleanPath } from "./pathFormat.js";

export const PATH_KEY = "lingo.path.v1";

export function loadLocalPath(storage = globalThis.localStorage) {
  try {
    return cleanPath(JSON.parse(storage?.getItem(PATH_KEY) || "null"));
  } catch {
    return null;
  }
}

export function saveLocalPath(path, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PATH_KEY, JSON.stringify(path));
  } catch {
    // Storage full or blocked: the path is planned again next time.
  }
}

// The account's path, or null (signed out, offline, none yet).
export async function loadAccountPath() {
  const res = await api("/path");
  return res.ok ? cleanPath(res.data.path) : null;
}

export function saveAccountPath(path) {
  return api("/path", { method: "PUT", body: { path } });
}

// Which path to keep, this device's or the account's: a later week wins,
// then the one planned later; on the same day the account's.
export function newerPath(local, account) {
  if (!local) return account;
  if (!account) return local;
  if (local.week !== account.week) return local.week > account.week ? local : account;
  return local.planned > account.planned ? local : account;
}
