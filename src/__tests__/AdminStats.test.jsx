import { screen } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import { DIFFICULTY_KEY, getDifficulty, loadDifficulty, resetDifficulty } from "../lib/difficulty";

function mockApi(routes) {
  const calls = [];
  global.fetch = jest.fn(async (url) => {
    const path = String(url).replace(/^\/api/, "");
    calls.push(path);
    const route = routes[path];
    if (!route) return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    return { ok: route.status < 400, status: route.status, json: async () => route.body };
  });
  return calls;
}

const health = { status: 200, body: { ok: true } };

beforeEach(() => {
  resetBackendCache();
  resetDifficulty();
});
afterEach(() => {
  delete global.fetch;
});

test("the Statistics page shows totals, days, games and hard words", async () => {
  mockApi({
    "/health": health,
    "/admin/stats": {
      status: 200,
      body: {
        updatedAt: "2026-10-16T12:00:00Z",
        days: [
          { day: "2026-10-15", learners: 2, answers: 30, firstTry: 20, accounts: 1 },
          { day: "2026-10-16", learners: 4, answers: 50, firstTry: 40, accounts: 0 },
        ],
        games: [{ id: "meaning", answers: 80, firstTry: 0.75, ms: 3200 }],
        words: { hardest: [{ key: "en-GB:through", word: "through", n: 12, learners: 4, firstTry: 0.25, ms: 6100 }], slowest: [], tracked: 1 },
        mistakes: {
          games: [{ id: "type-it", total: 4, kinds: { spelling: 3, word_order: 1 } }],
          common: [{ key: "en:oatmeal", word: "oatmeal", given: "oltmil", kind: "spelling", n: 3, learners: 3 }],
        },
        totals: { accounts: 7, activeWeek: 4, reminders: 2, openReports: 1 },
        rules: { dailyDays: 35, minAnswers: 5, minLearners: 3 },
      },
    },
  });
  renderApp("/admin/stats");
  expect(await screen.findByText("played this week")).toBeInTheDocument();
  expect(screen.getByText("7")).toBeInTheDocument();
  expect(screen.getByLabelText("Learners per day")).toBeInTheDocument();
  expect(screen.getByText("through")).toBeInTheDocument();
  expect(screen.getByText("25%")).toBeInTheDocument();
  expect(screen.getByText("Spelling 75% · Words in the wrong order 25%")).toBeInTheDocument();
  expect(screen.getByText("oltmil")).toBeInTheDocument();
});

test("a non-admin is told why", async () => {
  mockApi({ "/health": health, "/admin/stats": { status: 403, body: { error: "not_admin" } } });
  renderApp("/admin/stats");
  expect(await screen.findByText(/isn't an admin/)).toBeInTheDocument();
});

test("difficulty data is fetched once a day and kept on the device", async () => {
  const storage = memoryStorage();
  const calls = mockApi({ "/health": health, "/difficulty": { status: 200, body: { items: { "en-GB:dog": { n: 9, firstTry: 0.9 } } } } });
  const now = Date.parse("2026-10-16T10:00:00Z");
  expect(await loadDifficulty(storage, now)).toEqual({ "en-GB:dog": { n: 9, firstTry: 0.9 } });
  expect(JSON.parse(storage.data[DIFFICULTY_KEY]).fetchedAt).toBe(now);
  await loadDifficulty(storage, now + 3600_000);
  expect(calls.filter((c) => c === "/difficulty")).toHaveLength(1);
  resetDifficulty();
  expect(getDifficulty(storage)).toEqual({ "en-GB:dog": { n: 9, firstTry: 0.9 } });
});

test("no backend, no difficulty data", async () => {
  mockApi({});
  expect(await loadDifficulty(memoryStorage())).toBeNull();
});

test("an admin opens one learner's progress", async () => {
  mockApi({
    "/health": health,
    "/admin/users/5": {
      status: 200,
      body: {
        user: { id: 5, email: "anna@example.com", role: "learner", language: "fi", createdAt: "2026-10-01T10:00:00Z", lastAnswerAt: "2026-10-16T09:00:00Z" },
        devices: [{ device: "Safari on iPhone", lastSeenAt: "2026-10-16T09:00:00Z" }],
        reminders: { enabled: true, time: "18:00", timeZone: "Europe/Helsinki" },
        speechToday: 2,
        reports: 1,
        suggestions: 0,
        mistakes: {
          kinds: { spelling: 2, skipped: 1 },
          recent: [{ day: "2026-10-16", game: "type-it", word: "oatmeal", given: "oltmil", kind: "spelling" }],
        },
        progress: {
          xp: 620, level: 3, toNext: 130, words: 64, learned: 12, streakBest: 5, dailyGoal: 10, gems: 40,
          streak: { current: 4, lastDay: "2026-10-16" },
          totals: { words: 64, solved: 50, perfect: 40 },
          days: [{ day: "2026-10-16", words: 12, solved: 10, firstTry: 8, goalMet: true }],
          games: [{ id: "meaning", n: 40, meanMs: 3200, firstTryRate: 0.7 }],
          missed: [{ word: "through", lost: 4, solved: 1, recent: "0102", ms: 6100, last: "2026-10-16" }],
          wordCount: 30,
        },
      },
    },
  });
  renderApp("/admin/users/5");
  expect(await screen.findByText("through")).toBeInTheDocument();
  expect(screen.getByText(/Reminders: on at 18:00/)).toBeInTheDocument();
  expect(screen.getByText("Safari on iPhone")).toBeInTheDocument();
  expect(screen.getByText("words learned")).toBeInTheDocument();
  expect(screen.getByText("oltmil")).toBeInTheDocument();
  expect(screen.getAllByText("Spelling").length).toBeGreaterThan(0);
});
