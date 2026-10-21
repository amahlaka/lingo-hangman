// Shared word loading for every game.
//
// A word pair is `{ learning, native }`: `learning` is the word the learner
// practises (usually English), `native` is its meaning in their own language.
// Games get pairs either from a shared link (`?words=...`) or from the word
// bank (./content.js), filtered by categories. The bank also holds
// fill-the-gap sentences, grammar rules and mixed-up words; see the getters
// near the end of this file.

import { getContent, onContentChange } from "./content";
import { applyPreferences } from "./preferences";
import { fill } from "../i18n";

export const DEFAULT_LEARNING_LANG = "en";
export const DEFAULT_NATIVE_LANG = "fi";

// Languages a word list can be built in: [{ code, label }], from
// content/languages.json. Updated when newer content is loaded.
export let LANGUAGE_OPTIONS = [];

// Every category used by a word, sorted. Updated with the content.
export let ALL_CATEGORIES = [];

function refresh(content) {
  LANGUAGE_OPTIONS = content.languages.map(({ code, label }) => ({ code, label }));
  ALL_CATEGORIES = Array.from(new Set(wordItems(content).flatMap((w) => w.categories || []))).sort();
}

function wordItems(content = getContent()) {
  return content.items.filter((i) => i.type === "word");
}

// Everyday categories pre-selected so "Start game" works in one tap.
export const DEFAULT_CATEGORIES = ["food", "home", "shopping"];

export function languageLabel(code) {
  return LANGUAGE_OPTIONS.find((o) => o.code === code)?.label.replace(/ \(.*\)$/, "") || code;
}

// "Guess the English word for" / "Arvaa englanniksi:" in the UI language `t`.
export function guessPromptText(t, code) {
  return fill(t.guessPrompt, { language: languageLabel(code), inLanguage: t.inLanguage?.[code] || languageLabel(code) });
}

// The label over a word's meaning: "Suomeksi" in a Finnish UI, otherwise the
// language's name.
export function meaningLabel(t, code) {
  return code === "fi" ? t.practice.finnish : languageLabel(code);
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
  const language = getContent().languages.find((l) => l.code === lang);
  return (language?.alphabet || "ABCDEFGHIJKLMNOPQRSTUVWXYZ").split("");
}

// A word's text in `lang`, or in the language it falls back to ("en-GB" uses
// "en" unless a British spelling is given).
function wordIn(item, lang) {
  const text = item.text || {};
  if (text[lang]) return text[lang];
  const fallback = getContent().languages.find((l) => l.code === lang)?.fallback;
  return fallback ? text[fallback] : undefined;
}

// Built-in words matching the filters, as pairs with their categories attached.
// `include`: if non-empty, a word needs at least one of these categories.
// `exclude`: a word with any of these categories is left out.
// `preferences`: also narrow to the learner's focus areas and difficulty.
export function filterCommonWords({
  learningLang = DEFAULT_LEARNING_LANG,
  nativeLang = DEFAULT_NATIVE_LANG,
  include = [],
  exclude = [],
  preferences = false,
} = {}) {
  const items = preferences ? applyPreferences(wordItems(), { textOf: (w) => w.text?.en }) : wordItems();
  return items.filter((w) => {
    const cats = w.categories || [];
    return (
      wordIn(w, learningLang) &&
      wordIn(w, nativeLang) &&
      (include.length === 0 || cats.some((c) => include.includes(c))) &&
      !cats.some((c) => exclude.includes(c))
    );
  }).map((w) => ({
    id: w.id,
    learning: wordIn(w, learningLang),
    native: wordIn(w, nativeLang),
    categories: w.categories || [],
    time: w.time,
  }));
}

// `count` random pairs from the built-in list.
// `keep` (optional) drops pairs a game can't use before the count is taken.
export function pickCommonWords({ count = 5, keep, ...filters } = {}) {
  const pairs = filterCommonWords(filters);
  return shuffle(keep ? pairs.filter(keep) : pairs).slice(0, count);
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
// Without a `words` param it picks `count` random built-in words that pass
// `keep` (optional).
export function loadWordSet(params, { count = 5, keep } = {}) {
  const learningLang = params.get("learningLang") || DEFAULT_LEARNING_LANG;
  const nativeLang = params.get("nativeLang") || DEFAULT_NATIVE_LANG;
  const encoded = params.get("words");
  // A link that can't be read plays random word bank words instead.
  const linked = encoded ? decodeWords(encoded) : null;
  const pairs = linked?.length ? linked : pickCommonWords({ count, keep, learningLang, nativeLang, preferences: true });
  return {
    pairs: shuffle(pairs),
    learningLang,
    nativeLang,
    swap: params.get("swap") === "1",
    fromLink: Boolean(linked?.length),
  };
}

// Extra info for a pair from the word bank (e.g. clock times), if any.
export function wordInfo(learning, learningLang = DEFAULT_LEARNING_LANG) {
  return wordItems().find((w) => wordIn(w, learningLang) === learning);
}

// Display name for a category in the app's language ("en" or "fi").
export function categoryLabel(category, uiLang = "en") {
  const labels = getContent().categories[category] || {};
  return labels[uiLang] || labels.en || category.charAt(0).toUpperCase() + category.slice(1);
}

// { [category]: label } for every category, for CategoryChips' `labels`.
export function categoryLabels(uiLang = "en") {
  return Object.fromEntries(ALL_CATEGORIES.map((c) => [c, categoryLabel(c, uiLang)]));
}

// The categories under the headings of the focus area list, from
// index.json `categoryGroups`: [{ id, label, categories, optIn }], in content order.
// Categories no group names come last under "other" (label `otherLabel`).
export function categoryGroups(uiLang = "en", otherLabel = "Other") {
  const used = new Set();
  const groups = [];
  for (const g of getContent().categoryGroups || []) {
    const cats = (Array.isArray(g?.categories) ? g.categories : []).filter((c) => ALL_CATEGORIES.includes(c) && !used.has(c));
    cats.forEach((c) => used.add(c));
    if (cats.length) groups.push({ id: g.id, label: g.title?.[uiLang] || g.title?.en || g.id, categories: cats, optIn: g.optIn === true });
  }
  const rest = ALL_CATEGORIES.filter((c) => !used.has(c));
  if (rest.length) groups.push({ id: "other", label: otherLabel, categories: rest });
  return groups;
}

// Every item of one type from the word bank: "word", "gap", "rule", "confusable", "group", "sound", "text", "alike", "phone" or "passage".
export function getItems({ type } = {}) {
  const { items } = getContent();
  return type ? items.filter((i) => i.type === type) : items;
}

// Fill-the-gap sentences: `{ id, sentence, answers, distractors, translation,
// explanation, topic, categories, level }`, where `sentence` has one "___".
// `topic`: only sentences practising this rule or mixed-up words set.
// `lang`: sentence language; "en-GB" and "en" both match "en".
// `include` / `exclude` / `preferences`: as in filterCommonWords.
export function getGapItems({ topic, lang = DEFAULT_LEARNING_LANG, include = [], exclude = [], preferences = false } = {}) {
  const base = lang.split("-")[0];
  const gaps = getItems({ type: "gap" });
  return (preferences ? applyPreferences(gaps) : gaps).filter((g) => {
    const cats = g.categories || [];
    return (
      g.lang.split("-")[0] === base &&
      (topic === undefined || g.topic === topic) &&
      (include.length === 0 || cats.some((c) => include.includes(c))) &&
      !cats.some((c) => exclude.includes(c))
    );
  });
}

// Grammar rules (`type` "rule") or sets of mixed-up words ("confusable").
export function getTopics(type) {
  return getItems({ type });
}

// One item by id, e.g. the rule a gap sentence's `topic` points at.
export function getItem(id) {
  return getContent().byId.get(id);
}

export const getTopic = getItem;

// Pronunciation lessons ("sound" items), in word bank order: `{ id, kind,
// title, explanation, words: [{ text, say, meaning, sound, note, speak }],
// sounds, spellings, level }`. `kind` is "silent", "sound", "spell", "pairs"
// or "letters"; in `text`, square brackets mark the letters the lesson is
// about ("[k]nife").
export function getSoundLessons() {
  return getItems({ type: "sound" });
}

// Tips on saying single English sounds ("phone" items), for Say it right's
// feedback: `{ id, symbols: ["θ"], title, tip, example, lesson }`.
export function getPhoneTips() {
  return getItems({ type: "phone" });
}

// One or two sentences to read aloud ("passage" items), for Say it right's
// Read aloud: `{ id, text: { en, fi }, ipa: { en }, say, level, features, contexts }`,
// with one IPA word for every word of `text.en`.
export function getPassages() {
  return getItems({ type: "passage" });
}

// Multi-sentence texts ("text" items): dialogues, short stories, messages,
// notices. `{ id, kind, title, sentences: [{ en, fi, speaker }], questions,
// level, categories, features, contexts }`. `kind` filters to one kind.
export function getTexts({ kind } = {}) {
  const texts = getItems({ type: "text" });
  return kind ? texts.filter((t) => t.kind === kind) : texts;
}

// Sets of small words that are easy to mix up (is / are / am …), as arrays of
// words, for picking believable wrong options.
export function getWordGroups() {
  return getItems({ type: "group" }).map((g) => g.words);
}

// Words that count as the same answer ("alike" items) as a Map from each
// lowercase word to the first word of its set, for the answer checks.
// `kinds`: "sound" (to / too / two) and / or "spelling" (color / colour).
const alikeMaps = new Map();
onContentChange(() => alikeMaps.clear());
export function alikeWords(kinds = ["sound", "spelling"]) {
  const key = [...kinds].sort().join(",");
  if (!alikeMaps.has(key)) {
    const map = new Map();
    for (const item of getItems({ type: "alike" })) {
      if (!kinds.includes(item.kind)) continue;
      const words = item.words.map((w) => w.trim().toLowerCase());
      // Sets that share a word ("to / too / two", "two / 2") join into one.
      const head = words.map((w) => map.get(w)).find(Boolean) || words[0];
      for (const w of words) map.set(w, head);
    }
    alikeMaps.set(key, map);
  }
  return alikeMaps.get(key);
}

// Every whole sentence in the word bank as pairs `{ learning, native, id }`:
// multi-word phrases, example sentences of words and rules, sentences of
// texts, and fill-the-gap sentences with the gap filled in. Pairs without a translation in
// `nativeLang` are left out. `preferences`: as in filterCommonWords.
export function getSentences({
  learningLang = DEFAULT_LEARNING_LANG,
  nativeLang = DEFAULT_NATIVE_LANG,
  preferences = false,
} = {}) {
  const out = [];
  const seen = new Set();
  const add = (id, learning, native, categories = [], level) => {
    const key = learning?.trim().toLowerCase();
    if (!learning || !native || seen.has(key) || learning.trim().split(/\s+/).length < 2) return;
    seen.add(key);
    out.push({ id, learning, native, categories, level });
  };
  const exampleText = (ex, lang) => ex[lang] || (lang.startsWith("en") ? ex.en : undefined);
  for (const item of getContent().items) {
    if (item.type === "word") {
      add(item.id, wordIn(item, learningLang), wordIn(item, nativeLang), item.categories, item.level);
    }
    if (item.type === "word" || item.type === "rule") {
      (item.examples || []).forEach((ex, i) =>
        add(`${item.id}#${i + 1}`, exampleText(ex, learningLang), exampleText(ex, nativeLang), item.categories, item.level)
      );
    }
    if (item.type === "text" && learningLang.startsWith("en")) {
      item.sentences.forEach((line, i) => add(`${item.id}#${i + 1}`, line.en, line[nativeLang], item.categories));
    }
    if (item.type === "gap" && item.lang.split("-")[0] === learningLang.split("-")[0]) {
      add(item.id, item.sentence.replace("___", item.answers[0]), item.translation?.[nativeLang], item.categories, item.level);
    }
  }
  return preferences ? applyPreferences(out, { textOf: (s) => s.learning }) : out;
}

// A sentence from the word bank that uses `word`, to hear it in context: one
// of the word's own examples when it has any, otherwise any sentence with the
// word in it. A different one each call when there are several; null when
// there are none (or `word` is more than one word).
export function sentenceFor(word, learningLang = DEFAULT_LEARNING_LANG) {
  const target = typeof word === "string" ? word.trim().toLowerCase() : "";
  if (!target || /\s/.test(target)) return null;
  const item = wordItems().find((w) => wordIn(w, learningLang)?.trim().toLowerCase() === target);
  const own = (item?.examples || [])
    .map((ex) => ex[learningLang] || (learningLang.startsWith("en") ? ex.en : undefined))
    .filter(Boolean);
  const pool = own.length
    ? own
    : getSentences({ learningLang })
        .map((s) => s.learning)
        .filter((s) => s.toLowerCase().split(/[^\p{L}'’-]+/u).includes(target));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

refresh(getContent());
onContentChange(refresh);
