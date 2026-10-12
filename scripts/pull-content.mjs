// Downloads the word base (github.com/amahlaka/lingo-wordbase) into content/.
// The words live in their own repository so that editing them never needs
// access to the app or its deploy pipeline; see that repository's README.
//
//   npm run content:pull                 newest master
//   node scripts/pull-content.mjs --if-missing   only when content/ is empty
//
// WORDBASE_REPO and WORDBASE_REF pick another repository or branch/commit.
// Uses the public tarball and the system `tar`, so no git is needed.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = process.env.WORDBASE_REPO || "amahlaka/lingo-wordbase";
const ref = process.env.WORDBASE_REF || "master";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");

if (process.argv.includes("--if-missing") && fs.existsSync(path.join(dir, "index.json"))) process.exit(0);

const url = `https://codeload.github.com/${repo}/tar.gz/${ref}`;
const res = await fetch(url);
if (!res.ok) {
  console.error(`Could not download the word base from ${url}: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const archive = path.join(path.dirname(dir), ".content.tar.gz");
fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir);
try {
  execFileSync("tar", ["-xzf", archive, "-C", dir, "--strip-components=1"]);
} finally {
  fs.rmSync(archive, { force: true });
}
console.log(`Word base: ${repo}@${ref} -> content/`);
