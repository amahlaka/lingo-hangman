// Entry point: open the database (running any new migrations), then serve.

import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const db = openDatabase(config.dbPath);
const app = buildApp({ db, config });

async function shutdown(signal) {
  app.log.info({ signal }, "shutting down");
  await app.close();
  db.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ host: config.host, port: config.port });
