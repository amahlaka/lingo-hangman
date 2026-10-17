import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { setup } from "./helpers.js";
import { resourceMetadata, serverMetadata } from "../src/mcp/oauth.js";

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

const form = (t, url, body, { cookie, headers = {} } = {}) =>
  t.app.inject({
    method: "POST",
    url,
    payload: new URLSearchParams(body).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie: `lingo_session=${cookie}` } : {}), ...headers },
  });

async function register(t, body = {}) {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/oauth/register",
    payload: { client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none", ...body },
  });
  return res;
}

const authorizeUrl = (clientId, extra = {}) =>
  `/api/oauth/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st8",
    scope: "admin",
    resource: "https://lingo.example/api/mcp",
    ...extra,
  })}`;

// Opens the approval page as the signed-in admin and presses a button.
async function approve(t, clientId, decision = "allow") {
  const pageRes = await t.app.inject({ method: "GET", url: authorizeUrl(clientId), headers: { cookie: `lingo_session=${t.cookie}` } });
  assert.equal(pageRes.statusCode, 200);
  assert.match(pageRes.headers["content-security-policy"], /form-action 'self' https:\/\/claude\.ai/);
  // Browsers send "Origin: null" on a form POST from a no-referrer page.
  assert.equal(pageRes.headers["referrer-policy"], "same-origin");
  const request = pageRes.body.match(/name="request" value="([^"]+)"/)[1];
  return form(t, "/api/oauth/authorize", { request, decision }, { cookie: t.cookie, headers: { origin: "https://lingo.example" } });
}

const mcpPing = (t, token) =>
  t.app.inject({ method: "POST", url: "/api/mcp", payload: { jsonrpc: "2.0", id: 1, method: "ping" }, headers: { authorization: `Bearer ${token}` } });

test("discovery: the 401 points to the metadata, and nginx serves the same copy", async () => {
  const t = setup();
  const res = await mcpPing(t, "nope");
  assert.equal(res.statusCode, 401);
  assert.match(res.headers["www-authenticate"], /resource_metadata="https:\/\/lingo\.example\/api\/oauth\/protected-resource"/);
  const prm = (await t.call("GET", "/api/oauth/protected-resource")).json();
  assert.deepEqual(prm.authorization_servers, ["https://lingo.example"]);
  assert.equal(prm.resource, "https://lingo.example/api/mcp");
  const asm = (await t.call("GET", "/api/oauth/metadata")).json();
  assert.equal(asm.token_endpoint, "https://lingo.example/api/oauth/token");

  // The static copies at the live site's root must match what the API says.
  const conf = fs.readFileSync(new URL("../../deploy/preview/nginx.conf", import.meta.url), "utf8");
  const served = [...conf.matchAll(/return 200 '(\{.*\})';/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(served, [serverMetadata("https://lingo.bololoo.com"), resourceMetadata("https://lingo.bololoo.com")]);
  await t.close();
});

test("registration only takes claude.ai's or loopback callbacks", async () => {
  const t = setup();
  assert.equal((await register(t, { redirect_uris: ["https://evil.example/cb"] })).statusCode, 400);
  assert.equal((await register(t, { token_endpoint_auth_method: "private_key_jwt" })).statusCode, 400);
  const local = await register(t, { redirect_uris: ["http://localhost:33418/callback"] });
  assert.equal(local.statusCode, 201);
  assert.equal(local.json().client_secret, undefined);
  const withSecret = (await register(t, { token_endpoint_auth_method: "client_secret_post" })).json();
  assert.ok(withSecret.client_secret);
  await t.close();
});

test("the whole flow: sign in, allow, tokens, MCP, refresh, revoke", async () => {
  const t = setup();
  const client = (await register(t)).json();

  // Signed out: a link to sign in, and after it /api/oauth/continue comes back here.
  const out = await t.app.inject({ method: "GET", url: authorizeUrl(client.client_id) });
  assert.equal(out.statusCode, 200);
  assert.match(out.body, /href="\/account\?next=oauth"/);
  const resume = out.cookies.find((c) => c.name === "lingo_oauth_resume");
  assert.equal(resume.path, "/api/oauth");
  const cont = await t.app.inject({ method: "GET", url: "/api/oauth/continue", headers: { cookie: `lingo_oauth_resume=${resume.value}` } });
  assert.equal(cont.statusCode, 303);
  assert.equal(cont.headers.location, authorizeUrl(client.client_id));
  // Used once; unknown ids go to the Account page.
  const again = await t.app.inject({ method: "GET", url: "/api/oauth/continue", headers: { cookie: `lingo_oauth_resume=${resume.value}` } });
  assert.equal(again.headers.location, "/account");

  await t.signIn("boss@example.com");
  const allowed = await approve(t, client.client_id);
  assert.equal(allowed.statusCode, 303);
  const back = new URL(allowed.headers.location);
  assert.equal(`${back.origin}${back.pathname}`, CALLBACK);
  assert.equal(back.searchParams.get("state"), "st8");
  assert.equal(back.searchParams.get("iss"), "https://lingo.example");
  const code = back.searchParams.get("code");

  const exchange = (extra = {}) =>
    form(t, "/api/oauth/token", { grant_type: "authorization_code", code, redirect_uri: CALLBACK, client_id: client.client_id, code_verifier: verifier, ...extra });
  assert.equal((await exchange({ code_verifier: "x".repeat(43) })).json().error, "invalid_grant");
  // That try used the code up.
  assert.equal((await exchange()).json().error, "invalid_grant");

  const code2 = new URL((await approve(t, client.client_id)).headers.location).searchParams.get("code");
  const tokens = (await exchange({ code: code2 })).json();
  assert.equal(tokens.token_type, "Bearer");
  assert.equal(tokens.expires_in, 3600);
  assert.equal((await mcpPing(t, tokens.access_token)).statusCode, 200);

  const listed = (await t.call("GET", "/api/admin/tokens")).json().tokens;
  assert.deepEqual(listed.map((x) => [x.name, x.connector]), [["Claude", true]]);

  const refresh = (rt) => form(t, "/api/oauth/token", { grant_type: "refresh_token", refresh_token: rt, client_id: client.client_id });
  const renewed = (await refresh(tokens.refresh_token)).json();
  assert.ok(renewed.access_token && renewed.access_token !== tokens.access_token);
  assert.equal((await mcpPing(t, tokens.access_token)).statusCode, 401);
  assert.equal((await mcpPing(t, renewed.access_token)).statusCode, 200);
  assert.equal((await refresh(tokens.refresh_token)).json().error, "invalid_grant");
  assert.equal((await t.call("GET", "/api/admin/tokens")).json().tokens.length, 1);

  // Disconnecting on /admin/ai ends both tokens.
  await t.call("POST", "/api/admin/tokens/revoke", { id: listed[0].id });
  assert.equal((await mcpPing(t, renewed.access_token)).statusCode, 401);
  assert.equal((await refresh(renewed.refresh_token)).json().error, "invalid_grant");
  await t.close();
});

test("deny, foreign origins, bad requests and non-admins", async () => {
  const t = setup();
  const client = (await register(t)).json();
  await t.signIn("boss@example.com");

  const denied = await approve(t, client.client_id, "deny");
  assert.equal(new URL(denied.headers.location).searchParams.get("error"), "access_denied");

  // A form posted from another site.
  const pageRes = await t.app.inject({ method: "GET", url: authorizeUrl(client.client_id), headers: { cookie: `lingo_session=${t.cookie}` } });
  const request = pageRes.body.match(/name="request" value="([^"]+)"/)[1];
  const evil = await form(t, "/api/oauth/authorize", { request, decision: "allow" }, { cookie: t.cookie, headers: { origin: "https://evil.example" } });
  assert.equal(evil.statusCode, 403);

  // No PKCE, or an unregistered callback.
  const noPkce = await t.app.inject({ method: "GET", url: authorizeUrl(client.client_id, { code_challenge_method: "plain" }), headers: { cookie: `lingo_session=${t.cookie}` } });
  assert.equal(new URL(noPkce.headers.location).searchParams.get("error"), "invalid_request");
  const wrongCb = await t.app.inject({ method: "GET", url: authorizeUrl(client.client_id, { redirect_uri: "http://localhost:1/x" }) });
  assert.equal(wrongCb.statusCode, 400);

  // A learner can't approve.
  t.cookie = null;
  await t.signIn("learner@example.com");
  const learner = await t.app.inject({ method: "GET", url: authorizeUrl(client.client_id), headers: { cookie: `lingo_session=${t.cookie}` } });
  assert.equal(learner.statusCode, 403);
  await t.close();
});

test("a client with a secret must send it", async () => {
  const t = setup();
  const client = (await register(t, { token_endpoint_auth_method: "client_secret_basic" })).json();
  await t.signIn("boss@example.com");
  const code = new URL((await approve(t, client.client_id)).headers.location).searchParams.get("code");
  const body = { grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: verifier };
  const noSecret = await form(t, "/api/oauth/token", { ...body, client_id: client.client_id });
  assert.equal(noSecret.statusCode, 401);
  const code2 = new URL((await approve(t, client.client_id)).headers.location).searchParams.get("code");
  const basic = Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64");
  const ok = await form(t, "/api/oauth/token", { ...body, code: code2 }, { headers: { authorization: `Basic ${basic}` } });
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.json().access_token);
  await t.close();
});
