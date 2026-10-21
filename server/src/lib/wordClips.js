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
// the one that stays. With a TTS server (`maker`, lib/clipMaker.js) the API
// doesn't wait for the workflow: it makes the new clips there straight away,
// in the background, saves them under that same name and puts them back on
// the list. A clip it couldn't make is left to the workflow.
//
// The Recordings page (/admin/clips) lists every clip and saves an admin's
// edit (trimmed, faded, louder) as a new revision of one voice's clip, the
// same way: a new <key>-<revision>.mp3, named in index.json's "revisions".
// Its number is taken from remake.json too, so a later remake never reuses
// it. Every version stays on disk, so an older one can be put back; what was
// done is kept in <clip dir>/edits.json.

import fs from "node:fs/promises";
import path from "node:path";
import { CLIP_LANGS, VOICES, clipKey, normalizeSpeech, spokenTexts, wordByWordTexts, wordsKey } from "../../../src/lib/speechClips.js";

const RELOAD_MS = 60_000;
// A clip file: <key>.mp3 or <key>-<revision>.mp3 (keys are base 36).
const CLIP_FILE = /^([0-9a-z]+)(?:-(\d+))?\.mp3$/;
// History entries kept per clip in edits.json.
const MAX_EDITS = 20;

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));

// key -> IPA of each one-word text that a word-base word gives IPA for, so the
// TTS server reads it from that (as scripts/speech-audio.mjs plans it). A
// word two entries give different IPA for keeps the voice's own guess.
function wordIpa(content, keys) {
  const out = new Map();
  const clash = new Set();
  for (const lang of CLIP_LANGS) {
    const fallback = content.languages.find((l) => l.code === lang)?.fallback;
    for (const pack of content.packs) {
      for (const item of pack?.items || []) {
        const ipa = item.type === "word" ? item.ipa?.[lang] : undefined;
        const text = item.text?.[lang] || (fallback ? item.text?.[fallback] : undefined);
        if (typeof ipa !== "string" || typeof text !== "string" || /\s/.test(text.trim())) continue;
        const key = clipKey(text, lang);
        if (!keys.has(key) || clash.has(key)) continue;
        if (out.has(key) && out.get(key) !== ipa) {
          out.delete(key);
          clash.add(key);
        } else {
          out.set(key, ipa);
        }
      }
    }
  }
  return out;
}

export function createWordClips({ contentDir, clipDir, maker = null, log = null }) {
  let known = null; // { stamp, keys: Set, texts: Map, ipa: Map } of the word base on disk
  const making = new Set(); // keys being made on the TTS server now
  let made = Promise.resolve(); // the last remake on the TTS server
  let checkedAt = 0;
  let writing = Promise.resolve(); // index.json updates, one at a time

  // The word base's spoken texts, reloaded when content/index.json changes
  // (checked at most once a minute): `keys` of every text it says, and
  // `texts`, key -> { text, words }, with the word-by-word clips too, and
  // `ipa`, key -> the word base's IPA of a one-word text.
  async function loadKnown(now = Date.now()) {
    if (known && now - checkedAt < RELOAD_MS) return known;
    checkedAt = now;
    const stamp = (await fs.stat(path.join(contentDir, "index.json"))).mtimeMs;
    if (known?.stamp === stamp) return known;
    const index = await readJson(path.join(contentDir, "index.json"));
    const content = {
      languages: await readJson(path.join(contentDir, "languages.json")),
      packs: await Promise.all((index.packs || []).map((id) => readJson(path.join(contentDir, "packs", `${id}.json`)))),
    };
    const keys = new Set();
    const texts = new Map();
    for (const lang of CLIP_LANGS) {
      for (const [key, text] of spokenTexts(content, lang)) {
        keys.add(key);
        texts.set(key, { text, words: false });
      }
      for (const [key, text] of wordByWordTexts(content, lang)) texts.set(key, { text, words: true });
    }
    known = { stamp, keys, texts, ipa: wordIpa(content, keys) };
    return known;
  }

  const knownKeys = async () => (await loadKnown()).keys;

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
  // off the live list so they are made again: on the TTS server now when
  // there is one, else by the next Content publish. Resolves to the keys, or
  // null when the text isn't in the word base.
  async function remake(text, lang = "en") {
    const key = await keyFor(text, lang);
    if (!key) return null;
    const keys = [key];
    if (normalizeSpeech(text).split(" ").length > 1) keys.push(wordsKey(text, lang));
    const revisions = await queued(async () => {
      const list = await readRemakes();
      const files = await Promise.all(VOICES.map((v) => filesIn(v.folder)));
      for (const k of keys) {
        // Past every file already on disk, so a new one never replaces one.
        const onDisk = files.flatMap((f) => f.get(k) || []);
        list.keys[k] = Math.max(Number(list.keys[k]) || 0, ...onDisk) + 1;
      }
      await writeJson("remake.json", list);
      const manifest = await readManifest();
      for (const [folder, live] of Object.entries(manifest.voices)) {
        if (Array.isArray(live)) manifest.voices[folder] = live.filter((k) => !keys.includes(k));
        if (manifest.revisions?.[folder]) for (const k of keys) delete manifest.revisions[folder][k];
      }
      await writeJson("index.json", manifest);
      return Object.fromEntries(keys.map((k) => [k, list.keys[k]]));
    });
    if (maker) {
      for (const k of keys) making.add(k);
      made = made.then(() => makeAgain(revisions, lang)).catch(() => {});
    }
    return keys;
  }

  // The remade clips, made on the TTS server in every voice and put back on
  // the live list as <key>-<revision>.mp3. One that fails stays off the list
  // for the Content publish workflow.
  async function makeAgain(revisions, lang) {
    const { texts, ipa } = await loadKnown();
    for (const [key, revision] of Object.entries(revisions)) {
      const entry = texts.get(key);
      try {
        if (!entry) continue;
        for (const voice of VOICES) {
          const { audio, framed } = await maker.make({ text: entry.text, speaker: voice.speaker, words: entry.words, ipa: ipa.get(key) });
          if (!framed) log?.warn({ key }, "clip remake: the TTS server didn't cut the edges (old version?)");
          const file = path.join(clipDir, voice.folder, `${key}-${revision}.mp3`);
          await fs.mkdir(path.dirname(file), { recursive: true });
          const tmp = `${file}.${process.pid}.tmp`;
          await fs.writeFile(tmp, audio, { mode: 0o644 });
          await fs.rename(tmp, file);
        }
        await queued(async () => {
          // Asked for again meanwhile: that newer remake puts it back.
          if (Number((await readRemakes()).keys[key]) !== revision) return;
          const manifest = await readManifest();
          manifest.revisions = manifest.revisions && typeof manifest.revisions === "object" ? manifest.revisions : {};
          for (const voice of VOICES) {
            const live = Array.isArray(manifest.voices[voice.folder]) ? manifest.voices[voice.folder] : [];
            if (!live.includes(key)) manifest.voices[voice.folder] = [...live, key];
            manifest.revisions[voice.folder] = { ...(manifest.revisions[voice.folder] || {}), [key]: revision };
          }
          await writeJson("index.json", manifest);
        });
        log?.info({ key, revision }, "clip remade on the TTS server");
      } catch (err) {
        log?.warn({ key, err: err.message }, "clip remake on the TTS server failed; left to Content publish");
      } finally {
        making.delete(key);
      }
    }
  }

  // --- The Recordings page ---

  const voiceOf = (folder) => VOICES.find((v) => v.folder === folder) || null;

  // key -> sorted revisions of the files in a voice folder (0 is <key>.mp3).
  async function filesIn(folder) {
    let names = [];
    try {
      names = await fs.readdir(path.join(clipDir, folder));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const out = new Map();
    for (const name of names) {
      const m = CLIP_FILE.exec(name);
      if (!m) continue;
      if (!out.has(m[1])) out.set(m[1], []);
      out.get(m[1]).push(Number(m[2]) || 0);
    }
    for (const list of out.values()) list.sort((a, b) => a - b);
    return out;
  }

  async function readEdits() {
    const edits = await readOr("edits.json", {});
    return edits && typeof edits === "object" && !Array.isArray(edits) ? edits : {};
  }

  async function logEdit(folder, key, entry) {
    const edits = await readEdits();
    const forFolder = (edits[folder] && typeof edits[folder] === "object" ? edits[folder] : (edits[folder] = {}));
    forFolder[key] = [...(Array.isArray(forFolder[key]) ? forFolder[key] : []), entry].slice(-MAX_EDITS);
    await writeJson("edits.json", edits);
  }

  // The clip keys of report texts that the word base says (each text's own
  // clip and its word-by-word one).
  async function keysForTexts(texts, lang = "en") {
    const known = (await loadKnown()).texts;
    const out = new Set();
    for (const text of texts) {
      for (const key of [clipKey(text, lang), wordsKey(text, lang)]) if (known.has(key)) out.add(key);
    }
    return [...out];
  }

  // Every clip the word base needs, per voice: { voices, clips: [{ key, text,
  // words, voices: { <folder>: { state, revision?, versions?, edits? } } }] }.
  // state is live, remaking (an admin asked for it again) or missing (not
  // made yet; the app reads it another way). revision is the live file's.
  async function list() {
    const { texts } = await loadKnown();
    const manifest = await readManifest();
    const remakes = (await readRemakes()).keys;
    const edits = await readEdits();
    const voices = [];
    for (const v of VOICES) {
      voices.push({
        ...v,
        live: new Set(Array.isArray(manifest.voices[v.folder]) ? manifest.voices[v.folder] : []),
        revisions: manifest.revisions?.[v.folder] || {},
        files: await filesIn(v.folder),
      });
    }
    const clips = [];
    for (const [key, { text, words }] of texts) {
      const perVoice = {};
      for (const v of voices) {
        const live = v.live.has(key);
        const entry = { state: live ? "live" : making.has(key) ? "making" : remakes[key] ? "remaking" : "missing" };
        const revision = Number(v.revisions[key]) || 0;
        if (live && revision) entry.revision = revision;
        const versions = v.files.get(key);
        if (versions?.length) entry.versions = versions;
        const log = edits[v.folder]?.[key];
        if (Array.isArray(log) && log.length) entry.edits = log;
        perVoice[v.folder] = entry;
      }
      clips.push({ key, text, words, voices: perVoice });
    }
    return { voices: VOICES.map(({ id, folder, speaker }) => ({ id, folder, speaker })), clips };
  }

  // An admin's edit of one voice's live clip: `audio` (an MP3) becomes its
  // new revision and the one the app plays. `changes` says what was done
  // (trim, fades, gain), for the history. Resolves to { revision } or
  // { error }.
  async function saveEdit(folder, key, audio, changes = {}, now = new Date()) {
    if (!voiceOf(folder)) return { error: "bad_voice" };
    if (!(await loadKnown()).texts.has(key)) return { error: "not_word_base" };
    return queued(async () => {
      const manifest = await readManifest();
      if (!(manifest.voices[folder] || []).includes(key)) return { error: "not_live" };
      const list = await readRemakes();
      const from = Number(manifest.revisions?.[folder]?.[key]) || 0;
      const onDisk = (await filesIn(folder)).get(key) || [];
      const revision = Math.max(Number(list.keys[key]) || 0, from, ...onDisk) + 1;
      const file = path.join(clipDir, folder, `${key}-${revision}.mp3`);
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, audio, { mode: 0o644 });
      await fs.rename(tmp, file);
      list.keys[key] = revision;
      await writeJson("remake.json", list);
      manifest.revisions = manifest.revisions && typeof manifest.revisions === "object" ? manifest.revisions : {};
      manifest.revisions[folder] = { ...(manifest.revisions[folder] || {}), [key]: revision };
      await writeJson("index.json", manifest);
      await logEdit(folder, key, { revision, from, at: now.toISOString(), ...changes });
      return { revision };
    });
  }

  // Puts an earlier version of a voice's live clip back (0 is the first one,
  // <key>.mp3). Resolves to { revision } or { error }.
  async function useVersion(folder, key, revision, now = new Date()) {
    if (!voiceOf(folder)) return { error: "bad_voice" };
    if (!(await loadKnown()).texts.has(key)) return { error: "not_word_base" };
    return queued(async () => {
      const manifest = await readManifest();
      if (!(manifest.voices[folder] || []).includes(key)) return { error: "not_live" };
      if (!((await filesIn(folder)).get(key) || []).includes(revision)) return { error: "no_such_version" };
      const from = Number(manifest.revisions?.[folder]?.[key]) || 0;
      manifest.revisions = manifest.revisions && typeof manifest.revisions === "object" ? manifest.revisions : {};
      const forFolder = { ...(manifest.revisions[folder] || {}) };
      if (revision) forFolder[key] = revision;
      else delete forFolder[key];
      manifest.revisions[folder] = forFolder;
      await writeJson("index.json", manifest);
      await logEdit(folder, key, { revision, from, at: now.toISOString(), restored: true });
      return { revision };
    });
  }

  return {
    keyFor,
    has,
    save,
    remake,
    remaking,
    list,
    keysForTexts,
    saveEdit,
    useVersion,
    // Whether remakes are made on the TTS server, and (for tests) when the
    // ones asked for so far are done.
    makesNow: Boolean(maker),
    idle: () => made,
  };
}
