// Records one short utterance from the microphone for "Say it right" and
// turns it into a small 16 kHz, 16-bit mono WAV, the format the API's
// pronunciation scoring takes (server/src/routes/pronounce.js). Recording
// stops by itself after a short pause once the learner has spoken, or at
// MAX_MS. The clip stays in memory until it is sent; nothing is saved.

export const CLIP_RATE = 16000;
export const MAX_MS = 5000;
// Stop this long after the voice goes quiet.
const PAUSE_MS = 900;
// Give up when nothing louder than the room has been heard for this long.
const NO_SPEECH_MS = 4500;
// Keep this much quiet around the voice, so the first and last sounds aren't cut.
const PAD_SECONDS = 0.15;
// Loudness (RMS) above which a frame counts as voice; adapts to the room.
const MIN_VOICE = 0.012;

export function canRecord() {
  return Boolean(
    typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia &&
      typeof window !== "undefined" &&
      (window.AudioContext || window.webkitAudioContext)
  );
}

export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// Linear resampling from `from` Hz to `to` Hz, averaging when going down so
// high sounds don't fold back into the clip.
export function resample(samples, from, to) {
  if (from === to) return Float32Array.from(samples);
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = i * ratio;
    const end = Math.min(samples.length, start + ratio);
    if (ratio > 1) {
      let sum = 0;
      let n = 0;
      for (let j = Math.floor(start); j < end; j++) {
        sum += samples[j];
        n += 1;
      }
      out[i] = n ? sum / n : 0;
    } else {
      const j = Math.floor(start);
      const t = start - j;
      out[i] = samples[j] * (1 - t) + (samples[j + 1] ?? samples[j]) * t;
    }
  }
  return out;
}

// Cuts the quiet before and after the voice, keeping PAD_SECONDS of it.
// Frames of 20 ms count as voice above `threshold`.
export function trimSilence(samples, rate, threshold = MIN_VOICE) {
  const frame = Math.max(1, Math.round(rate * 0.02));
  let first = -1;
  let last = -1;
  for (let at = 0; at < samples.length; at += frame) {
    if (rms(samples.subarray(at, at + frame)) >= threshold) {
      if (first < 0) first = at;
      last = at + frame;
    }
  }
  if (first < 0) return new Float32Array(0);
  const pad = Math.round(rate * PAD_SECONDS);
  return samples.slice(Math.max(0, first - pad), Math.min(samples.length, last + pad));
}

// 16-bit PCM mono WAV bytes.
export function encodeWav(samples, rate = CLIP_RATE) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

// Louder quiet clips, so a soft voice reaches the recogniser clearly.
export function normalise(samples, target = 0.6) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 1e-4 || peak >= target) return samples;
  const gain = Math.min(8, target / peak);
  return samples.map((v) => v * gain);
}

// Safari: let the page record now, and play back through the speaker after
// (see the Say it microphone notes in src/lib/speechRecognition.js).
function audioSession(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch {
    // not supported
  }
}

// Start recording. Returns { done, stop, cancel }: `done` resolves to
// { wav: Uint8Array | null, seconds, error } where error is "not-allowed",
// "audio-capture", "unsupported", "no-speech" or null. `stop` ends early and
// keeps what was said; `cancel` throws it away. `onLevel(0..1)` gets the
// loudness about 20 times a second, for a meter. `pauseMs`: how long a quiet
// moment after speaking ends the recording (longer when reading sentences).
export function recordClip({ onLevel, maxMs = MAX_MS, pauseMs = PAUSE_MS } = {}) {
  if (!canRecord()) return { done: Promise.resolve({ wav: null, seconds: 0, error: "unsupported" }), stop() {}, cancel() {} };
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  let stream = null;
  let ctx = null;
  let node = null;
  let source = null;
  let ended = false;
  let cancelled = false;
  const chunks = [];
  let rate = 48000;
  let startedAt = 0;
  let voiceAt = 0;
  let quietSince = 0;
  let noise = MIN_VOICE / 2;

  function release() {
    try {
      node?.disconnect();
      source?.disconnect();
    } catch {
      // already gone
    }
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close?.().catch(() => {});
    audioSession("playback");
  }

  function end() {
    if (ended) return;
    ended = true;
    release();
    if (cancelled) return finish({ wav: null, seconds: 0, error: null });
    const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.length;
    }
    const threshold = Math.max(MIN_VOICE, noise * 2.5);
    const voice = voiceAt ? trimSilence(all, rate, threshold) : new Float32Array(0);
    if (voice.length < rate * 0.2) return finish({ wav: null, seconds: 0, error: "no-speech" });
    const clip = normalise(resample(voice, rate, CLIP_RATE));
    finish({ wav: encodeWav(clip, CLIP_RATE), seconds: clip.length / CLIP_RATE, error: null });
  }

  (async () => {
    audioSession("auto");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      audioSession("playback");
      ended = true;
      const name = err?.name || "";
      return finish({ wav: null, seconds: 0, error: name === "NotAllowedError" || name === "SecurityError" ? "not-allowed" : "audio-capture" });
    }
    if (cancelled) {
      ended = true;
      release();
      return finish({ wav: null, seconds: 0, error: null });
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    rate = ctx.sampleRate;
    source = ctx.createMediaStreamSource(stream);
    node = ctx.createScriptProcessor(2048, 1, 1);
    startedAt = performance.now();
    node.onaudioprocess = (e) => {
      if (ended) return;
      const input = e.inputBuffer.getChannelData(0);
      chunks.push(Float32Array.from(input));
      const level = rms(input);
      const now = performance.now();
      const voiced = level >= Math.max(MIN_VOICE, noise * 2.5);
      if (voiced) {
        if (!voiceAt) voiceAt = now;
        quietSince = 0;
      } else {
        // The room's own level, learned while nobody speaks.
        noise = noise * 0.95 + level * 0.05;
        if (voiceAt && !quietSince) quietSince = now;
      }
      onLevel?.(Math.min(1, level * 8));
      if (now - startedAt >= maxMs) end();
      else if (voiceAt && quietSince && now - quietSince >= pauseMs) end();
      else if (!voiceAt && now - startedAt >= NO_SPEECH_MS) end();
    };
    source.connect(node);
    // Some browsers only run the processor while it is connected to the output;
    // it writes nothing, so nothing is heard.
    node.connect(ctx.destination);
  })();

  return {
    done,
    stop: () => end(),
    cancel: () => {
      cancelled = true;
      if (stream || ended) end();
    },
  };
}
