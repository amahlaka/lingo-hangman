import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { setup } from "./helpers.js";
import { makeEvent } from "../../src/lib/syncEvents.js";
import { requestedScope } from "../src/mcp/oauth.js";
import { runStats } from "../src/stats/aggregate.js";

const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const answer = (word, solved, { gameId = "type-it", wrong = [], day = daysAgo(0) } = {}) =>
  makeEvent("answer", { result: { gameId, word, lang: "en", solved, triesLeft: 0, perfect: solved && !wrong.length, wrong, ms: 4000 }, day });

let nextId = 1;
const rpc = (t, token, method, params, { url = "/api/mcp/me" } = {}) =>
  t.app.inject({
    method: "POST",
    url,
    payload: { jsonrpc: "2.0", id: nextId++, method, params },
    headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream" },
  });
const call = async (t, token, name, args = {}) => {
  const res = await rpc(t, token, "tools/call", { name, arguments: args });
  assert.equal(res.statusCode, 200);
  const { result } = res.json();
  return result.isError ? { error: result.content[0].text } : JSON.parse(result.content[0].text);
};

async function learnerToken(t, email = "learner@example.com") {
  t.cookie = null;
  await t.signIn(email);
  const res = await t.call("POST", "/api/me/tokens", { name: "Claude Code" });
  assert.equal(res.statusCode, 201);
  return res.json();
}

test("a learner makes, lists and revokes their own tokens", async () => {
  const t = setup();
  assert.equal((await t.call("GET", "/api/me/tokens")).statusCode, 401);
  const made = await learnerToken(t);
  assert.match(made.token, /^lingo_mcp_/);
  assert.equal(made.scope, "learner");
  const { tokens } = (await t.call("GET", "/api/me/tokens")).json();
  assert.deepEqual(tokens.map((x) => [x.id, x.name, x.token]), [[made.id, "Claude Code", undefined]]);
  assert.equal((await t.call("POST", "/api/me/tokens", { name: "x", days: 7 })).statusCode, 400);
  // In the data export, without the secret.
  const exported = (await t.call("GET", "/api/me/export")).json();
  assert.deepEqual(exported.aiTokens.map((x) => x.name), ["Claude Code"]);
  assert.ok(!JSON.stringify(exported).includes(made.token));

  for (let i = 0; i < 9; i++) await t.call("POST", "/api/me/tokens", { name: `t${i}` });
  assert.equal((await t.call("POST", "/api/me/tokens", { name: "one more" })).json().error, "too_many_tokens");

  assert.equal((await rpc(t, made.token, "ping")).statusCode, 200);
  assert.equal((await t.call("POST", "/api/me/tokens/revoke", { id: made.id })).statusCode, 200);
  assert.equal((await rpc(t, made.token, "ping")).statusCode, 401);
  await t.close();
});

test("each endpoint takes only its own kind of token", async () => {
  const t = setup();
  const mine = await learnerToken(t);
  const res = await rpc(t, mine.token, "ping", undefined, { url: "/api/mcp" });
  assert.equal(res.statusCode, 403);
  assert.match(res.json().error.message, /lingo\.example\/api\/mcp\/me/);

  // The admin's tokens stay on /admin/ai, and a learner's on the Account page.
  t.cookie = null;
  await t.signIn("boss@example.com");
  const admin = (await t.call("POST", "/api/admin/tokens", { name: "Admin" })).json();
  await t.call("POST", "/api/me/tokens", { name: "Mine" });
  assert.deepEqual((await t.call("GET", "/api/admin/tokens")).json().tokens.map((x) => x.name), ["Admin"]);
  assert.deepEqual((await t.call("GET", "/api/me/tokens")).json().tokens.map((x) => x.name), ["Mine"]);
  assert.equal((await t.call("POST", "/api/me/tokens/revoke", { id: admin.id })).statusCode, 404);
  assert.equal((await rpc(t, admin.token, "ping")).statusCode, 403);

  const out = await rpc(t, "nope", "ping");
  assert.equal(out.statusCode, 401);
  assert.match(out.headers["www-authenticate"], /resource_metadata="https:\/\/lingo\.example\/api\/oauth\/protected-resource\/me", scope="learner"/);
  const prm = (await t.call("GET", "/api/oauth/protected-resource/me")).json();
  assert.equal(prm.resource, "https://lingo.example/api/mcp/me");
  assert.deepEqual(prm.scopes_supported, ["learner"]);
  await t.close();
});

test("the tools read only the token's own progress", async () => {
  const t = setup();
  const { token } = await learnerToken(t);

  const init = (await rpc(t, token, "initialize", { protocolVersion: "2025-06-18" })).json().result;
  assert.equal(init.serverInfo.name, "lingo-me");
  assert.match(init.instructions, /app language/);
  const { tools } = (await rpc(t, token, "tools/list")).json().result;
  assert.deepEqual(tools.map((x) => x.name), ["get_my_overview", "get_my_words", "get_my_mistakes", "analyze_my_learning", "get_my_leaderboard"]);
  assert.ok(tools.every((x) => x.annotations.readOnlyHint && !("id" in (x.inputSchema.properties || {}))));
  const { prompts } = (await rpc(t, token, "prompts/list")).json().result;
  assert.deepEqual(prompts.map((p) => p.name), ["review_my_progress", "practice_plan", "explain_my_mistakes"]);

  // Nothing synced yet.
  assert.match((await call(t, token, "get_my_overview")).note, /No answers/);

  // This learner's answers, and another learner's that must not show.
  const mineCookie = t.cookie;
  await t.call("POST", "/api/sync", {
    events: [
      answer("oatmeal", false, { wrong: ["oltmil"] }),
      answer("oatmeal", false, { wrong: ["otmeal"] }),
      answer("cat", true, { day: daysAgo(4) }),
      answer("cat", true, { day: daysAgo(2) }),
      answer("cat", true, { day: daysAgo(1) }),
      ...Array.from({ length: 20 }, (_, i) => answer(`word${i}`, i % 2 === 0, { gameId: "meaning", wrong: i % 2 ? ["other"] : [] })),
    ],
  });
  t.cookie = null;
  await t.signIn("someone@example.com");
  await t.call("POST", "/api/sync", { events: [answer("secretword", false, { wrong: ["sekret"] })] });
  t.cookie = mineCookie;

  const overview = await call(t, token, "get_my_overview");
  assert.equal(overview.language, "en");
  assert.equal(overview.totals.learnedWords, 1);
  assert.equal(overview.dailyGoal.today, 22);
  const typeIt = overview.games.find((g) => g.game === "type-it");
  assert.deepEqual([typeIt.name, typeIt.answers, typeIt.url], ["Type it", 5, "https://lingo.example/type-it"]);
  // Game names follow the app language.
  t.db.prepare("UPDATE users SET lang = 'fi' WHERE email = 'learner@example.com'").run();
  assert.equal((await call(t, token, "get_my_overview")).games.find((g) => g.game === "type-it").name, "Kirjoita se");
  assert.ok(overview.myPath.steps.length > 0);
  assert.ok(overview.myPath.steps.every((s) => s.url && s.goal > 0));

  const tricky = await call(t, token, "get_my_words", {});
  assert.equal(tricky.words[0].word, "oatmeal");
  assert.deepEqual((await call(t, token, "get_my_words", { list: "learned" })).words.map((w) => w.word), ["cat"]);

  const mistakes = await call(t, token, "get_my_mistakes", { game: "type-it" });
  assert.deepEqual(mistakes.kinds, { spelling: 2 });
  assert.deepEqual(mistakes.recent.map((m) => m.given), ["otmeal", "oltmil"]);

  const analysis = await call(t, token, "analyze_my_learning");
  assert.equal(analysis.answered, 25);
  assert.ok(analysis.overall);
  assert.ok(analysis.skills.some((s) => s.skill === "Vocabulary" && s.level));
  assert.ok(analysis.trickiestWords.some((w) => w.word === "oatmeal"));
  assert.ok(analysis.suggestedPractice.myPath.steps.length > 0);

  assert.deepEqual(await call(t, token, "get_my_leaderboard"), { joined: false, week: (await call(t, token, "get_my_leaderboard")).week });

  const everything = JSON.stringify([overview, tricky, mistakes, analysis, await call(t, token, "get_my_words", { list: "all", limit: 500 })]);
  assert.ok(!everything.includes("secretword") && !everything.includes("@example.com"));
  await t.close();
});

test("tricky words say how hard they are for everyone, once enough learners answered", async () => {
  const t = setup();
  for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
    t.cookie = null;
    await t.signIn(email);
    await t.call("POST", "/api/sync", { events: [answer("oatmeal", false, { wrong: ["x"] }), answer("oatmeal", true)] });
  }
  runStats(t.db);
  const { token } = await learnerToken(t, "a@example.com");
  const { words } = await call(t, token, "get_my_words", { list: "tricky" });
  assert.equal(words[0].word, "oatmeal");
  assert.equal(words[0].everyoneFirstTryShare, 0.5);
  await t.close();
});

test("requestedScope: the scope and resource parameters", () => {
  const base = "https://lingo.example";
  assert.equal(requestedScope({}, base), "admin");
  assert.equal(requestedScope({ scope: "learner" }, base), "learner");
  assert.equal(requestedScope({ resource: `${base}/api/mcp/me` }, base), "learner");
  assert.equal(requestedScope({ resource: `${base}/api/mcp/` }, base), "admin");
  assert.equal(requestedScope({ scope: "admin", resource: `${base}/api/mcp/me` }, base), null);
  assert.equal(requestedScope({ scope: "admin learner" }, base), null);
  assert.equal(requestedScope({ scope: "everything" }, base), null);
  assert.equal(requestedScope({ resource: "https://evil.example/api/mcp/me" }, base), null);
});

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
const form = (t, url, body, headers = {}) =>
  t.app.inject({ method: "POST", url, payload: new URLSearchParams(body).toString(), headers: { "content-type": "application/x-www-form-urlencoded", ...headers } });

test("a learner connects claude.ai through OAuth to their own progress", async () => {
  const t = setup();
  const client = (
    await t.app.inject({ method: "POST", url: "/api/oauth/register", payload: { client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" } })
  ).json();
  await t.signIn("learner@example.com");
  const url = (extra = {}) =>
    `/api/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: CALLBACK,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "s",
      scope: "learner",
      resource: "https://lingo.example/api/mcp/me",
      ...extra,
    })}`;
  const cookie = `lingo_session=${t.cookie}`;

  // The admin tools stay closed to a learner.
  assert.equal((await t.app.inject({ method: "GET", url: url({ scope: "admin", resource: "https://lingo.example/api/mcp" }), headers: { cookie } })).statusCode, 403);

  const english = await t.app.inject({ method: "GET", url: url(), headers: { cookie } });
  assert.match(english.body, /asks to read your Lingo progress/);
  // In the learner's app language.
  t.db.prepare("UPDATE users SET lang = 'fi'").run();
  const page = await t.app.inject({ method: "GET", url: url(), headers: { cookie } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /lang="fi"/);
  assert.match(page.body, /edistymistäsi/);
  const request = page.body.match(/name="request" value="([^"]+)"/)[1];
  const allowed = await form(t, "/api/oauth/authorize", { request, decision: "allow" }, { cookie, origin: "https://lingo.example" });
  const code = new URL(allowed.headers.location).searchParams.get("code");
  const tokens = (await form(t, "/api/oauth/token", { grant_type: "authorization_code", code, redirect_uri: CALLBACK, client_id: client.client_id, code_verifier: verifier })).json();
  assert.equal(tokens.scope, "learner");
  assert.equal((await rpc(t, tokens.access_token, "ping")).statusCode, 200);
  assert.equal((await rpc(t, tokens.access_token, "ping", undefined, { url: "/api/mcp" })).statusCode, 403);

  const renewed = (await form(t, "/api/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id })).json();
  assert.equal(renewed.scope, "learner");
  assert.equal((await rpc(t, renewed.access_token, "ping")).statusCode, 200);

  const listed = (await t.call("GET", "/api/me/tokens")).json().tokens;
  assert.deepEqual(listed.map((x) => [x.name, x.connector]), [["Claude", true]]);
  await t.call("POST", "/api/me/tokens/revoke", { id: listed[0].id });
  assert.equal((await rpc(t, renewed.access_token, "ping")).statusCode, 401);
  await t.close();
});
