// Recorded speech: which texts the games say aloud, and the file name each
// one's clip gets. Shared by the app (src/lib/speech.js) and the script that
// makes the clips (scripts/speech-audio.mjs), so this file has no imports and
// runs in plain Node.
//
// Clips live at /content/audio/<folder>/<key>.mp3, one folder per voice, with
// the keys of each folder in /content/audio/index.json:
// { "voices": { "<folder>": ["<key>", ...] } }. A text without a clip is read
// by the browser.

export const AUDIO_BASE = "/content/audio/";

// The recorded voices, picked under Settings. `speaker` is the Kokoro voice
// (https://huggingface.co/hexgrad/Kokoro-82M). Changing a voice or the model
// needs a new folder name, so every clip is made again.
export const VOICES = [
  { id: "female", folder: "kokoro-1.0-bf_emma", speaker: "bf_emma" },
  { id: "male", folder: "kokoro-1.0-bm_george", speaker: "bm_george" },
];
export const DEFAULT_VOICE = "female";

export function voiceById(id) {
  return VOICES.find((v) => v.id === id) || VOICES.find((v) => v.id === DEFAULT_VOICE);
}

// The only accent recorded so far. Other learning languages use the browser.
export const CLIP_LANGS = ["en-GB"];

export function normalizeSpeech(text) {
  return typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
}

// cyrb53: a fast 53-bit string hash, so keys are short and stable.
function hash53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function clipKey(text, lang = "en-GB") {
  return hash53(`${lang}|${normalizeSpeech(text)}`).toString(36);
}

const MARKED = /^([^[\]]*)\[([^[\]]+)\]([^[\]]*)$/;

// Everything the games can say in `lang`, from the raw word base
// ({ languages, packs }), without duplicates:
//   - words, phrases and sentences (Listen, Say it, Type it, Quick play)
//   - dictation sentences: examples, dialogue lines and filled-in gap
//     sentences (Type it, as getSentences in ./words.js builds them)
//   - the words of pronunciation lessons (Sounds of English)
export function spokenTexts({ languages = [], packs = [] }, lang = "en-GB") {
  const fallback = languages.find((l) => l.code === lang)?.fallback;
  const out = new Map();
  const add = (text) => {
    const t = normalizeSpeech(text);
    if (t) out.set(clipKey(t, lang), t);
  };
  const english = lang.startsWith("en");
  const inLang = (text) => text?.[lang] || (fallback ? text?.[fallback] : undefined);
  for (const pack of packs) {
    for (const item of pack?.items || []) {
      if (item.type === "word") add(inLang(item.text));
      if (item.type === "word" || item.type === "rule") {
        for (const ex of item.examples || []) add(ex?.[lang] || (english ? ex?.en : undefined));
      }
      if (item.type === "text" && english) {
        for (const line of item.sentences || []) add(line?.en);
      }
      if (item.type === "gap" && typeof item.lang === "string" && item.lang.split("-")[0] === lang.split("-")[0]) {
        if (typeof item.sentence === "string" && item.answers?.length) add(item.sentence.replace("___", item.answers[0]));
      }
      if (item.type === "sound" && english) {
        const marked = item.kind === "silent" || item.kind === "sound";
        for (const w of item.words || []) {
          const m = marked && typeof w.text === "string" ? MARKED.exec(w.text) : null;
          add(w.speak || (m ? m[1] + m[2] + m[3] : w.text));
        }
      }
    }
  }
  return out;
}
