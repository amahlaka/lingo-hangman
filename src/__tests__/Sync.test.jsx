import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import { emptyProgress, normalizeProgress, recordWord, STORAGE_KEY } from "../lib/progress";
import { applyEvents, cleanEvent } from "../lib/syncEvents";
import { SYNC_KEY } from "../lib/sync";
import { encodeWords } from "../lib/words";

// A fake API that folds events like the real one (server/src/routes/sync.js).
function fakeServer({ signedIn = true, events = [] } = {}) {
  const server = { signedIn, events: [...events], posts: [] };
  server.state = () => {
    if (!server.events.length) return null;
    const sorted = [...server.events].sort((a, b) => (a.type === "baseline" ? -1 : b.type === "baseline" ? 1 : a.at.localeCompare(b.at)));
    return JSON.parse(JSON.stringify(applyEvents(emptyProgress(), sorted, {})));
  };
  global.fetch = jest.fn(async (url, opts = {}) => {
    const method = opts.method || "GET";
    const path = String(url).replace(/^\/api/, "");
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (path === "/health") return reply(200, { ok: true });
    if (path === "/sync") {
      if (!server.signedIn) return reply(401, { error: "signed_out" });
      if (method === "GET") return reply(200, { email: "learner@example.com", state: server.state() });
      const body = JSON.parse(opts.body);
      server.posts.push(body);
      if (body.reset) server.events = [];
      for (const e of body.events) if (!server.events.some((x) => x.id === e.id)) server.events.push(cleanEvent(e));
      return reply(200, { state: server.state() });
    }
    return reply(404, { error: "not_found" });
  });
  return server;
}

const words = [
  { learning: "dog", native: "koira" },
  { learning: "cat", native: "kissa" },
  { learning: "bird", native: "lintu" },
  { learning: "fish", native: "kala" },
];
const byNative = Object.fromEntries(words.map((w) => [w.native, w.learning]));
const meaningLink = `/meaning?words=${encodeWords(words)}&learningLang=en-GB&nativeLang=fi`;

function deviceWith(n) {
  let s = emptyProgress();
  for (let i = 0; i < n; i++) s = recordWord(s, { gameId: "meaning", word: `w${i}`, solved: true, triesLeft: 1 }, { day: "2026-10-10" }).state;
  return memoryStorage({ [STORAGE_KEY]: JSON.stringify(s) });
}
const progressOf = (storage) => JSON.parse(storage.data[STORAGE_KEY]);
const syncOf = (storage) => JSON.parse(storage.data[SYNC_KEY] || "null");

beforeEach(() => {
  resetBackendCache();
  window.localStorage.clear();
});
afterEach(() => {
  delete global.fetch;
});

test("signed out, nothing is sent", async () => {
  const server = fakeServer({ signedIn: false });
  const { storage } = renderApp("/", { storage: deviceWith(2) });
  await act(async () => {});
  expect(server.posts).toHaveLength(0);
  expect(syncOf(storage)).toBeNull();
});

test("a device's progress joins an empty account, then each answer is sent", async () => {
  const server = fakeServer();
  const { storage } = renderApp(meaningLink, { storage: deviceWith(3) });
  await waitFor(() => expect(server.posts).toHaveLength(1));
  expect(server.posts[0].events[0].type).toBe("baseline");
  expect(server.state().totals.words).toBe(3);
  expect(syncOf(storage).user).toBe("learner@example.com");

  fireEvent.click(screen.getByRole("button", { name: byNative[screen.getByTestId("prompt-word").textContent] }));
  expect(syncOf(storage).outbox).toHaveLength(1);
  await act(async () => window.dispatchEvent(new Event("online")));
  await waitFor(() => expect(server.state().totals.words).toBe(4));
  expect(syncOf(storage).outbox).toHaveLength(0);
  expect(progressOf(storage).totals.words).toBe(4);
});

test("an empty device takes the account's progress", async () => {
  let acct = emptyProgress();
  acct = recordWord(acct, { gameId: "meaning", word: "cat", solved: true }, { day: "2026-10-12" }).state;
  const server = fakeServer({ events: [cleanEvent({ id: "base-000001", at: "2026-10-12T10:00:00Z", type: "baseline", payload: { state: acct } })] });
  const { storage } = renderApp("/");
  await waitFor(() => expect(progressOf(storage).totals.words).toBe(1));
  expect(server.posts[0].events).toHaveLength(0);
});

test("when both have progress the learner chooses, and keeping both adds them up", async () => {
  let acct = emptyProgress();
  acct = recordWord(acct, { gameId: "meaning", word: "cat", solved: true }, { day: "2026-10-12" }).state;
  const server = fakeServer({ events: [cleanEvent({ id: "base-000001", at: "2026-10-12T10:00:00Z", type: "baseline", payload: { state: acct } })] });
  const storage = deviceWith(2);
  const deviceXp = progressOf(storage).xp;
  renderApp("/", { storage });
  expect(await screen.findByRole("dialog", { name: "Combine your progress?" })).toBeInTheDocument();
  expect(screen.getByText("Level 1, 1 words practiced, 0 learned")).toBeInTheDocument();
  expect(server.posts).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Keep both" }));
  await waitFor(() => expect(progressOf(storage).totals.words).toBe(3));
  expect(progressOf(storage).xp).toBe(deviceXp + acct.xp);
  expect(server.posts[0].events[0].type).toBe("merge");
});

test("using this device's progress starts the account over", async () => {
  let acct = emptyProgress();
  acct = recordWord(acct, { gameId: "meaning", word: "cat", solved: true }, { day: "2026-10-12" }).state;
  const server = fakeServer({ events: [cleanEvent({ id: "base-000001", at: "2026-10-12T10:00:00Z", type: "baseline", payload: { state: acct } })] });
  const storage = deviceWith(2);
  renderApp("/", { storage });
  fireEvent.click(await screen.findByRole("button", { name: "Use this device's progress" }));
  await waitFor(() => expect(server.posts).toHaveLength(1));
  expect(server.posts[0].reset).toBe(true);
  expect(server.state().totals.words).toBe(2);
  expect(progressOf(storage).totals.words).toBe(2);
});

test("using the account's progress replaces this device's", async () => {
  let acct = emptyProgress();
  acct = recordWord(acct, { gameId: "meaning", word: "cat", solved: true }, { day: "2026-10-12" }).state;
  fakeServer({ events: [cleanEvent({ id: "base-000001", at: "2026-10-12T10:00:00Z", type: "baseline", payload: { state: acct } })] });
  const storage = deviceWith(2);
  renderApp("/", { storage });
  fireEvent.click(await screen.findByRole("button", { name: "Use my account's progress" }));
  await waitFor(() => expect(progressOf(storage).totals.words).toBe(1));
});

test("the event fold matches recording on the device", () => {
  const result = { gameId: "meaning", word: "cat", lang: "en", solved: true, triesLeft: 2, perfect: true, ms: 1200 };
  const local = recordWord(emptyProgress(), result, { day: "2026-10-15" }).state;
  const event = cleanEvent({ id: "e-00000001", at: "2026-10-15T10:00:00Z", type: "answer", payload: { result, day: "2026-10-15" } });
  expect(applyEvents(emptyProgress(), [event])).toEqual(local);
  expect(normalizeProgress({ xp: "lots", days: [], shop: { owned: "all" } }).xp).toBe(0);
});
