import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { localHour, playStats, prunePlay } from "../src/stats/play.js";
import { giveUpReason } from "../../src/lib/playSession.js";

const MIN = 60_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const session = (id, minutes, games, startAgo = 2 * 3600_000) => ({
  id,
  day: ago(startAgo).slice(0, 10),
  startedAt: ago(startAgo),
  endedAt: ago(startAgo - minutes * MIN),
  games,
});

test("visits and games are counted per hour, with or without an account", async () => {
  const t = setup();
  assert.equal((await t.call("POST", "/api/play/count", { visit: true })).statusCode, 200);
  await t.call("POST", "/api/play/count", { visit: true });
  await t.call("POST", "/api/play/count", { game: "hangman" });
  await t.signIn();
  await t.call("POST", "/api/play/count", { game: "hangman" });
  await t.call("POST", "/api/play/count", { game: "meaning" });
  assert.equal((await t.call("POST", "/api/play/count", { game: "Not a game!" })).statusCode, 400);
  assert.equal((await t.call("POST", "/api/play/count", {})).statusCode, 400);

  const rows = t.db.prepare("SELECT metric, key, value FROM play_counts ORDER BY metric, key").all();
  assert.deepEqual(rows.map((r) => ({ ...r })), [
    { metric: "games_account", key: "hangman", value: 1 },
    { metric: "games_account", key: "meaning", value: 1 },
    { metric: "games_anon", key: "hangman", value: 1 },
    { metric: "visits", key: "", value: 2 },
  ]);
  // Only the hour: no address, device or account.
  assert.deepEqual(Object.keys(t.db.prepare("SELECT * FROM play_counts LIMIT 1").get()).sort(), ["hour", "key", "metric", "value"]);

  const play = playStats(t.db);
  assert.equal(play.recentHours.length, 48);
  assert.equal(play.recentHours.at(-1).visits, 2);
  assert.deepEqual(play.popular[0], { id: "hangman", anon: 1, account: 1, total: 2 });
  const today = play.daily.at(-1);
  assert.equal(today.visits, 2);
  assert.equal(today.gamesAnon, 1);
  assert.equal(today.gamesAccount, 2);
  await t.close();
});

test("scanners, bots and unknown games are not counted", async () => {
  const t = setup();
  for (const ua of [
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 HeadlessChrome/140.0 Safari/537.36",
    "curl/8.5.0",
    "python-requests/2.32",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "",
  ]) {
    assert.equal((await t.call("POST", "/api/play/count", { visit: true }, { headers: { "user-agent": ua } })).statusCode, 200);
  }
  // A made-up game id (a scanner trying values) is refused.
  assert.equal((await t.call("POST", "/api/play/count", { game: "hangmanbq3og3rzkf" })).statusCode, 400);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM play_counts").get().n, 0);

  // One address opening the app more often than people do: the rest isn't counted.
  for (let i = 0; i < 70; i++) await t.call("POST", "/api/play/count", { visit: true });
  assert.equal(t.db.prepare("SELECT value FROM play_counts WHERE metric = 'visits'").get().value, 60);
  await t.close();
});

test("hours left out are not in the visit and game numbers, and can be counted again", async () => {
  const t = setup();
  t.db.exec("DELETE FROM play_left_out");
  const hour = (h) => new Date(Date.now() - h * 3600_000).toISOString().slice(0, 13);
  t.db
    .prepare("INSERT INTO play_counts (hour, metric, key, value) VALUES (?, 'visits', '', 200), (?, 'games_anon', 'hangman', 30), (?, 'visits', '', 2)")
    .run(hour(3), hour(3), hour(1));
  await t.signIn("boss@example.com");
  const stats = async () => (await t.call("GET", "/api/admin/stats")).json().play;
  assert.equal((await stats()).hourOfDay.reduce((a, b) => a + b, 0), 202);

  const from = `${hour(3)}:10:00Z`;
  const to = `${hour(3)}:50:00Z`;
  assert.equal((await t.call("POST", "/api/admin/play/left-out", { from, to: from.replace(/^\d{4}/, "2000") })).statusCode, 400);
  const made = await t.call("POST", "/api/admin/play/left-out", { from, to, note: "Burp scan" });
  assert.equal(made.statusCode, 201);
  const range = made.json();
  assert.equal(range.note, "Burp scan");
  assert.equal(range.from, `${hour(3)}:00:00Z`);

  let play = await stats();
  assert.deepEqual(play.leftOut.map((r) => r.id), [range.id]);
  assert.equal(play.hourOfDay.reduce((a, b) => a + b, 0), 2);
  assert.equal(play.popular.length, 0);
  assert.equal(play.recentHours.find((h) => h.hour.startsWith(hour(3))).leftOut, true);
  assert.equal(play.daily.reduce((a, d) => a + d.visits, 0), 2);
  // The counts themselves are kept.
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM play_counts").get().n, 3);

  assert.equal((await t.call("POST", "/api/admin/play/left-out/remove", { id: range.id })).statusCode, 200);
  play = await stats();
  assert.equal(play.hourOfDay.reduce((a, b) => a + b, 0), 202);
  assert.equal(play.leftOut.length, 0);

  // Admins only.
  t.cookie = null;
  await t.signIn("a@example.com");
  assert.equal((await t.call("POST", "/api/admin/play/left-out", { from, to })).statusCode, 403);
  await t.close();
});

test("the Burp scan of 2026-10-19 is left out", () => {
  const t = setup();
  const [scan] = playStats(t.db).leftOut;
  assert.deepEqual([scan.from, scan.to, scan.note], ["2026-10-19T12:00:00Z", "2026-10-19T13:59:59Z", "Burp security scan"]);
  return t.close();
});

test("play sessions and unfinished rounds need an account and are kept once", async () => {
  const t = setup();
  const body = {
    sessions: [session("s1", 12, { hangman: { rounds: 2, finished: 1 }, meaning: { rounds: 1, finished: 1 } })],
    giveUps: [{ id: "g1", at: ago(3600_000), game: "hangman", reason: "after_wrong", how: "left", answers: 4, ms: 90_000 }],
  };
  assert.equal((await t.call("POST", "/api/play/sessions", body)).statusCode, 401);
  await t.signIn();
  assert.deepEqual((await t.call("POST", "/api/play/sessions", body)).json(), { sessions: 1, giveUps: 1 });
  // Sent again (the app didn't hear back): still one of each.
  await t.call("POST", "/api/play/sessions", body);
  // Bad items are dropped, good ones kept.
  const res = await t.call("POST", "/api/play/sessions", {
    sessions: [session("s2", 5, { say: { rounds: 1, finished: 0 } }), session("bad", -5, { say: { rounds: 1, finished: 0 } }), { id: "x" }],
    giveUps: [{ id: "g2", at: ago(MIN), game: "say", reason: "bored", how: "left", answers: 1, ms: 1 }],
  });
  assert.deepEqual(res.json(), { sessions: 1, giveUps: 0 });
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM play_sessions").get().n, 2);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM give_ups").get().n, 1);

  // The learner's own data export has them.
  const data = (await t.call("GET", "/api/me/export")).json();
  assert.equal(data.playSessions.length, 2);
  assert.deepEqual(data.playSessions[0].games.hangman, { rounds: 2, finished: 1 });
  assert.equal(data.unfinishedRounds[0].reason, "after_wrong");
  await t.close();
});

test("the admin Statistics page gets play sessions and give-up reasons", async () => {
  const t = setup();
  await t.signIn("a@example.com");
  await t.call("POST", "/api/play/sessions", {
    sessions: [session("s1", 10, { hangman: { rounds: 2, finished: 1 } }), session("s2", 20, { hangman: { rounds: 1, finished: 1 }, meaning: { rounds: 2, finished: 2 } }, 5 * 3600_000)],
    giveUps: [
      { id: "g1", at: ago(3600_000), game: "hangman", reason: "stuck", how: "closed", answers: 3, ms: 200_000 },
      { id: "g2", at: ago(2 * 3600_000), game: "hangman", reason: "many_wrong", how: "left", answers: 5, ms: 100_000 },
    ],
  });
  t.cookie = null;
  await t.signIn("b@example.com");
  await t.call("POST", "/api/play/sessions", { sessions: [session("s1", 30, { say: { rounds: 1, finished: 0 } })] });

  t.cookie = null;
  await t.signIn("boss@example.com");
  const { play } = (await t.call("GET", "/api/admin/stats")).json();
  assert.equal(play.sessions.count, 3);
  assert.equal(play.sessions.learners, 2);
  assert.equal(play.sessions.avgMs, 20 * MIN);
  assert.equal(play.sessions.medianMs, 20 * MIN);
  assert.equal(play.sessions.avgGames, 1.3);
  assert.equal(play.sessions.oneGame, 0.67);
  assert.equal(play.sessions.games[0].id, "hangman");
  assert.equal(play.sessions.games[0].share, 0.67);
  assert.equal(play.giveUps.total, 2);
  assert.equal(play.giveUps.reasons.stuck, 1);
  assert.deepEqual(play.giveUps.how, { left: 1, closed: 1 });
  const hangman = play.giveUps.games.find((g) => g.id === "hangman");
  assert.deepEqual(hangman, { id: "hangman", rounds: 3, finished: 2, giveUps: 2, reasons: { stuck: 1, many_wrong: 1 } });
  await t.close();
});

test("old play data is removed", async () => {
  const t = setup();
  t.db.prepare("INSERT INTO play_counts (hour, metric, key, value) VALUES (?, 'visits', '', 3), (?, 'visits', '', 4)").run(
    ago(100 * 86400_000).slice(0, 13),
    ago(3600_000).slice(0, 13)
  );
  prunePlay(t.db);
  assert.deepEqual(t.db.prepare("SELECT value FROM play_counts").all().map((r) => r.value), [4]);
  await t.close();
});

test("hours are shown in Finnish time", () => {
  assert.deepEqual(localHour("2026-10-16T21"), { day: "2026-10-17", hour: 0 });
  assert.deepEqual(localHour("2026-01-16T21"), { day: "2026-01-16", hour: 23 });
});

test("a give-up reason comes from how the round was going", () => {
  const now = 1_000_000;
  const round = (recent, lastAgo = 5000) => ({ startedAt: now - 100_000, lastAt: now - lastAgo, answers: recent.length, recent });
  assert.equal(giveUpReason({ startedAt: now - 20_000, answers: 0, recent: [] }, now), "before_first");
  assert.equal(giveUpReason(round(["right"], 70_000), now), "stuck");
  assert.equal(giveUpReason(round(["wrong", "right", "wrong"]), now), "many_wrong");
  assert.equal(giveUpReason(round(["right", "wrong"]), now), "after_wrong");
  assert.equal(giveUpReason(round(["right", "skip"]), now), "after_skip");
  assert.equal(giveUpReason(round(["wrong", "right"]), now), "mid_round");
});
