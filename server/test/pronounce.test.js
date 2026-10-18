import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { cleanPhones, wavInfo } from "../src/routes/pronounce.js";

const TALKIES = { TALKIES_URL: "http://talkies:8000", TALKIES_TOKEN: "secret", PRONOUNCE_DAILY_LIMIT: "2" };

// A 16 kHz, 16-bit mono WAV of silence, `seconds` long.
function wav(seconds = 1, { rate = 16000, channels = 1 } = {}) {
  const data = Math.round(seconds * rate) * 2 * channels;
  const buf = Buffer.alloc(44 + data);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + data, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2 * channels, 28);
  buf.writeUInt16LE(2 * channels, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(data, 40);
  return buf;
}

// A fake Talkies service.
function fakeTalkies({ status = 200, text = "θ ɹ i", delay = 0 } = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, opts) => {
      const file = opts.body.get("file");
      calls.push({ url, headers: opts.headers, model: opts.body.get("model"), size: file.size, type: file.type });
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return { ok: status === 200, status, json: async () => ({ text }) };
    },
  };
}

const send = (t, body = wav()) => t.call("POST", "/api/pronounce", body, { headers: { "content-type": "audio/wav" } });

async function verified(t, email = "learner@example.com") {
  await t.signIn(email);
  t.db.prepare("UPDATE users SET role = 'verified' WHERE email = ?").run(email);
}

test("scoring needs an account, verification and the service", async () => {
  const fake = fakeTalkies();
  const t = setup(TALKIES, { pronounce: fake });
  assert.equal((await send(t)).statusCode, 401);
  await t.signIn();
  const status = (await t.call("GET", "/api/pronounce/status")).json();
  assert.deepEqual(status, { available: true, allowed: false, limit: 2, left: 2, requested: false });
  const refused = await send(t);
  assert.equal(refused.statusCode, 403);
  assert.equal(refused.json().error, "not_verified");
  assert.equal(fake.calls.length, 0);
  await t.close();

  const off = setup({}, { pronounce: fake });
  await verified(off);
  assert.equal((await off.call("GET", "/api/pronounce/status")).json().available, false);
  assert.equal((await send(off)).statusCode, 503);
  await off.close();
});

test("a verified learner's clip goes to the phoneme model and comes back as sounds", async () => {
  const fake = fakeTalkies({ text: " θ ɹ iː <|end|> " });
  const t = setup(TALKIES, { pronounce: fake });
  await verified(t);
  const res = await send(t);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { phones: "θ ɹ iː end", left: 1 });
  assert.equal(fake.calls[0].url, "http://talkies:8000/v1/audio/transcriptions");
  assert.equal(fake.calls[0].model, "zipa-ipa");
  assert.equal(fake.calls[0].headers.authorization, "Bearer secret");
  assert.equal(fake.calls[0].type, "audio/wav");
  assert.equal(fake.calls[0].size, wav().length);

  assert.equal((await send(t)).statusCode, 200);
  const over = await send(t);
  assert.equal(over.statusCode, 429);
  assert.equal(over.json().error, "pronounce_limit");
  assert.equal((await t.call("GET", "/api/pronounce/status")).json().left, 0);
  // Admins can play too.
  await t.signIn("boss@example.com");
  assert.equal((await send(t)).statusCode, 200);
  await t.close();
});

test("a longer reading counts more of the daily limit", async () => {
  const t = setup({ ...TALKIES, PRONOUNCE_DAILY_LIMIT: "10" }, { pronounce: fakeTalkies() });
  await verified(t);
  assert.equal((await send(t, wav(12))).json().left, 7);
  assert.equal((await send(t, wav(2))).json().left, 6);
  await t.close();
});

test("only short 16 kHz mono WAV clips are sent", async () => {
  const fake = fakeTalkies();
  const t = setup(TALKIES, { pronounce: fake });
  await verified(t);
  for (const body of [wav(0.1), wav(1, { rate: 44100 }), wav(1, { channels: 2 }), Buffer.from("not a wav file at all, just some text here....")]) {
    assert.equal((await send(t, body)).statusCode, 400);
  }
  assert.equal((await send(t, wav(16))).statusCode, 413);
  assert.equal((await t.call("POST", "/api/pronounce", { audio: "x" })).statusCode, 400);
  assert.equal(fake.calls.length, 0);
  assert.ok(wavInfo(wav(14.9)));
  await t.close();
});

test("a busy or failing service is not counted", async () => {
  const t = setup(TALKIES, { pronounce: fakeTalkies({ status: 409 }) });
  await verified(t);
  const busy = await send(t);
  assert.equal(busy.statusCode, 503);
  assert.equal(busy.json().error, "pronounce_queue_full");
  assert.equal((await t.call("GET", "/api/pronounce/status")).json().left, 2);
  await t.close();

  const broken = setup(TALKIES, { pronounce: fakeTalkies({ status: 500 }) });
  await verified(broken);
  assert.equal((await send(broken)).json().error, "pronounce_failed");
  await broken.close();
});

test("one clip at a time per learner", async () => {
  const t = setup(TALKIES, { pronounce: fakeTalkies({ delay: 50 }) });
  await verified(t);
  const [a, b] = await Promise.all([send(t), send(t)]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 429]);
  await t.close();
});

test("asking to be verified puts the learner on the admin list", async () => {
  const t = setup(TALKIES, { pronounce: fakeTalkies() });
  await t.signIn();
  assert.equal((await t.call("POST", "/api/pronounce/request")).json().requested, true);
  await t.signIn("boss@example.com");
  const users = (await t.call("GET", "/api/admin/users")).json().users;
  assert.ok(users.find((u) => u.email === "learner@example.com").ttsRequestedAt);
  await t.close();
});

test("only sounds come back from the recogniser", () => {
  assert.equal(cleanPhones("ð ə  w ɛ ð ə ˞"), "ð ə w ɛ ð ə ˞");
  assert.equal(cleanPhones('<script>alert("x")</script>'), "script alert x script");
  assert.equal(cleanPhones(null), "");
});
