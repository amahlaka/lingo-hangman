// The shape of the word bank in content/ and the checks every change must pass.
// Used by the app (to skip broken items), the admin editor (to show problems
// while editing) and `npm run content:check`. No imports, so Node runs it as is.
// content/README.md describes the format for people editing it.

export const ITEM_TYPES = ["word", "gap", "rule", "confusable", "group"];

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

// Example sentences: [{ "en": "...", "fi": "..." }].
function checkExamples(examples, problems) {
  if (examples === undefined) return;
  if (!Array.isArray(examples)) problems.push("examples must be a list");
  else examples.forEach((ex, i) => checkTextMap(ex, `examples[${i + 1}]`, problems, { mustHave: ["en"] }));
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
};

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
