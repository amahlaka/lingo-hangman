// The API as a Fastify instance, without listening, so tests can call it with
// app.inject(). Every route lives under /api: the reverse proxy forwards that
// path of the app's own address here, so the app calls it same-origin.

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { schemaVersion } from "./db.js";
import { createRateLimiter } from "./lib/rateLimit.js";
import authRoutes from "./routes/auth.js";
import accountRoutes from "./routes/account.js";
import feedbackRoutes from "./routes/feedback.js";
import adminRoutes from "./routes/admin.js";
import syncRoutes from "./routes/sync.js";
import ttsRoutes from "./routes/tts.js";
import pushRoutes from "./routes/push.js";
import statsRoutes from "./routes/stats.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import pathRoutes from "./routes/path.js";
import playRoutes from "./routes/play.js";
import mcpRoutes, { MCP_PATH } from "./routes/mcp.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// `tts` ({ fetchImpl, cache }) replaces the TTS service and its cache in tests;
// `push` is the function that sends one push message (push/sender.js).
export function buildApp({ db, config, logger = true, limiter = createRateLimiter(), tts = {}, push = null }) {
  const app = Fastify({
    logger: logger && {
      level: config.logLevel,
      // Never log cookies or auth headers.
      redact: ["req.headers.cookie", "req.headers.authorization", "req.headers['x-api-key']", 'res.headers["set-cookie"]'],
    },
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
  });

  app.register(cookie);

  // A ceiling on every route per client address, under the tighter limits
  // that sign-in and mail routes add themselves (routes/auth.js).
  app.register(rateLimit, {
    global: true,
    max: config.rateLimitPerMinute,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({ statusCode: 429, code: "too_many_requests", message: "Too many requests" }),
  });

  // Requests that change something must come from the app itself: the custom
  // header can't be sent cross-site without a CORS preflight, which this API
  // never allows, and a browser's Origin must be one of the app's. The MCP
  // endpoint is for AI tools, not the app: it takes a bearer token instead of
  // the cookie and checks the Origin itself (routes/mcp.js).
  app.addHook("onRequest", async (req, reply) => {
    if (SAFE_METHODS.has(req.method) || req.url.split("?")[0] === MCP_PATH) return;
    const origin = req.headers.origin;
    if (req.headers["x-lingo"] !== "1" || (origin && !config.origins.includes(origin))) {
      return reply.code(403).send({ error: "forbidden" });
    }
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

  app.register(authRoutes, { db, config, limiter });
  app.register(accountRoutes, { db, config });
  app.register(feedbackRoutes, { db, limiter });
  app.register(adminRoutes, { db, config });
  app.register(syncRoutes, { db, limiter });
  app.register(ttsRoutes, { db, config, limiter, ...tts });
  app.register(pushRoutes, { db, config, limiter, send: push });
  app.register(statsRoutes, { db });
  app.register(leaderboardRoutes, { db, limiter });
  app.register(pathRoutes, { db, limiter });
  app.register(playRoutes, { db, limiter });
  app.register(mcpRoutes, { db, config });

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
