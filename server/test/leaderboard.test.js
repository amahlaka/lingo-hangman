import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { makeEvent } from "../../src/lib/syncEvents.js";
import { groupsOf, randomNickname, weekOf } from "../src/leaderboard/board.js";

// `n` answers, all right first time, on `day` of this week.
const answers = (n, day = weekOf().start) =>
  Array.from({ length: n }, (_, i) =>
    makeEvent("answer", { result: { gameId: "meaning", word: `w${i}`, lang: "en", solved: true, triesLeft: 2, perfect: true }, day }, new Date(Date.now() - (n - i) * 1000))
  );

async function learner(t, email, n, { join = true } = {}) {
  t.cookie = null;
  await t.signIn(email);
  if (n) assert.equal((await t.call("POST", "/api/sync", { events: answers(n) })).statusCode, 200);
  if (join) assert.equal((await t.call("POST", "/api/leaderboard/join")).statusCode, 200);
  return t.cookie;
}

test("the week runs Monday to Sunday in Finnish time", () => {
  // Sunday 2026-10-18 23:30 UTC is already Monday in Helsinki.
  assert.deepEqual(weekOf(Date.parse("2026-10-18T23:30:00Z")), { start: "2026-10-19", end: "2026-10-25" });
  assert.deepEqual(weekOf(Date.parse("2026-10-16T12:00:00Z")), { start: "2026-10-12", end: "2026-10-18" });
});

test("nicknames are friendly and groups stay near the size", () => {
  assert.match(randomNickname(), /^[A-Z][a-z]+ [A-Z][a-z]+ \d{2}$/);
  assert.deepEqual(groupsOf([1, 2, 3]).map((g) => g.length), [3]);
  assert.deepEqual(groupsOf(Array.from({ length: 70 }, (_, i) => i)).map((g) => g.length), [35, 35]);
});

test("joining, ranking, renaming and leaving", async () => {
  const t = setup();
  assert.equal((await t.call("GET", "/api/leaderboard")).statusCode, 401);
  await learner(t, "a@example.com", 3);
  await learner(t, "b@example.com", 5);
  await learner(t, "c@example.com", 0);
  await learner(t, "lurker@example.com", 8, { join: false });
  const a = await learner(t, "a2@example.com", 1, { join: false });
  assert.equal((await t.call("GET", "/api/leaderboard", null, { cookie: a })).json().joined, false);

  t.cookie = null;
  await t.signIn("a@example.com");
  const board = (await t.call("GET", "/api/leaderboard")).json();
  assert.equal(board.joined, true);
  // The learner who didn't join never shows; the one with no XP yet neither.
  assert.deepEqual(board.top.map((e) => [e.rank, e.me]), [[1, false], [2, true]]);
  assert.ok(board.top[0].xp > board.top[1].xp && board.xp === board.top[1].xp);
  assert.equal(board.rank, 2);
  assert.equal(board.players, 2);
  assert.ok(!JSON.stringify(board).includes("@"));

  const renamed = (await t.call("POST", "/api/leaderboard/nickname")).json();
  assert.notEqual(renamed.nickname, board.nickname);

  t.cookie = null;
  await t.signIn("c@example.com");
  const c = (await t.call("GET", "/api/leaderboard")).json();
  assert.equal(c.rank, null);
  assert.equal(c.top.length, 2);

  assert.equal((await t.call("DELETE", "/api/leaderboard/join")).json().joined, false);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM leaderboard_members").get().n, 2);
  assert.equal((await t.call("POST", "/api/leaderboard/nickname")).statusCode, 404);
  await t.close();
});

test("far down the board you see the top and the learners around you", async () => {
  const t = setup();
  for (let i = 0; i < 14; i++) await learner(t, `l${i}@example.com`, 20 - i);
  const board = (await t.call("GET", "/api/leaderboard")).json(); // l13, 7 answers
  assert.equal(board.top.length, 10);
  assert.equal(board.rank, 14);
  assert.deepEqual(board.around.map((e) => e.rank), [12, 13, 14]);
  await t.close();
});
