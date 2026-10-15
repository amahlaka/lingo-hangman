// The shape of the word bank in content/ and the checks every change must pass.
// Used by the app (to skip broken items), the admin editor (to show problems
// while editing) and `npm run content:check`. No imports, so Node runs it as is.
// The lingo-wordbase README describes the format for people editing it.

export const ITEM_TYPES = ["word", "gap", "rule", "confusable", "group", "sound", "text"];

// ---- Metadata, all optional (the lingo-wordbase AUTHORING.md explains each) ----

// Part of speech of a `word` item. Multi-word entries are "phrase" (a chunk
// like "next stop") or "sentence" (a whole sentence or question).
export const PARTS_OF_SPEECH = [
  "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction",
  "determiner", "number", "interjection", "phrase", "sentence",
];

// Features of English an item shows, so games and statistics can pick or
// group items by them. Weighted towards what is hard for Finnish speakers.
export const FEATURES = [
  // Pronunciation
  "th-sound", "w-v-sound", "z-sound", "sh-ch-j-sound", "voiced-consonant", "silent-letter",
  "schwa", "vowel-length", "diphthong", "word-stress", "linking", "weak-form",
  // Spelling
  "irregular-spelling", "double-letter", "uk-us-spelling", "homophone",
  // Grammar
  "article", "uncountable", "irregular-plural", "pronoun-gender", "possessive",
  "preposition-time", "preposition-place", "phrasal-verb", "irregular-verb", "third-person-s",
  "present-simple", "present-continuous", "past-simple", "present-perfect", "future",
  "modal-verb", "question-form", "negative", "do-support", "contraction", "there-is",
  "imperative", "comparative", "superlative", "conditional", "passive", "gerund-infinitive",
  "word-order", "quantity",
  // Vocabulary and use
  "false-friend", "confusable", "collocation", "idiom", "compound", "polite-form",
  "uk-us-word", "cognate",
];

// Situations where an item is used.
export const CONTEXTS = [
  "home", "work", "study", "shopping", "eating-out", "travel", "transport", "hotel",
  "health", "emergency", "social", "small-talk", "family", "phone", "online", "money",
  "services", "sport", "nature", "weather", "culture",
];

export const REGISTERS = ["neutral", "formal", "informal"];

// Word types of the words in a sentence (`wordTypes` on word items and rule
// examples): one entry per word, in order, for the word-type hints in the
// games (src/lib/wordTypes.js). An entry is a word class, optionally followed
// by the sentence role of the main word of the subject or object:
// "noun:subject", "pronoun:object", "verb".
export const WORD_CLASSES = [
  "noun", "pronoun", "verb", "auxiliary", "adjective", "adverb", "article", "preposition",
  "conjunction", "number", "question", "particle", "interjection",
];
export const SENTENCE_ROLES = ["subject", "object"];

const EDGE_PUNCT = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu;

// The words of a sentence as the games count them: split at spaces, with
// punctuation at either end dropped ("Rovio," -> "Rovio", "&" -> nothing).
export function sentenceWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .map((raw) => raw.replace(EDGE_PUNCT, ""))
    .filter(Boolean);
}

// Multi-sentence `text` items.
export const TEXT_KINDS = ["dialogue", "story", "message", "email", "notice", "instructions", "description"];

// IPA between slashes: "/ˈkɪtʃɪn/".
const IPA_PATTERN = /^\/[^/]+\/$/;

// Pronunciation lessons ("sound" items) come in three kinds:
//   silent   words with a letter you don't say: "[k]nife"
//   sound    letters with more than one sound; each word names its `sound`
//   pairs    words that sound alike (ship / sheep); each word names its `pair`
//   letters  English letter names: "A" is said "ei"
export const SOUND_KINDS = ["silent", "sound", "pairs", "letters"];

// Square brackets mark the letters a pronunciation word is about: "[k]nife".
const MARK_PATTERN = /^([^[\]]*)\[([^[\]]+)\]([^[\]]*)$/;

// "[k]nife" -> { before: "", marked: "k", after: "nife", plain: "knife" }.
// null when the text doesn't have exactly one bracketed part.
export function parseMarked(text) {
  const m = typeof text === "string" ? MARK_PATTERN.exec(text) : null;
  if (!m) return null;
  const [, before, marked, after] = m;
  return { before, marked, after, plain: before + marked + after };
}

// Marks the missing word in a fill-the-gap sentence.
export const GAP = "___";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";
const norm = (s) => s.trim().toLowerCase();

// { "en": "...", "fi": "..." }: at least one language, every value filled in.
function checkTextMap(value, name, problems, { required = true, mustHave = [] } = {}) {
  if (value === undefined && !required) return;
  if (!isObject(value) || Object.keys(value).length === 0) {
    problems.push(`${name} needs at least one language`);
    return;
  }
  for (const [lang, text] of Object.entries(value)) {
    if (!isText(text)) problems.push(`${name}.${lang} is empty`);
    // English examples are marked *like this* (see ExampleText).
    else if (text.split("*").length % 2 === 0) problems.push(`${name}.${lang} has an unpaired *`);
  }
  for (const lang of mustHave) {
    if (!isText(value[lang])) problems.push(`${name} needs "${lang}"`);
  }
}

// allowNone: "" is allowed and means "no word" (e.g. no article: "___ coffee is hot").
function checkWordList(value, name, problems, { min = 1, allowNone = false } = {}) {
  const ok = (w) => isText(w) || (allowNone && w === "");
  if (!Array.isArray(value) || value.length < min || !value.every(ok)) {
    problems.push(`${name} needs at least ${min} filled-in word${min === 1 ? "" : "s"}`);
    return false;
  }
  return true;
}

// `decoyPool`: words that fill the free option slots of gap questions
// (src/lib/decoys.js). Optional; [] on a gap item turns its topic's pool off.
function checkDecoyPool(value, problems) {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.every(isText)) return problems.push("decoyPool must be a list of filled-in words");
  const seen = new Set();
  for (const w of value) {
    if (seen.has(norm(w))) problems.push(`decoyPool: "${w}" is listed twice`);
    seen.add(norm(w));
  }
}

// `wordTypes`: one valid entry per word of every English text in `texts`.
function checkWordTypes(value, texts, name, problems) {
  if (value === undefined) return;
  const pattern = new RegExp(`^(${WORD_CLASSES.join("|")})(:(${SENTENCE_ROLES.join("|")}))?$`);
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && pattern.test(v))) {
    problems.push(`${name} must be a list of word classes (${WORD_CLASSES.join(", ")}), each optionally with :subject or :object`);
    return;
  }
  for (const text of texts.filter(isText)) {
    const n = sentenceWords(text).length;
    if (n !== value.length) problems.push(`${name} has ${value.length} entries but "${text}" has ${n} words`);
  }
}

// Example sentences: [{ "en": "...", "fi": "...", "wordTypes": [...] }].
function checkExamples(examples, problems) {
  if (examples === undefined) return;
  if (!Array.isArray(examples)) problems.push("examples must be a list");
  else {
    examples.forEach((ex, i) => {
      const name = `examples[${i + 1}]`;
      if (!isObject(ex)) return checkTextMap(ex, name, problems);
      const { wordTypes, ...texts } = ex;
      checkTextMap(texts, name, problems, { mustHave: ["en"] });
      checkWordTypes(wordTypes, [texts.en, texts["en-GB"]], `${name}.wordTypes`, problems);
    });
  }
}

const CHECKS = {
  word(item, problems, ctx) {
    checkTextMap(item.text, "text", problems, { mustHave: ["en"] });
    if (isObject(item.text) && ctx.languageCodes) {
      for (const lang of Object.keys(item.text)) {
        if (!ctx.languageCodes.has(lang)) problems.push(`text.${lang}: unknown language (add it to languages.json first)`);
      }
    }
    if (item.time !== undefined && !(Array.isArray(item.time) && item.time.every((t) => TIME_PATTERN.test(t)))) {
      problems.push('time must be a list of clock times like "09:00"');
    }
    checkExamples(item.examples, problems);
    checkTextMap(item.note, "note", problems, { required: false });
    if (isObject(item.text)) checkWordTypes(item.wordTypes, [item.text.en, item.text["en-GB"]], "wordTypes", problems);
  },

  gap(item, problems, ctx) {
    if (!isText(item.lang)) problems.push('lang is missing (the language of the sentence, e.g. "en")');
    if (!isText(item.sentence) || item.sentence.split(GAP).length !== 2) {
      problems.push(`sentence needs exactly one ${GAP} where the missing word goes`);
    }
    const answersOk = checkWordList(item.answers, "answers", problems, { allowNone: true });
    const distractorsOk = checkWordList(item.distractors, "distractors", problems, { allowNone: true });
    if (answersOk && distractorsOk) {
      const answers = new Set(item.answers.map(norm));
      const both = item.distractors.filter((d) => answers.has(norm(d)));
      if (both.length) problems.push(`"${both.join('", "')}" is both an answer and a wrong option`);
    }
    checkDecoyPool(item.decoyPool, problems);
    checkTextMap(item.translation, "translation", problems, { required: false });
    checkTextMap(item.explanation, "explanation", problems, { required: false });
    if (item.topic !== undefined && !(isText(item.topic) && (!ctx.topicIds || ctx.topicIds.has(item.topic)))) {
      problems.push(`topic "${item.topic}" is not the id of a rule or a mixed-up words set`);
    }
  },

  rule(item, problems) {
    checkTextMap(item.title, "title", problems, { mustHave: ["en"] });
    checkTextMap(item.explanation, "explanation", problems);
    checkExamples(item.examples, problems);
    checkDecoyPool(item.decoyPool, problems);
  },

  confusable(item, problems) {
    checkTextMap(item.title, "title", problems, { required: false, mustHave: item.title ? ["en"] : [] });
    if (!Array.isArray(item.words) || item.words.length < 2) {
      problems.push("words needs at least two words that get mixed up");
    } else {
      item.words.forEach((w, i) => {
        const name = `words[${i + 1}]`;
        if (!isObject(w) || !isText(w.text)) problems.push(`${name}.text is empty`);
        else {
          checkTextMap(w.meaning, `${name}.meaning`, problems, { required: false });
          checkTextMap(w.note, `${name}.note`, problems, { required: false });
        }
      });
    }
    checkTextMap(item.explanation, "explanation", problems);
    checkDecoyPool(item.decoyPool, problems);
  },

  group(item, problems) {
    checkTextMap(item.title, "title", problems, { mustHave: ["en"] });
    if (checkWordList(item.words, "words", problems, { min: 2 })) {
      const seen = new Set();
      for (const w of item.words) {
        if (seen.has(norm(w))) problems.push(`"${w}" is in words twice`);
        seen.add(norm(w));
      }
    }
  },

  sound(item, problems) {
    checkTextMap(item.title, "title", problems, { mustHave: ["en"] });
    checkTextMap(item.explanation, "explanation", problems, { mustHave: ["en"] });
    if (!SOUND_KINDS.includes(item.kind)) {
      problems.push(`kind must be one of ${SOUND_KINDS.join(", ")}`);
      return;
    }
    const soundIds = new Set();
    if (item.kind === "sound") {
      if (!Array.isArray(item.sounds) || item.sounds.length < 2) problems.push("sounds needs at least two sounds to choose from");
      else {
        item.sounds.forEach((s, i) => {
          const name = `sounds[${i + 1}]`;
          if (!isObject(s) || !isText(s.id)) return problems.push(`${name}.id is empty`);
          if (soundIds.has(s.id)) problems.push(`${name}: "${s.id}" is listed twice`);
          soundIds.add(s.id);
          checkTextMap(s.label, `${name}.label`, problems, { mustHave: ["en"] });
        });
      }
    }
    if (!Array.isArray(item.words) || item.words.length < 3) {
      problems.push("words needs at least three words");
      return;
    }
    if (item.kind === "sound" && Array.isArray(item.sounds)) {
      // An option shows an example word with its sound, never the word asked,
      // so every sound needs two words: one to ask and one to show.
      for (const s of item.sounds) {
        const n = item.words.filter((w) => isObject(w) && w.sound === s?.id).length;
        if (isObject(s) && isText(s.id) && n < 2) problems.push(`sound "${s.id}" needs at least two words, so its example is never the word asked`);
      }
    }
    const seen = new Set();
    const texts = new Set(item.words.filter((w) => isObject(w) && isText(w.text)).map((w) => norm(w.text)));
    item.words.forEach((w, i) => {
      const name = `words[${i + 1}]`;
      if (!isObject(w) || !isText(w.text)) return problems.push(`${name}.text is empty`);
      if (item.kind === "pairs") {
        if (/[[\]]/.test(w.text)) problems.push(`${name}: sound-alike words don't use [ ]`);
        if (!isText(w.pair) || norm(w.pair) === norm(w.text) || !texts.has(norm(w.pair))) {
          problems.push(`${name}: pair must be another word in this lesson`);
        }
      } else if (item.kind === "letters") {
        if (/[[\]]/.test(w.text)) problems.push(`${name}: letter names don't use [ ]`);
      } else if (!parseMarked(w.text)) {
        problems.push(`${name}: put [ ] around the ${item.kind === "silent" ? "silent letters" : "letters that make the sound"}, once, like "[k]nife"`);
      }
      if (item.kind === "sound" && !soundIds.has(w.sound)) {
        problems.push(`${name}: sound must be one of the ids in sounds`);
      }
      const plain = norm(parseMarked(w.text)?.plain ?? w.text);
      if (seen.has(plain)) problems.push(`"${w.text}" is in words twice`);
      seen.add(plain);
      checkTextMap(w.say, `${name}.say`, problems, { required: false });
      checkTextMap(w.meaning, `${name}.meaning`, problems, { required: false });
      checkTextMap(w.note, `${name}.note`, problems, { required: false });
      if (w.speak !== undefined && !isText(w.speak)) problems.push(`${name}.speak is empty`);
      if (w.ipa !== undefined && !(typeof w.ipa === "string" && IPA_PATTERN.test(w.ipa))) {
        problems.push(`${name}.ipa must be written between slashes, like /naɪf/`);
      }
    });
  },

  // Several sentences that belong together: a dialogue, a short story, a
  // message. Each sentence in English, usually with Finnish; dialogue lines
  // name their speaker. `questions` (optional) test understanding.
  text(item, problems) {
    checkTextMap(item.title, "title", problems, { mustHave: ["en"] });
    if (!TEXT_KINDS.includes(item.kind)) problems.push(`kind must be one of ${TEXT_KINDS.join(", ")}`);
    if (!Array.isArray(item.sentences) || item.sentences.length < 2) {
      problems.push("sentences needs at least two sentences");
    } else {
      item.sentences.forEach((line, i) => {
        const name = `sentences[${i + 1}]`;
        if (!isObject(line)) return problems.push(`${name} must be like { "en": "...", "fi": "..." }`);
        const { speaker, ...text } = line;
        checkTextMap(text, name, problems, { mustHave: ["en"] });
        if (item.kind === "dialogue" && !isText(speaker)) problems.push(`${name}.speaker is missing (dialogue lines name who speaks)`);
        if (speaker !== undefined && !isText(speaker)) problems.push(`${name}.speaker is empty`);
      });
    }
    if (item.questions !== undefined) {
      if (!Array.isArray(item.questions)) problems.push("questions must be a list");
      else {
        item.questions.forEach((q, i) => {
          const name = `questions[${i + 1}]`;
          if (!isObject(q)) return problems.push(`${name} must be an object`);
          checkTextMap(q.question, `${name}.question`, problems, { mustHave: ["en"] });
          const answersOk = checkWordList(q.answers, `${name}.answers`, problems);
          const distractorsOk = checkWordList(q.distractors, `${name}.distractors`, problems);
          if (answersOk && distractorsOk) {
            const answers = new Set(q.answers.map(norm));
            if (q.distractors.some((d) => answers.has(norm(d)))) problems.push(`${name}: an answer is also a wrong option`);
          }
        });
      }
    }
    checkTextMap(item.note, "note", problems, { required: false });
  },
};

function checkList(value, name, allowed, problems) {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.every((v) => allowed.includes(v))) {
    problems.push(`${name} must be a list of: ${allowed.join(", ")}`);
  } else if (new Set(value).size !== value.length) {
    problems.push(`${name} lists something twice`);
  }
}

// The optional metadata any item may carry.
function checkMetadata(item, problems) {
  if (item.ipa !== undefined) {
    if (!isObject(item.ipa) || !Object.keys(item.ipa).length) problems.push('ipa must be like { "en-GB": "/ˈwɔːtə/" }');
    else {
      for (const [lang, v] of Object.entries(item.ipa)) {
        if (!(typeof v === "string" && IPA_PATTERN.test(v))) problems.push(`ipa.${lang} must be written between slashes, like /ˈwɔːtə/`);
      }
    }
  }
  // How to say it, written the way the learner's language reads ({ "fi": "wooter" }).
  checkTextMap(item.say, "say", problems, { required: false });
  if (item.pos !== undefined && !PARTS_OF_SPEECH.includes(item.pos)) problems.push(`pos must be one of ${PARTS_OF_SPEECH.join(", ")}`);
  checkList(item.features, "features", FEATURES, problems);
  checkList(item.contexts, "contexts", CONTEXTS, problems);
  if (item.register !== undefined && !REGISTERS.includes(item.register)) problems.push(`register must be one of ${REGISTERS.join(", ")}`);
}

// Problems with one item, as short sentences. Empty when the item is fine.
// ctx (optional): { languageCodes: Set, topicIds: Set } from the rest of the content.
export function validateItem(item, ctx = {}) {
  const problems = [];
  if (!isObject(item)) return ["is not an object"];
  if (!isText(item.id) || !ID_PATTERN.test(item.id)) {
    problems.push("id must be lower-case letters, numbers and dashes, like \"bus-stop\"");
  }
  if (!ITEM_TYPES.includes(item.type)) {
    problems.push(`type must be one of ${ITEM_TYPES.join(", ")}`);
    return problems;
  }
  if (item.categories !== undefined) {
    if (!Array.isArray(item.categories) || !item.categories.every((c) => isText(c) && ID_PATTERN.test(c))) {
      problems.push("categories must be lower-case names without spaces");
    }
  }
  if (item.level !== undefined && ![1, 2, 3].includes(item.level)) {
    problems.push("level must be 1, 2 or 3");
  }
  checkMetadata(item, problems);
  CHECKS[item.type](item, problems, ctx);
  return problems;
}

// Lookup sets validateItem needs, built from the whole content.
export function contentContext({ languages = [], packs = [] }) {
  const items = packs.flatMap((p) => (Array.isArray(p?.items) ? p.items : []));
  return {
    languageCodes: new Set(languages.map((l) => l?.code).filter(isText)),
    topicIds: new Set(items.filter((i) => i?.type === "rule" || i?.type === "confusable").map((i) => i.id)),
  };
}

// Every problem in the content, each starting with where it is.
// raw: { index, languages, packs: [pack] }, as read from content/.
export function validateContent({ index, languages, packs }) {
  const problems = [];
  const where = (file, msg) => problems.push(`${file}: ${msg}`);

  if (!isObject(index) || !Array.isArray(index.packs)) where("index.json", 'needs a "packs" list');
  if (isObject(index?.categories)) {
    for (const [cat, labels] of Object.entries(index.categories)) {
      if (!ID_PATTERN.test(cat)) where("index.json", `category "${cat}" must be lower case without spaces`);
      const p = [];
      checkTextMap(labels, `categories.${cat}`, p, { mustHave: ["en"] });
      p.forEach((m) => where("index.json", m));
    }
  }

  if (!Array.isArray(languages) || languages.length === 0) {
    where("languages.json", "needs at least one language");
  } else {
    const codes = new Set();
    languages.forEach((l, i) => {
      if (!isObject(l) || !isText(l.code) || !isText(l.label)) return where("languages.json", `language ${i + 1} needs a code and a label`);
      if (codes.has(l.code)) where("languages.json", `"${l.code}" is listed twice`);
      codes.add(l.code);
      if (l.alphabet !== undefined && !isText(l.alphabet)) where("languages.json", `"${l.code}" has an empty alphabet`);
    });
    languages.forEach((l) => {
      if (isObject(l) && l.fallback !== undefined && !codes.has(l.fallback)) {
        where("languages.json", `"${l.code}" falls back to unknown language "${l.fallback}"`);
      }
    });
  }

  const listed = Array.isArray(index?.packs) ? index.packs : [];
  const byId = new Map((packs || []).map((p) => [p?.id, p]));
  for (const id of listed) {
    if (!byId.has(id)) where("index.json", `pack "${id}" is listed but packs/${id}.json is missing`);
  }

  const ctx = contentContext({ languages: Array.isArray(languages) ? languages : [], packs: packs || [] });
  const seen = new Map();
  for (const pack of packs || []) {
    const file = `packs/${pack?.id}.json`;
    if (!isObject(pack) || !isText(pack.id) || !ID_PATTERN.test(pack.id)) {
      where(file, "needs an id made of lower-case letters, numbers and dashes");
      continue;
    }
    if (!listed.includes(pack.id)) where(file, 'is not listed in index.json "packs"');
    const p = [];
    checkTextMap(pack.title, "title", p, { mustHave: ["en"] });
    p.forEach((m) => where(file, m));
    if (!Array.isArray(pack.items)) {
      where(file, 'needs an "items" list');
      continue;
    }
    pack.items.forEach((item, i) => {
      const name = isText(item?.id) ? item.id : `item ${i + 1}`;
      validateItem(item, ctx).forEach((m) => where(file, `${name}: ${m}`));
      if (isText(item?.id)) {
        if (seen.has(item.id)) where(file, `${item.id}: id is already used in packs/${seen.get(item.id)}.json`);
        else seen.set(item.id, pack.id);
      }
    });
  }
  return problems;
}

// File text for a pack: one item per line keeps diffs short and readable.
export function formatPack(pack) {
  const { items = [], ...head } = pack;
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  const lines = items.map((item) => `    ${JSON.stringify(item)}`).join(",\n");
  return `${top}${Object.keys(head).length ? "," : ""}\n  "items": [${lines ? `\n${lines}\n  ` : ""}]\n}\n`;
}

export function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// Lower-case dashed id from any text: "Bus stop!" -> "bus-stop".
export function slugify(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
