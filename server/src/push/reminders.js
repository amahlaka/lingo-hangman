// Which reminder a learner gets today, if any, and the scheduler that sends
// them. Reminders follow the learner's own day: the time and time zone come
// from their settings, and "today" is their local day, the same day key the
// app records answers under (src/lib/progress.js).

import { DEFAULT_DAILY_GOAL, streakStatus } from "../../../src/lib/progress.js";

export const REMINDER_KINDS = ["goal", "streak"];
// A reminder that couldn't go at its time (the server was down) still goes
// this many minutes later, but not after that: a late-night nudge for a
// reminder set for the afternoon would only annoy.
export const SEND_WINDOW_MIN = 180;

const TEXT = {
  en: {
    streak: { title: "Keep your streak going", body: "You're on a {n}-day streak. Reach today's goal to keep it." },
    goal: { title: "Time for a little English", body: "{n} words make today's goal. It only takes a few minutes." },
    test: { title: "Reminders are on", body: "This is how a Lingo reminder looks." },
  },
  fi: {
    streak: { title: "Pidä putki käynnissä", body: "Putkesi on {n} päivää. Saavuta päivän tavoite, niin se jatkuu." },
    goal: { title: "Hetki englantia?", body: "{n} sanaa, niin päivän tavoite on täynnä. Se vie vain muutaman minuutin." },
    test: { title: "Muistutukset ovat päällä", body: "Tältä Lingon muistutus näyttää." },
  },
};

export function validTimeZone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// { day: "YYYY-MM-DD", minutes: minutes since local midnight } in `tz`.
export function localNow(now, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(now))
      .map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export const timeMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// null when the learner already played today (whatever they played) or has
// no kind of reminder that applies. A streak at risk comes before the goal.
export function reminderFor(state, kinds, today) {
  if (state?.days?.[today]?.words > 0) return null;
  const streak = state ? streakStatus(state, today) : { current: 0 };
  if (kinds.includes("streak") && streak.current > 0) return { kind: "streak", n: streak.current };
  if (kinds.includes("goal")) return { kind: "goal", n: state?.dailyGoal || DEFAULT_DAILY_GOAL };
  return null;
}

export function reminderMessage({ kind, n = 0 }, lang) {
  const text = (TEXT[lang] || TEXT.en)[kind];
  return {
    title: text.title,
    body: text.body.replace("{n}", String(n)),
    url: "/",
    tag: "lingo-reminder",
  };
}

// Sends one message to every device a learner subscribed. Subscriptions the
// push service says are gone (404/410) are removed. Returns how many sent.
export async function sendToUser(db, send, userId, message, { log, sessionHash } = {}) {
  const subs = sessionHash
    ? db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ? AND session_hash = ?").all(userId, sessionHash)
    : db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ?").all(userId);
  let sent = 0;
  for (const sub of subs) {
    try {
      await send(sub, message);
      db.prepare("UPDATE push_subscriptions SET last_sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(sub.id);
      sent += 1;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(sub.id);
      } else {
        // Never the endpoint: it is the address of the learner's device.
        log?.warn({ status: err?.statusCode || null, subscription: sub.id }, "push failed");
      }
    }
  }
  return sent;
}

// One pass of the scheduler: every learner whose reminder time has come
// today and who hasn't been handled today.
export async function runReminders(db, send, { now = Date.now(), log } = {}) {
  const rows = db
    .prepare(
      `SELECT p.*, a.state FROM push_settings p LEFT JOIN account_state a ON a.user_id = p.user_id
       WHERE p.enabled = 1 AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = p.user_id)`
    )
    .all();
  let sent = 0;
  for (const row of rows) {
    if (!validTimeZone(row.tz)) continue;
    const { day, minutes } = localNow(now, row.tz);
    if (row.last_day === day) continue;
    const at = timeMinutes(row.time);
    if (minutes < at) continue;
    db.prepare("UPDATE push_settings SET last_day = ? WHERE user_id = ?").run(day, row.user_id);
    if (minutes > at + SEND_WINDOW_MIN) continue;
    const reminder = reminderFor(row.state ? JSON.parse(row.state) : null, JSON.parse(row.kinds), day);
    if (!reminder) continue;
    sent += await sendToUser(db, send, row.user_id, reminderMessage(reminder, row.lang), { log });
  }
  if (sent) log?.info({ sent }, "reminders sent");
  return sent;
}

// Runs the scheduler every `intervalMs`; returns a function that stops it.
export function startReminders(db, send, { intervalMs, log }) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runReminders(db, send, { log });
    } catch (err) {
      log?.error(err, "reminder run failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
