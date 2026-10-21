// Every request to the Kokoro TTS service (TTS_URL) goes through here, one at
// a time (the service makes one clip at a time anyway): on-demand speech
// (routes/tts.js), word-base clips saved for everyone, and admins' remakes
// (lib/clipMaker.js). It keeps what the admin Speech server page shows: the
// queue now, the last requests, counts and times per day (tts_jobs_daily)
// and whether the service answers. On-demand texts are a learner's own, so
// they are never kept or shown; word-base texts are.

const RECENT = 50;
const HEALTH_MS = 15_000; // how long a health check is reused
const HEALTH_TIMEOUT_MS = 5_000;

export const TTS_KINDS = ["speech", "clip", "remake"];

export function createTtsService({ config, db = null, fetchImpl = globalThis.fetch, now = Date.now }) {
  let queue = Promise.resolve();
  let seq = 0;
  const jobs = []; // waiting and running, oldest first
  const recent = []; // finished, newest first
  let health = null;

  const base = () => config.ttsUrl.replace(/\/$/, "");
  const headers = (json) => ({
    ...(json ? { "content-type": "application/json" } : {}),
    ...(config.ttsApiKey ? { "x-api-key": config.ttsApiKey } : {}),
  });

  function record(job, ok, error) {
    const at = now();
    const ms = at - job.startedAt;
    const wait = job.startedAt - job.queuedAt;
    const i = jobs.indexOf(job);
    if (i >= 0) jobs.splice(i, 1);
    recent.unshift({ id: job.id, kind: job.kind, label: job.label, voice: job.voice, words: job.words, ok, ms, waitMs: wait, error: error || null, framed: job.framed ?? null, at: new Date(at).toISOString() });
    recent.length = Math.min(recent.length, RECENT);
    db?.prepare(
      `INSERT INTO tts_jobs_daily (day, kind, ok, failed, total_ms, max_ms, wait_ms) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (day, kind) DO UPDATE SET ok = ok + excluded.ok, failed = failed + excluded.failed,
         total_ms = total_ms + excluded.total_ms, max_ms = MAX(max_ms, excluded.max_ms), wait_ms = wait_ms + excluded.wait_ms`
    ).run(new Date(at).toISOString().slice(0, 10), job.kind, ok ? 1 : 0, ok ? 0 : 1, ms, ms, wait);
  }

  // `body` is the service's POST /tts body. `label` is shown on the admin
  // page: the text for word-base clips, null for a learner's own. Resolves to
  // { audio: Buffer, framed: boolean }.
  function speak({ kind, body, label = null, timeoutMs = config.ttsTimeoutMs }) {
    const job = { id: ++seq, kind, label, voice: body.voice, words: Boolean(body.words), state: "waiting", queuedAt: now() };
    jobs.push(job);
    const run = queue.then(async () => {
      job.state = "running";
      job.startedAt = now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(`${base()}/tts`, { method: "POST", headers: headers(true), body: JSON.stringify(body), signal: ctrl.signal });
        if (!res.ok) throw new Error(`tts service answered ${res.status}`);
        const audio = Buffer.from(await res.arrayBuffer());
        job.framed = body.frame ? res.headers?.get?.("x-kokoro-framed") === "1" : undefined;
        record(job, true);
        return { audio, framed: Boolean(job.framed) };
      } catch (err) {
        record(job, false, err.name === "AbortError" ? "timed out" : err.message);
        throw err;
      } finally {
        clearTimeout(timer);
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  // Whether the service answers, how fast, and its voices. Reused for 15 s.
  async function check({ force = false } = {}) {
    if (!config.ttsUrl) return { configured: false };
    if (!force && health && now() - health.at < HEALTH_MS) return health.value;
    const started = now();
    const get = async (p) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
      try {
        const res = await fetchImpl(`${base()}${p}`, { headers: headers(false), signal: ctrl.signal });
        if (!res.ok) throw new Error(`answered ${res.status}`);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    };
    let value;
    try {
      await get("/health");
      const ms = now() - started;
      const voices = await get("/voices").then((v) => (Array.isArray(v?.voices) ? v.voices.length : null)).catch(() => null);
      value = { configured: true, reachable: true, ms, voices, checkedAt: new Date(now()).toISOString() };
    } catch (err) {
      value = { configured: true, reachable: false, error: err.name === "AbortError" ? "timed out" : err.message, checkedAt: new Date(now()).toISOString() };
    }
    health = { at: now(), value };
    return value;
  }

  // Per day (newest first) and kind: { day, kind, ok, failed, avgMs, maxMs, avgWaitMs }.
  function daily(days = 14) {
    if (!db) return [];
    const since = new Date(now() - (days - 1) * 86400_000).toISOString().slice(0, 10);
    return db
      .prepare("SELECT day, kind, ok, failed, total_ms, max_ms, wait_ms FROM tts_jobs_daily WHERE day >= ? ORDER BY day DESC, kind")
      .all(since)
      .map((r) => {
        const n = r.ok + r.failed;
        return { day: r.day, kind: r.kind, ok: r.ok, failed: r.failed, avgMs: n ? Math.round(r.total_ms / n) : 0, maxMs: r.max_ms, avgWaitMs: n ? Math.round(r.wait_ms / n) : 0 };
      });
  }

  return {
    speak,
    check,
    daily,
    waiting: () => jobs.length,
    // The queue now (oldest first; at most one running) and the last requests.
    snapshot: () => ({
      jobs: jobs.map((j) => ({
        id: j.id,
        kind: j.kind,
        label: j.label,
        voice: j.voice,
        words: j.words,
        state: j.state,
        queuedAt: new Date(j.queuedAt).toISOString(),
        ...(j.startedAt ? { startedAt: new Date(j.startedAt).toISOString() } : {}),
      })),
      recent: recent.map((r) => ({ ...r })),
    }),
  };
}
