import React from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../test-utils";
import { resetBackendCache } from "../lib/backend";
import { encodeWords } from "../lib/words";
import { describeQuestion, itemRefFor, pendingFeedback } from "../lib/feedback";
import { editorLink, suggestionLink } from "../admin/AdminReports";

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
const words = [
  { learning: "dog", native: "koira" },
  { learning: "cat", native: "kissa" },
  { learning: "bird", native: "lintu" },
  { learning: "fish", native: "kala" },
];
const byNative = Object.fromEntries(words.map((w) => [w.native, w.learning]));
const meaningLink = `/meaning?words=${encodeWords(words)}&learningLang=en-GB&nativeLang=fi`;
const me = (role = "learner") => ({
  user: { email: "learner@example.com", role, lang: "en", createdAt: "2026-10-15T10:00:00Z" },
  passkeys: [],
  sessions: [{ id: "s1", device: "Chrome on Windows", lastSeenAt: "2026-10-15T10:00:00Z", current: true }],
});

beforeEach(() => {
  resetBackendCache();
  window.localStorage.clear();
});
afterEach(() => {
  delete global.fetch;
});

async function answerAndOpenReport() {
  const answer = byNative[screen.getByTestId("prompt-word").textContent];
  fireEvent.click(screen.getByRole("button", { name: answer }));
  fireEvent.click(await screen.findByRole("button", { name: "Report a problem" }));
  return answer;
}

test("a signed-in learner reports a problem with the question on screen", async () => {
  const calls = mockApi({ "GET /health": health, "POST /reports": { status: 201, body: { id: 1 } } });
  renderApp(meaningLink);
  const answer = await answerAndOpenReport();
  const dialog = screen.getByRole("dialog", { name: "Report a problem" });
  expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Typo" }));
  fireEvent.change(within(dialog).getByLabelText("More details (optional)"), { target: { value: "Spelled wrong" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
  expect(await within(dialog).findByText("Thanks, it's sent")).toBeInTheDocument();

  const sent = calls.find((c) => c.path === "/reports").body;
  expect(sent).toMatchObject({ game: "meaning", reason: "typo", comment: "Spelled wrong" });
  expect(sent.itemRef).toBe(`answer:${answer}`);
  expect(sent.context.answer).toBe(answer);
  expect(sent.context.solved).toBe(true);
  expect(sent.context.version).toBe("dev");
  expect(sent.clientId).toMatch(/^[A-Za-z0-9_-]{8,}$/);
  expect(pendingFeedback()).toBe(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("signed out, the report is kept and sent after signing in", async () => {
  let signedIn = false;
  const calls = mockApi({
    "GET /health": health,
    "POST /reports": () => (signedIn ? { status: 201, body: { id: 7 } } : { status: 401, body: { error: "signed_out" } }),
    "GET /me": () => (signedIn ? { status: 200, body: me() } : { status: 401, body: { error: "signed_out" } }),
    "GET /me/feedback": {
      status: 200,
      body: {
        reports: [{ id: 7, game: "meaning", itemRef: "answer:dog", reason: "wrong_answer", context: { answer: "dog" }, status: "fixed", createdAt: "2026-10-15T10:00:00Z" }],
        suggestions: [],
      },
    },
  });
  renderApp(meaningLink);
  await answerAndOpenReport();
  fireEvent.click(screen.getByRole("button", { name: "Wrong answer" }));
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("Sign in to send it")).toBeInTheDocument();
  expect(pendingFeedback()).toBe(1);

  signedIn = true;
  fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
  expect(await screen.findByText("Wrong answer: dog")).toBeInTheDocument();
  expect(screen.getByText("Fixed, thanks")).toBeInTheDocument();
  expect(calls.filter((c) => c.path === "/reports")).toHaveLength(2);
  expect(pendingFeedback()).toBe(0);
});

test("with the server unreachable the report waits for later", async () => {
  mockApi({ "GET /health": health, "POST /reports": { status: 503, body: {} } });
  renderApp(meaningLink);
  await answerAndOpenReport();
  fireEvent.click(screen.getByRole("button", { name: "Confusing" }));
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("Saved for later")).toBeInTheDocument();
  expect(pendingFeedback()).toBe(1);
});

test("no report button without the backend", async () => {
  mockApi({});
  renderApp(meaningLink);
  await act(async () => {});
  const answer = byNative[screen.getByTestId("prompt-word").textContent];
  fireEvent.click(screen.getByRole("button", { name: answer }));
  await act(async () => {});
  expect(screen.queryByRole("button", { name: "Report a problem" })).not.toBeInTheDocument();
});

test("the settings menu reports the hangman word and links to suggestions", async () => {
  mockApi({ "GET /health": health });
  renderApp(`/play?words=${encodeWords(words)}&learningLang=en&nativeLang=fi`);
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(await screen.findByRole("link", { name: "Suggest a word or sentence" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
  expect(screen.getByRole("dialog", { name: "Report a problem" })).toBeInTheDocument();
});

test("suggesting a word", async () => {
  const calls = mockApi({ "GET /health": health, "POST /suggestions": { status: 201, body: { id: 3 } } });
  renderApp("/suggest");
  fireEvent.click(await screen.findByRole("button", { name: "Phrase" }));
  fireEvent.change(screen.getByLabelText("In English"), { target: { value: "break a leg" } });
  fireEvent.change(screen.getByLabelText("In Finnish (optional)"), { target: { value: "lykkyä tykö" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("Thanks, it's sent")).toBeInTheDocument();
  expect(calls.find((c) => c.path === "/suggestions").body).toMatchObject({ kind: "phrase", text: "break a leg", meaning: "lykkyä tykö" });
  fireEvent.click(screen.getByRole("button", { name: "Suggest another" }));
  expect(screen.getByLabelText("In English")).toHaveValue("");
});

test("the admin queue lists reports by question and marks them fixed", async () => {
  let open = true;
  const group = {
    game: "meaning",
    itemRef: "answer:dog",
    count: 2,
    latestAt: "2026-10-15T10:00:00Z",
    reports: [
      { id: 1, reason: "typo", comment: "dgo", context: { answer: "dog" }, createdAt: "2026-10-15T10:00:00Z" },
      { id: 2, reason: "typo", comment: "", context: {}, createdAt: "2026-10-15T09:00:00Z" },
    ],
  };
  const calls = mockApi({
    "GET /health": health,
    "GET /admin/reports?status=open": () => ({ status: 200, body: { groups: open ? [group] : [] } }),
    "POST /admin/reports/status": () => {
      open = false;
      return { status: 200, body: { changed: 2 } };
    },
  });
  renderApp("/admin/reports");
  expect(await screen.findByText("dog")).toBeInTheDocument();
  expect(screen.getByText(/2 reports · Typo ×2/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open in editor" })).toHaveAttribute("href", "/admin?q=dog");
  fireEvent.click(screen.getByRole("button", { name: "Mark fixed" }));
  expect(await screen.findByText("Nothing here.")).toBeInTheDocument();
  expect(calls.find((c) => c.path === "/admin/reports/status").body).toEqual({ ids: [1, 2], status: "fixed" });
});

test("the admin queue explains what it needs", async () => {
  mockApi({ "GET /health": health, "GET /admin/reports?status=open": { status: 403, body: { error: "not_admin" } } });
  renderApp("/admin/reports");
  expect(await screen.findByText(/isn't an admin/)).toBeInTheDocument();
});

test("report helpers", () => {
  expect(itemRefFor({ id: "cat" })).toBe("cat");
  expect(itemRefFor({ target: { id: "gap-1" } })).toBe("gap-1");
  expect(itemRefFor({}, "dog")).toBe("answer:dog");
  const q = describeQuestion({ prompt: "x".repeat(300), options: ["a", "b"], target: { learning: "dog", fn() {} }, n: 2, f() {} });
  expect(q.prompt).toHaveLength(200);
  expect(q.options).toEqual(["a", "b"]);
  expect(q.target).toEqual({ learning: "dog" });
  expect(q.f).toBeUndefined();
  expect(editorLink("silent-k:knife")).toBe("/admin?item=silent-k");
  expect(suggestionLink({ text: "lamp", meaning: "lamppu" })).toBe("/admin?new=word&en=lamp&fi=lamppu");
});

test("the word bank editor opens an item from a link", async () => {
  renderApp("/admin?q=koira");
  await act(async () => {});
  expect(screen.getByRole("searchbox")).toHaveValue("koira");
});

test("a Say it miss can be reported with what the microphone heard", async () => {
  const calls = mockApi({ "GET /health": health, "POST /reports": { status: 201, body: { id: 1 } } });
  const script = [{ said: ["hello there"] }];
  window.SpeechRecognition = function Fake() {
    this.start = () => {
      const next = script.shift();
      Promise.resolve().then(() => {
        this.onresult?.({ results: [next.said.map((transcript) => ({ transcript }))] });
        this.onend?.();
      });
    };
    this.stop = () => {};
    this.abort = () => {};
  };
  try {
    renderApp(`/say?words=${encodeWords(words)}&learningLang=en-GB&nativeLang=fi`);
    const target = screen.getByTestId("prompt-word").textContent;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Tap and/ }));
    });
    fireEvent.click(await screen.findByRole("button", { name: "Report a problem" }));
    const dialog = screen.getByRole("dialog", { name: "Report a problem" });
    fireEvent.click(within(dialog).getByRole("button", { name: "It heard me wrong" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(await within(dialog).findByText("Thanks, it's sent")).toBeInTheDocument();
    const sent = calls.find((c) => c.path === "/reports").body;
    expect(sent).toMatchObject({ game: "say", reason: "misheard", itemRef: `answer:${target}` });
    expect(sent.context.heard).toEqual(["hello there"]);
    expect(sent.context.recognition).toBeTruthy();
  } finally {
    delete window.SpeechRecognition;
  }
});
