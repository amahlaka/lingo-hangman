import { act, waitFor } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import { emptyProgress, mergeProgress, normalizeProgress } from "../lib/progress";
import { applyEvents, cleanEvent, makeEvent } from "../lib/syncEvents";
import { SYNC_KEY } from "../lib/sync";
import { cleanRecordPayload, cleanSettingPayload } from "../lib/accountSettings";
import { explicitLocal, readLocal, writeLocal } from "../lib/localSettings";
import { getPreferences, setPreferences } from "../lib/preferences";
import { finishDaily } from "../games/daily/dailyLogic";

// A fake API that folds events like the real one (server/src/routes/sync.js).
function fakeServer(events = []) {
  const server = { events: events.map(cleanEvent), posts: [] };
  server.state = () => {
    if (!server.events.length) return null;
    const sorted = [...server.events].sort((a, b) => a.at.localeCompare(b.at));
    return JSON.parse(JSON.stringify(applyEvents(emptyProgress(), sorted, {})));
  };
  global.fetch = jest.fn(async (url, opts = {}) => {
    const path = String(url).replace(/^\/api/, "");
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (path === "/health") return reply(200, { ok: true });
    if (path !== "/sync") return reply(404, { error: "not_found" });
    if ((opts.method || "GET") === "GET") return reply(200, { email: "learner@example.com", state: server.state() });
    const body = JSON.parse(opts.body);
    server.posts.push(body);
    for (const e of body.events) if (!server.events.some((x) => x.id === e.id)) server.events.push(cleanEvent(e));
    return reply(200, { state: server.state() });
  });
  return server;
}

const at = (time) => new Date(`2026-10-18T${time}:00.000Z`);
const sent = (server) => server.posts.flatMap((p) => p.events).filter((e) => e.type === "setting" || e.type === "record");
// Progress and the sync outbox live in the app's (here in-memory) storage.
const linked = () => memoryStorage({ [SYNC_KEY]: JSON.stringify({ user: "learner@example.com", outbox: [] }) });
const outboxOf = (storage) => JSON.parse(storage.data[SYNC_KEY]).outbox;

beforeEach(() => {
  resetBackendCache();
  window.localStorage.clear();
  setPreferences({ focus: [], difficulty: "any" });
  window.localStorage.clear();
});
afterEach(() => {
  delete global.fetch;
});

test("only known settings and sensible records are kept", () => {
  expect(cleanSettingPayload({ key: "theme", value: "dark" })).toEqual({ key: "theme", value: "dark" });
  expect(cleanSettingPayload({ key: "theme", value: "pink" })).toBeNull();
  expect(cleanSettingPayload({ key: "voice", value: "robot" })).toBeNull();
  expect(cleanSettingPayload({ key: "topics", value: { grammar: ["your-youre"] } })).not.toBeNull();
  expect(cleanRecordPayload({ key: "rushBest", value: 0 })).toBeNull();
  expect(cleanRecordPayload({ key: "daily", value: { day: "yesterday" } })).toBeNull();
  expect(normalizeProgress({ settings: { theme: "pink", sound: false }, records: { rushBest: "lots" } })).toMatchObject({
    settings: { sound: false },
    records: {},
  });
});

test("records keep the best score and the latest Daily word day", () => {
  const ev = (type, key, value, time) => cleanEvent(makeEvent(type, { key, value }, at(time)));
  const day = (d, played) => ({ day: d, played, won: played, streak: 1, bestStreak: 2, lastWon: d });
  const state = applyEvents(emptyProgress(), [
    ev("record", "sayRightBest", 80, "09:00"),
    ev("record", "sayRightBest", 60, "10:00"),
    ev("record", "daily", day("2026-10-18", 5), "09:00"),
    // The same day from a second device: the first one counts.
    ev("record", "daily", day("2026-10-18", 9), "10:00"),
    // An older day from a device that was offline.
    ev("record", "daily", day("2026-10-17", 7), "11:00"),
  ]);
  expect(state.records.sayRightBest).toBe(80);
  expect(state.records.daily.played).toBe(5);

  // Combining two learners' progress: records by their rules, newer settings win.
  const other = { ...emptyProgress(), settings: { theme: "dark" }, records: { sayRightBest: 95 } };
  expect(mergeProgress(state, other).records.sayRightBest).toBe(95);
  expect(mergeProgress(state, other).settings.theme).toBe("dark");
});

test("a Daily word finished on another device shows here, but not an older one", () => {
  const word = { id: "w-apple", word: "APPLE", fi: "omena", ipa: "" };
  let local = finishDaily({ day: "2026-10-17", word, guesses: ["APPLE"], recorded: false, played: 3, won: 3, streak: 3, bestStreak: 3, lastWon: "2026-10-16" }, { won: true, key: "2026-10-17", yesterday: "2026-10-16" });
  window.localStorage.setItem("lingoDaily", JSON.stringify(local));
  expect(readLocal("daily")).toMatchObject({ day: "2026-10-17", played: 4, streak: 4 });

  writeLocal({ records: { daily: { day: "2026-10-16", played: 2, won: 2, streak: 2, bestStreak: 2, lastWon: "2026-10-16" } } });
  expect(readLocal("daily").played).toBe(4);

  const today = { id: "w-bread", word: "BREAD", fi: "leipä", ipa: "" };
  writeLocal({ records: { daily: { day: "2026-10-18", played: 5, won: 5, streak: 5, bestStreak: 5, lastWon: "2026-10-18", word: today, guesses: ["CRANE", "BREAD"] } } });
  local = JSON.parse(window.localStorage.getItem("lingoDaily"));
  expect(local).toMatchObject({ day: "2026-10-18", word: today, guesses: ["CRANE", "BREAD"], recorded: true, played: 5, streak: 5 });
});

test("the account's settings and records arrive on this device", async () => {
  const storage = linked();
  window.localStorage.setItem("lingoRushBest", "500");
  fakeServer([
    makeEvent("setting", { key: "theme", value: "dark" }, at("09:00")),
    makeEvent("setting", { key: "difficulty", value: "hard" }, at("09:00")),
    makeEvent("record", { key: "rushBest", value: 300 }, at("09:00")),
    makeEvent("record", { key: "sayRightBest", value: 88 }, at("09:00")),
  ]);
  renderApp("/", { storage });
  await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  expect(window.localStorage.getItem("theme")).toBe("dark");
  expect(getPreferences().difficulty).toBe("hard");
  expect(window.localStorage.getItem("lingoSayRightBest")).toBe("88");
  // This device's better best went up and stays.
  await waitFor(() => expect(window.localStorage.getItem("lingoRushBest")).toBe("500"));
});

test("settings only this device has go up; the account's win otherwise", async () => {
  const storage = linked();
  window.localStorage.setItem("theme", "light");
  window.localStorage.setItem("lingoVoice", "male");
  const server = fakeServer([makeEvent("setting", { key: "theme", value: "dark" }, at("09:00"))]);
  renderApp("/", { storage });
  await waitFor(() => expect(server.posts.length).toBeGreaterThan(0));
  expect(sent(server).map((e) => e.payload)).toEqual([{ key: "voice", value: "male" }]);
  await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("dark"));
});

test("a change made while signed in is sent; signed out it stays here", async () => {
  const storage = linked();
  const server = fakeServer();
  renderApp("/", { storage });
  await waitFor(() => expect(server.posts.length).toBeGreaterThan(0));
  act(() => setPreferences({ focus: ["food"], difficulty: "easy" }));
  expect(outboxOf(storage).map((e) => e.payload)).toEqual([
    { key: "focus", value: ["food"] },
    { key: "difficulty", value: "easy" },
  ]);
  // The same value again sends nothing.
  act(() => setPreferences({ difficulty: "easy" }));
  expect(outboxOf(storage)).toHaveLength(2);
  await act(async () => window.dispatchEvent(new Event("online")));
  await waitFor(() => expect(server.state().settings).toEqual({ focus: ["food"], difficulty: "easy" }));
  expect(explicitLocal().settings).toMatchObject({ focus: ["food"], difficulty: "easy" });
});

test("signed out, settings stay on this device", async () => {
  global.fetch = jest.fn(async (url) => ({
    ok: String(url).endsWith("/health"),
    status: String(url).endsWith("/health") ? 200 : 401,
    json: async () => ({}),
  }));
  const { storage } = renderApp("/");
  await act(async () => {});
  act(() => setPreferences({ difficulty: "hard" }));
  expect(storage.data[SYNC_KEY]).toBeUndefined();
});
