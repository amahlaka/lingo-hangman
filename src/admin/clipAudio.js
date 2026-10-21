// Sound work for the Recordings page (./AdminClips.jsx): reading a clip,
// drawing its waveform, and the edit itself (trim, fades, volume), then
// writing it as an MP3 like the Content publish workflow's clips (mono,
// 24 kHz, 48 kbit/s; scripts/speech-audio.py). The MP3 encoder (lamejs) is
// loaded only when a clip is saved.

export const CLIP_RATE = 24000;
export const CLIP_KBPS = 48;

// A clip's samples at 24 kHz: { samples: Float32Array, rate }.
export async function decodeClip(arrayBuffer) {
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new Offline(1, 1, CLIP_RATE);
  const buffer = await new Promise((resolve, reject) => {
    // Older Safari only has the callback form.
    const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
    if (p?.then) p.then(resolve, reject);
  });
  return { samples: buffer.getChannelData(0).slice(), rate: buffer.sampleRate };
}

// The loudest sample in each of `count` equal slices.
export function peaks(samples, count) {
  const out = new Float32Array(Math.max(0, count));
  if (!samples.length || !count) return out;
  const per = samples.length / count;
  for (let i = 0; i < count; i++) {
    let max = 0;
    const end = Math.min(samples.length, Math.ceil((i + 1) * per));
    for (let j = Math.floor(i * per); j < end; j++) {
      const v = Math.abs(samples[j]);
      if (v > max) max = v;
    }
    out[i] = max;
  }
  return out;
}

export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (gain) => (gain > 0 ? 20 * Math.log10(gain) : -Infinity);

export function peakOf(samples) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > max) max = v;
  }
  return max;
}

// The gain in dB (to one decimal) that brings the loudest sample to `target`
// dBFS; 0 for silence.
export function normalizeGain(samples, target = -1) {
  const peak = peakOf(samples);
  return peak > 0 ? Math.round((target - gainToDb(peak)) * 10) / 10 : 0;
}

// Where the sound starts and ends in seconds: the first and last sample
// louder than `threshold` dBFS, with `pad` seconds of room each side.
export function soundBounds(samples, rate, { threshold = -40, pad = 0.03 } = {}) {
  const limit = dbToGain(threshold);
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= limit) {
      if (first < 0) first = i;
      last = i;
    }
  }
  const duration = samples.length / rate;
  if (first < 0) return { start: 0, end: duration };
  return { start: Math.max(0, first / rate - pad), end: Math.min(duration, (last + 1) / rate + pad) };
}

// The edited samples: the part from `start` to `end` (seconds), faded in and
// out over `fadeIn` / `fadeOut` seconds, louder or quieter by `gain` dB, kept
// within full scale, with `padStart` / `padEnd` seconds of silence added
// before and after.
export function applyEdit(samples, rate, { start = 0, end = samples.length / rate, fadeIn = 0, fadeOut = 0, gain = 0, padStart = 0, padEnd = 0 } = {}) {
  const from = Math.max(0, Math.min(samples.length, Math.round(start * rate)));
  const to = Math.max(from, Math.min(samples.length, Math.round(end * rate)));
  const out = samples.slice(from, to);
  const before = Math.max(0, Math.round(padStart * rate));
  const after = Math.max(0, Math.round(padEnd * rate));
  const g = dbToGain(gain);
  const inLen = Math.min(out.length, Math.round(fadeIn * rate));
  const outLen = Math.min(out.length, Math.round(fadeOut * rate));
  for (let i = 0; i < out.length; i++) {
    let v = out[i] * g;
    if (i < inLen) v *= i / inLen;
    const fromEnd = out.length - 1 - i;
    if (fromEnd < outLen) v *= fromEnd / outLen;
    out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  if (!before && !after) return out;
  const padded = new Float32Array(before + out.length + after);
  padded.set(out, before);
  return padded;
}

export function toInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

// The samples (at CLIP_RATE) as an MP3 file.
export async function encodeMp3(samples) {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(1, CLIP_RATE, CLIP_KBPS);
  const pcm = toInt16(samples);
  const parts = [];
  const BLOCK = 1152 * 16;
  for (let i = 0; i < pcm.length; i += BLOCK) parts.push(encoder.encodeBuffer(pcm.subarray(i, i + BLOCK)));
  parts.push(encoder.flush());
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p.buffer, p.byteOffset, p.length), at);
    at += p.length;
  }
  return out;
}

export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
