import { createPlayTracker, PLAY_KEY } from "../lib/playTracker";

const MIN = 60_000;

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function setup({ signedIn = true, storage = memoryStorage() } = {}) {
  let clock = Date.parse("2026-10-17T10:00:00Z");
  const posts = [];
  const tracker = createPlayTracker({
    storage,
    tabStorage: memoryStorage(),
    now: () => clock,
    available: async () => true,
    isSignedIn: () => signedIn,
    post: async (path, body) => {
      posts.push({ path, body: JSON.parse(JSON.stringify(body)) });
      return { ok: true, status: 200 };
    },
  });
  const advance = (ms) => {
    clock += ms;
    return clock;
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { tracker, posts, advance, settle, storage, now: () => clock };
}

const right = { solved: true };
const wrong = { solved: false };

test("one session runs across games until the app closes", async () => {
  const { tracker, posts, advance, settle } = setup();
  tracker.start();
  tracker.openGame("hangman");
  advance(10_000);
  tracker.answer(right);
  advance(10_000);
  tracker.answer(right);
  tracker.finishRound();
  tracker.leaveGame("hangman");
  advance(5_000);
  tracker.openGame("meaning");
  advance(20_000);
  tracker.answer(right);
  tracker.finishRound();
  advance(3 * MIN);
  tracker.pageClosed();
  await settle();

  expect(posts.filter((p) => p.path === "/play/count").map((p) => p.body)).toEqual([{ visit: true }, { game: "hangman" }, { game: "meaning" }]);
  const sent = posts.find((p) => p.path === "/play/sessions").body;
  expect(sent.giveUps).toEqual([]);
  expect(sent.sessions).toHaveLength(1);
  const s = sent.sessions[0];
  expect(s.games).toEqual({ hangman: { rounds: 1, finished: 1 }, meaning: { rounds: 1, finished: 1 } });
  // Opened at 10:00:00, closed in a game 3m 45s later.
  expect(Date.parse(s.endedAt) - Date.parse(s.startedAt)).toBe(45_000 + 3 * MIN);
});

test("30 quiet minutes start a new session", async () => {
  const { tracker, posts, advance, settle } = setup();
  tracker.start();
  tracker.openGame("meaning");
  tracker.answer(right);
  tracker.finishRound();
  tracker.leaveGame("meaning");
  await settle();
  advance(31 * MIN);
  tracker.check();
  await settle();
  expect(posts.filter((p) => p.path === "/play/sessions")).toHaveLength(1);
  tracker.openGame("say");
  tracker.answer(right);
  tracker.pageClosed();
  await settle();
  const sessions = posts.filter((p) => p.path === "/play/sessions");
  expect(sessions).toHaveLength(2);
  expect(sessions[1].body.sessions[0].games).toEqual({ say: { rounds: 1, finished: 0 } });
});

test("leaving a round unfinished is a give-up with a reason", async () => {
  const { tracker, posts, advance, settle } = setup();
  tracker.start();
  tracker.openGame("type-it");
  advance(5_000);
  tracker.answer(wrong);
  advance(5_000);
  tracker.answer(wrong);
  tracker.leaveGame("type-it");
  await settle();
  // Peeking at a game for a moment isn't giving up.
  tracker.openGame("listening");
  advance(2_000);
  tracker.leaveGame("listening");
  await settle();
  // Sitting on a question for minutes, then closing the app.
  tracker.openGame("phrase");
  tracker.answer(right);
  advance(3 * MIN);
  tracker.pageClosed();
  await settle();
  const giveUps = posts.find((p) => p.path === "/play/sessions").body.giveUps;
  expect(giveUps.map((g) => [g.game, g.reason, g.how, g.answers])).toEqual([
    ["type-it", "many_wrong", "left", 2],
    ["phrase", "stuck", "closed", 1],
  ]);
});

test("a game opened before the app's start isn't taken for one left open", async () => {
  const { tracker, settle } = setup();
  // Children's effects run before their parents': the game page opens first.
  tracker.openGame("meaning");
  tracker.start();
  tracker.answer(right);
  await settle();
  expect(tracker.state.game).toBe("meaning");
  expect(tracker.state.round.answers).toBe(1);
  expect(tracker.state.outbox.giveUps).toEqual([]);
});

test("moving between pages of one game keeps the round", async () => {
  const { tracker, settle } = setup();
  tracker.start();
  tracker.openGame("hangman");
  tracker.answer(right);
  tracker.leaveGame("hangman");
  tracker.openGame("hangman");
  await settle();
  expect(tracker.state.round.answers).toBe(1);
  expect(tracker.state.outbox.giveUps).toEqual([]);
});

test("without an account only counts are sent", async () => {
  const { tracker, posts, settle } = setup({ signedIn: false });
  tracker.start();
  tracker.openGame("hangman");
  tracker.answer(wrong);
  tracker.pageClosed();
  await settle();
  expect(posts.map((p) => p.path)).toEqual(["/play/count", "/play/count"]);
  expect(tracker.state.outbox).toEqual({ sessions: [], giveUps: [] });
});

test("a session cut off by a killed app is sent at the next start", async () => {
  const storage = memoryStorage();
  const first = setup({ storage });
  first.tracker.start();
  first.tracker.openGame("meaning");
  first.advance(10_000);
  first.tracker.answer(right);
  // The app is killed here: no page close.
  expect(JSON.parse(storage.getItem(PLAY_KEY)).game).toBe("meaning");

  const second = setup({ storage });
  second.advance(2 * 3600_000);
  second.tracker.start();
  await second.settle();
  const sent = second.posts.find((p) => p.path === "/play/sessions").body;
  expect(sent.sessions[0].games).toEqual({ meaning: { rounds: 1, finished: 0 } });
  expect(sent.giveUps.map((g) => [g.reason, g.how])).toEqual([["mid_round", "closed"]]);
});
