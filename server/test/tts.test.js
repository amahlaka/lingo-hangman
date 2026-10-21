import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { ttsText } from "../src/routes/tts.js";

const TTS = { TTS_URL: "http://kokoro-tts:8000", TTS_API_KEY: "secret", TTS_DAILY_LIMIT: "2", TTS_VERIFIED_LIMIT: "5" };

// A fake Kokoro service and an in-memory cache.
function fakeTts({ fail = false, delay = 0 } = {}) {
  const calls = [];
  const files = new Map();
  return {
    calls,
    files,
    fetchImpl: async (url, opts) => {
      calls.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (fail) return { ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) };
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(`mp3:${JSON.parse(opts.body).text}`).buffer };
    },
    cache: { get: async (h) => files.get(h) || null, put: async (h, d) => void files.set(h, d) },
  };
}

test("speech needs an account and the service", async () => {
  const fake = fakeTts();
  const t = setup(TTS, { tts: fake });
  assert.equal((await t.call("POST", "/api/tts", { text: "Hello there" })).statusCode, 401);
  await t.close();
  const off = setup({}, { tts: fake });
  await off.signIn();
  assert.equal((await off.call("POST", "/api/tts", { text: "Hello there" })).statusCode, 503);
  assert.equal((await off.call("GET", "/api/tts/status")).json().available, false);
  await off.close();
});

test("a learner hears new sentences up to the daily limit; repeats are free and shared", async () => {
  const fake = fakeTts();
  const t = setup(TTS, { tts: fake });
  await t.signIn();
  const first = await t.call("POST", "/api/tts", { text: "  The cat   sat on the mat. ", voice: "male" });
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers["content-type"], "audio/mpeg");
  assert.equal(first.headers["x-tts-left"], "1");
  assert.equal(first.body, "mp3:The cat sat on the mat.");
  assert.deepEqual(fake.calls[0].body, { text: "The cat sat on the mat.", voice: "am_liam", speed: 0.8, format: "mp3" });
  assert.equal(fake.calls[0].headers["x-api-key"], "secret");
  assert.equal(fake.calls[0].url, "http://kokoro-tts:8000/tts");

  const again = await t.call("POST", "/api/tts", { text: "The cat sat on the mat.", voice: "male" });
  assert.equal(again.headers["x-tts-cached"], "1");
  assert.equal(again.headers["x-tts-left"], "1");
  assert.equal(fake.calls.length, 1);

  assert.equal((await t.call("POST", "/api/tts", { text: "A dog barks." })).statusCode, 200);
  const over = await t.call("POST", "/api/tts", { text: "A bird sings." });
  assert.equal(over.statusCode, 429);
  assert.equal(over.json().error, "tts_limit");

  // Another learner gets the first sentence from the cache without spending.
  await t.signIn("other@example.com");
  const shared = await t.call("POST", "/api/tts", { text: "The cat sat on the mat.", voice: "male" });
  assert.equal(shared.headers["x-tts-cached"], "1");
  assert.equal((await t.call("GET", "/api/tts/status")).json().used, 0);
  await t.close();
});

test("only short English text is spoken", async () => {
  const t = setup(TTS, { tts: fakeTts() });
  await t.signIn();
  for (const body of [{ text: "" }, { text: "x".repeat(201) }, { text: "Привет мир" }, { text: "!!!" }, { text: 5 }, { text: "Hi", voice: "robot" }]) {
    assert.equal((await t.call("POST", "/api/tts", body)).statusCode, 400, JSON.stringify(body));
  }
  assert.equal(ttsText("Café au lait, isn't it?"), "Café au lait, isn't it?");
  assert.equal(ttsText("It costs €5 (or £4)."), "It costs €5 (or £4).");
  await t.close();
});

test("a failed generation is not counted", async () => {
  const t = setup(TTS, { tts: fakeTts({ fail: true }) });
  await t.signIn();
  assert.equal((await t.call("POST", "/api/tts", { text: "Hello there" })).statusCode, 502);
  assert.equal((await t.call("GET", "/api/tts/status")).json().used, 0);
  await t.close();
});

test("one generation at a time per learner", async () => {
  const fake = fakeTts({ delay: 30 });
  const t = setup(TTS, { tts: fake });
  await t.signIn();
  const [a, b] = await Promise.all([t.call("POST", "/api/tts", { text: "First one" }), t.call("POST", "/api/tts", { text: "Second one" })]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 429]);
  await t.close();
});

test("a learner asks for more and an admin verifies them", async () => {
  const t = setup(TTS, { tts: fakeTts() });
  await t.signIn();
  const learner = t.cookie;
  const asked = await t.call("POST", "/api/tts/request");
  assert.deepEqual(
    { tier: asked.json().tier, limit: asked.json().limit, requested: asked.json().requested },
    { tier: "basic", limit: 2, requested: true }
  );

  assert.equal((await t.call("GET", "/api/admin/users")).statusCode, 403);
  await t.signIn("boss@example.com");
  const list = (await t.call("GET", "/api/admin/users")).json();
  assert.equal(list.users[0].email, "learner@example.com");
  assert.ok(list.users[0].ttsRequestedAt);
  assert.deepEqual(list.limits, { basic: 2, extended: 5 });
  const id = list.users[0].id;
  assert.equal((await t.call("POST", "/api/admin/users/role", { id, role: "verified" })).statusCode, 200);
  assert.equal((await t.call("POST", "/api/admin/users/role", { id, role: "admin" })).statusCode, 400);
  const boss = list.users.find((u) => u.email === "boss@example.com");
  assert.equal((await t.call("POST", "/api/admin/users/role", { id: boss.id, role: "learner" })).statusCode, 404);

  const status = (await t.call("GET", "/api/tts/status", undefined, { cookie: learner })).json();
  assert.deepEqual({ tier: status.tier, limit: status.limit, requested: status.requested }, { tier: "extended", limit: 5, requested: false });
  await t.close();
});

test("the disk cache drops the least recently used clips when full", async () => {
  const { createTtsCache } = await import("../src/lib/ttsCache.js");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tts-"));
  const cache = createTtsCache({ dir, maxBytes: 250 });
  const clip = Buffer.alloc(100, 1);
  await cache.put("aaold", clip);
  await new Promise((r) => setTimeout(r, 20));
  await cache.put("bbmid", clip);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(await cache.get("aaold")); // used again, so now the newest
  await new Promise((r) => setTimeout(r, 20));
  await cache.put("ccnew", clip);
  assert.equal(await cache.get("bbmid"), null);
  assert.ok(await cache.get("aaold"));
  assert.ok(await cache.get("ccnew"));
  await fs.rm(dir, { recursive: true });
});

// A word base on disk with one word and one sentence, and an empty clip folder.
async function wordBase() {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lingo-clips-"));
  const content = path.join(root, "content");
  await fs.mkdir(path.join(content, "packs"), { recursive: true });
  await fs.writeFile(path.join(content, "languages.json"), JSON.stringify([{ code: "en" }, { code: "fi" }]));
  await fs.writeFile(path.join(content, "index.json"), JSON.stringify({ packs: ["basics"] }));
  await fs.writeFile(
    path.join(content, "packs", "basics.json"),
    JSON.stringify({ id: "basics", items: [{ type: "word", text: { en: "kitchen", fi: "keittiö" }, examples: [{ en: "The kitchen is warm." }] }] })
  );
  const audio = path.join(content, "audio");
  await fs.mkdir(audio);
  await fs.writeFile(path.join(audio, "index.json"), JSON.stringify({ voices: { "kokoro-1.0-v5-af_nova": ["old"] } }));
  return { fs, path, audio, env: { CONTENT_DIR: content, CLIP_DIR: audio }, done: () => fs.rm(root, { recursive: true, force: true }) };
}

test("a word-base text without a clip gets one saved like a recorded clip, for anyone", async () => {
  const base = await wordBase();
  const fake = fakeTts();
  const t = setup({ ...TTS, ...base.env }, { tts: fake });
  const { clipKey } = await import("../../src/lib/speechClips.js");
  const key = clipKey("kitchen", "en");

  const made = await t.call("POST", "/api/tts/clip", { text: " kitchen ", voice: "male" });
  assert.equal(made.statusCode, 200);
  assert.deepEqual(made.json(), { folder: "kokoro-1.0-v5-am_liam", key, made: true });
  assert.deepEqual(fake.calls[0].body, { text: "kitchen", voice: "am_liam", speed: 0.8, format: "mp3" });
  const file = base.path.join(base.audio, "kokoro-1.0-v5-am_liam", `${key}.mp3`);
  assert.equal(await base.fs.readFile(file, "utf8"), "mp3:kitchen");
  const index = JSON.parse(await base.fs.readFile(base.path.join(base.audio, "index.json"), "utf8"));
  assert.deepEqual(index.voices, { "kokoro-1.0-v5-af_nova": ["old"], "kokoro-1.0-v5-am_liam": [key] });

  // Asked again: already saved, nothing made.
  const again = await t.call("POST", "/api/tts/clip", { text: "kitchen", voice: "male" });
  assert.deepEqual(again.json(), { folder: "kokoro-1.0-v5-am_liam", key, made: false });
  assert.equal(fake.calls.length, 1);

  // Example sentences are word-base texts too; anything else is not.
  assert.equal((await t.call("POST", "/api/tts/clip", { text: "The kitchen is warm." })).statusCode, 200);
  const other = await t.call("POST", "/api/tts/clip", { text: "Something else entirely" });
  assert.equal(other.statusCode, 404);
  assert.equal(other.json().error, "not_word_base");
  assert.equal(fake.calls.length, 2);
  await t.close();
  await base.done();
});

test("making word-base clips needs the service and the folders; a failed one leaves nothing behind", async () => {
  const base = await wordBase();
  const off = setup(base.env, { tts: fakeTts() });
  assert.equal((await off.call("POST", "/api/tts/clip", { text: "kitchen" })).statusCode, 503);
  await off.close();
  const noDirs = setup(TTS, { tts: fakeTts() });
  assert.equal((await noDirs.call("POST", "/api/tts/clip", { text: "kitchen" })).statusCode, 503);
  await noDirs.close();

  const failing = setup({ ...TTS, ...base.env }, { tts: fakeTts({ fail: true }) });
  assert.equal((await failing.call("POST", "/api/tts/clip", { text: "kitchen" })).statusCode, 502);
  const files = await base.fs.readdir(base.audio);
  assert.deepEqual(files, ["index.json"]);
  await failing.close();
  await base.done();
});

test("an admin has a bad clip made again: it leaves the list, the API won't save it, and the workflow's new one counts", async () => {
  const base = await wordBase();
  const fake = fakeTts();
  const t = setup({ ...TTS, ...base.env }, { tts: fake });
  const { clipKey, wordsKey } = await import("../../src/lib/speechClips.js");
  const sentence = "The kitchen is warm.";
  const key = clipKey(sentence, "en");
  const words = wordsKey(sentence, "en");
  const NOVA = "kokoro-1.0-v5-af_nova";
  assert.equal((await t.call("POST", "/api/tts/clip", { text: sentence })).statusCode, 200);
  const readIndex = async () => JSON.parse(await base.fs.readFile(base.path.join(base.audio, "index.json"), "utf8"));
  assert.ok((await readIndex()).voices[NOVA].includes(key));

  assert.equal((await t.call("POST", "/api/admin/clips/remake", { text: sentence })).statusCode, 401);
  await t.signIn("boss@example.com");
  const remade = await t.call("POST", "/api/admin/clips/remake", { text: ` ${sentence} ` });
  assert.equal(remade.statusCode, 200);
  assert.deepEqual(remade.json(), { text: sentence, keys: [key, words] });
  assert.deepEqual((await readIndex()).voices[NOVA], ["old"]);
  const remakes = JSON.parse(await base.fs.readFile(base.path.join(base.audio, "remake.json"), "utf8"));
  assert.deepEqual(remakes, { keys: { [key]: 1, [words]: 1 } });

  // The old file is still there, but the API doesn't hand it out or make one.
  const refused = await t.call("POST", "/api/tts/clip", { text: sentence });
  assert.equal(refused.statusCode, 404);
  assert.equal(refused.json().error, "remaking");
  assert.equal(fake.calls.length, 1);

  // Once the workflow lists its new clip again, the text is an ordinary clip.
  await base.fs.writeFile(base.path.join(base.audio, "index.json"), JSON.stringify({ voices: { [NOVA]: ["old", key] }, revisions: { [NOVA]: { [key]: 1 } } }));
  assert.deepEqual((await t.call("POST", "/api/tts/clip", { text: sentence })).json(), { folder: NOVA, key, made: false });

  // A second remake takes the revision with it and counts up.
  await t.call("POST", "/api/admin/clips/remake", { text: sentence });
  assert.deepEqual(await readIndex(), { voices: { [NOVA]: ["old"] }, revisions: { [NOVA]: {} } });
  const again = JSON.parse(await base.fs.readFile(base.path.join(base.audio, "remake.json"), "utf8"));
  assert.equal(again.keys[key], 2);

  const other = await t.call("POST", "/api/admin/clips/remake", { text: "Something else entirely" });
  assert.equal(other.statusCode, 404);
  assert.equal((await t.call("POST", "/api/admin/clips/remake", {})).statusCode, 400);
  await t.close();
  await base.done();
});

test("the Recordings page lists every clip with its reports, saves an edit as a new revision and puts an older one back", async () => {
  const base = await wordBase();
  const t = setup({ ...TTS, ...base.env }, { tts: fakeTts() });
  const { clipKey, wordsKey } = await import("../../src/lib/speechClips.js");
  const NOVA = "kokoro-1.0-v5-af_nova";
  const LIAM = "kokoro-1.0-v5-am_liam";
  const word = clipKey("kitchen", "en");
  const sentence = clipKey("The kitchen is warm.", "en");
  const words = wordsKey("The kitchen is warm.", "en");
  const readJson = async (name) => JSON.parse(await base.fs.readFile(base.path.join(base.audio, name), "utf8"));
  await base.fs.mkdir(base.path.join(base.audio, NOVA));
  await base.fs.writeFile(base.path.join(base.audio, NOVA, `${word}.mp3`), "old");
  await base.fs.writeFile(base.path.join(base.audio, "index.json"), JSON.stringify({ voices: { [NOVA]: [word] } }));

  assert.equal((await t.call("GET", "/api/admin/clips")).statusCode, 401);
  // A learner reports the word's audio.
  await t.signIn("learner@example.com");
  const report = { clientId: "c1-report-0001", game: "hangman", itemRef: "kitchen", reason: "bad_audio", comment: "Too quiet", context: { question: { id: "kitchen", learning: "kitchen" }, answer: "kitchen" } };
  assert.equal((await t.call("POST", "/api/reports", report)).statusCode, 201);
  await t.signIn("boss@example.com");

  const listed = (await t.call("GET", "/api/admin/clips")).json();
  assert.deepEqual(listed.voices.map((v) => v.folder), [NOVA, LIAM]);
  const byKey = new Map(listed.clips.map((c) => [c.key, c]));
  assert.deepEqual([...byKey.keys()].sort(), [word, sentence, words].sort());
  assert.deepEqual(byKey.get(word).voices, { [NOVA]: { state: "live", versions: [0] }, [LIAM]: { state: "missing" } });
  assert.equal(byKey.get(words).words, true);
  assert.deepEqual(byKey.get(word).reports.map((r) => [r.reason, r.comment]), [["bad_audio", "Too quiet"]]);
  assert.equal(byKey.get(sentence).reports, undefined);

  // Only an MP3, of a live clip, in a known voice.
  const mp3 = Buffer.from([0xff, 0xf3, 0x64, 0xc4, 1, 2, 3, 4]).toString("base64");
  const edit = (body) => t.call("POST", "/api/admin/clips/edit", { folder: NOVA, key: word, audio: mp3, ...body });
  assert.equal((await edit({ audio: Buffer.from("<html>").toString("base64") })).statusCode, 400);
  assert.equal((await edit({ folder: "../x" })).json().error, "bad_voice");
  assert.equal((await edit({ folder: LIAM })).statusCode, 409);
  assert.equal((await edit({ key: "zzzz" })).statusCode, 404);

  const saved = await edit({ changes: { start: 0.0421, end: 0.8, gain: 6, padEnd: 0.25, evil: "x" } });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.json(), { folder: NOVA, key: word, revision: 1 });
  assert.ok((await base.fs.readFile(base.path.join(base.audio, NOVA, `${word}-1.mp3`))).equals(Buffer.from(mp3, "base64")));
  assert.equal(await base.fs.readFile(base.path.join(base.audio, NOVA, `${word}.mp3`), "utf8"), "old");
  assert.deepEqual((await readJson("index.json")).revisions, { [NOVA]: { [word]: 1 } });
  assert.deepEqual((await readJson("remake.json")).keys, { [word]: 1 });
  const log = (await readJson("edits.json"))[NOVA][word];
  assert.deepEqual({ ...log[0], at: "" }, { revision: 1, from: 0, at: "", start: 0.042, end: 0.8, gain: 6, padEnd: 0.25 });

  // A later remake never takes the edit's number.
  await t.call("POST", "/api/admin/clips/remake", { text: "kitchen" });
  assert.equal((await readJson("remake.json")).keys[word], 2);
  await base.fs.writeFile(base.path.join(base.audio, "index.json"), JSON.stringify({ voices: { [NOVA]: [word] }, revisions: { [NOVA]: { [word]: 1 } } }));
  // A second edit counts on from both.
  assert.equal((await edit({})).json().revision, 3);

  // Back to the first version, or to any that is on disk.
  const use = (revision) => t.call("POST", "/api/admin/clips/use", { folder: NOVA, key: word, revision });
  assert.equal((await use(2)).statusCode, 404);
  assert.equal((await use(0)).statusCode, 200);
  assert.deepEqual((await readJson("index.json")).revisions, { [NOVA]: {} });
  const after = (await t.call("GET", "/api/admin/clips")).json().clips.find((c) => c.key === word).voices[NOVA];
  assert.deepEqual(after.versions, [0, 1, 3]);
  assert.equal(after.revision, undefined);
  assert.equal(after.edits.at(-1).restored, true);
  assert.equal((await use(1)).json().revision, 1);
  assert.deepEqual((await readJson("index.json")).revisions, { [NOVA]: { [word]: 1 } });
  await t.close();
  await base.done();
});
