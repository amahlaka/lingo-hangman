// Jest stand-in for ./bundledContent.js, which needs Vite's import.meta.glob.
import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "content");
const read = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));

export default {
  index: read("index.json"),
  languages: read("languages.json"),
  packs: fs
    .readdirSync(path.join(dir, "packs"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => read(`packs/${f}`)),
};
