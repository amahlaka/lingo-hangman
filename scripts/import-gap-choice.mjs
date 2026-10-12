// Turns a "gap-choice" file (the format the Grammar check and Mixed-up words
// games started with in src/content/) into a word bank pack.
//
//   node scripts/import-gap-choice.mjs <file.json> <pack-id> <rule|confusable> "<English name>" "<Finnish name>"
//
// Each set becomes a rule or confusable item (title, explanation) and each of
// its sentences a gap item pointing at it, with the other options as wrong
// options. A file that already has word bank `items` is copied as it is.
// Writes content/packs/<pack-id>.json and lists it in index.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatJson, formatPack } from "../src/lib/contentSchema.js";

const [file, packId, topicType, titleEn, titleFi] = process.argv.slice(2);
if (!file || !packId || !["rule", "confusable"].includes(topicType)) {
  console.error('Usage: node scripts/import-gap-choice.mjs <file.json> <pack-id> <rule|confusable> "<English name>" "<Finnish name>"');
  process.exit(1);
}
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");
const source = JSON.parse(fs.readFileSync(file, "utf8"));
const lang = (source.learningLang || "en").split("-")[0];
const native = source.nativeLang || "fi";

const items = Array.isArray(source.items) ? source.items : [];
for (const set of source.sets || []) {
  const title = { en: set.title, ...(set.titleFi ? { [native]: set.titleFi } : {}) };
  const topic = { id: set.id, type: topicType, title };
  if (topicType === "confusable") topic.words = set.options.filter(Boolean).map((text) => ({ text }));
  topic.explanation = set.rule;
  items.push(topic);
  set.items.forEach((it, i) => {
    const options = it.options || set.options;
    const gap = {
      id: `${set.id}-${i + 1}`,
      type: "gap",
      lang,
      sentence: it.text,
      answers: [it.answer],
      distractors: options.filter((o) => o !== it.answer),
    };
    if (it[native]) gap.translation = { [native]: it[native] };
    if (it.why) gap.explanation = it.why;
    gap.topic = set.id;
    items.push(gap);
  });
}

const pack = { id: packId, title: { en: titleEn || packId, ...(titleFi ? { fi: titleFi } : {}) }, items };
fs.writeFileSync(path.join(dir, "packs", `${packId}.json`), formatPack(pack));
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
if (!index.packs.includes(packId)) index.packs.push(packId);
fs.writeFileSync(path.join(dir, "index.json"), formatJson(index));
const topics = items.filter((i) => i.type === topicType).length;
console.log(`Wrote packs/${packId}.json: ${topics} ${topicType}s, ${items.length - topics} other items.`);
