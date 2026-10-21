import { screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import { dayTotals, jobLabel, megabytes, seconds } from "../admin/AdminTts";

function mockApi(routes) {
  global.fetch = jest.fn(async (url) => {
    const path = String(url).replace(/^\/api/, "");
    const route = routes[path];
    if (!route) return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    return { ok: route.status < 400, status: route.status, json: async () => route.body };
  });
}

const today = new Date().toISOString().slice(0, 10);
const page = {
  status: { configured: true, reachable: true, ms: 42, voices: 54, checkedAt: new Date().toISOString() },
  queue: {
    jobs: [
      { id: 7, kind: "remake", label: "kitchen", voice: "af_nova", words: false, state: "running", queuedAt: new Date().toISOString(), startedAt: new Date().toISOString() },
      { id: 8, kind: "speech", label: null, voice: "am_liam", words: false, state: "waiting", queuedAt: new Date().toISOString() },
    ],
    recent: [{ id: 6, kind: "clip", label: "The kitchen is warm.", voice: "am_liam", words: true, ok: false, ms: 30000, waitMs: 1200, error: "timed out", framed: null, at: new Date().toISOString() }],
  },
  daily: [
    { day: today, kind: "speech", ok: 3, failed: 1, avgMs: 2000, maxMs: 4000, avgWaitMs: 100 },
    { day: today, kind: "remake", ok: 2, failed: 0, avgMs: 5000, maxMs: 6000, avgWaitMs: 0 },
  ],
  usage: [{ day: today, learners: 2, clips: 4 }],
  remakes: [{ key: "k1", text: "kitchen", words: false }, { key: "k2", text: "storyboard", words: false }],
  settings: { dailyLimit: 10, verifiedLimit: 200, queueMax: 20, timeoutMs: 30000, cacheMaxBytes: 2048 * 1024 * 1024, remakesOnServer: true },
  cacheBytes: 5 * 1024 * 1024,
  requested: 1,
};

beforeEach(() => resetBackendCache());
afterEach(() => delete global.fetch);

test("the Speech server page shows the status, the queue, the last requests and the days", async () => {
  mockApi({ "/health": { status: 200, body: { ok: true } }, "/admin/tts": { status: 200, body: page } });
  renderApp("/admin/tts");
  expect(await screen.findByText("● Answering")).toBeInTheDocument();
  expect(screen.getByText("Making")).toBeInTheDocument();
  expect(screen.getByText("“kitchen”")).toBeInTheDocument();
  expect(screen.getByText("A learner's sentence (not shown)")).toBeInTheDocument();
  expect(screen.getByText("✕ timed out")).toBeInTheDocument();
  expect(screen.getByText("requests today").previousSibling).toHaveTextContent("6");
  expect(screen.getByText("2 (4)")).toBeInTheDocument();
  expect(screen.getByText("Clips to make again (1)")).toBeInTheDocument();
});

test("the Speech server page says when the service isn't answering", async () => {
  mockApi({ "/health": { status: 200, body: { ok: true } }, "/admin/tts": { status: 200, body: { ...page, status: { configured: true, reachable: false, error: "timed out", checkedAt: new Date().toISOString() } } } });
  renderApp("/admin/tts");
  expect(await screen.findByText("● Not answering")).toBeInTheDocument();
});

test("labels, totals and units", () => {
  expect(jobLabel({ label: null })).toBe("A learner's sentence (not shown)");
  expect(jobLabel({ label: "Hi", words: true })).toBe("“Hi” · word by word");
  expect(dayTotals(page.daily)).toEqual([{ day: today, ok: 5, failed: 1, ms: 18000, kinds: { speech: 4, remake: 2 }, avgMs: 3000 }]);
  expect(seconds(420)).toBe("420 ms");
  expect(seconds(2500)).toBe("2.5 s");
  expect(megabytes(5 * 1024 * 1024)).toBe("5.0 MB");
});
