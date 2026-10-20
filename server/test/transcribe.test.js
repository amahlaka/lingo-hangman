import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { cleanText } from "../src/routes/transcribe.js";

const STT = { STT_URL: "http://lingo-whistle:8000/", STT_TOKEN: "secret", STT_DAILY_LIMIT: "2" };

// A 16 kHz, 16-bit mono WAV of silence, `seconds` long.
function wav(seconds = 1) {
  const data = Math.round(seconds * 16000) * 2;
  const buf = Buffer.alloc(44 + data);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + data, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(data, 40);
  return buf;
}

// A fake Whistle service.
function fakeWhistle({ status = 200, text = "Water.", delay = 0 } = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, opts) => {
      const file = opts.body.get("file");
      calls.push({ url, headers: opts.headers, model: opts.body.get("model"), language: opts.body.get("language"), size: file.size });
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return { ok: status === 200, status, json: async () => ({ text }) };
    },
  };
}

const send = (t, body = wav()) => t.call("POST", "/api/transcribe", body, { headers: { "content-type": "audio/wav" } });

async function verified(t, email = "learner@example.com") {
  await t.signIn(email);
  t.db.prepare("UPDATE users SET role = 'verified' WHERE email = ?").run(email);
}

test("speech-to-text needs an account, verification and the service", async () => {
  const fake = fakeWhistle();
  const t = setup(STT, { transcribe: fake });
  assert.equal((await send(t)).statusCode, 401);
  await t.signIn();
  assert.deepEqual((await t.call("GET", "/api/transcribe/status")).json(), { available: true, allowed: false, limit: 2, left: 2 });
  const refused = await send(t);
  assert.equal(refused.statusCode, 403);
  assert.equal(refused.json().error, "not_verified");
  assert.equal(fake.calls.length, 0);
  await t.close();

  const off = setup({}, { transcribe: fake });
  await verified(off);
  assert.equal((await off.call("GET", "/api/transcribe/status")).json().available, false);
  assert.equal((await send(off)).statusCode, 503);
  await off.close();
});

test("a verified learner's clip comes back as words, within the daily limit", async () => {
  const fake = fakeWhistle({ text: " Where is the <b>bathroom</b>? " });
  const t = setup(STT, { transcribe: fake });
  await verified(t);
  const res = await send(t);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { text: "Where is the b bathroom b ?", left: 1 });
  assert.equal(fake.calls[0].url, "http://lingo-whistle:8000/v1/audio/transcriptions");
  assert.equal(fake.calls[0].model, "whistle");
  assert.equal(fake.calls[0].language, "en");
  assert.equal(fake.calls[0].headers.authorization, "Bearer secret");
  assert.equal(fake.calls[0].size, wav().length);
  assert.equal((await send(t)).statusCode, 200);
  const limited = await send(t);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error, "transcribe_limit");
  assert.equal(fake.calls.length, 2);
  await t.close();
});

test("bad clips, long clips and service failures are refused without counting", async () => {
  const fake = fakeWhistle({ status: 500 });
  const t = setup(STT, { transcribe: fake });
  await verified(t);
  assert.equal((await send(t, Buffer.from("not a wav"))).statusCode, 400);
  assert.equal((await send(t, wav(12))).statusCode, 413);
  const failed = await send(t);
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.json().error, "transcribe_failed");
  assert.equal((await t.call("GET", "/api/transcribe/status")).json().left, 2);
  await t.close();

  const busy = fakeWhistle({ status: 409 });
  const b = setup(STT, { transcribe: busy });
  await verified(b);
  assert.equal((await send(b)).json().error, "transcribe_queue_full");
  await b.close();
});

test("admins can use it too", async () => {
  const t = setup(STT, { transcribe: fakeWhistle() });
  await t.signIn("boss@example.com");
  assert.equal((await t.call("GET", "/api/transcribe/status")).json().allowed, true);
  assert.equal((await send(t)).statusCode, 200);
  await t.close();
});

test("cleanText keeps words and punctuation only", () => {
  assert.equal(cleanText("  I'd like a ticket, please!  "), "I'd like a ticket, please!");
  assert.equal(cleanText("<|en|> water"), "en water");
  assert.equal(cleanText(null), "");
});
