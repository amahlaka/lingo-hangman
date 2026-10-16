import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { memoryStorage, renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import { emptyProgress, STORAGE_KEY } from "../lib/progress";
import { emptySync, SYNC_KEY } from "../lib/sync";

function mockApi(routes) {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const method = opts.method || "GET";
    const path = String(url).replace(/^\/api/, "");
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, path, body });
    let route = routes[`${method} ${path}`];
    if (typeof route === "function") route = route(body);
    if (!route) return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    return { ok: route.status < 400, status: route.status, json: async () => route.body };
  });
  return calls;
}

const health = { status: 200, body: { ok: true } };
const me = {
  user: { email: "learner@example.com", role: "learner", lang: "en", createdAt: "2026-10-15T10:00:00Z" },
  passkeys: [],
  sessions: [{ id: "s1", device: "Chrome on Windows", lastSeenAt: "2026-10-15T10:00:00Z", current: true }],
};
const pushView = (over = {}) => ({
  available: true,
  publicKey: "BPublicKey",
  enabled: false,
  time: "18:00",
  timeZone: null,
  kinds: ["goal", "streak"],
  devices: 0,
  thisDevice: false,
  ...over,
});

// A browser that can show notifications and subscribe to push.
function fakeBrowserPush({ answer = "granted" } = {}) {
  const sub = {
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BKeyKeyKey", auth: "authauth" } }),
    unsubscribe: jest.fn(async () => true),
  };
  const pushManager = { getSubscription: jest.fn(async () => null), subscribe: jest.fn(async () => sub) };
  window.PushManager = function PushManager() {};
  window.Notification = { permission: "default", requestPermission: jest.fn(async () => answer) };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve({ pushManager }) } });
  return { sub, pushManager };
}

beforeEach(() => {
  resetBackendCache();
  window.localStorage.clear();
});
afterEach(() => {
  delete global.fetch;
  delete window.PushManager;
  delete window.Notification;
  delete navigator.serviceWorker;
});

test("turning reminders on asks for permission and subscribes this device", async () => {
  const browser = fakeBrowserPush();
  let view = pushView();
  const calls = mockApi({
    "GET /health": health,
    "GET /me": { status: 200, body: me },
    "GET /me/feedback": { status: 200, body: { reports: [], suggestions: [] } },
    "GET /push": () => ({ status: 200, body: view }),
    "POST /push/subscribe": () => {
      view = { ...view, devices: 1, thisDevice: true };
      return { status: 200, body: view };
    },
    "PUT /push/settings": (body) => {
      view = { ...view, ...body };
      return { status: 200, body: view };
    },
  });
  renderApp("/account");
  fireEvent.click(await screen.findByRole("button", { name: "Remind me" }));
  expect(await screen.findByText("This device gets reminders.")).toBeInTheDocument();
  expect(window.Notification.requestPermission).toHaveBeenCalled();
  expect(browser.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
  expect(calls.find((c) => c.path === "/push/subscribe").body).toEqual({
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: { p256dh: "BKeyKeyKey", auth: "authauth" },
  });
  const put = calls.find((c) => c.method === "PUT");
  expect(put.body).toMatchObject({ enabled: true, time: "18:00", lang: "en" });
  expect(typeof put.body.timeZone).toBe("string");
  expect(screen.getByRole("button", { name: "Remind me" })).toHaveAttribute("aria-pressed", "true");

  // Kinds save straight away.
  fireEvent.click(screen.getByRole("button", { name: "My streak could break" }));
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT").at(-1).body).toMatchObject({ kinds: ["goal"] }));
});

test("a blocked permission is explained, not retried", async () => {
  fakeBrowserPush();
  window.Notification.permission = "denied";
  mockApi({
    "GET /health": health,
    "GET /me": { status: 200, body: me },
    "GET /me/feedback": { status: 200, body: { reports: [], suggestions: [] } },
    "GET /push": { status: 200, body: pushView() },
  });
  renderApp("/account");
  expect(await screen.findByText(/blocked in this browser's settings/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remind me" })).toBeDisabled();
});

test("without the server's keys the section is hidden", async () => {
  fakeBrowserPush();
  mockApi({
    "GET /health": health,
    "GET /me": { status: 200, body: me },
    "GET /me/feedback": { status: 200, body: { reports: [], suggestions: [] } },
    "GET /push": { status: 200, body: pushView({ available: false }) },
  });
  renderApp("/account");
  expect(await screen.findByText("Signed in as learner@example.com")).toBeInTheDocument();
  await act(async () => {});
  expect(screen.queryByRole("heading", { name: "Reminders" })).not.toBeInTheDocument();
});

function playedOn(days) {
  const state = emptyProgress();
  for (const day of days) state.days[day] = { words: 3, solved: 3, xp: 30, goalMet: false };
  return memoryStorage({
    [STORAGE_KEY]: JSON.stringify(state),
    [SYNC_KEY]: JSON.stringify({ ...emptySync(), user: "learner@example.com" }),
  });
}

test("Home offers reminders once, after a few days of playing", async () => {
  fakeBrowserPush();
  mockApi({
    "GET /health": health,
    "GET /sync": { status: 200, body: { email: "learner@example.com", state: null } },
    "GET /push": { status: 200, body: pushView() },
  });
  const { unmount } = renderApp("/", { storage: playedOn(["2026-10-10", "2026-10-11"]) });
  await act(async () => {});
  expect(screen.queryByText("Want a daily nudge?")).not.toBeInTheDocument();
  unmount();

  const second = renderApp("/", { storage: playedOn(["2026-10-10", "2026-10-11", "2026-10-12"]) });
  expect(await screen.findByText("Want a daily nudge?")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
  expect(screen.queryByText("Want a daily nudge?")).not.toBeInTheDocument();
  second.unmount();

  renderApp("/", { storage: playedOn(["2026-10-10", "2026-10-11", "2026-10-12"]) });
  await act(async () => {});
  expect(screen.queryByText("Want a daily nudge?")).not.toBeInTheDocument();
});

test("turning reminders on from Home", async () => {
  fakeBrowserPush();
  let view = pushView();
  mockApi({
    "GET /health": health,
    "GET /sync": { status: 200, body: { email: "learner@example.com", state: null } },
    "GET /push": () => ({ status: 200, body: view }),
    "POST /push/subscribe": () => ({ status: 200, body: { ...view, devices: 1, thisDevice: true } }),
    "PUT /push/settings": (body) => {
      view = { ...view, ...body, devices: 1, thisDevice: true };
      return { status: 200, body: view };
    },
  });
  renderApp("/", { storage: playedOn(["2026-10-10", "2026-10-11", "2026-10-12"]) });
  fireEvent.click(await screen.findByRole("button", { name: "Turn on reminders" }));
  expect(await screen.findByText(/Reminders are on for 18:00/)).toBeInTheDocument();
});
