// Recorded speech for the word base: works out which clips to make and writes
// the list the app reads. The clips themselves are made by speech-audio.py.
//
//   node scripts/speech-audio.mjs plan   [--live URL] [--out DIR]
//   node scripts/speech-audio.mjs finish [--live URL] [--out DIR]
//
// plan    lists every text the games say (src/lib/speechClips.js) and writes
//         DIR/todo.json with the ones that have no clip yet: none on the live
//         site at URL (if given) and none already in DIR/<voice>/.
// finish  writes DIR/index.json: the keys of every clip that is now on the
//         live site or in DIR/<voice>/, for texts the games still say.
//
// DIR defaults to audio-build/. Reads the word base from content/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLIP_LANGS, spokenTexts } from "../src/lib/speechClips.js";

// Changing the voice or model starts a new folder, so every clip is made again.
export const VOICE = "kokoro-1.0-bf_emma";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const command = args[0];
const live = option("--live");
const out = path.resolve(option("--out") || path.join(root, "audio-build"));
const voiceDir = path.join(out, VOICE);

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, "content", file), "utf8"));
const index = readJson("index.json");
const content = {
  languages: readJson("languages.json"),
  packs: index.packs.map((id) => readJson(`packs/${id}.json`)),
};

// key -> { text, lang }
const wanted = new Map();
for (const lang of CLIP_LANGS) {
  for (const [key, text] of spokenTexts(content, lang)) wanted.set(key, { text, lang });
}

// Keys of the clips on the live site. A missing list means none; any other
// failure stops here, so a network hiccup can't publish a list without them.
async function liveKeys() {
  if (!live) return new Set();
  const url = new URL("content/audio/index.json", live.endsWith("/") ? live : `${live}/`);
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (res.status === 404) return new Set();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const manifest = await res.json();
    return new Set(manifest.voice === VOICE && Array.isArray(manifest.keys) ? manifest.keys : []);
  } catch (error) {
    console.error(`Could not read ${url}: ${error.message}`);
    process.exit(1);
  }
}

const madeKeys = () =>
  new Set(fs.existsSync(voiceDir) ? fs.readdirSync(voiceDir).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)) : []);

fs.mkdirSync(voiceDir, { recursive: true });
const onSite = await liveKeys();

if (command === "plan") {
  const made = madeKeys();
  const todo = [...wanted].filter(([key]) => !onSite.has(key) && !made.has(key)).map(([key, v]) => ({ key, ...v }));
  fs.writeFileSync(path.join(out, "todo.json"), `${JSON.stringify({ voice: VOICE, items: todo }, null, 2)}\n`);
  console.log(`${wanted.size} texts are spoken, ${onSite.size} clips are live, ${todo.length} to make.`);
} else if (command === "finish") {
  const made = madeKeys();
  const keys = [...wanted.keys()].filter((key) => onSite.has(key) || made.has(key)).sort();
  fs.writeFileSync(path.join(out, "index.json"), `${JSON.stringify({ voice: VOICE, keys })}\n`);
  const missing = wanted.size - keys.length;
  console.log(`index.json lists ${keys.length} clips${missing ? `; ${missing} texts have none and use the browser voice` : ""}.`);
} else {
  console.error("Usage: node scripts/speech-audio.mjs plan|finish [--live URL] [--out DIR]");
  process.exit(1);
}
