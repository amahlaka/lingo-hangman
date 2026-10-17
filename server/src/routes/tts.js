// On-demand speech: English the app has no recorded clip for (new content,
// sentences a learner types), made by the Kokoro TTS service with the same
// voices and speed as the recorded clips. Signed-in learners only, with a
// daily limit of new clips (cache hits are free); learners Arttu verifies get
// a higher one. Typed texts are never logged or stored as text: the cache is
// keyed by a hash.

import { CLIP_SPEED, normalizeSpeech, voiceById } from "../../../src/lib/speechClips.js";
import { sha256 } from "../lib/crypto.js";
import { createTtsCache } from "../lib/ttsCache.js";
import { createWordClips } from "../lib/wordClips.js";
import { requireSession } from "../sessions.js";

export const MAX_TTS_TEXT = 200;
// New word-base clips one address can have made in an hour (saved ones are free).
const CLIPS_PER_HOUR = 30;
const HOUR = 3600_000;
// Latin letters (with accents, for names and loanwords), digits, spaces and
// everyday punctuation, with at least one letter.
const ENGLISH_RE = /^[\p{Script=Latin}0-9 .,!?'"’‘“”\-–—:;()&%$€£/]+$/u;
// Bump when the way live clips are made changes, so they are made again.
const LIVE_VERSION = "live1";

export const ttsDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export function ttsText(value) {
  const text = normalizeSpeech(value);
  if (!text || text.length > MAX_TTS_TEXT || !ENGLISH_RE.test(text) || !/\p{L}/u.test(text)) return null;
  return text;
}

export function ttsStatus(db, config, session, now = Date.now()) {
  const extended = session.role === "verified" || session.role === "admin";
  const limit = extended ? config.ttsVerifiedLimit : config.ttsDailyLimit;
  const used = db.prepare("SELECT count FROM tts_usage WHERE user_id = ? AND day = ?").get(session.user_id, ttsDay(now))?.count || 0;
  const requested = Boolean(db.prepare("SELECT tts_requested_at FROM users WHERE id = ?").get(session.user_id)?.tts_requested_at);
  return {
    available: Boolean(config.ttsUrl),
    tier: extended ? "extended" : "basic",
    limit,
    used,
    left: Math.max(0, limit - used),
    requested: !extended && requested,
  };
}

export default async function ttsRoutes(app, { db, config, limiter, fetchImpl = globalThis.fetch, cache, wordClips }) {
  const store = cache || createTtsCache({ dir: config.ttsCacheDir, maxBytes: config.ttsCacheBytes });
  const clips =
    wordClips || (config.clipDir && config.contentDir ? createWordClips({ contentDir: config.contentDir, clipDir: config.clipDir }) : null);
  const busyUsers = new Set();
  const making = new Map(); // hash -> Promise<Buffer>, so one text is made once
  let queue = Promise.resolve();
  let waiting = 0;

  // The Kokoro service makes one clip at a time, so requests wait in turn.
  function generate(text, speaker) {
    waiting += 1;
    const run = queue.then(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), config.ttsTimeoutMs);
      try {
        const res = await fetchImpl(`${config.ttsUrl.replace(/\/$/, "")}/tts`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(config.ttsApiKey ? { "x-api-key": config.ttsApiKey } : {}) },
          body: JSON.stringify({ text, voice: speaker, speed: CLIP_SPEED, format: "mp3" }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`tts service answered ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      } finally {
        clearTimeout(timer);
      }
    });
    queue = run.catch(() => {}).finally(() => {
      waiting -= 1;
    });
    return run;
  }

  // A word-base text without a recorded clip, for anyone (Hangman's Listen
  // hint): { text, voice } -> { folder, key }, after which the clip is at
  // /content/audio/<folder>/<key>.mp3 like every recorded one. 404 when the
  // text isn't in the word base; the app then uses on-demand speech or the
  // browser voice.
  const savingClip = new Map(); // "folder/key" -> Promise
  app.post("/api/tts/clip", async (req, reply) => {
    if (!config.ttsUrl || !clips) return reply.code(503).send({ error: "tts_unavailable" });
    const b = req.body || {};
    const text = ttsText(b.text);
    if (!text || (b.voice !== undefined && b.voice !== "female" && b.voice !== "male")) {
      return reply.code(400).send({ error: "bad_request" });
    }
    const { folder, speaker } = voiceById(b.voice);
    let key;
    try {
      key = await clips.keyFor(text);
    } catch (err) {
      req.log.warn({ err: err.message }, "word base not readable");
      return reply.code(503).send({ error: "tts_unavailable" });
    }
    if (!key) return reply.code(404).send({ error: "not_word_base" });
    const id = `${folder}/${key}`;
    if (!savingClip.has(id) && (await clips.has(folder, key))) return { folder, key, made: false };

    let job = savingClip.get(id);
    if (!job) {
      if (!limiter.allow(`tts-clip:${req.ip}`, CLIPS_PER_HOUR, HOUR)) return reply.code(429).send({ error: "tts_limit" });
      if (waiting >= config.ttsQueueMax) return reply.code(503).send({ error: "tts_queue_full" });
      job = generate(text, speaker).then((audio) => clips.save(folder, key, audio));
      savingClip.set(id, job);
      job.catch(() => {}).finally(() => savingClip.delete(id));
    }
    try {
      await job;
      return { folder, key, made: true };
    } catch (err) {
      req.log.warn({ err: err.message }, "word clip failed");
      return reply.code(502).send({ error: "tts_failed" });
    }
  });

  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireSession(db));

    scoped.get("/api/tts/status", async (req) => ttsStatus(db, config, req.session));

    // "Ask for more": puts the learner on the list in /admin/users.
    scoped.post("/api/tts/request", async (req) => {
      db.prepare("UPDATE users SET tts_requested_at = COALESCE(tts_requested_at, ?) WHERE id = ? AND role = 'learner'").run(
        new Date().toISOString(),
        req.session.user_id
      );
      return ttsStatus(db, config, req.session);
    });

    // { text, voice: "female" | "male" } -> audio/mpeg. X-TTS-Left says how
    // many new clips are left today.
    scoped.post("/api/tts", async (req, reply) => {
      if (!config.ttsUrl) return reply.code(503).send({ error: "tts_unavailable" });
      const b = req.body || {};
      const text = ttsText(b.text);
      if (!text || (b.voice !== undefined && b.voice !== "female" && b.voice !== "male")) {
        return reply.code(400).send({ error: "bad_request" });
      }
      const voice = voiceById(b.voice);
      const hash = sha256(`${LIVE_VERSION}|${voice.folder}|${CLIP_SPEED}|${text}`);
      const status = ttsStatus(db, config, req.session);
      const send = (audio, left, cached) =>
        reply
          .type("audio/mpeg")
          .header("Cache-Control", "private, max-age=604800")
          .header("X-TTS-Left", String(left))
          .header("X-TTS-Cached", cached ? "1" : "0")
          .send(audio);

      const hit = await store.get(hash);
      if (hit) return send(hit, status.left, true);

      if (status.left <= 0) return reply.code(429).send({ error: "tts_limit", ...status });
      const userId = req.session.user_id;
      if (busyUsers.has(userId)) return reply.code(429).send({ error: "tts_busy" });
      if (!making.has(hash) && waiting >= config.ttsQueueMax) return reply.code(503).send({ error: "tts_queue_full" });

      busyUsers.add(userId);
      try {
        let job = making.get(hash);
        if (!job) {
          job = generate(text, voice.speaker).then(async (audio) => {
            await store.put(hash, audio);
            return audio;
          });
          making.set(hash, job);
          job.catch(() => {}).finally(() => making.delete(hash));
        }
        const audio = await job;
        db.prepare(
          `INSERT INTO tts_usage (user_id, day, count) VALUES (?, ?, 1)
           ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1`
        ).run(userId, ttsDay());
        return send(audio, status.left - 1, false);
      } catch (err) {
        // Only the failure, never the text.
        req.log.warn({ err: err.message }, "tts generation failed");
        return reply.code(502).send({ error: "tts_failed" });
      } finally {
        busyUsers.delete(userId);
      }
    });
  });
}
