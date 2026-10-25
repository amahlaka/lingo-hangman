// Recorded clips made on the TTS server (the Kokoro service at TTS_URL)
// instead of in the Content publish workflow, for an admin's "Make it again"
// and for a clip a learner listens to before the workflow has made it.
// The service cuts off the stray sounds Kokoro adds at the edges (`frame`),
// reads a single word from the word base's IPA (`dict_ipa`) and makes the
// word-by-word clips (`words`), as scripts/speech-audio.py does. An older
// service ignores those and says the text plainly; its answer's
// X-Kokoro-Framed header says which it did.

import { CLIP_SPEED } from "../../../src/lib/speechClips.js";

// A word-by-word clip of a long sentence takes a while on two CPUs.
const MIN_TIMEOUT_MS = 120_000;

export function createClipMaker({ config, service }) {
  // { text, speaker, words?, ipa?, kind? } -> { audio: Buffer, framed: boolean },
  // through the shared queue to the service (lib/ttsService.js). `kind` is
  // what the admin Speech server page calls the job: "remake" by default,
  // "clip" for a missing clip made when a learner first listens.
  function make({ text, speaker, words = false, ipa, kind = "remake" }) {
    return service.speak({
      kind,
      label: text,
      timeoutMs: Math.max(config.ttsTimeoutMs, MIN_TIMEOUT_MS),
      body: {
        text,
        voice: speaker,
        speed: CLIP_SPEED,
        format: "mp3",
        frame: true,
        ...(words ? { words: true } : {}),
        ...(ipa ? { dict_ipa: ipa } : {}),
      },
    });
  }

  return { make };
}
