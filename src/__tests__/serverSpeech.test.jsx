import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import { resetTranscribeStatus, setServerSpeech } from "../lib/serverSpeech";
import { encodeWords } from "../lib/words";
import { recordClip } from "../lib/micRecorder";

jest.mock("../lib/micRecorder", () => {
  const real = jest.requireActual("../lib/micRecorder");
  return {
    ...real,
    canRecord: () => true,
    recordClip: jest.fn(() => ({ done: Promise.resolve({ wav: new Uint8Array([1, 2, 3]), seconds: 1, error: null }), stop() {}, cancel() {} })),
  };
});

const words = [
  { learning: "dog", native: "koira" },
  { learning: "cat", native: "kissa" },
  { learning: "bird", native: "lintu" },
  { learning: "fish", native: "kala" },
];
const link = `/say?words=${encodeWords(words)}&learningLang=en&nativeLang=fi`;
const prompt = () => screen.getByTestId("prompt-word").textContent;

function mockApi(routes) {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const method = opts.method || "GET";
    const path = String(url).replace(/^\/api/, "").split("?")[0];
    calls.push({ method, path, body: opts.body, headers: opts.headers });
    let route = routes[`${method} ${path}`];
    if (typeof route === "function") route = route();
    if (!route) return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    return { ok: route.status < 400, status: route.status, json: async () => route.body };
  });
  return calls;
}

const health = { status: 200, body: { ok: true } };
const sttStatus = (over = {}) => ({ status: 200, body: { available: true, allowed: true, limit: 400, left: 400, ...over } });

beforeEach(() => {
  resetBackendCache();
  resetTranscribeStatus();
  window.localStorage.clear();
  recordClip.mockClear();
});
afterEach(() => {
  delete global.fetch;
  delete window.SpeechRecognition;
});

describe("Lingo's own recogniser in Say it", () => {
  it("listens through the server for a verified player, even without browser recognition", async () => {
    setServerSpeech(true);
    let heard = "";
    const calls = mockApi({
      "GET /health": health,
      "GET /transcribe/status": sttStatus(),
      "POST /transcribe": () => ({ status: 200, body: { text: heard, left: 399 } }),
    });
    renderApp(link);
    const mic = await screen.findByRole("button", { name: /Tap and/ });
    expect(screen.getByText(/Lingo's own recogniser turns your speech into text/)).toBeInTheDocument();
    const target = prompt();
    heard = `The ${target}.`;
    await act(async () => {
      fireEvent.click(mic);
    });
    expect(await screen.findByText(`Nicely said: "${target}".`)).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.path === "/transcribe");
    expect(post.headers["Content-Type"]).toBe("audio/wav");
    expect(recordClip).toHaveBeenCalledWith(expect.objectContaining({ maxMs: 8000 }));
  });

  it("falls back to the self check when the server can't answer and the browser can't listen", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setServerSpeech(true);
    mockApi({
      "GET /health": health,
      "GET /transcribe/status": sttStatus(),
      "POST /transcribe": { status: 429, body: { error: "transcribe_limit" } },
    });
    renderApp(link);
    const mic = await screen.findByRole("button", { name: /Tap and/ });
    await act(async () => {
      fireEvent.click(mic);
    });
    expect(await screen.findByRole("button", { name: "I said it" })).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("stays with the browser when the player isn't verified or hasn't turned it on", async () => {
    setServerSpeech(true);
    const calls = mockApi({ "GET /health": health, "GET /transcribe/status": sttStatus({ allowed: false }) });
    renderApp(link);
    await waitFor(() => expect(calls.some((c) => c.path === "/transcribe/status")).toBe(true));
    expect(screen.getByRole("button", { name: "I said it" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tap and/ })).not.toBeInTheDocument();

    setServerSpeech(false);
    resetTranscribeStatus();
    const off = mockApi({ "GET /health": health, "GET /transcribe/status": sttStatus() });
    renderApp(link);
    await act(async () => {});
    expect(off.some((c) => c.path === "/transcribe/status")).toBe(false);
  });
});

describe("Practice settings", () => {
  it("offers Lingo's recogniser to verified players only", async () => {
    mockApi({ "GET /health": health, "GET /transcribe/status": sttStatus() });
    renderApp("/preferences");
    const choice = await screen.findByRole("button", { name: /Use Lingo's own recogniser/ });
    expect(choice).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(choice);
    expect(choice).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("lingoServerSpeech")).toBe("1");
  });

  it("hides it from other players", async () => {
    const calls = mockApi({ "GET /health": health, "GET /transcribe/status": sttStatus({ allowed: false }) });
    renderApp("/preferences");
    await waitFor(() => expect(calls.some((c) => c.path === "/transcribe/status")).toBe(true));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Use Lingo's own recogniser/ })).not.toBeInTheDocument();
  });
});
