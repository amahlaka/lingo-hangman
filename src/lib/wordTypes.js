// Word types for the hints every game can show: what kind of word each word
// is (verb, noun …) and, for the main word of the subject or object, its part
// in the sentence. Sentences get them from their word bank item's `wordTypes`
// (one entry per word, see WORD_CLASSES in ./contentSchema.js); single words
// from their item's `pos`. Also decides which sentence-structure rule
// (`sentence-…` rule items) a sentence shows. Pure functions, no React.

import { WORD_CLASSES, sentenceWords } from "./contentSchema";
import { getContent, onContentChange } from "./content";
import { wordKey } from "./progress";
import { itemLevel } from "./preferences";
import { wordStanding } from "./adaptive";

// Points from this round each hint costs, next to the rule peek (5) and
// hangman's 5 / 8 / 25. Labels on every place say the most, so they cost more.
export const SLOT_HINT_COST = 8;
export const OPTION_HINT_COST = 5;

// Colour family of each word class. Small grammar words share one quiet colour
// so the colours that matter stand out. The CSS classes are lg-wt--<family>.
const FAMILY = {
  noun: "noun",
  pronoun: "pronoun",
  verb: "verb",
  auxiliary: "verb",
  adjective: "adjective",
  adverb: "adverb",
  question: "question",
  number: "small",
  article: "small",
  preposition: "small",
  conjunction: "small",
  particle: "small",
  interjection: "small",
};
export const COLOR_FAMILIES = ["noun", "pronoun", "verb", "adjective", "adverb", "question", "small"];

// `pos` of single-word items, mapped onto the word classes.
const POS_CLASS = { determiner: "pronoun" };

// Small grammar words the word bank may not tag anywhere, for wordClassOf.
const SMALL_WORDS = {
  article: ["a", "an", "the"],
  question: ["what", "where", "when", "why", "who", "whom", "whose", "which", "how"],
  pronoun: [
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his", "its",
    "our", "their", "mine", "yours", "hers", "ours", "theirs", "this", "that", "these", "those", "some", "any",
  ],
  preposition: ["in", "on", "at", "to", "from", "with", "for", "of", "by", "about", "under", "near", "into", "since", "until", "between"],
  conjunction: ["and", "but", "or", "because", "if", "so", "than"],
  auxiliary: ["do", "does", "did", "can", "could", "will", "would", "shall", "should", "may", "might", "must"],
  verb: ["am", "is", "are", "was", "were", "be", "been", "have", "has", "had"],
};

// "noun:subject" -> { cls: "noun", role: "subject" }. null for anything unknown.
export function parseWordType(tag) {
  if (typeof tag !== "string") return null;
  const [cls, role = null] = tag.split(":");
  return WORD_CLASSES.includes(cls) ? { cls, role } : null;
}

export function colorFamily(cls) {
  return FAMILY[cls] || "small";
}

// What a place in the sentence is labelled with: its role when it is the main
// word of the subject or object, otherwise its word class.
export function slotKind(type) {
  return type ? type.role || type.cls : null;
}

// The `wordTypes` of a sentence pair from the word bank, parsed, when they
// line up with `words` (the puzzle's words). null when there are none.
export function sentenceTypes(pair, words) {
  if (!pair?.id) return null;
  const item = byId().get(pair.id);
  if (!Array.isArray(item?.wordTypes) || item.wordTypes.length !== words.length) return null;
  const types = item.wordTypes.map(parseWordType);
  return types.every(Boolean) ? types : null;
}

// The word class of a single English word, for games that show loose words
// (choices, tiles): from a one-word item's `pos`, else from how the word is
// tagged in the word bank's sentences (the most common class wins). null
// when the word bank doesn't say.
export function wordClassOf(word) {
  if (!word) return null;
  return lexicon().get(word.trim().toLowerCase()) || null;
}

// The sentence-structure rule a sentence practises, as a rule item id, or
// null for a fragment ("in the morning") with no subject.
export function sentencePattern(types, words, text = "") {
  if (!types || !types.length) return null;
  const lower = words.map((w) => w.toLowerCase());
  const question = /\?\s*$/.test(text.trim());
  let i = 0;
  while (i < types.length - 1 && types[i].cls === "interjection") i++;
  const first = types[i];
  const hasSubject = types.some((t) => t.role === "subject");

  if (first.cls === "question") return "sentence-wh-questions";
  if (lower[i] === "there" || (BE.has(lower[i]) && lower[i + 1] === "there")) return "sentence-there-is";
  if (first.cls === "auxiliary" && /^(do|does|did)$/.test(lower[i]) && question) return "sentence-questions-do";
  if ((first.cls === "auxiliary" || (first.cls === "verb" && BE.has(lower[i]))) && question && hasSubject) {
    return "sentence-questions-helper";
  }
  if (!hasSubject) {
    const verbFirst = first.cls === "verb" || (first.cls === "auxiliary" && /n't$/.test(lower[i]));
    return verbFirst ? "sentence-imperatives" : null;
  }
  if (lower.some((w) => /n't$/.test(w) || w === "not")) return "sentence-negatives";
  const verbs = types.map((t, j) => (t.cls === "verb" || t.cls === "auxiliary" ? lower[j] : null)).filter(Boolean);
  const hasObject = types.some((t) => t.role === "object");
  if (!hasObject && verbs.every((v) => BE.has(v))) return "sentence-be";
  return "sentence-svo";
}

// The rule item id a word bank sentence practises, when the word bank has
// that rule; recorded as the answer's lesson so statistics show it.
export function sentenceLesson(pair, text = pair?.learning) {
  const words = sentenceWords(text);
  const id = sentencePattern(sentenceTypes(pair, words), words, text);
  return id && byId().has(id) ? id : undefined;
}

const BE = new Set(["am", "is", "are", "was", "were", "be", "been", "being", "isn't", "aren't", "wasn't", "weren't"]);

// The rules shown on the sentence rules page, in reading order.
export const SENTENCE_RULES = [
  "sentence-svo",
  "sentence-be",
  "sentence-adjectives",
  "sentence-place-time",
  "sentence-questions-do",
  "sentence-questions-helper",
  "sentence-wh-questions",
  "sentence-negatives",
  "sentence-there-is",
  "sentence-imperatives",
];

// Rule examples with their word types, ready to show as typed chips:
// [{ en, fi, words, types }]. Examples without (valid) types are left out.
export function typedExamples(rule) {
  return (rule?.examples || [])
    .map((ex) => {
      const words = sentenceWords(ex.en);
      const types = Array.isArray(ex.wordTypes) ? ex.wordTypes.map(parseWordType) : [];
      return { en: ex.en, fi: ex.fi, words, types };
    })
    .filter((ex) => ex.types.length === ex.words.length && ex.types.every(Boolean));
}

// --- When the hints switch on by themselves ----------------------------------

// Levels count as easy enough for automatic help up to this one.
export const AUTO_MAX_LEVEL = 2;
// Answers on sentences of a level needed before the level can count as hard.
export const AUTO_MIN_ANSWERS = 4;
// Below this share of quick first tries a level counts as hard.
export const AUTO_FIRST_TRY = 0.6;

// Levels (1 … AUTO_MAX_LEVEL) whose sentences in `items` ([{ learning, level }])
// the learner has found hard lately: across their recent answers (the last few
// per sentence, from progress `words`), fewer than AUTO_FIRST_TRY were quick
// first tries.
export function hardLevels(state, items, lang = "en") {
  const marks = new Map();
  for (const item of items || []) {
    const level = itemLevel(item, item.learning);
    if (level > AUTO_MAX_LEVEL) continue;
    const recent = state?.words?.[wordKey(item.learning, lang)]?.recent || "";
    if (!recent) continue;
    marks.set(level, (marks.get(level) || "") + recent);
  }
  const out = new Set();
  for (const [level, m] of marks) {
    if (m.length >= AUTO_MIN_ANSWERS && [...m].filter((c) => c === "2").length / m.length < AUTO_FIRST_TRY) out.add(level);
  }
  return out;
}

// Whether a sentence gets its word-type hints for free: it is an easy one
// (level AUTO_MAX_LEVEL or lower) and either sentences of its level have been
// hard lately (`hard`, from hardLevels) or this sentence itself is tricky.
export function autoHints(state, item, hard, lang = "en") {
  const level = itemLevel(item, item.learning);
  if (level > AUTO_MAX_LEVEL) return false;
  if (hard?.has(level)) return true;
  return wordStanding(state?.words?.[wordKey(item.learning, lang)]) === "tricky";
}

// The level of a sentence pair: its word bank item's own, else a guess.
export function pairLevel(pair) {
  return itemLevel(byId().get(pair?.id) || {}, pair?.learning);
}

// --- Lookups over the current word bank --------------------------------------

let cache = null;
onContentChange(() => {
  cache = null;
});

function buildLexicon() {
  const items = getContent().items;
  const counts = new Map();
  const count = (word, cls, n = 1) => {
    const key = word.toLowerCase();
    const c = counts.get(key) || {};
    c[cls] = (c[cls] || 0) + n;
    counts.set(key, c);
  };
  for (const item of items) {
    if (item.type === "rule") {
      for (const ex of typedExamples(item)) ex.words.forEach((w, i) => count(w, ex.types[i].cls));
    }
    if (item.type !== "word") continue;
    const en = item.text?.en || item.text?.["en-GB"];
    if (!en) continue;
    const words = sentenceWords(en);
    const cls = POS_CLASS[item.pos] || item.pos;
    // A one-word item's own `pos` beats any number of sentences.
    if (words.length === 1 && WORD_CLASSES.includes(cls)) count(words[0], cls, 1000);
    if (Array.isArray(item.wordTypes) && item.wordTypes.length === words.length) {
      item.wordTypes.forEach((tag, i) => {
        const type = parseWordType(tag);
        if (type) count(words[i], type.cls);
      });
    }
  }
  for (const [cls, words] of Object.entries(SMALL_WORDS)) {
    for (const w of words) if (!counts.has(w)) count(w, cls);
  }
  const lex = new Map();
  for (const [word, c] of counts) lex.set(word, Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]);
  return lex;
}

function byId() {
  return getContent().byId;
}

function lexicon() {
  cache = cache || buildLexicon();
  return cache;
}
