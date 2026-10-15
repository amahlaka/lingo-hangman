import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";
import { createMailer } from "../src/mail/mailer.js";
import { sendDueMail } from "../src/mail/queue.js";

const quietLog = { info() {}, warn() {}, error() {} };

export function setup(env = {}) {
  const db = openDatabase(":memory:");
  const config = loadConfig({
    ORIGINS: "https://lingo.example",
    MAILER: "memory",
    ADMIN_EMAILS: "boss@example.com",
    ...env,
  });
  const app = buildApp({ db, config, logger: false });
  const mailer = createMailer(config, quietLog);
  const t = {
    db,
    app,
    config,
    mailer,
    cookie: null,
    async flushMail() {
      await sendDueMail(db, mailer, quietLog);
      return mailer.sent;
    },
    // Keeps the session cookie between calls, unless a call passes its own.
    async call(method, url, body, { headers = {}, cookie } = {}) {
      const own = cookie !== undefined;
      if (!own) cookie = t.cookie;
      const res = await app.inject({
        method,
        url,
        payload: body,
        headers: {
          ...(method === "GET" ? {} : { "x-lingo": "1", origin: "https://lingo.example" }),
          ...(cookie ? { cookie: `lingo_session=${cookie}` } : {}),
          "user-agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
          ...headers,
        },
      });
      const set = res.cookies.find((c) => c.name === "lingo_session");
      if (set && !own) t.cookie = set.value || null;
      return res;
    },
    // Sign in (or up) with an emailed code.
    async signIn(email = "learner@example.com") {
      await t.call("POST", "/api/auth/code", { email, lang: "fi" });
      const mails = await t.flushMail();
      const code = mails.at(-1).text.match(/\d{6}/)[0];
      return t.call("POST", "/api/auth/verify", { email, code });
    },
    async close() {
      await app.close();
      db.close();
    },
  };
  return t;
}
