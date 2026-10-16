import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";

const week = { start: "2026-10-12", end: "2026-10-18" };
const joined = {
  joined: true,
  week,
  nickname: "Calm Otter 42",
  xp: 40,
  rank: 12,
  players: 14,
  top: Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, nickname: `Learner ${i + 1}`, xp: 200 - i * 10, me: false })),
  around: [
    { rank: 11, nickname: "Quick Fox 17", xp: 50, me: false },
    { rank: 12, nickname: "Calm Otter 42", xp: 40, me: true },
    { rank: 13, nickname: "Kind Seal 80", xp: 30, me: false },
  ],
};

function mockApi(routes) {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const path = `${opts.method || "GET"} ${String(url).replace(/^\/api/, "")}`;
    calls.push(path);
    const route = routes[path];
    if (!route) return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    return { ok: route.status < 400, status: route.status, json: async () => route.body };
  });
  return calls;
}

beforeEach(() => resetBackendCache());
afterEach(() => {
  delete global.fetch;
});

test("a learner far down sees the top ten and the learners around them", async () => {
  mockApi({ "GET /health": { status: 200, body: { ok: true } }, "GET /leaderboard": { status: 200, body: joined } });
  renderApp("/leaderboard");
  expect(await screen.findByText("You're number 12 this week, with 40 XP.")).toBeInTheDocument();
  expect(screen.getByText("Learner 1")).toBeInTheDocument();
  expect(screen.getByText("Calm Otter 42 (you)")).toBeInTheDocument();
  expect(screen.getByText("Kind Seal 80")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(13); // top 10 + 3 around (the gap is hidden)
});

test("joining from the board page", async () => {
  const calls = mockApi({
    "GET /health": { status: 200, body: { ok: true } },
    "GET /leaderboard": { status: 200, body: { joined: false, week } },
    "POST /leaderboard/join": { status: 200, body: { ...joined, rank: null, xp: 0, top: [], around: [], players: 0 } },
  });
  renderApp("/leaderboard");
  fireEvent.click(await screen.findByRole("button", { name: "Join the weekly board" }));
  expect(await screen.findByText("Play a word this week to get on the board.")).toBeInTheDocument();
  expect(screen.getByText("Nobody has played yet this week. Be the first!")).toBeInTheDocument();
  expect(calls).toContain("POST /leaderboard/join");
});

test("signed out, the board asks for an account", async () => {
  mockApi({ "GET /health": { status: 200, body: { ok: true } }, "GET /leaderboard": { status: 401, body: { error: "signed_out" } } });
  renderApp("/leaderboard");
  expect(await screen.findByText(/needs an account/)).toBeInTheDocument();
});

test("without the backend the board says it isn't available", async () => {
  mockApi({});
  renderApp("/leaderboard");
  expect(await screen.findByText("The weekly board isn't available right now.")).toBeInTheDocument();
});
