import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { cleanEvent, makeEvent } from "../../src/lib/syncEvents.js";
import { phoneCounts } from "../../src/lib/pronunciationStats.js";
import { runStats } from "../src/stats/aggregate.js";

const today = new Date().toISOString().slice(0, 10);
// A Say it right answer: "think" said with t (θ missed) unless `good`.
const said = (word, score, { mode = "words", good = false, wpm } = {}) =>
  makeEvent("answer", {
    result: {
      gameId: "say-right", word, lang: "en", solved: score >= 60, triesLeft: 1, perfect: score >= 60, ms: 5000,
      score, mode, phones: good ? { θ: [1, 0, 0], ɪ: [1, 0, 0] } : { θ: [1, 1, 0], ɪ: [1, 0, 1] }, ...(wpm ? { wpm } : {}),
    },
    day: today,
  });

async function learner(t, email, events) {
  t.cookie = null;
  await t.signIn(email);
  assert.equal((await t.call("POST", "/api/sync", { events })).statusCode, 200);
  return t.db.prepare("SELECT id FROM users WHERE email = ?").get(email).id;
}

test("answers keep a Say it right score and sound counts, nothing else", () => {
  const e = said("think", 70, { mode: "read", wpm: 120 });
  e.payload.result.phones["bad sound"] = [1, 0, 0];
  e.payload.result.phones.x = [1, 2, 0];
  e.payload.result.secret = "no";
  const clean = cleanEvent(e).payload.result;
  assert.deepEqual([clean.score, clean.mode, clean.wpm], [70, "read", 120]);
  assert.deepEqual(clean.phones, { θ: [1, 1, 0], ɪ: [1, 0, 1] });
  assert.equal(clean.secret, undefined);
  // Other games don't carry them.
  const other = makeEvent("answer", { result: { gameId: "meaning", word: "cat", solved: true, score: 50 }, day: today });
  assert.equal(cleanEvent(other).payload.result.score, undefined);
  assert.equal(cleanEvent(said("think", 140)).payload.result.score, undefined);

  assert.deepEqual(phoneCounts([{ sounds: [{ symbol: "θ", status: "miss" }, { symbol: "ɪ", status: "ok" }] }, { sounds: [{ symbol: "θ", status: "close" }] }]), {
    θ: [2, 1, 1],
    ɪ: [1, 0, 0],
  });
});

test("admins see pronunciation over several learners, and one learner's own", async () => {
  const t = setup();
  const a = await learner(t, "a@example.com", [said("think", 50), said("think", 60), said("Thank you. I think so.", 70, { mode: "read", wpm: 110 })]);
  await learner(t, "b@example.com", [said("think", 40), said("think", 90, { good: true })]);
  await learner(t, "c@example.com", [said("think", 55)]);
  runStats(t.db);

  t.cookie = null;
  await t.signIn("boss@example.com");
  const { pronunciation } = (await t.call("GET", "/api/admin/stats")).json();
  assert.equal(pronunciation.answers, 6);
  const words = pronunciation.modes.find((m) => m.mode === "words");
  assert.deepEqual([words.answers, words.learners, words.average], [5, 3, 59]);
  assert.equal(pronunciation.modes.find((m) => m.mode === "read").wpm, 110);
  // θ: 6 times, missed 5; only sounds and words 3+ learners had.
  assert.deepEqual(pronunciation.sounds[0], { symbol: "θ", seen: 6, missed: 5, close: 0, rate: 0.83, learners: 3 });
  assert.deepEqual(pronunciation.hardest.map((w) => [w.word, w.learners]), [["think", 3]]);

  const view = (await t.call("GET", `/api/admin/users/${a}`)).json().pronunciation;
  assert.equal(view.answers, 3);
  assert.deepEqual(view.sounds[0], { symbol: "θ", seen: 3, missed: 3, close: 0, rate: 1 });
  assert.equal(view.hardest[0].word, "think");
  assert.deepEqual(view.recent[0], { day: today, mode: "read", word: "Thank you. I think so.", score: 70, wpm: 110 });
  await t.close();
});
