// Outgoing mail goes through the mail_queue table, so a slow or failing mail
// server never fails a request. A worker sends due mail every few seconds and
// retries with growing waits; a mail that can no longer help (an expired
// sign-in code) is dropped instead.

import { renderMail } from "./templates.js";

const RETRY_WAITS_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000, 2 * 3600_000];

export function enqueueMail(db, { to, template, lang, data, dropAfter = null }, now = Date.now()) {
  db.prepare(
    "INSERT INTO mail_queue (to_addr, template, data, next_try_at, drop_after, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(to, template, JSON.stringify({ lang, ...data }), now, dropAfter, now);
}

export async function sendDueMail(db, mailer, log, now = Date.now()) {
  const due = db
    .prepare("SELECT * FROM mail_queue WHERE status = 'pending' AND next_try_at <= ? ORDER BY id LIMIT 10")
    .all(now);
  const finish = db.prepare("UPDATE mail_queue SET status = ?, data = '{}' WHERE id = ?");
  for (const row of due) {
    if (row.drop_after && now > row.drop_after) {
      finish.run("dropped", row.id);
      continue;
    }
    const { lang, ...data } = JSON.parse(row.data);
    try {
      const mail = renderMail(row.template, lang, data);
      await mailer.send({ ...mail, to: row.to_addr, template: row.template });
      finish.run("sent", row.id);
      log.info({ to: row.to_addr, template: row.template }, "mail sent");
    } catch (err) {
      const wait = RETRY_WAITS_MS[row.tries];
      if (wait === undefined) {
        finish.run("failed", row.id);
        log.error({ to: row.to_addr, template: row.template, err: err.message }, "mail failed, giving up");
      } else {
        db.prepare("UPDATE mail_queue SET tries = tries + 1, next_try_at = ? WHERE id = ?").run(now + wait, row.id);
        log.warn({ to: row.to_addr, template: row.template, err: err.message }, "mail failed, will retry");
      }
    }
  }
  // Keep a week of history for troubleshooting (no bodies are kept).
  db.prepare("DELETE FROM mail_queue WHERE status != 'pending' AND created_at < ?").run(now - 7 * 86400_000);
  return due.length;
}

export function startMailWorker(db, mailer, log, intervalMs = 3000) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await sendDueMail(db, mailer, log);
    } catch (err) {
      log.error({ err: err.message }, "mail worker");
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
