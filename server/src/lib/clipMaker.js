// Recorded clips made on the TTS server (the Kokoro service at TTS_URL)
// instead of in the Content publish workflow, for an admin's "Make it again".
// The service cuts off the stray sounds Kokoro adds at the edges (`frame`),
// reads a single word from the word base's IPA (`dict_ipa`) and makes the
// word-by-word clips (`words`), as scripts/speech-audio.py does. An older
// service ignores those and says the text plainly; its answer's
// X-Kokoro-Framed header says which it did.

import { CLIP_SPEED } from "../../../src/lib/speechClips.js";

// A word-by-word clip of a long sentence takes a while on two CPUs.
const MIN_TIMEOUT_MS = 120_000;

export function createClipMaker({ config, fetchImpl = globalThis.fetch }) {
  let queue = Promise.resolve();

  // { text, speaker, words?, ipa? } -> { audio: Buffer, framed: boolean }.
  // One at a time: the service makes one clip at a time anyway.
  function make({ text, speaker, words = false, ipa }) {
    const run = queue.then(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.max(config.ttsTimeoutMs, MIN_TIMEOUT_MS));
      try {
        const res = await fetchImpl(`${config.ttsUrl.replace(/\/$/, "")}/tts`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(config.ttsApiKey ? { "x-api-key": config.ttsApiKey } : {}) },
          body: JSON.stringify({
            text,
            voice: speaker,
            speed: CLIP_SPEED,
            format: "mp3",
            frame: true,
            ...(words ? { words: true } : {}),
            ...(ipa ? { dict_ipa: ipa } : {}),
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`tts service answered ${res.status}`);
        return { audio: Buffer.from(await res.arrayBuffer()), framed: res.headers?.get?.("x-kokoro-framed") === "1" };
      } finally {
        clearTimeout(timer);
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  return { make };
}
