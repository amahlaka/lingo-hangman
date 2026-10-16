import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import { resetSpeechClips } from "../lib/speech";

function mockApi(routes) {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const method = opts.method || "GET";
    const path = String(url).replace(/^\/api/, "").split("?")[0];
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, path, body, query: String(url).split("?")[1] });
    let route = routes[`${method} ${path}`];
    if (typeof route === "function") route = route(body);
    if (!route) return { ok: false, status: 404, headers: new Map(), json: async () => ({ error: "not_found" }) };
    const headers = new Map(Object.entries(route.headers || {}).map(([k, v]) => [k, v]));
    return {
      ok: route.status < 400,
      status: route.status,
      headers: { get: (k) => headers.get(k) ?? null },
      json: async () => route.body,
      blob: async () => ({ text: "audio" }),
    };
  });
  return calls;
}

const health = { status: 200, body: { ok: true } };
const status = (over = {}) => ({ status: 200, body: { available: true, tier: "basic", limit: 10, used: 3, left: 7, requested: false, ...over } });

beforeEach(() => {
  resetBackendCache();
  resetSpeechClips();
  window.localStorage.clear();
  URL.createObjectURL = jest.fn(() => "blob:made");
  URL.revokeObjectURL = jest.fn();
  window.Audio = function () {
    this.paused = true;
    this.played = [];
    this.play = () => {
      this.played.push(this.src);
      window.lastPlayed = this.src;
      return Promise.resolve();
    };
    this.pause = () => {};
  };
});
afterEach(() => {
  delete global.fetch;
  delete window.Audio;
  delete window.lastPlayed;
});

test("a learner hears a typed sentence in Lingo's voice and sees what is left", async () => {
  const calls = mockApi({
    "GET /health": health,
    "GET /tts/status": status(),
    "POST /tts": { status: 200, headers: { "X-TTS-Left": "6" } },
  });
  renderApp("/hear");
  expect(await screen.findByText("You can hear 7 new sentences today.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Sentence in English"), { target: { value: "Where is   the station?" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Hear it" }));
  });
  expect(await screen.findByText("You can hear 6 new sentences today.")).toBeInTheDocument();
  expect(calls.find((c) => c.path === "/tts" && c.method === "POST").body).toEqual({ text: "Where is the station?", voice: "female" });
  expect(window.lastPlayed).toBe("blob:made");
});

test("past the limit the browser voice reads it, and the learner can ask for more", async () => {
  const spoken = [];
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  window.speechSynthesis = { speak: (u) => spoken.push(u.text), cancel: () => {}, getVoices: () => [] };
  const calls = mockApi({
    "GET /health": health,
    "GET /tts/status": status({ used: 10, left: 0 }),
    "POST /tts": { status: 429, body: { error: "tts_limit", left: 0 } },
    "POST /tts/request": status({ used: 10, left: 0, requested: true }),
  });
  try {
    renderApp("/hear");
    expect(await screen.findByText(/No new sentences left today/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sentence in English"), { target: { value: "One more, please." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Hear it" }));
    });
    expect(await screen.findByText(/today's are used up/)).toBeInTheDocument();
    expect(spoken).toEqual(["One more, please."]);
    fireEvent.click(screen.getByRole("button", { name: "Ask for more" }));
    expect(await screen.findByText(/You asked for more/)).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/tts/request")).toBe(true);
  } finally {
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
  }
});

test("signed out, it says how to hear Lingo's voice, and only English is accepted", async () => {
  mockApi({ "GET /health": health, "GET /tts/status": { status: 401, body: { error: "signed_out" } } });
  renderApp("/hear");
  expect(await screen.findByText("Sign in to hear it in Lingo's voice")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Sentence in English"), { target: { value: "Привет" } });
  expect(screen.getByText(/Use English letters/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Hear it" })).toBeDisabled();
});

test("the admin verifies a learner who asked for more", async () => {
  let role = "learner";
  const calls = mockApi({
    "GET /health": health,
    "GET /admin/users": () => ({
      status: 200,
      body: {
        users: [{ id: 7, email: "learner@example.com", role, createdAt: "2026-10-15T10:00:00Z", ttsRequestedAt: role === "learner" ? "2026-10-15T11:00:00Z" : null, ttsToday: 10 }],
        limits: { basic: 10, extended: 200 },
      },
    }),
    "POST /admin/users/role": (body) => {
      role = body.role;
      return { status: 200, body: { ok: true } };
    },
  });
  renderApp("/admin/users");
  const item = (await screen.findByText("learner@example.com")).closest("li");
  expect(within(item).getByText(/asked for more/)).toBeInTheDocument();
  fireEvent.click(within(item).getByRole("button", { name: "Verify" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Remove verification" })).toBeInTheDocument());
  expect(calls.find((c) => c.path === "/admin/users/role").body).toEqual({ id: 7, role: "verified" });
});
