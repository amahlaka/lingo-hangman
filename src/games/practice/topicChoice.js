// The topics a learner picked in a game (Grammar check, Sounds of English),
// kept on this device per game (and on the learner's account, see
// src/lib/localSettings.js). An empty list means every topic.

import { localChanged } from "../../lib/localSettings.js";

export const TOPICS_KEY = "lingo.gapTopics.v1";

export function loadTopicChoice(gameId, storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage?.getItem(TOPICS_KEY) || "{}");
    const ids = all?.[gameId];
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveTopicChoice(gameId, ids, storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage?.getItem(TOPICS_KEY) || "{}") || {};
    storage?.setItem(TOPICS_KEY, JSON.stringify({ ...all, [gameId]: ids }));
    localChanged("topics");
  } catch {
    // Storage full or blocked: every topic is played next time.
  }
}
