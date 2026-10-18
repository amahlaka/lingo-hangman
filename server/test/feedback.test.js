import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";

const report = (over = {}) => ({
  clientId: "r-0000000001",
  game: "meaning",
  itemRef: "word:cat",
  reason: "wrong_answer",
  comment: "Kissa is right too",
  context: { question: "cat", answer: "kissa", version: "abc" },
  ...over,
});

test("reports and suggestions need an account", async () => {
  const t = setup();
  assert.equal((await t.call("POST", "/api/reports", report())).statusCode, 401);
  assert.equal((await t.call("POST", "/api/suggestions", { clientId: "s-0000000001", kind: "word", text: "lamp" })).statusCode, 401);
  await t.close();
});

test("a learner sends a report once, even when it is resent, and sees its status", async () => {
  const t = setup();
  await t.signIn();
  const first = await t.call("POST", "/api/reports", report());
  assert.equal(first.statusCode, 201);
  const again = await t.call("POST", "/api/reports", report());
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().id, first.json().id);

  const bad = [
    report({ clientId: "x" }),
    report({ reason: "rude" }),
    report({ game: "" }),
    report({ comment: "x".repeat(1001) }),
    report({ context: { big: "x".repeat(5000) } }),
  ];
  for (const body of bad) assert.equal((await t.call("POST", "/api/reports", body)).statusCode, 400);

  const sugg = await t.call("POST", "/api/suggestions", {
    clientId: "s-0000000001",
    kind: "phrase",
    text: " break a leg ",
    meaning: "lykkyä tykö",
  });
  assert.equal(sugg.statusCode, 201);
  assert.equal((await t.call("POST", "/api/suggestions", { clientId: "s-0000000002", kind: "song", text: "x" })).statusCode, 400);
  // Finnish only is fine (the learner may not know the English); nothing at all isn't.
  assert.equal((await t.call("POST", "/api/suggestions", { clientId: "s-0000000003", kind: "word", meaning: "pölynimuri" })).statusCode, 201);
  assert.equal((await t.call("POST", "/api/suggestions", { clientId: "s-0000000004", kind: "word", text: " ", meaning: "" })).statusCode, 400);

  const mine = (await t.call("GET", "/api/me/feedback")).json();
  assert.equal(mine.reports.length, 1);
  assert.equal(mine.reports[0].status, "open");
  assert.deepEqual(mine.reports[0].context, { question: "cat", answer: "kissa", version: "abc" });
  assert.deepEqual(mine.suggestions.map((s) => [s.text, s.meaning, s.given]), [["", "pölynimuri", "fi"], ["break a leg", "lykkyä tykö", "both"]]);

  const exported = (await t.call("GET", "/api/me/export")).json();
  assert.equal(exported.reports.length, 1);
  assert.equal(exported.suggestions.length, 2);
  await t.close();
});

test("reports per account are limited per day", async () => {
  const t = setup();
  await t.signIn();
  let last;
  for (let i = 0; i < 31; i++) last = await t.call("POST", "/api/reports", report({ clientId: `r-limit-${String(i).padStart(4, "0")}` }));
  assert.equal(last.statusCode, 429);
  await t.close();
});

test("the admin queue groups reports by question and marks them fixed", async () => {
  const t = setup();
  // Two learners report the same question, one another.
  await t.signIn("a@example.com");
  await t.call("POST", "/api/reports", report({ clientId: "r-a-000001" }));
  await t.call("POST", "/api/reports", report({ clientId: "r-a-000002", itemRef: "word:dog", reason: "typo" }));
  await t.call("POST", "/api/suggestions", { clientId: "s-a-000001", kind: "word", text: "lamp", meaning: "lamppu" });
  await t.signIn("b@example.com");
  await t.call("POST", "/api/reports", report({ clientId: "r-b-000001", reason: "confusing" }));

  // Learners can't read the queue.
  assert.equal((await t.call("GET", "/api/admin/reports")).statusCode, 403);

  await t.signIn("boss@example.com");
  const queue = (await t.call("GET", "/api/admin/reports")).json();
  assert.equal(queue.groups.length, 2);
  assert.equal(queue.groups[0].itemRef, "word:cat");
  assert.equal(queue.groups[0].count, 2);
  assert.ok(!JSON.stringify(queue).includes("a@example.com"), "no emails in the queue");

  const ids = queue.groups[0].reports.map((r) => r.id);
  const marked = await t.call("POST", "/api/admin/reports/status", { ids, status: "fixed" });
  assert.equal(marked.json().changed, 2);
  assert.equal((await t.call("GET", "/api/admin/reports")).json().groups.length, 1);
  assert.equal((await t.call("GET", "/api/admin/reports?status=fixed")).json().groups[0].count, 2);
  assert.equal((await t.call("POST", "/api/admin/reports/status", { ids: ["1"], status: "fixed" })).statusCode, 400);

  const suggestions = (await t.call("GET", "/api/admin/suggestions")).json().suggestions;
  assert.equal(suggestions.length, 1);
  await t.call("POST", "/api/admin/suggestions/status", { ids: [suggestions[0].id], status: "accepted" });
  assert.equal((await t.call("GET", "/api/admin/suggestions")).json().suggestions.length, 0);

  // The reporter sees it was fixed.
  await t.signIn("b@example.com");
  assert.equal((await t.call("GET", "/api/me/feedback")).json().reports[0].status, "fixed");
  await t.close();
});

test("an account named in ADMIN_EMAILS later becomes admin, and admin needs a recent sign-in", async () => {
  const t = setup({ ADMIN_EMAILS: "" });
  await t.signIn("boss@example.com");
  assert.equal((await t.call("GET", "/api/admin/reports")).statusCode, 403);
  t.config.adminEmails.push("boss@example.com");
  assert.equal((await t.call("GET", "/api/admin/reports")).statusCode, 200);
  t.db.prepare("UPDATE sessions SET auth_at = ?").run(Date.now() - 25 * 3600_000);
  const stale = await t.call("GET", "/api/admin/reports");
  assert.equal(stale.statusCode, 401);
  assert.equal(stale.json().error, "sign_in_again");
  await t.close();
});

test("deleting an account deletes its reports", async () => {
  const t = setup();
  await t.signIn();
  await t.call("POST", "/api/reports", report());
  await t.call("DELETE", "/api/me", { confirm: "learner@example.com" });
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM reports").get().n, 0);
  await t.close();
});

test("a Say it report can say the microphone heard the learner wrong", async () => {
  const t = setup();
  await t.signIn();
  const say = report({ game: "say", reason: "misheard", context: { heard: ["hello there"] } });
  assert.equal((await t.call("POST", "/api/reports", say)).statusCode, 201);
  await t.close();
});
