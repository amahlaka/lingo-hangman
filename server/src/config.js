// Settings come from the environment (the server's .env), never from the repo.

export function loadConfig(env = process.env) {
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
  };
}
