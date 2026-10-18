// What the admin pages show, as plain functions over the database, so the
// admin routes (routes/admin.js) and the AI tools (mcp/adminTools.js) give the
// same answers.

import { reportView, suggestionView } from "./routes/feedback.js";
import { ttsDay } from "./routes/tts.js";
import { DAILY_DAYS, MIN_ANSWERS, MIN_LEARNERS, cached } from "./stats/aggregate.js";
import { accountProgress } from "./routes/sync.js";
import { playStats } from "./stats/play.js";
import { gemBalance } from "../../src/lib/cosmetics.js";
import { answerSummary, learnedWords, levelInfo, progressSummary } from "../../src/lib/progress.js";
import { answerMistakes } from "../../src/lib/mistakes.js";
import { PRONOUNCE_GAME, pronunciationTotals } from "../../src/lib/pronunciationStats.js";

export const REPORT_STATUSES = ["open", "fixed", "dismissed"];
export const SUGGESTION_STATUSES = ["open", "accepted", "dismissed"];
export const MAX_ROWS = 500;

export const idList = (ids) =>
  Array.isArray(ids) && ids.length > 0 && ids.length <= MAX_ROWS && ids.every((id) => Number.isInteger(id) && id > 0) ? ids : null;

// Reports grouped by question, so ten reports of one question are one row.
export function reportGroups(db, status) {
  const rows = db.prepare("SELECT * FROM reports WHERE status = ? ORDER BY id DESC LIMIT ?").all(status, MAX_ROWS);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.game}\u0000${row.item_ref}`;
    if (!groups.has(key)) groups.set(key, { game: row.game, itemRef: row.item_ref, reports: [] });
    groups.get(key).reports.push(reportView(row));
  }
  return [...groups.values()]
    .map((g) => ({ ...g, count: g.reports.length, latestAt: g.reports[0].createdAt }))
    .sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt));
}

export function suggestionList(db, status) {
  return db.prepare("SELECT * FROM suggestions WHERE status = ? ORDER BY id DESC LIMIT ?").all(status, MAX_ROWS).map(suggestionView);
}

// Sets the status of reports or suggestions; "open" clears the resolved time.
// Returns how many rows changed.
export function setStatus(db, table, ids, status) {
  if (table !== "reports" && table !== "suggestions") throw new Error(`no status in ${table}`);
  const update = db.prepare(
    `UPDATE ${table} SET status = ?, resolved_at = CASE WHEN ? = 'open' THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END WHERE id = ?`
  );
  let changed = 0;
  for (const id of ids) changed += Number(update.run(status, status, id).changes);
  return changed;
}

// The Statistics page: numbers over all learners, recomputed a few times a
// day (stats/aggregate.js), plus live account totals.
export function adminStats(db) {
  const rows = db.prepare("SELECT * FROM stats_daily ORDER BY day").all();
  const byDay = new Map();
  for (const r of rows) {
    const d = byDay.get(r.day) || { day: r.day, learners: 0, answers: 0, firstTry: 0, accounts: 0 };
    if (r.metric === "learners") d.learners = r.value;
    else if (r.metric === "accounts") d.accounts = r.value;
    else if (r.metric === "answers") d.answers += r.value;
    else if (r.metric === "first_try") d.firstTry += r.value;
    byDay.set(r.day, d);
  }
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const words = cached(db, "words");
  return {
    updatedAt: words?.updatedAt || null,
    days: [...byDay.values()],
    games: cached(db, "games")?.value || [],
    words: words?.value || { hardest: [], slowest: [], tracked: 0 },
    mistakes: cached(db, "mistakes")?.value || { games: [], common: [] },
    pronunciation: cached(db, "pronunciation")?.value || { answers: 0, modes: [], sounds: [], hardest: [] },
    // Visits, games started, play sessions and unfinished rounds, counted now.
    play: playStats(db),
    totals: {
      accounts: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
      activeWeek: db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM sync_events WHERE type = 'answer' AND at >= ?").get(weekAgo).n,
      reminders: db.prepare("SELECT COUNT(*) AS n FROM push_settings WHERE enabled = 1").get().n,
      openReports: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").get().n,
    },
    rules: { dailyDays: DAILY_DAYS, minAnswers: MIN_ANSWERS, minLearners: MIN_LEARNERS },
  };
}

// One learner's own progress and account details (Arttu, 2026-10-16:
// admins see individual statistics), or null when there is no such account.
export function learnerView(db, id) {
  const u = db.prepare("SELECT id, email, role, lang, created_at, tts_requested_at FROM users WHERE id = ?").get(id);
  if (!u) return null;
  const state = accountProgress(db, id);
  const lastAnswer = db.prepare("SELECT MAX(at) AS at FROM sync_events WHERE user_id = ? AND type = 'answer'").get(id).at;
  const sessions = db.prepare("SELECT device, last_seen_at FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC").all(id);
  const push = db.prepare("SELECT enabled, time, tz FROM push_settings WHERE user_id = ?").get(id);
  const words = state
    ? Object.entries(state.words).map(([key, w]) => ({
        word: key.replace(/^[^:]+:/, ""),
        solved: w.solved,
        lost: w.lost,
        recent: w.recent || "",
        last: w.last || null,
        ms: w.timed ? Math.round(w.ms / w.timed) : null,
      }))
    : [];
  const days = state
    ? Object.entries(state.days)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 30)
        .map(([day, d]) => ({ day, words: d.words, solved: d.solved, firstTry: d.firstTry || 0, goalMet: Boolean(d.goalMet) }))
    : [];
  return {
    mistakes: learnerMistakes(db, id),
    pronunciation: learnerPronunciation(db, id),
    user: {
      id: u.id,
      email: u.email,
      role: u.role,
      language: u.lang,
      createdAt: u.created_at,
      lastAnswerAt: lastAnswer,
      ttsRequestedAt: u.tts_requested_at,
    },
    devices: sessions.map((s) => ({ device: s.device, lastSeenAt: new Date(s.last_seen_at).toISOString() })),
    reminders: push ? { enabled: Boolean(push.enabled), time: push.time, timeZone: push.tz } : null,
    speechToday: db.prepare("SELECT count FROM tts_usage WHERE user_id = ? AND day = ?").get(id, ttsDay())?.count || 0,
    reports: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE user_id = ?").get(id).n,
    suggestions: db.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE user_id = ?").get(id).n,
    progress: state
      ? {
          ...progressSummary(state),
          toNext: levelInfo(state.xp).toNext,
          dailyGoal: state.dailyGoal,
          streak: { current: state.streak.current, lastDay: state.streak.lastDay },
          totals: state.totals,
          gems: gemBalance(state),
          days,
          games: answerSummary(state).games,
          missed: words.filter((w) => w.lost > 0).sort((a, b) => b.lost - a.lost || b.lost / (b.solved + b.lost) - a.lost / (a.solved + a.lost)).slice(0, 20),
          wordCount: words.length,
          // Every word solved on 3 different days, most recently practiced first.
          learnedWords: learnedWords(state).map((w) => ({ word: w.word, solved: w.solved, lost: w.lost, last: w.last })),
        }
      : null,
  };
}

// One learner's Say it right: scores by mode, their weakest sounds, the words
// and readings they found hardest, and their latest scores.
const RECENT_SCORES = 20;
export function learnerPronunciation(db, userId) {
  const totals = pronunciationTotals();
  const recent = [];
  const rows = db
    .prepare("SELECT payload FROM sync_events WHERE user_id = ? AND type = 'answer' ORDER BY seq DESC")
    .iterate(userId);
  for (const row of rows) {
    const { result, day } = JSON.parse(row.payload);
    if (result.gameId !== PRONOUNCE_GAME || !result.phones) continue;
    totals.add(result);
    if (recent.length < RECENT_SCORES) {
      recent.push({ day, mode: result.mode || "words", word: result.word || "", score: result.score, ...(result.wpm ? { wpm: result.wpm } : {}) });
    }
  }
  // Counted for one learner, so the learner counts are left out.
  const drop = ({ learners, ...rest }) => rest;
  const s = totals.summary({ max: 10 });
  return { answers: s.answers, modes: s.modes.map(drop), sounds: s.sounds.map(drop), hardest: s.items.map(drop), recent };
}

// How one learner has gone wrong: counts by kind over their synced answers,
// and the latest mistakes with what they answered.
const RECENT_MISTAKES = 30;
function learnerMistakes(db, userId) {
  const kinds = {};
  const recent = [];
  const rows = db
    .prepare("SELECT payload FROM sync_events WHERE user_id = ? AND type = 'answer' ORDER BY seq DESC")
    .iterate(userId);
  for (const row of rows) {
    const { result, day } = JSON.parse(row.payload);
    for (const m of answerMistakes(result)) {
      kinds[m.kind] = (kinds[m.kind] || 0) + 1;
      if (recent.length < RECENT_MISTAKES) recent.push({ day, game: result.gameId, word: result.word || "", given: m.given, kind: m.kind });
    }
  }
  return { kinds, recent };
}
