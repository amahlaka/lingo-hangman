import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import bundled from "../lib/bundledContent";
import { setContent } from "../lib/content";
import { validateItem } from "../lib/contentSchema";
import { buildSayRightRound, rankKey, roundSounds, sayRightPool, tipFor } from "../games/say-right/sayRightLogic";
import { encodeWav, resample, trimSilence } from "../lib/micRecorder";

jest.mock("../lib/micRecorder", () => {
  const real = jest.requireActual("../lib/micRecorder");
  return {
    ...real,
    canRecord: () => true,
    recordClip: jest.fn(() => ({ done: Promise.resolve({ wav: new Uint8Array([1, 2, 3]), seconds: 1, error: null }), stop() {}, cancel() {} })),
  };
});

const think = { id: "think", type: "word", text: { en: "think", fi: "ajatella" }, ipa: { en: "/θɪŋk/" }, say: { fi: "think" }, features: ["th-sound"], level: 1 };
const thTip = {
  id: "phone-th-quiet", type: "phone", symbols: ["θ"], example: "thin",
  title: { en: "Quiet th, as in think", fi: "Soinniton th" },
  tip: { en: "Put your tongue between your teeth and blow.", fi: "Kieli hampaiden väliin." },
};

function useContent(items) {
  setContent({
    index: { packs: ["test"], categories: {} },
    languages: bundled.languages,
    packs: [{ id: "test", title: { en: "Test" }, items }],
  });
}

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
const okStatus = (over = {}) => ({ status: 200, body: { available: true, allowed: true, limit: 150, left: 150, requested: false, ...over } });

beforeEach(() => {
  resetBackendCache();
  window.localStorage.clear();
});
afterEach(() => {
  delete global.fetch;
  setContent(bundled);
});

describe("Say it right", () => {
  it("is for verified players: signed out, it asks to sign in", async () => {
    mockApi({ "GET /health": health, "GET /pronounce/status": { status: 401, body: { error: "signed_out" } } });
    renderApp("/say-right");
    expect(await screen.findByText(/Sign in to your Lingo account first/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/account");
  });

  it("lets a learner who isn't verified ask to be", async () => {
    const calls = mockApi({
      "GET /health": health,
      "GET /pronounce/status": okStatus({ allowed: false }),
      "POST /pronounce/request": okStatus({ allowed: false, requested: true }),
    });
    renderApp("/say-right");
    fireEvent.click(await screen.findByRole("button", { name: "Ask to be verified" }));
    expect(await screen.findByText(/You've asked to be verified/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path === "/pronounce/request")).toBe(true);
  });

  it("says when scoring is off on the server", async () => {
    mockApi({ "GET /health": health, "GET /pronounce/status": okStatus({ available: false }) });
    renderApp("/say-right");
    expect(await screen.findByText(/Scoring isn't available right now/)).toBeInTheDocument();
  });

  it("scores a recording sound by sound and shows the tip for a missed sound", async () => {
    useContent([think, thTip]);
    const calls = mockApi({
      "GET /health": health,
      "GET /pronounce/status": okStatus(),
      "POST /pronounce": { status: 200, body: { phones: "t ɪ ŋ k", left: 149 } },
    });
    renderApp("/say-right");
    expect(await screen.findByTestId("prompt-word")).toHaveTextContent("think");
    expect(screen.getByTestId("prompt-ipa")).toHaveTextContent("/θɪŋk/");
    // The Finnish reading is one tap away.
    expect(screen.queryByTestId("prompt-reading")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show the Finnish reading" }));
    expect(screen.getByTestId("prompt-reading")).toHaveTextContent("Read the Finnish way: think");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tap and say it/ }));
    });
    expect(await screen.findByText("Very good")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.path === "/pronounce");
    expect(post.headers["Content-Type"]).toBe("audio/wav");
    expect(post.headers["X-Lingo"]).toBe("1");
    expect(screen.getByText("θ")).toHaveClass("sr-sound--miss");
    expect(screen.getByText("ŋ")).toHaveClass("sr-sound--ok");
    expect(screen.getByText(/Quiet th, as in think/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: 'Hear "thin"' })).toBeInTheDocument();
    // "Keep this score" comes before the microphone, never hidden under it.
    const keep = screen.getByRole("button", { name: "Keep this score" });
    const again = screen.getByRole("button", { name: /Tap and try again/ });
    expect(keep.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(keep).toHaveClass("lg-btn--primary");

    // A better try; 90 or more ends the word.
    global.fetch.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ phones: "θ ɪ ŋ k", left: 148 }) }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tap and try again/ }));
    });
    expect(await screen.findByText(/Well said: "think"/)).toBeInTheDocument();
    expect(screen.getByText("Excellent")).toBeInTheDocument();
  });

  it("explains a busy server without spending a try", async () => {
    useContent([think]);
    mockApi({
      "GET /health": health,
      "GET /pronounce/status": okStatus(),
      "POST /pronounce": { status: 503, body: { error: "pronounce_queue_full" } },
    });
    renderApp("/say-right");
    await screen.findByTestId("prompt-word");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tap and say it/ }));
    });
    expect(await screen.findByText(/Lots of people are speaking/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tap and say it/ })).toBeInTheDocument();
  });

  it("isn't needed for the Explorer badge or My path", () => {
    const { GAMES, PLAYABLE_GAME_IDS } = require("../games/registry");
    expect(GAMES.find((g) => g.id === "say-right")).toMatchObject({ restricted: true, noPath: true });
    expect(PLAYABLE_GAME_IDS).not.toContain("say-right");
  });
});

describe("Say it right logic", () => {
  it("asks short word bank words with IPA, about half with a hard sound", () => {
    useContent([
      think,
      { id: "cat", type: "word", text: { en: "cat", fi: "kissa" }, ipa: { en: "/kæt/" } },
      { id: "no-ipa", type: "word", text: { en: "dog", fi: "koira" } },
      { id: "long", type: "word", text: { en: "Where is the bus stop?", fi: "Missä on bussipysäkki?" }, ipa: { en: "/ˈwer ɪz ðə ˈbʌs stɑːp/" } },
    ]);
    const pool = sayRightPool([
      { id: "think", learning: "think", native: "ajatella" },
      { id: "cat", learning: "cat", native: "kissa" },
      { id: "no-ipa", learning: "dog", native: "koira" },
      { id: "long", learning: "Where is the bus stop?", native: "Missä on bussipysäkki?" },
    ]);
    expect(pool.map((p) => p.id)).toEqual(["think", "cat"]);
    expect(buildSayRightRound(pool, 2).map((p) => p.id).sort()).toEqual(["cat", "think"]);
  });

  it("names scores and finds tips", () => {
    useContent([think, thTip]);
    expect(rankKey(95)).toBe("sayRightRankGreat");
    expect(rankKey(60)).toBe("sayRightRankGood");
    expect(rankKey(10)).toBe("sayRightRankTry");
    expect(tipFor("θ").id).toBe("phone-th-quiet");
    expect(tipFor("ð")).toBe(null);
    expect(roundSounds([{ practise: [{ symbol: "θ" }, { symbol: "v" }] }, { practise: [{ symbol: "θ" }] }])).toEqual([{ symbol: "θ", n: 2 }, { symbol: "v", n: 1 }]);
  });

  it("checks sound tips in the word bank", () => {
    expect(validateItem(thTip)).toEqual([]);
    expect(validateItem({ ...thTip, symbols: ["/θ/"] })[0]).toMatch(/symbols must be/);
    expect(validateItem({ ...thTip, tip: { fi: "x" } })).toEqual(['tip needs "en"']);
    expect(validateItem({ ...thTip, lesson: "nope" }, { soundIds: new Set(["th-sounds"]) })[0]).toMatch(/lesson "nope"/);
  });
});

describe("the recorder's clip", () => {
  it("is a 16 kHz mono WAV with the quiet around the voice cut", () => {
    const rate = 48000;
    const samples = new Float32Array(rate);
    for (let i = rate * 0.4; i < rate * 0.6; i++) samples[i] = Math.sin(i / 5) * 0.5;
    const voice = trimSilence(samples, rate);
    expect(voice.length / rate).toBeCloseTo(0.5, 1);
    const wav = encodeWav(resample(voice, rate, 16000), 16000);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(40, true)).toBe(wav.length - 44);
    expect(trimSilence(new Float32Array(1000), 16000).length).toBe(0);
  });
});
