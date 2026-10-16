import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { openDatabase, migrate, listMigrations, schemaVersion } from "../src/db.js";
import { loadConfig } from "../src/config.js";

function setup() {
  const db = openDatabase(":memory:");
  const config = { ...loadConfig({}), version: "abc1234" };
  return { db, app: buildApp({ db, config, logger: false }) };
}

test("health reports ok, the version and the schema", async () => {
  const { app, db } = setup();
  const res = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true, version: "abc1234", schema: listMigrations().at(-1).id });
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  await app.close();
  db.close();
});

test("health is 503 when the database is gone", async () => {
  const { app, db } = setup();
  db.close();
  const res = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().ok, false);
  await app.close();
});

test("unknown paths are a JSON 404", async () => {
  const { app, db } = setup();
  const res = await app.inject({ method: "GET", url: "/api/nope" });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: "not_found" });
  await app.close();
  db.close();
});

test("migrations run once, in order, and a failing one changes nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lingo-mig-"));
  fs.writeFileSync(path.join(dir, "001_a.sql"), "CREATE TABLE a (x INTEGER);");
  fs.writeFileSync(path.join(dir, "002_b.sql"), "CREATE TABLE b (x INTEGER);");
  fs.writeFileSync(path.join(dir, "notes.txt"), "ignored");
  const db = openDatabase(":memory:", { migrationsDir: dir });
  assert.equal(schemaVersion(db), 2);
  assert.deepEqual(migrate(db, dir), []);

  fs.writeFileSync(path.join(dir, "003_bad.sql"), "CREATE TABLE c (x INTEGER); INSERT INTO nope VALUES (1);");
  assert.throws(() => migrate(db, dir), /003_bad.sql failed/);
  assert.equal(schemaVersion(db), 2);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'c'").get(), undefined);
  db.close();
  fs.rmSync(dir, { recursive: true });
});

test("the database file and its folder are created", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lingo-db-"));
  const file = path.join(dir, "nested", "lingo.db");
  const db = openDatabase(file);
  assert.ok(fs.existsSync(file));
  db.close();
  fs.rmSync(dir, { recursive: true });
});

test("the speech cache sits next to the database unless set", () => {
  assert.equal(loadConfig({ DB_PATH: "/data/lingo.db" }).ttsCacheDir, "/data/tts-cache");
  assert.equal(loadConfig({}).ttsCacheDir, "data/tts-cache");
  assert.equal(loadConfig({ DB_PATH: "/data/lingo.db", TTS_CACHE_DIR: "/cache" }).ttsCacheDir, "/cache");
});
