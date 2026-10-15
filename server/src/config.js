// Settings come from the environment (the server's .env), never from the repo.

function list(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const origins = list(env.ORIGINS || "http://localhost:5173");
  return {
    host: env.HOST || "0.0.0.0",
    port: Number(env.PORT || 3000),
    // ":memory:" for tests; a file on the data volume in the container.
    dbPath: env.DB_PATH || "./data/lingo.db",
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
  };
}
