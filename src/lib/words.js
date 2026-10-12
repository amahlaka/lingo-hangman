// Shared word loading for every game.
//
// A word pair is `{ learning, native }`: `learning` is the word the learner
// practises (usually English), `native` is its meaning in their own language.
// Games get pairs either from a shared link (`?words=...`) or from the built-in
// COMMON_WORDS list, filtered by categories.

import { COMMON_WORDS } from "../commonWords";

export const DEFAULT_LEARNING_LANG = "en-GB";
export const DEFAULT_NATIVE_LANG = "fi";

// Languages a word list can be built in. `code` matches the keys in COMMON_WORDS
// except en-GB, which has its own key for British spellings.
export const LANGUAGE_OPTIONS = [
  { code: "en-GB", label: "English (UK)" },
  { code: "en", label: "English (US)" },
  { code: "fi", label: "Finnish" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "sv", label: "Swedish" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "cs", label: "Czech" },
  { code: "ro", label: "Romanian" },
  { code: "hu", label: "Hungarian" },
  { code: "tr", label: "Turkish" },
];

// Everyday categories pre-selected so "Start game" works in one tap.
export const DEFAULT_CATEGORIES = ["food", "home", "shopping"];

const FALLBACK_WORDS = [
  { learning: "car", native: "auto" },
  { learning: "traffic light", native: "liikennevalo" },
];

export function languageLabel(code) {
  return LANGUAGE_OPTIONS.find((o) => o.code === code)?.label.replace(/ \(.*\)$/, "") || code;
}

// Fisher-Yates shuffle; returns a new array.
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getAlphabet(lang) {
  switch (lang) {
    case "fi": return "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖ".split("");
    case "de": return "AÄBCDEFGHIJKLMNOÖPQRSßTUÜVWXYZ".split("");
    case "es": return "AÁBCDEÉFGHIÍJKLMNÑOÓPQRSTUÚÜVWXYZ".split("");
    case "sv": return "AÅÄBCDEFGHIJKLMNOPQRSTUVWXYZÖ".split("");
    case "pt": return "AÁÂÃÀBCÇDEÉÊFGHIÍJKLMNOÓÔÕPQRSTUÚÜVWXYZ".split("");
    case "pl": return "AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ".split("");
    case "cs": return "AÁBCČDĎEÉĚFGHIÍJKLMNŇOÓPQRŘSŠTŤUÚŮVWXZÝŽ".split("");
    case "ro": return "AĂÂBCDEFGHIÎJKLMNOPQRSȘTȚUVWXYZ".split("");
    case "hu": return "AÁBCDEÉFGHIÍJKLMNOÓÖŐPQRSTUÚÜŰVWXYZ".split("");
    case "tr": return "AÂBCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split("");
    default: return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  }
}

// COMMON_WORDS has no separate "en-GB" for every word, so fall back to "en".
function wordIn(entry, lang) {
  return entry[lang] || (lang === "en-GB" ? entry.en : undefined);
}

export const ALL_CATEGORIES = Array.from(
  new Set(COMMON_WORDS.flatMap((w) => w.categories || []))
).sort();

// Built-in words matching the filters, as pairs with their categories attached.
// `include`: if non-empty, a word needs at least one of these categories.
// `exclude`: a word with any of these categories is left out.
export function filterCommonWords({
  learningLang = DEFAULT_LEARNING_LANG,
  nativeLang = DEFAULT_NATIVE_LANG,
  include = [],
  exclude = [],
} = {}) {
  return COMMON_WORDS.filter((w) => {
    const cats = w.categories || [];
    return (
      wordIn(w, learningLang) &&
      wordIn(w, nativeLang) &&
      (include.length === 0 || cats.some((c) => include.includes(c))) &&
      !cats.some((c) => exclude.includes(c))
    );
  }).map((w) => ({
    learning: wordIn(w, learningLang),
    native: wordIn(w, nativeLang),
    categories: w.categories || [],
    time: w.time,
  }));
}

// `count` random pairs from the built-in list.
export function pickCommonWords({ count = 5, ...filters } = {}) {
  return shuffle(filterCommonWords(filters)).slice(0, count);
}

function toBase64Unicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64Unicode(str) {
  return decodeURIComponent(escape(atob(str)));
}

// Encode pairs for the `words` URL parameter (base64 JSON, URI-encoded).
export function encodeWords(pairs) {
  const clean = pairs
    .filter((p) => p.learning && p.native)
    .map(({ learning, native }) => ({ learning, native }));
  return encodeURIComponent(toBase64Unicode(JSON.stringify(clean)));
}

// Decode the `words` URL parameter. Returns null if it can't be read.
export function decodeWords(encoded) {
  try {
    const pairs = JSON.parse(fromBase64Unicode(decodeURIComponent(encoded)));
    return Array.isArray(pairs) ? pairs.filter((p) => p && p.learning && p.native) : null;
  } catch {
    return null;
  }
}

// Query string (without "?") for a word set: words, languages and options.
export function buildWordsQuery({
  pairs,
  learningLang = DEFAULT_LEARNING_LANG,
  nativeLang = DEFAULT_NATIVE_LANG,
  swap = false,
}) {
  return `words=${encodeWords(pairs)}${swap ? "&swap=1" : ""}&learningLang=${learningLang}&nativeLang=${nativeLang}`;
}

// Read the word set a game was opened with.
// `params` is a URLSearchParams (e.g. from react-router's useSearchParams).
// Without a `words` param it picks `count` random built-in words.
export function loadWordSet(params, { count = 5 } = {}) {
  const learningLang = params.get("learningLang") || DEFAULT_LEARNING_LANG;
  const nativeLang = params.get("nativeLang") || DEFAULT_NATIVE_LANG;
  const encoded = params.get("words");
  let pairs;
  let fromLink = false;
  if (encoded) {
    pairs = decodeWords(encoded) || FALLBACK_WORDS;
    fromLink = true;
  } else {
    pairs = pickCommonWords({ count, learningLang, nativeLang });
  }
  return {
    pairs: shuffle(pairs),
    learningLang,
    nativeLang,
    swap: params.get("swap") === "1",
    fromLink,
  };
}

// Extra info for a pair from the built-in list (e.g. clock times), if any.
export function wordInfo(learning, learningLang = DEFAULT_LEARNING_LANG) {
  return COMMON_WORDS.find((w) => wordIn(w, learningLang) === learning);
}
