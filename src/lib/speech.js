// Reading words aloud, shared by the games that do it (Listen and choose, Say
// it right, Type it, Sounds of English).
//
// Texts from the word base have recorded clips (made with an open voice
// model, see scripts/speech-audio.mjs), so every device hears the same voice.
// Anything without a clip, or a clip that won't play (offline, say), falls
// back to the browser's own speech synthesis.

import { AUDIO_BASE, DEFAULT_VOICE, clipKey, voiceById, wordsKey } from "./speechClips";

export const RATE_NORMAL = 0.9;
export const RATE_SLOW = 0.6;

// Recorded clips play at their natural speed; slow is this much slower.
const CLIP_SLOW = 0.7;

function synth() {
  return typeof window !== "undefined" && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function"
    ? window.speechSynthesis
    : null;
}

function canPlayClips() {
  return typeof window !== "undefined" && typeof window.Audio === "function";
}

// { base, folders: Map(folder -> Set of keys) } once /content/audio/index.json
// has loaded.
let clips = null;
let voiceId = DEFAULT_VOICE; // "female" or "male", from Settings
let player = null;
let turn = 0; // bumps on every speak/stop, so a clip that was stopped never falls back

export function canSpeak() {
  return Boolean(synth()) || Boolean(clipKeys()?.size && canPlayClips());
}

// The recorded voice to use (see VOICES in ./speechClips.js).
export function setSpeechVoice(id) {
  voiceId = voiceById(id).id;
}

function clipKeys() {
  return clips?.folders.get(voiceById(voiceId).folder) || null;
}

// Load the list of recorded clips. Called once at startup; until it has
// loaded (or if it fails) everything uses the browser voice.
export async function loadSpeechClips({ base = AUDIO_BASE, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function" || !canPlayClips()) return false;
  try {
    const res = await fetchImpl(`${base}index.json`, { cache: "no-cache" });
    if (!res.ok) return false;
    const manifest = await res.json();
    if (!manifest.voices || typeof manifest.voices !== "object") return false;
    const folders = new Map(
      Object.entries(manifest.voices).filter(([, keys]) => Array.isArray(keys)).map(([folder, keys]) => [folder, new Set(keys)])
    );
    clips = { base, folders };
    unlockOnFirstTap();
    return true;
  } catch {
    return false;
  }
}

function getPlayer() {
  if (!player) {
    player = new window.Audio();
    player.preload = "auto";
  }
  return player;
}

// Phones only let a page play sound it starts from a tap. Playing a moment of
// silence on the shared player during the first tap lets later clips play on
// their own (a new question reading its word, for instance).
function unlockOnFirstTap() {
  if (typeof document === "undefined") return;
  const unlock = () => {
    document.removeEventListener("pointerdown", unlock, true);
    document.removeEventListener("keydown", unlock, true);
    const p = getPlayer();
    if (!p.paused) return;
    p.src = "/silence.mp3";
    p.play()?.catch?.(() => {});
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}

// Prefer a voice for the exact accent, then any voice for the language.
export function pickVoice(voices, langTag) {
  const list = voices || [];
  const lower = langTag.toLowerCase();
  const base = lower.split("-")[0];
  const tagOf = (v) => (v.lang || "").toLowerCase().replace("_", "-");
  return list.find((v) => tagOf(v) === lower) || list.find((v) => tagOf(v).split("-")[0] === base) || null;
}

// Word-list language code ("en-GB", "en", "fi" …) to a speech language tag.
export function speechLang(code = "en") {
  return code === "en" ? "en-US" : code;
}

function speakWithBrowser(text, langTag, rate) {
  const s = synth();
  if (!s) return false;
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = langTag;
  utterance.rate = rate;
  const voice = pickVoice(s.getVoices(), langTag);
  if (voice) utterance.voice = voice;
  s.cancel();
  s.speak(utterance);
  return true;
}

// The browser voice can't pause between words on its own, so each word is
// its own utterance.
function speakWordsWithBrowser(text, langTag) {
  const s = synth();
  if (!s) return false;
  const voice = pickVoice(s.getVoices(), langTag);
  s.cancel();
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const utterance = new window.SpeechSynthesisUtterance(word);
    utterance.lang = langTag;
    utterance.rate = RATE_SLOW;
    if (voice) utterance.voice = voice;
    s.speak(utterance);
  }
  return true;
}

function playClip(key, fallbackSpeech, rate) {
  const mine = turn;
  let fellBack = false;
  const fallback = () => {
    if (fellBack || mine !== turn) return;
    fellBack = true;
    fallbackSpeech();
  };
  const p = getPlayer();
  p.src = `${clips.base}${voiceById(voiceId).folder}/${key}.mp3`;
  p.preservesPitch = true;
  p.playbackRate = rate < RATE_NORMAL ? CLIP_SLOW : 1;
  // Not played: offline, blocked before the first tap, or a broken file.
  p.onerror = fallback;
  try {
    const started = p.play();
    if (started?.catch) {
      started.catch((error) => {
        if (error?.name !== "AbortError") fallback();
      });
    }
  } catch {
    fallback();
  }
}

export function speak(text, { lang = "en", rate = RATE_NORMAL } = {}) {
  if (!text) return false;
  const langTag = speechLang(lang);
  const key = clipKey(text, lang);
  stopSpeaking();
  if (clipKeys()?.has(key) && canPlayClips()) {
    playClip(key, () => speakWithBrowser(text, langTag, rate), rate);
    return true;
  }
  return speakWithBrowser(text, langTag, rate);
}

// Say a sentence slowly, one word at a time with a pause after each.
export function speakWords(text, { lang = "en" } = {}) {
  if (!text) return false;
  const langTag = speechLang(lang);
  const key = wordsKey(text, lang);
  stopSpeaking();
  if (clipKeys()?.has(key) && canPlayClips()) {
    playClip(key, () => speakWordsWithBrowser(text, langTag), RATE_NORMAL);
    return true;
  }
  return speakWordsWithBrowser(text, langTag);
}

export function stopSpeaking() {
  turn += 1;
  if (player) {
    player.onerror = null;
    if (!player.paused) player.pause();
  }
  const s = synth();
  if (s) s.cancel();
}

// For tests.
export function resetSpeechClips() {
  clips = null;
  player = null;
  voiceId = DEFAULT_VOICE;
}
