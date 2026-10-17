// Recorded clips the API makes itself: a word-base text that has no clip yet
// (new content the Content publish workflow hasn't voiced) is made with the
// TTS service and saved where that workflow puts its clips,
// <clip dir>/<voice folder>/<key>.mp3, with its key added to
// <clip dir>/index.json. From then on it is an ordinary recorded clip, and
// the workflow, which never replaces an existing clip, leaves it alone.
//
// Only texts the word base says can be made, so nobody can fill the folder
// with text of their own.

import fs from "node:fs/promises";
import path from "node:path";
import { CLIP_LANGS, clipKey, spokenTexts } from "../../../src/lib/speechClips.js";

const RELOAD_MS = 60_000;

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

export function createWordClips({ contentDir, clipDir }) {
  let known = null; // { stamp, keys: Set } of the word base on disk
  let checkedAt = 0;
  let writing = Promise.resolve(); // index.json updates, one at a time

  // The keys of every text the word base says, reloaded when content/index.json
  // changes (checked at most once a minute).
  async function knownKeys(now = Date.now()) {
    if (known && now - checkedAt < RELOAD_MS) return known.keys;
    checkedAt = now;
    const stamp = (await fs.stat(path.join(contentDir, "index.json"))).mtimeMs;
    if (known?.stamp === stamp) return known.keys;
    const index = await readJson(path.join(contentDir, "index.json"));
    const content = {
      languages: await readJson(path.join(contentDir, "languages.json")),
      packs: await Promise.all((index.packs || []).map((id) => readJson(path.join(contentDir, "packs", `${id}.json`)))),
    };
    const keys = new Set();
    for (const lang of CLIP_LANGS) for (const key of spokenTexts(content, lang).keys()) keys.add(key);
    known = { stamp, keys };
    return keys;
  }

  // The clip's key when `text` is in the word base, else null.
  async function keyFor(text, lang = "en") {
    if (!CLIP_LANGS.includes(lang)) return null;
    const key = clipKey(text, lang);
    return (await knownKeys()).has(key) ? key : null;
  }

  const fileFor = (folder, key) => path.join(clipDir, folder, `${key}.mp3`);

  async function has(folder, key) {
    try {
      return (await fs.stat(fileFor(folder, key))).isFile();
    } catch {
      return false;
    }
  }

  async function save(folder, key, audio) {
    const file = fileFor(folder, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, audio, { mode: 0o644 });
    await fs.rename(tmp, file);
    const run = writing.then(() => addToIndex(folder, key));
    writing = run.catch(() => {});
    await run;
  }

  async function addToIndex(folder, key) {
    const file = path.join(clipDir, "index.json");
    let manifest = { voices: {} };
    try {
      manifest = await readJson(file);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    if (!manifest.voices || typeof manifest.voices !== "object") manifest.voices = {};
    const keys = Array.isArray(manifest.voices[folder]) ? manifest.voices[folder] : [];
    if (keys.includes(key)) return;
    manifest.voices[folder] = [...keys, key];
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(manifest), { mode: 0o644 });
    await fs.rename(tmp, file);
  }

  return { keyFor, has, save };
}
