// Recorded speech for the word base: works out which clips to make and writes
// the list the app reads. The clips themselves are made by speech-audio.py.
//
//   node scripts/speech-audio.mjs plan   [--live URL] [--out DIR]
//   node scripts/speech-audio.mjs finish [--live URL] [--out DIR]
//
// plan    lists every text the games say (src/lib/speechClips.js), and the
//         word-by-word version of each one longer than a word, in every
//         voice, with the word base's IPA for words that have it, and writes
//         DIR/todo.json with the ones that have no clip yet:
//         none on the live site at URL (if given) and none already in
//         DIR/<voice folder>/.
// finish  writes DIR/index.json: per voice, the keys of every clip that is now
//         on the live site or in DIR/<voice folder>/, for texts still said.
//
// A clip an admin asked to remake (the live site's audio/remake.json, from
// server/src/lib/wordClips.js) is off the live list, so plan lists it again,
// to be made as <key>-<revision>.mp3: clip files are cached for good, so a
// new one needs a new name. index.json's "revisions" names those files.
//
// DIR defaults to audio-build/. Reads the word base from content/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLIP_LANGS, VOICES, clipKey, spokenTexts, wordByWordTexts } from "../src/lib/speechClips.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const command = args[0];
const live = option("--live");
const out = path.resolve(option("--out") || path.join(root, "audio-build"));

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, "content", file), "utf8"));
const index = readJson("index.json");
const content = {
  languages: readJson("languages.json"),
  packs: index.packs.map((id) => readJson(`packs/${id}.json`)),
};

// key -> { text, lang, ipa?, words? }
const wanted = new Map();
for (const lang of CLIP_LANGS) {
  for (const [key, text] of spokenTexts(content, lang)) wanted.set(key, { text, lang });
  for (const [key, text] of wordByWordTexts(content, lang)) wanted.set(key, { text, lang, words: true });
}

// Single words with IPA in the word base are read from it, because on its own
// a word can be ambiguous to the voice ("live" alone comes out as in "live
// music"). Phrases and sentences give the voice context (and IPA would drop
// their punctuation, so a question wouldn't sound like one). A word two
// entries give different IPA for keeps the voice's own guess.
for (const lang of CLIP_LANGS) {
  const fallback = content.languages.find((l) => l.code === lang)?.fallback;
  const clash = new Set();
  for (const pack of content.packs) {
    for (const item of pack.items || []) {
      const ipa = item.type === "word" ? item.ipa?.[lang] : undefined;
      const text = item.text?.[lang] || (fallback ? item.text?.[fallback] : undefined);
      const word = typeof ipa === "string" && typeof text === "string" && !/\s/.test(text.trim());
      const entry = word ? wanted.get(clipKey(text, lang)) : undefined;
      if (!entry || clash.has(entry)) continue;
      if (entry.ipa && entry.ipa !== ipa) {
        console.warn(`"${entry.text}" has two IPA readings (${entry.ipa}, ${ipa}); the voice picks one.`);
        delete entry.ipa;
        clash.add(entry);
      } else {
        entry.ipa = ipa;
      }
    }
  }
}

// A JSON file of the live site's audio folder. A missing file means none; any
// other failure stops here, so a network hiccup can't publish a list without
// the clips.
async function liveJson(name) {
  if (!live) return null;
  const url = new URL(`content/audio/${name}`, live.endsWith("/") ? live : `${live}/`);
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (error) {
    console.error(`Could not read ${url}: ${error.message}`);
    process.exit(1);
  }
}

// key -> file name of every clip made in DIR/<folder>/ ("<key>" or "<key>-<revision>").
const madeFiles = (folder) => {
  const dir = path.join(out, folder);
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)) : [];
  return new Map(names.map((name) => [name.replace(/-\d+$/, ""), name]));
};
const revisionOf = (name) => Number(/-(\d+)$/.exec(name)?.[1]) || 0;

fs.mkdirSync(out, { recursive: true });
const manifest = (await liveJson("index.json")) || {};
// folder -> Set of keys
const onSite = new Map(Object.entries(manifest.voices || {}).map(([folder, keys]) => [folder, new Set(keys)]));
// key -> revision of the clips to make again
const remakes = (await liveJson("remake.json"))?.keys || {};

if (command === "plan") {
  const todo = [];
  for (const voice of VOICES) {
    const live = onSite.get(voice.folder) || new Set();
    const made = madeFiles(voice.folder);
    for (const [key, v] of wanted) {
      if (live.has(key) || made.has(key)) continue;
      const revision = Number(remakes[key]) || 0;
      todo.push({ key, ...v, folder: voice.folder, speaker: voice.speaker, ...(revision ? { file: `${key}-${revision}` } : {}) });
    }
  }
  fs.writeFileSync(path.join(out, "todo.json"), `${JSON.stringify({ items: todo }, null, 2)}\n`);
  console.log(`${wanted.size} texts are spoken in ${VOICES.length} voices; ${todo.length} clips to make.`);
} else if (command === "finish") {
  const voices = {};
  const revisions = {};
  for (const voice of VOICES) {
    const live = onSite.get(voice.folder) || new Set();
    const made = madeFiles(voice.folder);
    const liveRevisions = manifest.revisions?.[voice.folder] || {};
    voices[voice.folder] = [...wanted.keys()].filter((key) => live.has(key) || made.has(key)).sort();
    const folderRevisions = {};
    for (const key of voices[voice.folder]) {
      const revision = made.has(key) ? revisionOf(made.get(key)) : Number(liveRevisions[key]) || 0;
      if (revision) folderRevisions[key] = revision;
    }
    if (Object.keys(folderRevisions).length) revisions[voice.folder] = folderRevisions;
    const missing = wanted.size - voices[voice.folder].length;
    console.log(`${voice.folder}: ${voices[voice.folder].length} clips${missing ? `; ${missing} texts use the browser voice` : ""}.`);
  }
  const index = Object.keys(revisions).length ? { voices, revisions } : { voices };
  fs.writeFileSync(path.join(out, "index.json"), `${JSON.stringify(index)}\n`);
} else {
  console.error("Usage: node scripts/speech-audio.mjs plan|finish [--live URL] [--out DIR]");
  process.exit(1);
}
