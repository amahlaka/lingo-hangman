import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { emptyProgress } from "../../src/lib/progress.js";
import { localNow, reminderFor, runReminders } from "../src/push/reminders.js";

const VAPID = { VAPID_PUBLIC_KEY: "BPublicKeyForTests", VAPID_PRIVATE_KEY: "private-key-for-tests" };
const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
};

function fakePush({ status } = {}) {
  const sent = [];
  const send = async (sub, message) => {
    if (status) throw Object.assign(new Error("push service"), { statusCode: status });
    sent.push({ endpoint: sub.endpoint, message });
  };
  return { sent, send };
}

const userId = (t, email = "learner@example.com") => t.db.prepare("SELECT id FROM users WHERE email = ?").get(email).id;

function setState(t, id, state) {
  t.db.prepare("INSERT OR REPLACE INTO account_state (user_id, state) VALUES (?, ?)").run(id, JSON.stringify(state));
}

test("reminders need an account, and the server's keys to subscribe", async () => {
  const t = setup();
  assert.equal((await t.call("GET", "/api/push")).statusCode, 401);
  await t.signIn();
  const view = (await t.call("GET", "/api/push")).json();
  assert.equal(view.available, false);
  assert.equal(view.enabled, false);
  assert.deepEqual(view.kinds, ["goal", "streak"]);
  assert.equal((await t.call("POST", "/api/push/subscribe", SUB)).statusCode, 503);
  await t.close();
});

test("subscriptions only go to the browsers' push services", async () => {
  const t = setup(VAPID, { push: fakePush().send });
  await t.signIn();
  for (const endpoint of ["http://fcm.googleapis.com/x", "https://kokoro-tts:8000/tts", "https://evil.example/push", "https://googleapis.com.evil.example/x", "https://fcm.googleapis.com:8443/x"]) {
    assert.equal((await t.call("POST", "/api/push/subscribe", { ...SUB, endpoint })).statusCode, 400, endpoint);
  }
  assert.equal((await t.call("POST", "/api/push/subscribe", { ...SUB, keys: { p256dh: "short", auth: "x" } })).statusCode, 400);
  const ok = await t.call("POST", "/api/push/subscribe", SUB);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().thisDevice, true);
  assert.equal(ok.json().devices, 1);
  // Subscribing again (a new endpoint for the same device) replaces it.
  const again = await t.call("POST", "/api/push/subscribe", { ...SUB, endpoint: "https://web.push.apple.com/QOk1" });
  assert.equal(again.json().devices, 1);
  const off = await t.call("DELETE", "/api/push/subscribe", {});
  assert.equal(off.json().devices, 0);
  await t.close();
});

test("settings are checked and kept", async () => {
  const t = setup(VAPID, { push: fakePush().send });
  await t.signIn();
  assert.equal((await t.call("PUT", "/api/push/settings", { enabled: true, time: "25:00" })).statusCode, 400);
  assert.equal((await t.call("PUT", "/api/push/settings", { enabled: true, timeZone: "Mars/Olympus" })).statusCode, 400);
  assert.equal((await t.call("PUT", "/api/push/settings", { enabled: true, kinds: ["spam"] })).statusCode, 400);
  const res = await t.call("PUT", "/api/push/settings", { enabled: true, time: "07:30", timeZone: "Europe/Helsinki", kinds: ["goal"], lang: "fi" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    (({ enabled, time, timeZone, kinds }) => ({ enabled, time, timeZone, kinds }))(res.json()),
    { enabled: true, time: "07:30", timeZone: "Europe/Helsinki", kinds: ["goal"] }
  );
  // A partial update keeps the rest.
  const off = (await t.call("PUT", "/api/push/settings", { enabled: false })).json();
  assert.equal(off.enabled, false);
  assert.equal(off.time, "07:30");
  const exported = (await t.call("GET", "/api/me/export")).json();
  assert.deepEqual(exported.reminders.settings, { enabled: false, time: "07:30", timeZone: "Europe/Helsinki", kinds: ["goal"], language: "fi" });
  await t.close();
});

test("a test reminder goes to this device only", async () => {
  const push = fakePush();
  const t = setup(VAPID, { push: push.send });
  await t.signIn();
  assert.equal((await t.call("POST", "/api/push/test", {})).statusCode, 409);
  const first = t.cookie;
  await t.call("POST", "/api/push/subscribe", SUB);
  t.cookie = null;
  await t.signIn();
  await t.call("POST", "/api/push/subscribe", { ...SUB, endpoint: "https://updates.push.services.mozilla.com/wpush/v2/xyz" });
  const res = await t.call("POST", "/api/push/test", {});
  assert.equal(res.json().sent, 1);
  assert.equal(push.sent[0].endpoint, "https://updates.push.services.mozilla.com/wpush/v2/xyz");
  assert.equal(push.sent[0].message.title, "Reminders are on");
  // Signing a device out stops its reminders.
  await t.call("POST", "/api/auth/logout", {}, { cookie: first });
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get().n, 1);
  await t.close();
});

test("which reminder, if any", () => {
  const state = emptyProgress();
  assert.deepEqual(reminderFor(null, ["goal", "streak"], "2026-10-17"), { kind: "goal", n: 10 });
  assert.deepEqual(reminderFor({ ...state, dailyGoal: 5 }, ["goal", "streak"], "2026-10-17"), { kind: "goal", n: 5 });
  const streaky = { ...state, streak: { current: 4, best: 4, lastDay: "2026-10-16", restDays: [] } };
  assert.deepEqual(reminderFor(streaky, ["goal", "streak"], "2026-10-17"), { kind: "streak", n: 4 });
  assert.deepEqual(reminderFor(streaky, ["goal"], "2026-10-17"), { kind: "goal", n: 10 });
  assert.equal(reminderFor(streaky, [], "2026-10-17"), null);
  // Played today, even short of the goal: no reminder.
  const played = { ...streaky, days: { "2026-10-17": { words: 2, solved: 2, xp: 20, goalMet: false } } };
  assert.equal(reminderFor(played, ["goal", "streak"], "2026-10-17"), null);
  assert.deepEqual(localNow(Date.parse("2026-10-16T21:30:00Z"), "Europe/Helsinki"), { day: "2026-10-17", minutes: 30 });
});

test("the scheduler sends once a day, at the learner's time", async () => {
  const push = fakePush();
  const t = setup(VAPID, { push: push.send });
  await t.signIn();
  await t.call("POST", "/api/push/subscribe", SUB);
  await t.call("PUT", "/api/push/settings", { enabled: true, time: "18:00", timeZone: "Europe/Helsinki", lang: "en" });
  const id = userId(t);
  t.db.prepare("UPDATE push_settings SET last_day = NULL").run();
  setState(t, id, { ...emptyProgress(), streak: { current: 3, best: 3, lastDay: "2026-10-15", restDays: [] } });

  // 17:00 in Helsinki (UTC+3 in October): not yet.
  assert.equal(await runReminders(t.db, push.send, { now: Date.parse("2026-10-16T14:00:00Z") }), 0);
  assert.equal(await runReminders(t.db, push.send, { now: Date.parse("2026-10-16T15:05:00Z") }), 1);
  assert.equal(push.sent[0].message.title, "Keep your streak going");
  assert.match(push.sent[0].message.body, /3-day streak/);
  assert.equal(await runReminders(t.db, push.send, { now: Date.parse("2026-10-16T15:10:00Z") }), 0);

  // The next day they played before 18:00: quiet.
  setState(t, id, { ...emptyProgress(), days: { "2026-10-17": { words: 3, solved: 3, xp: 30, goalMet: false } } });
  assert.equal(await runReminders(t.db, push.send, { now: Date.parse("2026-10-17T15:05:00Z") }), 0);

  // The server was down until late at night: that day is skipped.
  setState(t, id, emptyProgress());
  assert.equal(await runReminders(t.db, push.send, { now: Date.parse("2026-10-18T20:00:00Z") }), 0);
  assert.equal(t.db.prepare("SELECT last_day FROM push_settings").get().last_day, "2026-10-18");

  // Turned off: nothing.
  await t.call("PUT", "/api/push/settings", { enabled: false });
  assert.equal(await runReminders(t.db, push.send, { now: Date.parse("2026-10-19T15:05:00Z") }), 0);
  assert.equal(push.sent.length, 1);
  await t.close();
});

test("a subscription the push service says is gone is removed", async () => {
  const gone = fakePush({ status: 410 });
  const t = setup(VAPID, { push: gone.send });
  await t.signIn();
  await t.call("POST", "/api/push/subscribe", SUB);
  await t.call("PUT", "/api/push/settings", { enabled: true, time: "18:00", timeZone: "Europe/Helsinki" });
  t.db.prepare("UPDATE push_settings SET last_day = NULL").run();
  assert.equal(await runReminders(t.db, gone.send, { now: Date.parse("2026-10-16T15:05:00Z") }), 0);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get().n, 0);
  // A test reminder to a device that is gone says so.
  await t.call("POST", "/api/push/subscribe", SUB);
  assert.equal((await t.call("POST", "/api/push/test", {})).statusCode, 502);
  // Deleting the account deletes the settings too.
  await t.call("DELETE", "/api/me", { confirm: "learner@example.com" });
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM push_settings").get().n, 0);
  await t.close();
});
