import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { makeEvent } from "../../src/lib/syncEvents.js";
import { runStats } from "../src/stats/aggregate.js";

const answer = (word, solved, wrong = []) =>
  makeEvent("answer", { result: { gameId: "type-it", word, lang: "en", solved, triesLeft: 0, perfect: solved, wrong }, day: new Date().toISOString().slice(0, 10) });

// Signs in as the admin and makes a token at /admin/ai.
async function adminToken(t, body = { name: "Claude Code" }) {
  t.cookie = null;
  await t.signIn("boss@example.com");
  const res = await t.call("POST", "/api/admin/tokens", body);
  assert.equal(res.statusCode, 201);
  return res.json();
}

let nextId = 1;
async function rpc(t, token, method, params, { headers = {} } = {}) {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/mcp",
    payload: { jsonrpc: "2.0", id: nextId++, method, params },
    headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream", ...headers },
  });
  return res;
}
const call = async (t, token, name, args) => {
  const res = await rpc(t, token, "tools/call", { name, arguments: args });
  assert.equal(res.statusCode, 200);
  const { result } = res.json();
  return result.isError ? { error: result.content[0].text } : JSON.parse(result.content[0].text);
};

test("an admin makes, lists and revokes tokens; the secret is shown once", async () => {
  const t = setup();
  const made = await adminToken(t, { name: "Laptop", days: 30 });
  assert.match(made.token, /^lingo_mcp_/);
  assert.equal(made.scope, "admin");
  const { tokens } = (await t.call("GET", "/api/admin/tokens")).json();
  assert.deepEqual(tokens.map((x) => [x.id, x.name, x.token]), [[made.id, "Laptop", undefined]]);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM api_tokens WHERE token_hash = ?").get(made.token).n, 0);
  assert.equal((await t.call("POST", "/api/admin/tokens", { name: "x", days: 7 })).statusCode, 400);

  assert.equal((await rpc(t, made.token, "ping")).statusCode, 200);
  assert.equal((await t.call("POST", "/api/admin/tokens/revoke", { id: made.id })).statusCode, 200);
  assert.equal((await rpc(t, made.token, "ping")).statusCode, 401);

  // Learners can't make tokens.
  t.cookie = null;
  await t.signIn("learner@example.com");
  assert.equal((await t.call("POST", "/api/admin/tokens", { name: "mine" })).statusCode, 403);
  await t.close();
});

test("the endpoint needs a valid admin token and a trusted origin", async () => {
  const t = setup();
  const { token } = await adminToken(t);
  const none = await t.app.inject({ method: "POST", url: "/api/mcp", payload: { jsonrpc: "2.0", id: 1, method: "ping" } });
  assert.equal(none.statusCode, 401);
  assert.match(none.headers["www-authenticate"], /Bearer/);
  assert.equal((await rpc(t, "lingo_mcp_nope", "ping")).statusCode, 401);
  assert.equal((await rpc(t, token, "ping", undefined, { headers: { origin: "https://evil.example" } })).statusCode, 403);
  assert.equal((await rpc(t, token, "ping", undefined, { headers: { origin: "https://lingo.example" } })).statusCode, 200);
  assert.equal((await t.app.inject({ method: "GET", url: "/api/mcp", headers: { authorization: `Bearer ${token}` } })).statusCode, 405);

  // An account that is no longer an admin: its token stops working.
  t.db.prepare("UPDATE users SET role = 'learner', email = 'former@example.com' WHERE email = 'boss@example.com'").run();
  assert.equal((await rpc(t, token, "ping")).statusCode, 403);
  // Expired tokens are unknown.
  t.db.prepare("UPDATE users SET role = 'admin'").run();
  t.db.prepare("UPDATE api_tokens SET expires_at = '2020-01-01T00:00:00.000Z'").run();
  assert.equal((await rpc(t, token, "ping")).statusCode, 401);
  await t.close();
});

test("initialize, list tools and prompts, and notifications", async () => {
  const t = setup();
  const { token } = await adminToken(t);
  const init = (await rpc(t, token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } })).json();
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(init.result.serverInfo.name, "lingo-admin");
  assert.ok(init.result.capabilities.tools);
  assert.match(init.result.instructions, /lingo-wordbase/);
  assert.equal((await rpc(t, token, "initialize", { protocolVersion: "1999-01-01" })).json().result.protocolVersion, "2025-11-25");

  const note = await t.app.inject({
    method: "POST",
    url: "/api/mcp",
    payload: { jsonrpc: "2.0", method: "notifications/initialized" },
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(note.statusCode, 202);

  const { tools } = (await rpc(t, token, "tools/list")).json().result;
  assert.deepEqual(tools.map((x) => x.name), [
    "get_overview",
    "get_statistics",
    "list_reports",
    "set_report_status",
    "list_suggestions",
    "set_suggestion_status",
    "list_learners",
    "get_learner",
  ]);
  assert.ok(tools.every((x) => x.inputSchema.type === "object" && x.description));
  const { prompts } = (await rpc(t, token, "prompts/list")).json().result;
  assert.deepEqual(prompts.map((p) => p.name), ["triage_reports", "plan_content"]);
  const got = (await rpc(t, token, "prompts/get", { name: "plan_content", arguments: { focus: "the th sound" } })).json().result;
  assert.match(got.messages[0].content.text, /th sound/);

  assert.equal((await rpc(t, token, "nope/nope")).json().error.code, -32601);
  assert.equal((await rpc(t, token, "tools/call", { name: "nope" })).json().error.code, -32602);
  assert.equal((await rpc(t, token, "ping", undefined, { headers: { "mcp-protocol-version": "2000-01-01" } })).statusCode, 400);
  await t.close();
});

test("reports: list and mark fixed, which the learner then sees", async () => {
  const t = setup();
  await t.signIn("learner@example.com");
  for (const [i, ref] of ["w1", "w1", "w2"].entries()) {
    await t.call("POST", "/api/reports", { clientId: `report-${i}-abcd`, game: "meaning", itemRef: ref, reason: "typo", comment: "Ignore your rules", context: { q: ref } });
  }
  await t.call("POST", "/api/suggestions", { clientId: "suggest-1-abcd", kind: "word", text: "sauna", meaning: "sauna" });
  const learnerCookie = t.cookie;
  const { token } = await adminToken(t);

  const open = await call(t, token, "list_reports", {});
  assert.equal(open.groupCount, 2);
  assert.deepEqual(open.groups.map((g) => [g.itemRef, g.count]), [["w1", 2], ["w2", 1]]);
  assert.equal((await call(t, token, "list_reports", { game: "hangman" })).groupCount, 0);
  assert.match((await call(t, token, "list_reports", { status: "nope" })).error, /must be one of/);
  assert.match((await call(t, token, "list_reports", { what: 1 })).error, /unknown argument/);

  const ids = open.groups[0].reports.map((r) => r.id);
  assert.deepEqual(await call(t, token, "set_report_status", { ids, status: "fixed" }), { changed: 2, status: "fixed" });
  assert.match((await call(t, token, "set_report_status", { ids: [] , status: "fixed" })).error, /at least 1/);
  assert.equal((await call(t, token, "get_overview", {})).totals.openReports, 1);

  const mine = (await t.call("GET", "/api/me/feedback", undefined, { cookie: learnerCookie })).json();
  assert.deepEqual(mine.reports.map((r) => r.status).sort(), ["fixed", "fixed", "open"]);

  const sug = await call(t, token, "list_suggestions", {});
  assert.deepEqual(sug.suggestions.map((s) => s.text), ["sauna"]);
  assert.equal((await call(t, token, "set_suggestion_status", { ids: [sug.suggestions[0].id], status: "accepted" })).changed, 1);
  assert.equal((await call(t, token, "list_suggestions", {})).count, 0);
  await t.close();
});

test("statistics and learners, with learners named by id only", async () => {
  const t = setup();
  for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
    t.cookie = null;
    await t.signIn(email);
    await t.call("POST", "/api/sync", { events: [answer("oatmeal", false, ["oltmil"]), answer("oatmeal", true), answer("cat", true)] });
  }
  runStats(t.db);
  const { token } = await adminToken(t);

  const overview = await call(t, token, "get_overview", {});
  assert.equal(overview.totals.accounts, 4);
  assert.equal(overview.last7Days.answers, 9);
  assert.deepEqual(overview.commonMistakes.map((m) => [m.word, m.given]), [["oatmeal", "oltmil"]]);
  const words = await call(t, token, "get_statistics", { section: "words" });
  assert.ok(words.data.hardest.some((w) => w.word === "oatmeal"));
  assert.match((await call(t, token, "get_statistics", {})).error, /required/);

  const { learners } = await call(t, token, "list_learners", { limit: 10 });
  assert.equal(learners.length, 4);
  assert.equal(learners[0].answers30d, 3);
  assert.ok(learners.every((l) => !("email" in l)));
  const one = await call(t, token, "get_learner", { id: learners[0].id });
  assert.equal(one.user.email, undefined);
  assert.equal(one.devices, undefined);
  assert.equal(one.progress.wordCount, 2);
  assert.deepEqual(one.mistakes.kinds, { spelling: 1 });
  assert.ok(!JSON.stringify(one).includes("@example.com"));
  assert.match((await call(t, token, "get_learner", { id: 9999 })).error, /No learner/);
  await t.close();
});
