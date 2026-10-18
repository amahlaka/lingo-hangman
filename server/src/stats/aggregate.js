// Statistics over everyone's answers (the "answer" events in sync_events):
// daily counts for the admin Statistics page, and how hard each word is,
// published at /api/difficulty for Quick play, how learners go wrong, and
// how they say English sounds in Say it right.
// Only numbers over several learners leave this file; nothing here names or
// counts a single learner.

import { wordKey } from "../../../src/lib/progress.js";
import { answerMistakes } from "../../../src/lib/mistakes.js";
import { pronunciationTotals } from "../../../src/lib/pronunciationStats.js";

// Days of answers the job looks at.
export const STATS_DAYS = 90;
// Days shown day by day on the admin page.
export const DAILY_DAYS = 35;
// A word's numbers are published only with this many answers from this many
// different learners, so they never describe one person.
export const MIN_ANSWERS = 5;
export const MIN_LEARNERS = 3;
const LIST_LENGTH = 25;

const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Reads the answers once and returns everything the job stores.
export function aggregate(db, now = Date.now()) {
  const since = new Date(now - STATS_DAYS * 86400_000).toISOString();
  const dailySince = isoDay(now - DAILY_DAYS * 86400_000);
  const days = new Map(); // day -> { learners:Set, answers:{game:n}, firstTry:{game:n} }
  const games = new Map(); // game -> { n, firstTry, ms[] }
  const words = new Map(); // key -> { word, n, firstTry, solved, learners:Set, ms[] }
  const kinds = new Map(); // game -> { kind: n }
  const wrongs = new Map(); // key -> given -> { n, kind, learners:Set }
  const pronunciation = pronunciationTotals();
  const rows = db
    .prepare("SELECT user_id, payload FROM sync_events WHERE type = 'answer' AND at >= ?")
    .iterate(since);
  for (const row of rows) {
    const { result, day } = JSON.parse(row.payload);
    const first = result.solved && result.perfect ? 1 : 0;
    const game = result.gameId;

    const g = games.get(game) || { n: 0, firstTry: 0, ms: [] };
    g.n += 1;
    g.firstTry += first;
    if (result.ms && result.ms < 60000) g.ms.push(result.ms);
    games.set(game, g);

    if (day >= dailySince) {
      const d = days.get(day) || { learners: new Set(), answers: {}, firstTry: {} };
      d.learners.add(row.user_id);
      d.answers[game] = (d.answers[game] || 0) + 1;
      d.firstTry[game] = (d.firstTry[game] || 0) + first;
      days.set(day, d);
    }

    if (result.word) {
      const key = wordKey(result.word, result.lang || "en");
      const w = words.get(key) || { word: result.word, n: 0, firstTry: 0, solved: 0, learners: new Set(), ms: [] };
      w.n += 1;
      w.firstTry += first;
      w.solved += result.solved ? 1 : 0;
      w.learners.add(row.user_id);
      if (result.ms && result.ms < 60000) w.ms.push(result.ms);
      words.set(key, w);
    }

    pronunciation.add(result, row.user_id);

    for (const m of answerMistakes(result)) {
      const k = kinds.get(game) || {};
      k[m.kind] = (k[m.kind] || 0) + 1;
      kinds.set(game, k);
      if (!result.word || !m.given) continue;
      const key = wordKey(result.word, result.lang || "en");
      const given = m.given.toLowerCase();
      const byWord = wrongs.get(key) || new Map();
      const e = byWord.get(given) || { n: 0, kind: m.kind, learners: new Set() };
      e.n += 1;
      e.learners.add(row.user_id);
      byWord.set(given, e);
      wrongs.set(key, byWord);
    }
  }

  const daily = [];
  for (const [day, d] of days) {
    daily.push({ day, metric: "learners", key: "", value: d.learners.size });
    for (const [game, n] of Object.entries(d.answers)) {
      daily.push({ day, metric: "answers", key: game, value: n });
      daily.push({ day, metric: "first_try", key: game, value: d.firstTry[game] });
    }
  }
  const accounts = db
    .prepare("SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY day")
    .all(dailySince);
  for (const a of accounts) daily.push({ day: a.day, metric: "accounts", key: "", value: a.n });

  const items = {};
  const listed = [];
  for (const [key, w] of words) {
    if (w.n < MIN_ANSWERS || w.learners.size < MIN_LEARNERS) continue;
    const entry = { n: w.n, firstTry: Math.round((w.firstTry / w.n) * 100) / 100, ms: median(w.ms) };
    items[key] = entry;
    listed.push({ key, word: w.word, learners: w.learners.size, solved: Math.round((w.solved / w.n) * 100) / 100, ...entry });
  }

  // Wrong answers given by several learners, so none of them is one person's.
  const common = [];
  for (const [key, byWord] of wrongs) {
    const word = words.get(key)?.word || key;
    for (const [given, e] of byWord) {
      if (e.learners.size < MIN_LEARNERS) continue;
      common.push({ key, word, given, kind: e.kind, n: e.n, learners: e.learners.size });
    }
  }
  const mistakes = {
    games: [...kinds].map(([id, k]) => ({ id, kinds: k, total: Object.values(k).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total),
    common: common.sort((a, b) => b.learners - a.learners || b.n - a.n).slice(0, LIST_LENGTH),
  };

  // Say it right: scores by mode, the sounds learners miss most and the
  // words and readings with the lowest scores, each over several learners.
  const said = pronunciation.summary({ minLearners: MIN_LEARNERS, minAnswers: MIN_ANSWERS });
  const pronounce = {
    answers: said.answers,
    modes: said.modes,
    sounds: said.sounds,
    hardest: said.items,
  };

  return {
    daily,
    mistakes,
    pronunciation: pronounce,
    difficulty: { generatedAt: new Date(now).toISOString(), days: STATS_DAYS, items },
    words: {
      hardest: [...listed].sort((a, b) => a.firstTry - b.firstTry || b.n - a.n).slice(0, LIST_LENGTH),
      slowest: listed.filter((w) => w.ms).sort((a, b) => b.ms - a.ms).slice(0, LIST_LENGTH),
      tracked: listed.length,
    },
    games: [...games]
      .map(([id, g]) => ({ id, answers: g.n, firstTry: Math.round((g.firstTry / g.n) * 100) / 100, ms: median(g.ms) }))
      .sort((a, b) => b.answers - a.answers),
  };
}

// Recomputes and stores the statistics. Runs in one transaction, so the
// pages never see half a result.
export function runStats(db, now = Date.now()) {
  const out = aggregate(db, now);
  const put = db.prepare(
    `INSERT INTO stats_cache (name, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM stats_daily").run();
    const ins = db.prepare("INSERT INTO stats_daily (day, metric, key, value) VALUES (?, ?, ?, ?)");
    for (const r of out.daily) ins.run(r.day, r.metric, r.key, r.value);
    put.run("difficulty", JSON.stringify(out.difficulty));
    put.run("words", JSON.stringify(out.words));
    put.run("games", JSON.stringify(out.games));
    put.run("mistakes", JSON.stringify(out.mistakes));
    put.run("pronunciation", JSON.stringify(out.pronunciation));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return out;
}

export function cached(db, name) {
  const row = db.prepare("SELECT value, updated_at FROM stats_cache WHERE name = ?").get(name);
  return row ? { value: JSON.parse(row.value), updatedAt: row.updated_at } : null;
}

// Runs the job now and then every `intervalMs`; returns a function that stops it.
export function startStats(db, { intervalMs, log }) {
  const run = () => {
    try {
      const out = runStats(db);
      log?.info({ words: out.words.tracked }, "statistics updated");
    } catch (err) {
      log?.error(err, "statistics failed");
    }
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  setTimeout(run, 5000).unref();
  return () => clearInterval(timer);
}
