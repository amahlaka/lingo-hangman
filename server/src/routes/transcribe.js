// Server speech-to-text for "Say it": instead of the browser's recogniser, a
// verified learner's clip comes here and goes to the Whistle service
// (whistle/, on the server's own Docker network) or any service that answers
// the same OpenAI-style request, such as Talkies. It answers the words it
// heard, and the app checks them like the browser's (src/games/say).
// Verified learners and admins only, like Say it right, with its own daily
// limit. Clips are never stored or logged: they are passed on and dropped,
// and so is what was heard.

import { requireSession } from "../sessions.js";
import { SAMPLE_RATE, pronounceDay, wavInfo } from "./pronounce.js";

// A word or a sentence; Say it stops recording after 8 seconds.
export const MAX_SECONDS = 10;
const MAX_AUDIO_BYTES = 44 + MAX_SECONDS * SAMPLE_RATE * 2 + 1024;
const PER_MINUTE = 20;
const MINUTE = 60_000;

// What the recogniser heard, as plain text the app can show.
export function cleanText(text) {
  return String(text || "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}'’.,!?\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export default async function transcribeRoutes(app, { db, config, limiter, fetchImpl = globalThis.fetch }) {
  const used = new Map(); // "userId|day" -> clips that day
  const busyUsers = new Set();
  let queue = Promise.resolve();
  let waiting = 0;

  const allowed = (session) => session.role === "verified" || session.role === "admin";
  const usedToday = (userId) => used.get(`${userId}|${pronounceDay()}`) || 0;
  function countUse(userId) {
    const day = pronounceDay();
    for (const key of used.keys()) if (!key.endsWith(`|${day}`)) used.delete(key);
    const key = `${userId}|${day}`;
    used.set(key, (used.get(key) || 0) + 1);
  }

  function status(session) {
    const limit = config.sttDailyLimit;
    return {
      available: Boolean(config.sttUrl),
      allowed: allowed(session),
      limit,
      left: Math.max(0, limit - usedToday(session.user_id)),
    };
  }

  // Whistle runs one clip at a time, so clips wait in turn.
  function recognise(wav) {
    waiting += 1;
    const run = queue.then(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), config.sttTimeoutMs);
      try {
        const form = new FormData();
        form.append("file", new Blob([wav], { type: "audio/wav" }), "clip.wav");
        form.append("model", config.sttModel);
        form.append("language", "en");
        form.append("response_format", "json");
        const res = await fetchImpl(`${config.sttUrl.replace(/\/$/, "")}/v1/audio/transcriptions`, {
          method: "POST",
          headers: config.sttToken ? { authorization: `Bearer ${config.sttToken}` } : {},
          body: form,
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const err = new Error(`speech-to-text answered ${res.status}`);
          err.busy = res.status === 429 || res.status === 409;
          throw err;
        }
        return cleanText((await res.json())?.text);
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

    scoped.get("/api/transcribe/status", async (req) => status(req.session));

    // A WAV (Content-Type audio/wav) -> { text: "where is the bathroom", left }.
    scoped.post("/api/transcribe", async (req, reply) => {
      if (!config.sttUrl) return reply.code(503).send({ error: "transcribe_unavailable" });
      const s = req.session;
      if (!allowed(s)) return reply.code(403).send({ error: "not_verified" });
      const clip = wavInfo(req.body);
      if (!clip || clip.seconds > MAX_SECONDS) return reply.code(400).send({ error: "bad_audio" });
      if (usedToday(s.user_id) >= config.sttDailyLimit) return reply.code(429).send({ error: "transcribe_limit", ...status(s) });
      if (busyUsers.has(s.user_id)) return reply.code(429).send({ error: "transcribe_busy" });
      if (!limiter.allow(`transcribe:${s.user_id}`, PER_MINUTE, MINUTE)) return reply.code(429).send({ error: "transcribe_busy" });
      if (waiting >= config.sttQueueMax) return reply.code(503).send({ error: "transcribe_queue_full" });

      busyUsers.add(s.user_id);
      try {
        const text = await recognise(req.body);
        countUse(s.user_id);
        return { text, left: Math.max(0, config.sttDailyLimit - usedToday(s.user_id)) };
      } catch (err) {
        // Only the failure, never the audio or the words.
        req.log.warn({ err: err.message }, "speech-to-text failed");
        return reply.code(503).send({ error: err.busy ? "transcribe_queue_full" : "transcribe_failed" });
      } finally {
        busyUsers.delete(s.user_id);
      }
    });
  });
}
