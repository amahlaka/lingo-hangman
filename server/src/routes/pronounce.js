// Pronunciation scoring for "Say it right": the app records a short clip of
// the learner saying a word bank word, or reading a sentence or two aloud
// (Read aloud), and sends it here; the API passes it to
// the Talkies phoneme recogniser (zipa-ipa, on the server's own Docker
// network) and returns the IPA sounds it heard. The app scores them against
// the word's IPA (src/lib/phonemes.js). Verified learners and admins only,
// with a daily limit, since the recogniser runs on the server's CPU. Clips are
// never stored or logged: they go to Talkies and are dropped.

import { requireSession } from "../sessions.js";

// A 16 kHz, 16-bit mono WAV the app makes from the microphone (src/lib/micRecorder.js).
export const SAMPLE_RATE = 16000;
export const MIN_SECONDS = 0.25;
// Two sentences read slowly (Read aloud).
export const MAX_SECONDS = 15;
// A clip counts one use of the daily limit for every this many seconds of it,
// since the recogniser's time grows with the clip.
export const SECONDS_PER_USE = 5;
const MAX_AUDIO_BYTES = 44 + MAX_SECONDS * SAMPLE_RATE * 2 + 1024;
// Clips one learner can send in a minute, on top of the daily limit.
const PER_MINUTE = 12;
const MINUTE = 60_000;

export const pronounceDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// { seconds } when `buf` is a WAV the recogniser can take as it is (PCM,
// 16-bit, mono, 16 kHz, a sensible length), else null.
export function wavInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let fmt = null;
  let data = null;
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = buf.toString("ascii", at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === "fmt " && size >= 16 && at + 24 <= buf.length) {
      fmt = { format: buf.readUInt16LE(at + 8), channels: buf.readUInt16LE(at + 10), rate: buf.readUInt32LE(at + 12), bits: buf.readUInt16LE(at + 22) };
    } else if (id === "data") {
      data = Math.min(size, buf.length - at - 8);
      break;
    }
    at += 8 + size + (size % 2);
  }
  if (!fmt || data === null) return null;
  if (fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== SAMPLE_RATE || fmt.bits !== 16) return null;
  const seconds = data / (SAMPLE_RATE * 2);
  if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) return null;
  return { seconds };
}

// IPA phones separated by spaces, as the recogniser answers; anything else is
// dropped so the app only ever gets letters and spaces back.
export function cleanPhones(text) {
  return String(text || "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{Lm}ˈˌː˞\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
}

export default async function pronounceRoutes(app, { db, config, limiter, fetchImpl = globalThis.fetch }) {
  const used = new Map(); // "userId|day" -> clips scored that day
  const busyUsers = new Set();
  let queue = Promise.resolve();
  let waiting = 0;

  const allowed = (session) => session.role === "verified" || session.role === "admin";
  const usedToday = (userId, now = Date.now()) => used.get(`${userId}|${pronounceDay(now)}`) || 0;
  function countUse(userId, uses = 1) {
    const day = pronounceDay();
    for (const key of used.keys()) if (!key.endsWith(`|${day}`)) used.delete(key);
    const key = `${userId}|${day}`;
    used.set(key, (used.get(key) || 0) + uses);
  }

  function status(session) {
    const limit = config.pronounceDailyLimit;
    const requested = Boolean(db.prepare("SELECT tts_requested_at FROM users WHERE id = ?").get(session.user_id)?.tts_requested_at);
    return {
      available: Boolean(config.talkiesUrl),
      allowed: allowed(session),
      limit,
      left: Math.max(0, limit - usedToday(session.user_id)),
      // Asked an admin to be verified (the same list as asking for more speech).
      requested: !allowed(session) && requested,
    };
  }

  // Talkies runs one recognition at a time, so clips wait in turn.
  function recognise(wav) {
    waiting += 1;
    const run = queue.then(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), config.pronounceTimeoutMs);
      try {
        const form = new FormData();
        form.append("file", new Blob([wav], { type: "audio/wav" }), "clip.wav");
        form.append("model", config.talkiesModel);
        form.append("response_format", "json");
        const res = await fetchImpl(`${config.talkiesUrl.replace(/\/$/, "")}/v1/audio/transcriptions`, {
          method: "POST",
          headers: config.talkiesToken ? { authorization: `Bearer ${config.talkiesToken}` } : {},
          body: form,
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const err = new Error(`talkies answered ${res.status}`);
          // 429: no free slot; 409: another model is busy. Both pass.
          err.busy = res.status === 429 || res.status === 409;
          throw err;
        }
        return cleanPhones((await res.json())?.text);
      } finally {
        clearTimeout(timer);
      }
    });
    queue = run.catch(() => {}).finally(() => {
      waiting -= 1;
    });
    return run;
  }

  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireSession(db));
    scoped.addContentTypeParser("audio/wav", { parseAs: "buffer", bodyLimit: MAX_AUDIO_BYTES }, (req, body, done) => done(null, body));

    scoped.get("/api/pronounce/status", async (req) => status(req.session));

    // "Ask to be verified": puts the learner on the list in /admin/users.
    scoped.post("/api/pronounce/request", async (req) => {
      db.prepare("UPDATE users SET tts_requested_at = COALESCE(tts_requested_at, ?) WHERE id = ? AND role = 'learner'").run(
        new Date().toISOString(),
        req.session.user_id
      );
      return status(req.session);
    });

    // A WAV (Content-Type audio/wav) -> { phones: "θ r iː", left }.
    scoped.post("/api/pronounce", async (req, reply) => {
      if (!config.talkiesUrl) return reply.code(503).send({ error: "pronounce_unavailable" });
      const s = req.session;
      if (!allowed(s)) return reply.code(403).send({ error: "not_verified" });
      const clip = wavInfo(req.body);
      if (!clip) return reply.code(400).send({ error: "bad_audio" });
      if (usedToday(s.user_id) >= config.pronounceDailyLimit) return reply.code(429).send({ error: "pronounce_limit", ...status(s) });
      if (busyUsers.has(s.user_id)) return reply.code(429).send({ error: "pronounce_busy" });
      if (!limiter.allow(`pronounce:${s.user_id}`, PER_MINUTE, MINUTE)) return reply.code(429).send({ error: "pronounce_busy" });
      if (waiting >= config.pronounceQueueMax) return reply.code(503).send({ error: "pronounce_queue_full" });

      busyUsers.add(s.user_id);
      try {
        const phones = await recognise(req.body);
        countUse(s.user_id, Math.max(1, Math.ceil(clip.seconds / SECONDS_PER_USE)));
        return { phones, left: Math.max(0, config.pronounceDailyLimit - usedToday(s.user_id)) };
      } catch (err) {
        // Only the failure, never the audio.
        req.log.warn({ err: err.message }, "pronunciation recognition failed");
        return reply.code(503).send({ error: err.busy ? "pronounce_queue_full" : "pronounce_failed" });
      } finally {
        busyUsers.delete(s.user_id);
      }
    });
  });
}
