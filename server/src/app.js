// The API as a Fastify instance, without listening, so tests can call it with
// app.inject(). Every route lives under /api: the reverse proxy forwards that
// path of the app's own address here, so the app calls it same-origin.

import Fastify from "fastify";
import { schemaVersion } from "./db.js";

export function buildApp({ db, config, logger = true }) {
  const app = Fastify({
    logger: logger && {
      level: config.logLevel,
      // Never log cookies or auth headers; later phases add codes and tokens.
      redact: ["req.headers.cookie", "req.headers.authorization", "req.headers['x-api-key']"],
    },
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (!reply.hasHeader("Cache-Control")) reply.header("Cache-Control", "no-store");
  });

  // Polled by the Docker health check every 30 s, so only problems are logged.
  app.get("/api/health", { logLevel: "warn" }, async (req, reply) => {
    let dbOk = true;
    let schema = null;
    try {
      schema = schemaVersion(db);
    } catch {
      dbOk = false;
    }
    reply.code(dbOk ? 200 : 503);
    return { ok: dbOk, version: config.version, schema };
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: "not_found" });
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    reply.code(status).send({ error: status >= 500 ? "server_error" : err.code || "bad_request" });
  });

  return app;
}
