// Checks the word bank in content/ and that every pack file is written in the
// standard layout. Run with `npm run content:check`; CI and the content
// publish workflow run it too.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatJson, formatPack, validateContent } from "../src/lib/contentSchema.js";

const dir = process.argv.slice(2).find((a) => !a.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");
const read = (file) => fs.readFileSync(path.join(dir, file), "utf8");
const problems = [];

function parse(file) {
  try {
    return JSON.parse(read(file));
  } catch (err) {
    problems.push(`${file}: ${err.message}`);
    return null;
  }
}

const index = parse("index.json");
const languages = parse("languages.json");
const packFiles = fs.readdirSync(path.join(dir, "packs")).filter((f) => f.endsWith(".json")).sort();
const packs = packFiles.map((f) => {
  const pack = parse(`packs/${f}`);
  if (pack && pack.id !== path.basename(f, ".json")) problems.push(`packs/${f}: id "${pack.id}" must match the file name`);
  if (pack && read(`packs/${f}`) !== formatPack(pack)) problems.push(`packs/${f}: not in the standard layout (run npm run content:format)`);
  return pack;
}).filter(Boolean);

if (process.argv.includes("--format")) {
  for (const pack of packs) fs.writeFileSync(path.join(dir, "packs", `${pack.id}.json`), formatPack(pack));
  if (index) fs.writeFileSync(path.join(dir, "index.json"), formatJson(index));
  if (languages) fs.writeFileSync(path.join(dir, "languages.json"), formatJson(languages));
  console.log("Formatted the content files.");
  process.exit(0);
}

if (index && languages) problems.push(...validateContent({ index, languages, packs }));

if (problems.length) {
  console.error(`Content has ${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const count = packs.reduce((n, p) => n + p.items.length, 0);
console.log(`Content OK: ${packs.length} packs, ${count} items, ${languages.length} languages.`);
