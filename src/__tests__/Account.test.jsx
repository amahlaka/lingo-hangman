import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";

// A fake API: routes "METHOD /path" to { status, body } or a function of the request body.
function mockApi(routes) {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const method = opts.method || "GET";
    const path = String(url).replace(/^\/api/, "");
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, path, body, headers: opts.headers });
    let route = routes[`${method} ${path}`];
    if (typeof route === "function") route = route(body);
    if (!route) return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    return { ok: route.status < 400, status: route.status, json: async () => route.body };
  });
  return calls;
}

const health = { status: 200, body: { ok: true, version: "x", schema: 2 } };
const me = {
  user: { email: "learner@example.com", role: "learner", lang: "en", createdAt: "2026-10-15T10:00:00Z" },
  passkeys: [{ id: "pk1", name: "Chrome on Windows", synced: true, createdAt: "2026-10-15T10:00:00Z", lastUsedAt: null }],
  sessions: [
    { id: "s1", device: "Chrome on Windows", lastSeenAt: "2026-10-15T10:00:00Z", current: true },
    { id: "s2", device: "Safari on iPhone", lastSeenAt: "2026-10-14T10:00:00Z", current: false },
  ],
};

beforeEach(() => resetBackendCache());
afterEach(() => {
  delete global.fetch;
});

test("the settings menu links to Account only when the backend answers", async () => {
  mockApi({ "GET /health": health });
  renderApp("/");
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(await screen.findByRole("link", { name: "Account" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument();
});

test("no Account link without a backend", async () => {
  mockApi({});
  renderApp("/");
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  await act(async () => {});
  expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
});

test("signing up with an emailed code", async () => {
  let signedIn = false;
  const calls = mockApi({
    "GET /health": health,
    "GET /me": () => (signedIn ? { status: 200, body: { ...me, passkeys: [] } } : { status: 401, body: { error: "signed_out" } }),
    "POST /auth/code": { status: 202, body: { sent: true } },
    "POST /auth/verify": (body) => {
      if (body.code !== "123456") return { status: 400, body: { error: "wrong_code" } };
      signedIn = true;
      return { status: 200, body: { created: true, passkeys: 0 } };
    },
  });
  renderApp("/account");
  // jsdom has no WebAuthn, so the email form shows straight away.
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "learner@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  expect(await screen.findByText(/We sent a 6-digit code to learner@example.com/)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "000000" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("That code isn't right. Check it and try again.")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123 456" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Signed in as learner@example.com")).toBeInTheDocument();
  expect(screen.getByText("No passkeys yet. You sign in with an email code.")).toBeInTheDocument();

  const write = calls.find((c) => c.path === "/auth/code");
  expect(write.headers["X-Lingo"]).toBe("1");
  expect(write.body).toEqual({ email: "learner@example.com", lang: "en" });
});

test("the signed-in page lists passkeys and devices, and signs out another device", async () => {
  const calls = mockApi({
    "GET /health": health,
    "GET /me": { status: 200, body: me },
    "DELETE /me/sessions/s2": { status: 200, body: { ok: true } },
  });
  renderApp("/account");
  expect(await screen.findByText("Signed in as learner@example.com")).toBeInTheDocument();
  expect(screen.getByText("Chrome on Windows · Synced")).toBeInTheDocument();
  expect(screen.getByText("This device")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign out Safari on iPhone" }));
  await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/me/sessions/s2")).toBe(true));
});

test("deleting the account needs the email typed", async () => {
  mockApi({
    "GET /health": health,
    "GET /me": { status: 200, body: me },
    "DELETE /me": (body) =>
      body.confirm === "learner@example.com" ? { status: 200, body: { ok: true } } : { status: 400, body: { error: "confirm_email" } },
  });
  renderApp("/account");
  fireEvent.click(await screen.findByText("Delete my account"));
  const input = screen.getAllByLabelText("Email").at(-1);
  fireEvent.change(input, { target: { value: "someone@else.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  expect(await screen.findByText("Type your email exactly to confirm.")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "learner@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  expect(await screen.findByText("Your account was deleted.")).toBeInTheDocument();
});

test("an admin page's old sign-in: sign in again on Account, then back to the page", async () => {
  let fresh = false;
  const admin = { ...me, user: { ...me.user, email: "boss@example.com", role: "admin" } };
  const calls = mockApi({
    "GET /health": health,
    "GET /me": { status: 200, body: admin },
    "GET /me/feedback": { status: 200, body: { reports: [], suggestions: [] } },
    "GET /admin/users": () => (fresh ? { status: 200, body: { users: [], limits: { basic: 10, extended: 200 } } } : { status: 401, body: { error: "sign_in_again" } }),
    "POST /auth/code": { status: 202, body: { sent: true } },
    "POST /auth/verify": () => {
      fresh = true;
      return { status: 200, body: { created: false, passkeys: 1 } };
    },
  });
  renderApp("/admin/users");
  fireEvent.click(await screen.findByRole("link", { name: "Sign in again" }));
  expect(await screen.findByText(/Sign in again to continue/)).toBeInTheDocument();
  // The account's email is already filled in.
  expect(screen.getByLabelText("Email")).toHaveValue("boss@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  fireEvent.change(await screen.findByLabelText("Code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(calls.filter((c) => c.path === "/admin/users").length).toBe(2));
  expect(await screen.findByText(/Verified learners get 200/)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Sign in again" })).not.toBeInTheDocument();
});

test("without a backend the page says so", async () => {
  mockApi({});
  renderApp("/account");
  expect(await screen.findByText(/Accounts can't be reached right now/)).toBeInTheDocument();
});

test("the privacy page is in Finnish too", () => {
  renderApp("/privacy", { lang: "fi" });
  expect(screen.getByRole("heading", { name: "Tietosuoja" })).toBeInTheDocument();
  expect(screen.getByText("Jos luot tilin")).toBeInTheDocument();
});
