import { act, fireEvent, screen } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import { emptyProgress, STORAGE_KEY } from "../lib/progress";
import { emptySync, SYNC_KEY } from "../lib/sync";

function mockApi(routes) {
  global.fetch = jest.fn(async (url) => {
    const route = routes[`GET ${String(url).replace(/^\/api/, "")}`];
    if (!route) return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    return { ok: route.status < 400, status: route.status, json: async () => route.body };
  });
}

const health = { status: 200, body: { ok: true } };
const signedOut = { status: 401, body: { error: "signed_out" } };
const THREE_DAYS = ["2026-10-10", "2026-10-11", "2026-10-12"];

function playedOn(days, { user = null } = {}) {
  const state = emptyProgress();
  for (const day of days) state.days[day] = { words: 3, solved: 3, xp: 30, goalMet: false };
  return memoryStorage({
    [STORAGE_KEY]: JSON.stringify(state),
    ...(user ? { [SYNC_KEY]: JSON.stringify({ ...emptySync(), user }) } : {}),
  });
}

beforeEach(() => {
  resetBackendCache();
  window.localStorage.clear();
});
afterEach(() => {
  delete global.fetch;
});

test("Home suggests an account once, after three days of playing", async () => {
  mockApi({ "GET /health": health, "GET /me": signedOut });
  const first = renderApp("/", { storage: playedOn(THREE_DAYS.slice(0, 2)) });
  await act(async () => {});
  expect(screen.queryByText("Keep your progress safe?")).not.toBeInTheDocument();
  first.unmount();

  const second = renderApp("/", { storage: playedOn(THREE_DAYS) });
  expect(await screen.findByText("Keep your progress safe?")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/account");
  fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
  expect(screen.queryByText("Keep your progress safe?")).not.toBeInTheDocument();
  second.unmount();

  renderApp("/", { storage: playedOn(THREE_DAYS) });
  await act(async () => {});
  expect(screen.queryByText("Keep your progress safe?")).not.toBeInTheDocument();
});

test("shown once even when left unanswered", async () => {
  mockApi({ "GET /health": health, "GET /me": signedOut });
  const first = renderApp("/", { storage: playedOn(THREE_DAYS) });
  expect(await screen.findByText("Keep your progress safe?")).toBeInTheDocument();
  first.unmount();

  renderApp("/", { storage: playedOn(THREE_DAYS) });
  await act(async () => {});
  expect(screen.queryByText("Keep your progress safe?")).not.toBeInTheDocument();
});

test("not suggested to a signed-in learner or when accounts can't be reached", async () => {
  mockApi({ "GET /health": health, "GET /me": { status: 200, body: { user: { email: "a@example.com" } } } });
  const signedIn = renderApp("/", { storage: playedOn(THREE_DAYS) });
  await act(async () => {});
  expect(screen.queryByText("Keep your progress safe?")).not.toBeInTheDocument();
  signedIn.unmount();

  resetBackendCache();
  mockApi({});
  const offline = renderApp("/", { storage: playedOn(THREE_DAYS) });
  await act(async () => {});
  expect(screen.queryByText("Keep your progress safe?")).not.toBeInTheDocument();
  offline.unmount();

  // Neither visit used up the one-time offer.
  resetBackendCache();
  mockApi({ "GET /health": health, "GET /me": signedOut });
  renderApp("/", { storage: playedOn(THREE_DAYS) });
  expect(await screen.findByText("Keep your progress safe?")).toBeInTheDocument();
});
