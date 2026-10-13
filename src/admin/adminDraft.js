// Helpers for the word bank admin page: the editable copy ("draft") of the
// content files, what changed, and blank items to start from. No React here.

import { formatJson, formatPack, slugify } from "../lib/contentSchema";

const clone = (v) => JSON.parse(JSON.stringify(v));

export function draftFrom(raw) {
  return clone({ index: raw.index, languages: raw.languages, packs: raw.packs });
}

// Path in the word base repository -> file text for every content file in a draft, with items tidied as
// they would be saved.
export function draftFiles(draft) {
  const files = {
    "index.json": formatJson(draft.index),
    "languages.json": formatJson(draft.languages),
  };
  for (const pack of draft.packs) {
    files[`packs/${pack.id}.json`] = formatPack({ ...pack, items: pack.items.map(tidyItem) });
  }
  return files;
}

// [{ path, content, original }] for files that differ from `original`.
export function changedFiles(draft, original) {
  const before = draftFiles(original);
  return Object.entries(draftFiles(draft))
    .filter(([path, text]) => before[path] !== text)
    .map(([path, content]) => ({ path, content, original: before[path] ?? null }));
}

export function itemLabel(item) {
  switch (item.type) {
    case "word": return item.text?.en || item.id;
    case "gap": return item.sentence || item.id;
    case "rule": return item.title?.en || item.id;
    case "confusable": return item.title?.en || (item.words || []).map((w) => w.text).filter(Boolean).join(" / ") || item.id;
    case "group": return item.title?.en || item.id;
    case "sound": return item.title?.en || item.id;
    default: return item.id;
  }
}

export const TYPE_NAMES = {
  word: "Word or phrase",
  gap: "Fill-the-gap sentence",
  rule: "Grammar rule",
  confusable: "Mixed-up words",
  group: "Word group",
  sound: "Pronunciation lesson",
};

// A new item of `type` with an id that isn't taken yet.
export function blankItem(type, takenIds) {
  let n = 1;
  while (takenIds.has(`new-${type}-${n}`)) n++;
  const id = `new-${type}-${n}`;
  switch (type) {
    case "word": return { id, type, text: { en: "", fi: "" }, categories: [] };
    case "gap": return { id, type, lang: "en", sentence: "", answers: [], distractors: [], translation: { fi: "" }, categories: [] };
    case "rule": return { id, type, title: { en: "", fi: "" }, explanation: { en: "", fi: "" }, examples: [] };
    case "confusable": return { id, type, words: [{ text: "", meaning: { fi: "" } }, { text: "", meaning: { fi: "" } }], explanation: { en: "", fi: "" } };
    case "group": return { id, type, title: { en: "", fi: "" }, words: [] };
    case "sound": return { id, type, kind: "silent", title: { en: "", fi: "" }, explanation: { en: "", fi: "" }, words: [{ text: "", say: { fi: "" }, meaning: { fi: "" } }] };
    default: return { id, type };
  }
}

// An id suggestion from the item's main text, unique among takenIds.
export function suggestId(item, takenIds) {
  const base = slugify(itemLabel(item).replace(/_{3}/g, " ")).split("-").slice(0, 6).join("-") || item.type;
  let id = base;
  for (let n = 2; takenIds.has(id); n++) id = `${base}-${n}`;
  return id;
}

// The draft as it will be saved, for running the content checks on.
export function tidyDraft(draft) {
  return { ...draft, packs: draft.packs.map((p) => ({ ...p, items: p.items.map(tidyItem) })) };
}

// Drops empty optional bits before saving: blank translations, empty lists of
// examples, unused notes. Required fields stay so the checks can flag them.
export function tidyItem(item) {
  const out = clone(item);
  const tidyMap = (m) => (m ? Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === "string" && v.trim() !== "")) : m);
  const dropIfEmpty = (obj, key) => {
    if (obj[key] && typeof obj[key] === "object" && Object.keys(obj[key]).length === 0) delete obj[key];
  };
  if (out.text) out.text = tidyMap(out.text);
  for (const key of ["translation", "explanation", "title"]) {
    if (out[key]) out[key] = tidyMap(out[key]);
  }
  dropIfEmpty(out, "translation");
  if (out.type === "gap") dropIfEmpty(out, "explanation");
  if (Array.isArray(out.examples)) {
    out.examples = out.examples.map(tidyMap).filter((ex) => Object.keys(ex).length);
    if (!out.examples.length) delete out.examples;
  }
  if (Array.isArray(out.words) && out.type === "confusable") {
    out.words = out.words.map((w) => {
      const word = { ...w, meaning: tidyMap(w.meaning), note: tidyMap(w.note) };
      dropIfEmpty(word, "meaning");
      dropIfEmpty(word, "note");
      return word;
    });
  }
  if (out.type === "sound") {
    if (Array.isArray(out.words)) {
      out.words = out.words.map((w) => {
        const word = { ...w, say: tidyMap(w.say), meaning: tidyMap(w.meaning), note: tidyMap(w.note) };
        for (const key of ["say", "meaning", "note"]) dropIfEmpty(word, key);
        if (out.kind !== "sound") delete word.sound;
        if (typeof word.speak === "string" && !word.speak.trim()) delete word.speak;
        return word;
      });
    }
    if (out.kind !== "sound") delete out.sounds;
    else if (Array.isArray(out.sounds)) out.sounds = out.sounds.map((s) => ({ ...s, label: tidyMap(s.label) }));
  }
  if (Array.isArray(out.categories) && out.categories.length === 0) delete out.categories;
  if (out.topic === "") delete out.topic;
  return out;
}
