import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import { matches, versionLabel } from "../admin/AdminClips";
import { applyEdit, normalizeGain, peaks, soundBounds, toBase64 } from "../admin/clipAudio";

const NOVA = "kokoro-1.0-v5-af_nova";
const LIAM = "kokoro-1.0-v5-am_liam";

function mockApi(routes) {
  global.fetch = jest.fn(async (url) => {
    const path = String(url).replace(/^\/api/, "");
    const route = routes[path];
    if (!route) return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
    return { ok: route.status < 400, status: route.status, json: async () => route.body };
  });
}

const clips = {
  voices: [
    { id: "female", folder: NOVA, speaker: "af_nova" },
    { id: "male", folder: LIAM, speaker: "am_liam" },
  ],
  clips: [
    { key: "a1", text: "kitchen", words: false, voices: { [NOVA]: { state: "live", versions: [0] }, [LIAM]: { state: "live", versions: [0] } } },
    {
      key: "b2",
      text: "storyboard",
      words: false,
      voices: { [NOVA]: { state: "live", versions: [0] }, [LIAM]: { state: "missing" } },
      reports: [{ id: 8, game: "hangman", itemRef: "storyboard", reason: "bad_audio", comment: "Ääni hiljainen", createdAt: "2026-10-18T08:48:55Z" }],
    },
    {
      key: "c3",
      text: "The kitchen is warm.",
      words: true,
      voices: { [NOVA]: { state: "live", revision: 2, versions: [0, 2], edits: [{ revision: 2, from: 0, at: "2026-10-21T10:00:00Z", start: 0.05, gain: 3 }] }, [LIAM]: { state: "remaking", versions: [0] } },
    },
  ],
};

beforeEach(() => resetBackendCache());
afterEach(() => delete global.fetch);

test("the Recordings page puts reported clips first and lists the rest under All", async () => {
  mockApi({ "/health": { status: 200, body: { ok: true } }, "/admin/clips": { status: 200, body: clips } });
  renderApp("/admin/clips");
  expect(await screen.findByText("storyboard")).toBeInTheDocument();
  expect(screen.getByText("Bad audio")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reported (1)" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText("kitchen")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "All" }));
  expect(screen.getByText("kitchen")).toBeInTheDocument();
  expect(screen.getByText("3 clips")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edited" }));
  expect(screen.getByText("The kitchen is warm.")).toBeInTheDocument();
  expect(screen.getByText("1 clip")).toBeInTheDocument();

  // Opening a reported clip shows its report.
  fireEvent.click(screen.getByRole("button", { name: /Reported/ }));
  fireEvent.click(screen.getByRole("button", { name: /storyboard/ }));
  expect(await screen.findByText("Ääni hiljainen")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark fixed" })).toBeInTheDocument();
});

test("a link from a report searches all clips for its text", async () => {
  mockApi({ "/health": { status: 200, body: { ok: true } }, "/admin/clips": { status: 200, body: clips } });
  renderApp("/admin/clips?q=kitchen");
  expect(await screen.findByText("2 clips")).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Find a text" })).toHaveValue("kitchen");
});

test("the Recordings page asks a stale admin to sign in again", async () => {
  mockApi({ "/health": { status: 200, body: { ok: true } }, "/admin/clips": { status: 401, body: { error: "sign_in_again" } } });
  renderApp("/admin/clips");
  expect(await screen.findByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/account?next=%2Fadmin%2Fclips&again=1");
});

test("filters and version labels", () => {
  const [kitchen, storyboard, sentence] = clips.clips;
  expect(matches(storyboard, NOVA, "reported")).toBe(true);
  expect(matches(kitchen, NOVA, "reported")).toBe(false);
  expect(matches(storyboard, LIAM, "missing")).toBe(true);
  expect(matches(sentence, LIAM, "missing")).toBe(true);
  expect(matches(sentence, NOVA, "edited")).toBe(true);
  expect(versionLabel(0)).toBe("First version");
  expect(versionLabel(3, [])).toBe("Version 3, made again by the voice");
  expect(versionLabel(2, sentence.voices[NOVA].edits)).toMatch(/^Version 2, edited .* \(trimmed, \+3 dB\)$/);
});

describe("clip edits", () => {
  const rate = 1000;
  const samples = Float32Array.from({ length: 1000 }, (_, i) => (i >= 200 && i < 700 ? 0.5 : 0));

  it("trims, fades and changes the volume within full scale", () => {
    const out = applyEdit(samples, rate, { start: 0.2, end: 0.7, gain: 6.0206, fadeIn: 0.1, fadeOut: 0.1 });
    expect(out.length).toBe(500);
    expect(out[0]).toBe(0);
    expect(out[50]).toBeCloseTo(0.5, 2);
    expect(out[250]).toBeCloseTo(1, 3);
    expect(out[499]).toBe(0);
    expect(Math.max(...applyEdit(samples, rate, { gain: 20 }))).toBe(1);
  });

  it("finds where the sound is, the gain to a peak and the waveform", () => {
    expect(soundBounds(samples, rate, { pad: 0.01 })).toEqual({ start: 0.19, end: 0.71 });
    expect(soundBounds(new Float32Array(100), rate)).toEqual({ start: 0, end: 0.1 });
    expect(normalizeGain(samples, 0)).toBeCloseTo(6, 0);
    expect(normalizeGain(new Float32Array(10))).toBe(0);
    expect(Array.from(peaks(samples, 4))).toEqual([0.5, 0.5, 0.5, 0]);
  });

  it("writes bytes as base64", () => {
    expect(toBase64(new Uint8Array([0xff, 0xf3, 0x64]))).toBe("//Nk");
  });
});
