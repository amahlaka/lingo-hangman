import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";

beforeEach(() => resetBackendCache());
afterEach(() => {
  delete global.fetch;
});

const me = {
  user: { email: "learner@example.com", role: "learner", lang: "en", createdAt: "2026-10-15T10:00:00Z" },
  passkeys: [],
  sessions: [{ id: "s1", device: "Chrome on Windows", lastSeenAt: "2026-10-15T10:00:00Z", current: true }],
};

test("a learner connects an AI assistant: the address, a token shown once, and revoking", async () => {
  let tokens = [{ id: 1, name: "Claude", scope: "learner", connector: true, createdAt: "2026-10-17T10:00:00Z", expiresAt: "2027-01-15T10:00:00Z", lastUsedAt: "2026-10-18T09:00:00Z" }];
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const path = String(url).replace(/^\/api/, "");
    const method = opts.method || "GET";
    calls.push([method, path, opts.body && JSON.parse(opts.body)]);
    const ok = (body, status = 200) => ({ ok: true, status, json: async () => body });
    if (path === "/health") return ok({ ok: true });
    if (path === "/me") return ok(me);
    if (path === "/me/tokens" && method === "POST") {
      tokens = [{ id: 3, name: "Laptop", scope: "learner", connector: false, createdAt: "2026-10-18T10:00:00Z", expiresAt: "2027-01-16T10:00:00Z", lastUsedAt: null }, ...tokens];
      return ok({ id: 3, name: "Laptop", scope: "learner", expiresAt: "2027-01-16T10:00:00Z", token: "lingo_mcp_secret" }, 201);
    }
    if (path === "/me/tokens") return ok({ tokens });
    if (path === "/me/tokens/revoke") {
      tokens = tokens.filter((x) => x.id !== JSON.parse(opts.body).id);
      return ok({ ok: true });
    }
    return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
  });
  renderApp("/account");

  expect(await screen.findByRole("heading", { name: "AI assistant" })).toBeInTheDocument();
  expect(screen.getByLabelText("Address for Claude")).toHaveTextContent(`${window.location.origin}/api/mcp/me`);
  expect(screen.getByText("Claude (connector)")).toBeInTheDocument();
  expect(screen.getByText(/last used/)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Token name"), { target: { value: "Laptop" } });
  fireEvent.click(screen.getByRole("button", { name: "Make token" }));
  expect(await screen.findByText("Copy it now: this is the only time it's shown.")).toBeInTheDocument();
  expect(screen.getByLabelText("Setup command")).toHaveTextContent(
    `claude mcp add --transport http lingo ${window.location.origin}/api/mcp/me --header "Authorization: Bearer lingo_mcp_secret"`
  );
  expect(calls).toContainEqual(["POST", "/me/tokens", { name: "Laptop", days: 90 }]);
  expect(await screen.findByText("not used yet", { exact: false })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Revoke: Laptop" }));
  await waitFor(() => expect(screen.queryByLabelText("Setup command")).not.toBeInTheDocument());
  expect(calls).toContainEqual(["POST", "/me/tokens/revoke", { id: 3 }]);
  fireEvent.click(screen.getByRole("button", { name: "Disconnect: Claude" }));
  expect(await screen.findByText("Nothing connected yet.")).toBeInTheDocument();
});
