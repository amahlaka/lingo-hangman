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
