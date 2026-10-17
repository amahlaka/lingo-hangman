// The topics a learner picked for a gap game (Grammar check), kept on this
// device per game. An empty list means every topic.

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
  } catch {
    // Storage full or blocked: every topic is played next time.
  }
}
