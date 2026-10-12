// Thin wrapper over the browser's speech synthesis, used by the listening game.

export const RATE_NORMAL = 0.9;
export const RATE_SLOW = 0.6;

function synth() {
  return typeof window !== "undefined" && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function"
    ? window.speechSynthesis
    : null;
}

export function canSpeak() {
  return Boolean(synth());
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
export function speechLang(code = "en-GB") {
  return code === "en" ? "en-US" : code;
}

export function speak(text, { lang = "en-GB", rate = RATE_NORMAL } = {}) {
  const s = synth();
  if (!s || !text) return false;
  const langTag = speechLang(lang);
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = langTag;
  utterance.rate = rate;
  const voice = pickVoice(s.getVoices(), langTag);
  if (voice) utterance.voice = voice;
  s.cancel();
  s.speak(utterance);
  return true;
}

export function stopSpeaking() {
  const s = synth();
  if (s) s.cancel();
}
