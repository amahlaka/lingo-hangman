import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";

const plan = {
  v: 1,
  week: "2026-10-12",
  planned: "2026-10-16",
  placement: false,
  steps: [
    { game: "listening", skill: "Listening", reason: "practise", goal: 10, base: 4 },
    { game: "type-it", skill: "Spelling", reason: "new", goal: 10, base: 0, extra: "dropped" },
  ],
};

test("a learner's path is kept for all their devices", async () => {
  const t = setup();
  assert.equal((await t.call("GET", "/api/path")).statusCode, 401);
  await t.signIn("a@example.com");
  assert.deepEqual((await t.call("GET", "/api/path")).json(), { path: null, updatedAt: null });
  const saved = await t.call("PUT", "/api/path", { path: plan });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().path.steps[1].extra, undefined);
  assert.equal((await t.call("GET", "/api/path")).json().path.steps[0].game, "listening");
  assert.equal((await t.call("GET", "/api/me/export")).json().path.week, "2026-10-12");

  assert.equal((await t.call("PUT", "/api/path", { path: { ...plan, v: 99 } })).statusCode, 400);
  assert.equal((await t.call("PUT", "/api/path", { path: { ...plan, steps: [{ game: "<script>" }] } })).statusCode, 400);
  assert.equal((await t.call("PUT", "/api/path", { path: { ...plan, week: "soon" } })).statusCode, 400);

  // Another learner has their own.
  t.cookie = null;
  await t.signIn("b@example.com");
  assert.equal((await t.call("GET", "/api/path")).json().path, null);
  await t.close();
});
