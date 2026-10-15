// Entry point: open the database (running any new migrations), start the
// mail worker and housekeeping, then serve.

import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { buildApp } from "./app.js";
import { createRateLimiter } from "./lib/rateLimit.js";
import { createMailer } from "./mail/mailer.js";
import { startMailWorker } from "./mail/queue.js";
import { deleteExpired } from "./sessions.js";

const config = loadConfig();
const db = openDatabase(config.dbPath);
const limiter = createRateLimiter();
const app = buildApp({ db, config, limiter });

const mailer = createMailer(config, app.log);
const stopMail = startMailWorker(db, mailer, app.log);
const housekeeping = setInterval(() => {
  deleteExpired(db);
  limiter.sweep(86400_000);
}, 10 * 60_000);
housekeeping.unref();

async function shutdown(signal) {
  app.log.info({ signal }, "shutting down");
  stopMail();
  clearInterval(housekeeping);
  await app.close();
  db.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ host: config.host, port: config.port });
app.log.info({ rpId: config.rpId, origins: config.origins, mailer: config.mailer }, "lingo api ready");
