// Generated speech on disk, shared by every learner: one MP3 per hash of
// (voice folder, speed, text). Least recently used files go once the cache is
// over its size; reading a file marks it used.

import fs from "node:fs/promises";
import path from "node:path";

export function createTtsCache({ dir, maxBytes }) {
  let total = null; // bytes on disk, counted on first write
  const fileFor = (hash) => path.join(dir, hash.slice(0, 2), `${hash}.mp3`);

  async function files() {
    const out = [];
    let subdirs = [];
    try {
      subdirs = await fs.readdir(dir);
    } catch {
      return out;
    }
    for (const sub of subdirs) {
      let names = [];
      try {
        names = await fs.readdir(path.join(dir, sub));
      } catch {
        continue;
      }
      for (const name of names) {
        const file = path.join(dir, sub, name);
        try {
          const st = await fs.stat(file);
          if (st.isFile()) out.push({ file, size: st.size, used: st.mtimeMs });
        } catch {
          // Removed meanwhile.
        }
      }
    }
    return out;
  }

  async function get(hash) {
    const file = fileFor(hash);
    try {
      const data = await fs.readFile(file);
      const now = new Date();
      await fs.utimes(file, now, now).catch(() => {});
      return data;
    } catch {
      return null;
    }
  }

  async function put(hash, data) {
    const file = fileFor(hash);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
    if (total === null) total = (await files()).reduce((n, f) => n + f.size, 0);
    else total += data.length;
    if (total > maxBytes) await evict();
  }

  // Down to 90% of the limit, oldest use first.
  async function evict() {
    const list = (await files()).sort((a, b) => a.used - b.used);
    total = list.reduce((n, f) => n + f.size, 0);
    for (const f of list) {
      if (total <= maxBytes * 0.9) break;
      try {
        await fs.unlink(f.file);
        total -= f.size;
      } catch {
        // Gone already.
      }
    }
  }

  return { get, put, evict, size: async () => (await files()).reduce((n, f) => n + f.size, 0) };
}
