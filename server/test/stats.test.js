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
