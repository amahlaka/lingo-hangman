import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";

beforeEach(() => resetBackendCache());
afterEach(() => {
  delete global.fetch;
});

test("an admin makes an AI token, sees it once with the setup command, and can revoke it", async () => {
  let tokens = [];
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const path = String(url).replace(/^\/api/, "");
    calls.push([opts.method || "GET", path, opts.body && JSON.parse(opts.body)]);
    const ok = (body, status = 200) => ({ ok: true, status, json: async () => body });
    if (path === "/health") return ok({ ok: true });
    if (path === "/admin/tokens" && opts.method === "POST") {
      tokens = [{ id: 3, name: "Laptop", scope: "admin", createdAt: "2026-10-17T10:00:00Z", expiresAt: "2027-01-15T10:00:00Z", lastUsedAt: null }];
      return ok({ id: 3, name: "Laptop", scope: "admin", expiresAt: "2027-01-15T10:00:00Z", token: "lingo_mcp_secret" }, 201);
    }
    if (path === "/admin/tokens") return ok({ tokens });
    if (path === "/admin/tokens/revoke") {
      tokens = [];
      return ok({ ok: true });
    }
    return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
  });

  renderApp("/admin/ai");
  expect(await screen.findByText("None yet.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Token name"), { target: { value: "Laptop" } });
  fireEvent.click(screen.getByRole("button", { name: "Make token" }));
  expect(await screen.findByLabelText("Setup command")).toHaveTextContent(
    'claude mcp add --transport http lingo-admin http://localhost/api/mcp --header "Authorization: Bearer lingo_mcp_secret"'
  );
  expect(calls).toContainEqual(["POST", "/admin/tokens", { name: "Laptop", days: 90 }]);
  expect(await screen.findByText(/not used yet/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
  expect(await screen.findByText("None yet.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Setup command")).not.toBeInTheDocument();
  expect(calls).toContainEqual(["POST", "/admin/tokens/revoke", { id: 3 }]);
});

test("the AI tools page asks a non-admin to sign in", async () => {
  global.fetch = jest.fn(async (url) =>
    String(url).endsWith("/health")
      ? { ok: true, status: 200, json: async () => ({ ok: true }) }
      : { ok: false, status: 403, json: async () => ({ error: "not_admin" }) }
  );
  renderApp("/admin/ai");
  expect(await screen.findByText(/isn't an admin/)).toBeInTheDocument();
});

test("after signing in, Account goes back only to the OAuth approval page", () => {
  const { oauthReturn } = require("../app/Account");
  expect(oauthReturn("?next=%2Fapi%2Foauth%2Fauthorize%3Fclient_id%3Dx")).toBe("/api/oauth/authorize?client_id=x");
  expect(oauthReturn("?next=https%3A%2F%2Fevil.example%2Fapi%2Foauth%2Fauthorize%3Fx")).toBeNull();
  expect(oauthReturn("?next=%2F%2Fevil.example%2Fapi%2Foauth%2Fauthorize%3F")).toBeNull();
  expect(oauthReturn("")).toBeNull();
});
