// Settings come from the environment (the server's .env), never from the repo.

import path from "node:path";

function list(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const origins = list(env.ORIGINS || "http://localhost:5173");
  const dbPath = env.DB_PATH || "./data/lingo.db";
  return {
    host: env.HOST || "0.0.0.0",
    port: Number(env.PORT || 3000),
    // ":memory:" for tests; a file on the data volume in the container.
    dbPath,
    // The commit the image was built from, shown by /api/health.
    version: env.LINGO_VERSION || "dev",
    logLevel: env.LOG_LEVEL || "info",
    // Requests reach the API only through the reverse proxy on the Docker
    // network, so its X-Forwarded-For is trusted from private addresses only.
    trustProxy: env.TRUST_PROXY || "loopback, linklocal, uniquelocal",
    // Requests per minute from one address, on any route.
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE || 120),

    // Passkeys: the app's address. RP_ID is its host name, ORIGINS the full
    // https://... origins the app is served from (comma separated).
    rpId: env.RP_ID || new URL(origins[0]).hostname,
    rpName: env.RP_NAME || "Lingo",
    origins,
    // The app's own address, for links the API hands out (OAuth metadata).
    publicUrl: (env.PUBLIC_URL || origins[0]).replace(/\/$/, ""),
    // Where OAuth clients (AI connectors) may send the approval back, besides
    // claude.ai's own and loopback addresses for local tools (comma separated).
    oauthRedirectUris: list(env.OAUTH_REDIRECT_URIS),
    // Cookies are Secure unless the app runs on plain http (local development).
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : origins.every((o) => o.startsWith("https:")),
    // Accounts with these emails are admins.
    adminEmails: list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()),

    // Mail: "log" (default: writes recipient and template only), "memory"
    // (tests) or "smtp" (real sending; set only on the server).
    mailer: env.MAILER || "log",
    smtp: {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    mailFrom: env.MAIL_FROM || "lingo@bololoo.com",
    mailFromName: env.MAIL_FROM_NAME || "Lingo",
    // Bounces go to a + address of the sender.
    mailBounce: env.MAIL_BOUNCE || null,

    // On-demand speech: the Kokoro TTS service on the Docker network
    // (http://kokoro-tts:8000) and its API key. Without TTS_URL the app uses
    // recorded clips and the browser voice only.
    ttsUrl: env.TTS_URL || null,
    ttsApiKey: env.TTS_API_KEY || null,
    // Next to the database by default, so it lands on the data volume (the
    // container's own files are read-only).
    ttsCacheDir: env.TTS_CACHE_DIR || path.join(dbPath === ":memory:" ? "./data" : path.dirname(dbPath), "tts-cache"),
    ttsCacheBytes: Number(env.TTS_CACHE_MB || 2048) * 1024 * 1024,
    // New clips a day: every signed-in learner, and learners Arttu verified.
    ttsDailyLimit: Number(env.TTS_DAILY_LIMIT || 10),
    ttsVerifiedLimit: Number(env.TTS_VERIFIED_LIMIT || 200),
    // Requests waiting for the service, which makes one clip at a time.
    ttsQueueMax: Number(env.TTS_QUEUE_MAX || 20),
    ttsTimeoutMs: Number(env.TTS_TIMEOUT_MS || 30000),
    // The published word base (read only) and its recorded clips (written),
    // so a word-base text without a clip can get one (routes/tts.js). Both
    // unset: no clips are made.
    contentDir: env.CONTENT_DIR || null,
    clipDir: env.CLIP_DIR || null,

    // Pronunciation scoring (Say it right): the Talkies speech service on the
    // Docker network (http://talkies:8000) and its bearer token. Without
    // TALKIES_URL the game says scoring is not available.
    talkiesUrl: env.TALKIES_URL || null,
    talkiesToken: env.TALKIES_TOKEN || null,
    // The phoneme recogniser: IPA sounds, not words.
    talkiesModel: env.TALKIES_MODEL || "zipa-ipa",
    // Clips a verified learner can have scored in a day.
    pronounceDailyLimit: Number(env.PRONOUNCE_DAILY_LIMIT || 150),
    // Clips waiting for the service, which scores one at a time.
    pronounceQueueMax: Number(env.PRONOUNCE_QUEUE_MAX || 6),
    pronounceTimeoutMs: Number(env.PRONOUNCE_TIMEOUT_MS || 20000),

    // Reminders by web push. The VAPID key pair is made once on the server
    // (npx web-push generate-vapid-keys) and kept in its .env; without it
    // reminders are off and the app hides them.
    vapidPublicKey: env.VAPID_PUBLIC_KEY || null,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY || null,
    vapidSubject: env.VAPID_SUBJECT || "mailto:lingo@bololoo.com",
    // How often the reminder scheduler looks for learners to remind.
    pushIntervalMs: Number(env.PUSH_INTERVAL_MS || 5 * 60_000),

    // How often the statistics and difficulty data are recomputed.
    statsIntervalMs: Number(env.STATS_INTERVAL_MS || 6 * 3600_000),
  };
}
