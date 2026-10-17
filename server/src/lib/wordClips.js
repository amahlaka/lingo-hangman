// Recorded clips the API makes itself: a word-base text that has no clip yet
// (new content the Content publish workflow hasn't voiced) is made with the
// TTS service and saved where that workflow puts its clips,
// <clip dir>/<voice folder>/<key>.mp3, with its key added to
// <clip dir>/index.json. From then on it is an ordinary recorded clip, and
// the workflow, which never replaces an existing clip, leaves it alone.
//
// Only texts the word base says can be made, so nobody can fill the folder
// with text of their own.
//
// A bad clip is remade by an admin (remake): its key leaves index.json, so
// the app stops playing it, and goes on <clip dir>/remake.json with a
// revision number. The next Content publish makes it again under
// <key>-<revision>.mp3 (a clip's file is cached for good, so a remade one
// needs a new name) and lists that in index.json's "revisions". Until then
// the API won't save it either, so the slower but cleaner workflow clip is
// the one that stays.

import fs from "node:fs/promises";
import path from "node:path";
import { CLIP_LANGS, clipKey, normalizeSpeech, spokenTexts, wordsKey } from "../../../src/lib/speechClips.js";

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
    await queued(() => addToIndex(folder, key));
  }

  // One write to index.json or remake.json at a time.
  function queued(fn) {
    const run = writing.then(fn);
    writing = run.catch(() => {});
    return run;
  }

  async function readOr(name, empty) {
    try {
      return await readJson(path.join(clipDir, name));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      return empty;
    }
  }

  async function writeJson(name, value) {
    const file = path.join(clipDir, name);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value), { mode: 0o644 });
    await fs.rename(tmp, file);
  }

  async function readManifest() {
    const manifest = await readOr("index.json", { voices: {} });
    if (!manifest.voices || typeof manifest.voices !== "object") manifest.voices = {};
    return manifest;
  }

  async function readRemakes() {
    const list = await readOr("remake.json", { keys: {} });
    if (!list.keys || typeof list.keys !== "object") list.keys = {};
    return list;
  }

  async function addToIndex(folder, key) {
    const manifest = await readManifest();
    const keys = Array.isArray(manifest.voices[folder]) ? manifest.voices[folder] : [];
    if (keys.includes(key)) return;
    manifest.voices[folder] = [...keys, key];
    await writeJson("index.json", manifest);
  }

  // Whether the clip waits for the Content publish workflow to make it again.
  async function remaking(folder, key) {
    if (!(await readRemakes()).keys[key]) return false;
    const keys = (await readManifest()).voices[folder];
    return !(Array.isArray(keys) && keys.includes(key));
  }

  // Takes a word-base text's clips (both voices, and its word-by-word clip)
  // off the live list so the next Content publish makes them again.
  // Resolves to the keys, or null when the text isn't in the word base.
  async function remake(text, lang = "en") {
    const key = await keyFor(text, lang);
    if (!key) return null;
    const keys = [key];
    if (normalizeSpeech(text).split(" ").length > 1) keys.push(wordsKey(text, lang));
    await queued(async () => {
      const list = await readRemakes();
      for (const k of keys) list.keys[k] = (Number(list.keys[k]) || 0) + 1;
      await writeJson("remake.json", list);
      const manifest = await readManifest();
      for (const [folder, live] of Object.entries(manifest.voices)) {
        if (Array.isArray(live)) manifest.voices[folder] = live.filter((k) => !keys.includes(k));
        if (manifest.revisions?.[folder]) for (const k of keys) delete manifest.revisions[folder][k];
      }
      await writeJson("index.json", manifest);
    });
    return keys;
  }

  return { keyFor, has, save, remake, remaking };
}
