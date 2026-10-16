import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { makeEvent } from "../../src/lib/syncEvents.js";
import { runStats } from "../src/stats/aggregate.js";

const HOUR = 3600_000;
const answer = (word, msAgo, solved, ms = 3000) => {
  const at = new Date(Date.now() - msAgo);
  return makeEvent(
    "answer",
    { result: { gameId: "meaning", word, lang: "en", solved, triesLeft: 2, perfect: solved, ms }, day: at.toISOString().slice(0, 10) },
    at
  );
};

async function learner(t, email, events) {
  t.cookie = null;
  await t.signIn(email);
  const res = await t.call("POST", "/api/sync", { events });
  assert.equal(res.statusCode, 200);
}

test("difficulty lists only words several learners answered", async () => {
  const t = setup();
  // "cat": 3 learners, 6 answers, 2 right first time. "dog": one learner only.
  await learner(t, "a@example.com", [answer("cat", HOUR, false), answer("cat", 2 * HOUR, false), ...[1, 2, 3, 4, 5, 6].map((i) => answer("dog", i * HOUR, true))]);
  await learner(t, "b@example.com", [answer("cat", HOUR, false), answer("cat", 2 * HOUR, true, 9000)]);
  await learner(t, "c@example.com", [answer("Cat", HOUR, false), answer("cat", 2 * HOUR, true)]);
  runStats(t.db);

  t.cookie = null;
  const res = await t.call("GET", "/api/difficulty");
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["cache-control"], /public/);
  const { items } = res.json();
  assert.deepEqual(Object.keys(items), ["en:cat"]);
  assert.deepEqual(items["en:cat"], { n: 6, firstTry: 0.33, ms: 3000 });
  await t.close();
});

test("an empty server still answers", async () => {
  const t = setup();
  assert.deepEqual((await t.call("GET", "/api/difficulty")).json(), { generatedAt: null, items: {} });
  await t.close();
});

test("the admin Statistics page gets totals, days and word lists", async () => {
  const t = setup();
  await learner(t, "a@example.com", [answer("cat", HOUR, false), answer("cat", 2 * HOUR, false)]);
  await learner(t, "b@example.com", [answer("cat", HOUR, false), answer("cat", 2 * HOUR, true)]);
  await learner(t, "c@example.com", [answer("cat", HOUR, true), answer("cat", 2 * HOUR, true)]);
  assert.equal((await t.call("GET", "/api/admin/stats")).statusCode, 403);
  runStats(t.db);

  t.cookie = null;
  await t.signIn("boss@example.com");
  const res = await t.call("GET", "/api/admin/stats");
  assert.equal(res.statusCode, 200);
  const stats = res.json();
  assert.equal(stats.totals.accounts, 4);
  assert.equal(stats.totals.activeWeek, 3);
  assert.equal(stats.days.reduce((n, d) => n + d.answers, 0), 6);
  assert.ok(stats.days.some((d) => d.learners >= 2));
  assert.deepEqual(stats.games.map((g) => [g.id, g.answers]), [["meaning", 6]]);
  assert.equal(stats.words.hardest[0].word, "cat");
  assert.equal(stats.words.hardest[0].learners, 3);
  assert.ok(stats.updatedAt);
  await t.close();
});

test("an admin sees one learner's own progress", async () => {
  const t = setup();
  await learner(t, "a@example.com", [answer("cat", HOUR, false), answer("cat", 2 * HOUR, true), answer("dog", 3 * HOUR, true)]);
  const id = t.db.prepare("SELECT id FROM users WHERE email = 'a@example.com'").get().id;
  assert.equal((await t.call("GET", `/api/admin/users/${id}`)).statusCode, 403);
  t.cookie = null;
  await t.signIn("boss@example.com");
  const res = await t.call("GET", `/api/admin/users/${id}`);
  assert.equal(res.statusCode, 200);
  const view = res.json();
  assert.equal(view.user.email, "a@example.com");
  assert.ok(view.user.lastAnswerAt);
  assert.equal(view.progress.words, 3);
  assert.deepEqual(view.progress.games.map((g) => [g.id, g.n]), [["meaning", 3]]);
  assert.deepEqual(view.progress.missed.map((w) => [w.word, w.lost, w.solved]), [["cat", 1, 1]]);
  assert.equal(view.devices.length, 1);
  const list = (await t.call("GET", "/api/admin/users")).json();
  assert.ok(list.users.find((u) => u.id === id).lastAnswerAt);
  assert.equal((await t.call("GET", "/api/admin/users/99999")).statusCode, 404);
  await t.close();
});

const typed = (word, wrong, msAgo = HOUR, extra = {}) => {
  const at = new Date(Date.now() - msAgo);
  return makeEvent(
    "answer",
    { result: { gameId: "type-it", word, lang: "en", solved: false, triesLeft: 0, perfect: false, wrong, ...extra }, day: at.toISOString().slice(0, 10) },
    at
  );
};

test("how learners go wrong: kinds per game and wrong answers several learners gave", async () => {
  const t = setup();
  await learner(t, "a@example.com", [typed("oatmeal", ["oltmil"]), typed("I like tea", ["tea I like"], 2 * HOUR)]);
  await learner(t, "b@example.com", [typed("oatmeal", ["Oltmil", "otmeal"])]);
  await learner(t, "c@example.com", [typed("oatmeal", ["oltmil"]), typed("cat", [], 2 * HOUR, { skipped: true })]);
  const out = runStats(t.db);
  const game = out.mistakes.games.find((g) => g.id === "type-it");
  assert.deepEqual(game.kinds, { spelling: 4, word_order: 1, skipped: 1 });
  // "otmeal" and the word-order slip came from one learner each: not listed.
  assert.deepEqual(out.mistakes.common.map((c) => [c.word, c.given, c.kind, c.learners]), [["oatmeal", "oltmil", "spelling", 3]]);

  t.cookie = null;
  await t.signIn("boss@example.com");
  assert.equal((await t.call("GET", "/api/admin/stats")).json().mistakes.common.length, 1);
  const id = t.db.prepare("SELECT id FROM users WHERE email = 'a@example.com'").get().id;
  const { mistakes } = (await t.call("GET", `/api/admin/users/${id}`)).json();
  assert.deepEqual(mistakes.kinds, { spelling: 1, word_order: 1 });
  assert.deepEqual(mistakes.recent.map((m) => [m.word, m.given, m.kind]), [["I like tea", "tea I like", "word_order"], ["oatmeal", "oltmil", "spelling"]]);
  await t.close();
});
