import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { makeEvent } from "../../src/lib/syncEvents.js";
import { emptyProgress, recordWord } from "../../src/lib/progress.js";

const answer = (word, at, solved = true) =>
  makeEvent("answer", { result: { gameId: "meaning", word, lang: "en", solved, triesLeft: 2, perfect: solved }, day: at.slice(0, 10) }, new Date(at));

test("sync needs an account", async () => {
  const t = setup();
  assert.equal((await t.call("GET", "/api/sync")).statusCode, 401);
  assert.equal((await t.call("POST", "/api/sync", { events: [] })).statusCode, 401);
  await t.close();
});

test("events from two devices fold into one progress, in time order", async () => {
  const t = setup();
  await t.signIn();
  const empty = (await t.call("GET", "/api/sync")).json();
  assert.equal(empty.hasProgress, false);
  assert.equal(empty.state, null);

  const a1 = answer("cat", "2026-10-14T10:00:00.000Z");
  const a2 = answer("dog", "2026-10-15T10:00:00.000Z");
  let res = await t.call("POST", "/api/sync", { events: [a1, a2], gameIds: ["meaning", "hangman"] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().state.totals.words, 2);

  // The same events again change nothing.
  res = await t.call("POST", "/api/sync", { events: [a1, a2] });
  assert.equal(res.json().state.totals.words, 2);

  // An offline device sends an older answer: everything is applied again in order.
  const older = answer("bird", "2026-10-13T09:00:00.000Z", false);
  res = await t.call("POST", "/api/sync", { events: [older] });
  const state = res.json().state;
  assert.equal(state.totals.words, 3);
  assert.equal(state.totals.solved, 2);

  // The same as applying them on one device.
  let local = emptyProgress();
  for (const e of [older, a1, a2]) local = recordWord(local, e.payload.result, { day: e.payload.day, gameIds: ["meaning", "hangman"] }).state;
  assert.deepEqual(state, JSON.parse(JSON.stringify(local)));

  const status = (await t.call("GET", "/api/sync")).json();
  assert.equal(status.hasProgress, true);
  assert.equal(status.summary.words, 3);
  assert.equal((await t.call("GET", "/api/me/export")).json().progress.totals.words, 3);
  await t.close();
});

test("a baseline starts an empty account; merge adds; reset starts over", async () => {
  const t = setup();
  await t.signIn();
  let device = emptyProgress();
  device = recordWord(device, { gameId: "meaning", word: "cat", solved: true, triesLeft: 1 }, { day: "2026-10-10" }).state;
  let res = await t.call("POST", "/api/sync", { events: [makeEvent("baseline", { state: device })] });
  assert.equal(res.json().state.xp, device.xp);

  // A second baseline would wipe the account, so it is refused.
  res = await t.call("POST", "/api/sync", { events: [makeEvent("baseline", { state: device })] });
  assert.equal(res.statusCode, 409);

  res = await t.call("POST", "/api/sync", { events: [makeEvent("merge", { state: device })] });
  assert.equal(res.json().state.xp, device.xp * 2);
  assert.equal(res.json().state.words["en:cat"].solved, 2);

  res = await t.call("POST", "/api/sync", { reset: true, events: [makeEvent("baseline", { state: device })] });
  assert.equal(res.json().state.xp, device.xp);
  await t.close();
});

test("bad events are refused and gems come from the events", async () => {
  const t = setup();
  await t.signIn();
  const bad = [
    { id: "x", at: new Date().toISOString(), type: "answer", payload: {} },
    makeEvent("answer", { result: { gameId: "meaning", solved: "yes" }, day: "2026-10-15" }),
    makeEvent("hack", {}),
    makeEvent("answer", { result: { gameId: "meaning", solved: true }, day: "yesterday" }),
  ];
  for (const e of bad) assert.equal((await t.call("POST", "/api/sync", { events: [e] })).statusCode, 400);
  assert.equal((await t.call("POST", "/api/sync", { events: Array(501).fill(answer("a", "2026-10-15T10:00:00.000Z")) })).statusCode, 400);

  // Buying without gems does nothing.
  const res = await t.call("POST", "/api/sync", { events: [makeEvent("buy", { id: "accent-fjord" })] });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().state.shop.owned, []);
  await t.close();
});

test("an event from the future is kept at the server's time", async () => {
  const t = setup();
  await t.signIn();
  const e = answer("cat", "2099-01-01T00:00:00.000Z");
  await t.call("POST", "/api/sync", { events: [e] });
  const at = t.db.prepare("SELECT at FROM sync_events").get().at;
  assert.ok(at < "2099");
  await t.close();
});
