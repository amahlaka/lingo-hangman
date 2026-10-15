// SQLite through Node's built-in node:sqlite: one file on the data volume, no
// native modules to build. Migrations are the numbered .sql files in
// ../migrations, applied in order at start-up, each in its own transaction.
// They only ever move forward; a rolled-back release must still work with the
// newer schema, so migrations add tables and columns and never remove them.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export function openDatabase(dbPath, { migrationsDir = MIGRATIONS_DIR } = {}) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db, migrationsDir);
  return db;
}

export function listMigrations(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((file) => ({ id: Number(file.slice(0, 3)), file, sql: fs.readFileSync(path.join(dir, file), "utf8") }));
}

export function migrate(db, dir = MIGRATIONS_DIR) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    file TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  const done = new Set(db.prepare("SELECT id FROM schema_migrations").all().map((r) => r.id));
  const applied = [];
  for (const m of listMigrations(dir)) {
    if (done.has(m.id)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (id, file) VALUES (?, ?)").run(m.id, m.file);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${m.file} failed: ${err.message}`);
    }
    applied.push(m.file);
  }
  return applied;
}

export function schemaVersion(db) {
  return db.prepare("SELECT COALESCE(MAX(id), 0) AS v FROM schema_migrations").get().v;
}
