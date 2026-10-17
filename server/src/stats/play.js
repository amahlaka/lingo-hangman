// Play statistics for the admin Statistics page (docs/backend.md, "Play
// statistics"), worked out when the page asks: the tables are small.
//
// Visits and games started are plain hourly counts over everyone. Play
// sessions and unfinished rounds are from signed-in learners only.

import { GIVE_UP_REASONS } from "../../../src/lib/playSession.js";

export const PLAY_ZONE = "Europe/Helsinki";
// Days of play data kept, and shown.
export const PLAY_KEEP_DAYS = 90;
export const PLAY_DAYS = 30;
export const PLAY_DAILY_DAYS = 35;
const RECENT_HOURS = 48;

const zoneFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLAY_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

// "YYYY-MM-DDTHH" (UTC) -> { day, hour } in Finnish time.
export function localHour(hourKey) {
  const parts = Object.fromEntries(zoneFormat.formatToParts(new Date(`${hourKey}:00:00Z`)).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};
const share = (n, total) => (total ? Math.round((n / total) * 100) / 100 : 0);
const isoHour = (ms) => new Date(ms).toISOString().slice(0, 13);

export function playStats(db, now = Date.now()) {
  const since = new Date(now - PLAY_DAYS * 86400_000).toISOString();
  const dailySinceMs = now - PLAY_DAILY_DAYS * 86400_000;
  const dailySince = localHour(isoHour(dailySinceMs)).day;

  // ---- Hourly counts (everyone) ----
  const counts = db.prepare("SELECT hour, metric, key, value FROM play_counts WHERE hour >= ?").all(isoHour(dailySinceMs));
  const recentFrom = isoHour(now - (RECENT_HOURS - 1) * 3600_000);
  const recent = new Map();
  for (let i = RECENT_HOURS - 1; i >= 0; i--) recent.set(isoHour(now - i * 3600_000), 0);
  const days = new Map();
  const day = (d) => {
    if (!days.has(d)) days.set(d, { day: d, visits: 0, gamesAnon: 0, gamesAccount: 0, sessions: 0, learners: 0, avgMs: null });
    return days.get(d);
  };
  const hourOfDay = Array(24).fill(0);
  const popular = new Map();
  const popularFrom = isoHour(now - PLAY_DAYS * 86400_000);
  for (const r of counts) {
    const local = localHour(r.hour);
    if (r.metric === "visits") {
      if (r.hour >= recentFrom && recent.has(r.hour)) recent.set(r.hour, recent.get(r.hour) + r.value);
      if (r.hour >= popularFrom) hourOfDay[local.hour] += r.value;
      if (local.day >= dailySince) day(local.day).visits += r.value;
      continue;
    }
    const anon = r.metric === "games_anon";
    if (local.day >= dailySince) day(local.day)[anon ? "gamesAnon" : "gamesAccount"] += r.value;
    if (r.hour >= popularFrom) {
      const p = popular.get(r.key) || { id: r.key, anon: 0, account: 0, total: 0 };
      p[anon ? "anon" : "account"] += r.value;
      p.total += r.value;
      popular.set(r.key, p);
    }
  }

  // ---- Play sessions (signed in) ----
  const sessionRows = db.prepare("SELECT user_id, day, ms, games FROM play_sessions WHERE started_at >= ?").all(since);
  const lengths = [];
  const gameSessions = new Map(); // game -> { sessions, rounds, finished }
  const learnerDays = new Set();
  const learners = new Set();
  let distinctGames = 0;
  let oneGame = 0;
  for (const r of sessionRows) {
    const games = JSON.parse(r.games);
    lengths.push(r.ms);
    learners.add(r.user_id);
    learnerDays.add(`${r.user_id}|${r.day}`);
    const ids = Object.keys(games);
    distinctGames += ids.length;
    if (ids.length === 1) oneGame += 1;
    for (const id of ids) {
      const g = gameSessions.get(id) || { id, sessions: 0, rounds: 0, finished: 0 };
      g.sessions += 1;
      g.rounds += games[id].rounds;
      g.finished += games[id].finished;
      gameSessions.set(id, g);
    }
  }
  const dailySessions = db
    .prepare(
      `SELECT day, COUNT(*) AS sessions, COUNT(DISTINCT user_id) AS learners, AVG(ms) AS avgMs
       FROM play_sessions WHERE day >= ? GROUP BY day`
    )
    .all(dailySince);
  for (const r of dailySessions) Object.assign(day(r.day), { sessions: r.sessions, learners: r.learners, avgMs: Math.round(r.avgMs) });

  // ---- Unfinished rounds (signed in) ----
  const giveUpRows = db.prepare("SELECT game, reason, how, answers FROM give_ups WHERE at >= ?").all(since);
  const reasons = Object.fromEntries(GIVE_UP_REASONS.map((r) => [r, 0]));
  const how = { left: 0, closed: 0 };
  const byGame = new Map();
  for (const r of giveUpRows) {
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    how[r.how] = (how[r.how] || 0) + 1;
    const g = byGame.get(r.game) || { id: r.game, giveUps: 0, reasons: {} };
    g.giveUps += 1;
    g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
    byGame.set(r.game, g);
  }
  const gameIds = new Set([...gameSessions.keys(), ...byGame.keys()]);

  return {
    zone: PLAY_ZONE,
    days: PLAY_DAYS,
    recentHours: [...recent].map(([hour, visits]) => ({ hour: `${hour}:00:00Z`, visits })),
    // Visits by hour of the day (Finnish time), added up over PLAY_DAYS.
    hourOfDay,
    daily: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    popular: [...popular.values()].sort((a, b) => b.total - a.total),
    sessions: {
      count: sessionRows.length,
      learners: learners.size,
      avgMs: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null,
      medianMs: median(lengths),
      avgGames: sessionRows.length ? Math.round((distinctGames / sessionRows.length) * 10) / 10 : null,
      oneGame: share(oneGame, sessionRows.length),
      // Sessions per learner on the days they played.
      perLearnerDay: learnerDays.size ? Math.round((sessionRows.length / learnerDays.size) * 10) / 10 : null,
      games: [...gameSessions.values()]
        .map((g) => ({ ...g, share: share(g.sessions, sessionRows.length) }))
        .sort((a, b) => b.sessions - a.sessions),
    },
    giveUps: {
      total: giveUpRows.length,
      reasons,
      how,
      games: [...gameIds]
        .map((id) => {
          const s = gameSessions.get(id) || { rounds: 0, finished: 0 };
          const g = byGame.get(id) || { giveUps: 0, reasons: {} };
          return { id, rounds: s.rounds, finished: s.finished, giveUps: g.giveUps, reasons: g.reasons };
        })
        .filter((g) => g.rounds || g.giveUps)
        .sort((a, b) => b.giveUps - a.giveUps || b.rounds - a.rounds),
    },
  };
}

// Housekeeping: play data older than PLAY_KEEP_DAYS goes.
export function prunePlay(db, now = Date.now()) {
  const before = new Date(now - PLAY_KEEP_DAYS * 86400_000).toISOString();
  db.prepare("DELETE FROM play_counts WHERE hour < ?").run(before.slice(0, 13));
  db.prepare("DELETE FROM play_sessions WHERE started_at < ?").run(before);
  db.prepare("DELETE FROM give_ups WHERE at < ?").run(before);
}
