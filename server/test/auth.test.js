import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";

test("a code signs up a new learner and sets a session cookie", async () => {
  const t = setup();
  const res = await t.call("POST", "/api/auth/code", { email: " Learner@Example.com ", lang: "fi" });
  assert.equal(res.statusCode, 202);
  const [mail] = await t.flushMail();
  assert.equal(mail.to, "learner@example.com");
  assert.equal(mail.template, "code");
  assert.match(mail.subject, /^Lingo-koodisi: \d{6}$/);
  assert.match(mail.html, /<p/);
  const code = mail.text.match(/\d{6}/)[0];

  const verify = await t.call("POST", "/api/auth/verify", { email: "learner@example.com", code });
  assert.equal(verify.statusCode, 200);
  assert.deepEqual(verify.json(), { created: true, passkeys: 0 });
  const cookie = verify.cookies.find((c) => c.name === "lingo_session");
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, "Lax");
  assert.equal(cookie.path, "/api");

  const me = await t.call("GET", "/api/me");
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.email, "learner@example.com");
  assert.equal(me.json().user.role, "learner");
  assert.equal(me.json().sessions[0].device, "Chrome on Windows");
  assert.equal(me.json().sessions[0].current, true);

  // A code works once.
  t.cookie = null;
  const again = await t.call("POST", "/api/auth/verify", { email: "learner@example.com", code });
  assert.equal(again.json().error, "code_expired");

  // The second sign-in finds the same account.
  const second = await t.signIn("learner@example.com");
  assert.deepEqual(second.json(), { created: false, passkeys: 0 });
  await t.close();
});

test("only a hash of the code and of the session is stored", async () => {
  const t = setup();
  await t.call("POST", "/api/auth/code", { email: "a@example.com" });
  const [mail] = await t.flushMail();
  const code = mail.text.match(/\d{6}/)[0];
  assert.notEqual(t.db.prepare("SELECT code_hash FROM login_codes").get().code_hash, code);
  // Sent mail keeps no body or code.
  assert.equal(t.db.prepare("SELECT data FROM mail_queue").get().data, "{}");
  await t.call("POST", "/api/auth/verify", { email: "a@example.com", code });
  assert.notEqual(t.db.prepare("SELECT id_hash FROM sessions").get().id_hash, t.cookie);
  await t.close();
});

test("wrong codes count, and five end the code", async () => {
  const t = setup();
  await t.call("POST", "/api/auth/code", { email: "a@example.com" });
  const [mail] = await t.flushMail();
  const code = mail.text.match(/\d{6}/)[0];
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i++) {
    const res = await t.call("POST", "/api/auth/verify", { email: "a@example.com", code: wrong });
    assert.equal(res.json().error, "wrong_code");
  }
  const fifth = await t.call("POST", "/api/auth/verify", { email: "a@example.com", code: wrong });
  assert.equal(fifth.json().error, "code_expired");
  const right = await t.call("POST", "/api/auth/verify", { email: "a@example.com", code });
  assert.equal(right.json().error, "code_expired");
  assert.equal(t.cookie, null);
  await t.close();
});

test("bad emails are refused and code requests are rate limited per email", async () => {
  const t = setup();
  assert.equal((await t.call("POST", "/api/auth/code", { email: "nope" })).statusCode, 400);
  for (let i = 0; i < 5; i++) {
    assert.equal((await t.call("POST", "/api/auth/code", { email: "a@example.com" })).statusCode, 202);
  }
  assert.equal((await t.call("POST", "/api/auth/code", { email: "a@example.com" })).statusCode, 429);
  assert.equal((await t.call("POST", "/api/auth/code", { email: "b@example.com" })).statusCode, 202);
  await t.close();
});

test("an expired code mail is dropped, not sent", async () => {
  const t = setup();
  await t.call("POST", "/api/auth/code", { email: "a@example.com" });
  t.db.prepare("UPDATE mail_queue SET drop_after = 1").run();
  assert.deepEqual(await t.flushMail(), []);
  assert.equal(t.db.prepare("SELECT status FROM mail_queue").get().status, "dropped");
  await t.close();
});

test("failed mail is retried later", async () => {
  const t = setup();
  let fail = true;
  t.mailer.send = async () => {
    if (fail) throw new Error("smtp down");
  };
  await t.call("POST", "/api/auth/code", { email: "a@example.com" });
  await t.flushMail();
  const row = t.db.prepare("SELECT * FROM mail_queue").get();
  assert.equal(row.status, "pending");
  assert.equal(row.tries, 1);
  assert.ok(row.next_try_at > Date.now());
  await t.close();
});

test("admins come from ADMIN_EMAILS", async () => {
  const t = setup();
  await t.signIn("boss@example.com");
  assert.equal((await t.call("GET", "/api/me")).json().user.role, "admin");
  await t.close();
});

test("writes need the app's header and origin", async () => {
  const t = setup();
  const noHeader = await t.call("POST", "/api/auth/code", { email: "a@example.com" }, { headers: { "x-lingo": "" } });
  assert.equal(noHeader.statusCode, 403);
  const otherSite = await t.call("POST", "/api/auth/code", { email: "a@example.com" }, { headers: { origin: "https://evil.example" } });
  assert.equal(otherSite.statusCode, 403);
  await t.close();
});

test("signed out, account routes answer 401", async () => {
  const t = setup();
  assert.equal((await t.call("GET", "/api/me")).statusCode, 401);
  assert.equal((await t.call("GET", "/api/me", null, { cookie: "made-up" })).statusCode, 401);
  await t.close();
});

test("logout ends the session", async () => {
  const t = setup();
  await t.signIn();
  const old = t.cookie;
  await t.call("POST", "/api/auth/logout");
  assert.equal(t.cookie, null);
  assert.equal((await t.call("GET", "/api/me", null, { cookie: old })).statusCode, 401);
  await t.close();
});

test("another device can be signed out", async () => {
  const t = setup();
  await t.signIn();
  const first = t.cookie;
  await t.signIn();
  const me = (await t.call("GET", "/api/me")).json();
  assert.equal(me.sessions.length, 2);
  const other = me.sessions.find((s) => !s.current);
  assert.equal((await t.call("DELETE", `/api/me/sessions/${other.id}`)).statusCode, 200);
  assert.equal((await t.call("GET", "/api/me", null, { cookie: first })).statusCode, 401);
  assert.equal((await t.call("GET", "/api/me")).statusCode, 200);
  await t.close();
});

test("export holds the account, and deleting needs the email typed", async () => {
  const t = setup();
  await t.signIn("a@example.com");
  const exp = await t.call("GET", "/api/me/export");
  assert.match(exp.headers["content-disposition"], /attachment/);
  assert.equal(exp.json().account.email, "a@example.com");
  assert.equal(exp.json().sessions.length, 1);

  assert.equal((await t.call("DELETE", "/api/me", { confirm: "wrong@example.com" })).statusCode, 400);
  const del = await t.call("DELETE", "/api/me", { confirm: "A@example.com" });
  assert.equal(del.statusCode, 200);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 0);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
  const mails = await t.flushMail();
  assert.equal(mails.at(-1).template, "accountDeleted");
  await t.close();
});

test("passkey sign-in options are discoverable and challenges are single use", async () => {
  const t = setup();
  const res = await t.call("POST", "/api/auth/passkey/options");
  const { challengeId, options } = res.json();
  assert.equal(options.rpId, "lingo.example");
  assert.equal(options.allowCredentials, undefined);
  const fake = { id: "abc", rawId: "abc", type: "public-key", response: {}, clientExtensionResults: {} };
  const unknown = await t.call("POST", "/api/auth/passkey/verify", { challengeId, response: fake });
  assert.equal(unknown.json().error, "unknown_passkey");
  const reused = await t.call("POST", "/api/auth/passkey/verify", { challengeId, response: fake });
  assert.equal(reused.json().error, "challenge_expired");
  await t.close();
});

test("passkey registration options ask for a discoverable credential", async () => {
  const t = setup();
  await t.signIn("a@example.com");
  const { options } = (await t.call("POST", "/api/me/passkeys/options")).json();
  assert.equal(options.rp.id, "lingo.example");
  assert.equal(options.user.name, "a@example.com");
  assert.equal(options.authenticatorSelection.residentKey, "required");
  // A made-up response is refused, and the challenge is then used up.
  const bad = await t.call("POST", "/api/me/passkeys", { response: { id: "x", rawId: "x", type: "public-key", response: {} } });
  assert.equal(bad.json().error, "passkey_failed");
  const again = await t.call("POST", "/api/me/passkeys", { response: { id: "x" } });
  assert.equal(again.json().error, "challenge_expired");
  await t.close();
});

test("every route has a per-address ceiling", async () => {
  const t = setup({ RATE_LIMIT_PER_MINUTE: "5" });
  for (let i = 0; i < 5; i++) assert.equal((await t.call("GET", "/api/me")).statusCode, 401);
  const res = await t.call("GET", "/api/me");
  assert.equal(res.statusCode, 429);
  assert.equal(res.json().error, "too_many_requests");
  await t.close();
});
