// Progress sync: every change that matters is also an event, and an
// account's progress is all its events applied in time order. The same code
// runs in the app (src/app/ProgressContext.jsx) and in the API
// (server/src/routes/sync.js), so both arrive at the same state.
// See docs/backend.md ("Progress sync").
//
// Event: { id, at (ISO time), type, payload }
//   answer   { result, day }   a finished word, as recordWord takes it, plus
//                              `wrong` (what was answered on wrong tries),
//                              `skipped`, and Say it right's `score`, `mode`,
//                              `phones` and `wpm`
//   goal     { goal }          daily goal changed
//   buy      { id }            shop item bought (or one extra try)
//   use      { id }            one extra try used ("extra-try")
//   equip    { id }            owned item put in use
//   setting  { key, value }    a setting changed (src/lib/accountSettings.js)
//   record   { key, value }    a game record changed (best score, Daily word)
//   baseline { state }         the whole progress, replacing what was before
//                              (a device's progress joining an empty account)
//   merge    { state }         a device's progress added to the account's

import { mergeProgress, normalizeProgress, recordWord, setDailyGoal } from "./progress.js";
import { buyItem, equipItem, useExtraTry } from "./cosmetics.js";
import { cleanPronunciation } from "./pronunciationStats.js";
import { applyRecord, applySetting, cleanRecordPayload, cleanSettingPayload } from "./accountSettings.js";

export const EVENT_TYPES = ["answer", "goal", "buy", "equip", "use", "setting", "record", "baseline", "merge"];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_WRONG = 8;

const str = (v, max) => typeof v === "string" && v.length <= max;
const optStr = (v, max) => v === undefined || v === null || str(v, max);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// A recordWord result with only the fields it uses, or null when invalid.
function cleanResult(r) {
  if (!isObj(r) || typeof r.solved !== "boolean" || !str(r.gameId, 40) || !optStr(r.word, 200)) return null;
  if (!optStr(r.lang, 10) || !optStr(r.lesson, 120)) return null;
  const triesLeft = Number.isInteger(r.triesLeft) ? Math.min(Math.max(r.triesLeft, 0), 10) : 0;
  const out = { gameId: r.gameId, solved: r.solved, triesLeft, perfect: r.perfect === true };
  if (r.word) out.word = r.word;
  if (r.lang) out.lang = r.lang;
  if (r.lesson) out.lesson = r.lesson;
  if (Number.isFinite(r.ms) && r.ms > 0) out.ms = Math.round(r.ms);
  // What the learner answered on wrong tries (src/lib/mistakes.js).
  if (Array.isArray(r.wrong)) {
    const wrong = r.wrong.filter((w) => typeof w === "string" && w.trim()).slice(0, MAX_WRONG).map((w) => w.trim().slice(0, 120));
    if (wrong.length) out.wrong = wrong;
  }
  if (r.skipped === true) out.skipped = true;
  // Say it right: the score and how each sound went (src/lib/pronunciationStats.js).
  if (r.gameId === "say-right") Object.assign(out, cleanPronunciation(r));
  return out;
}

// The event as stored, or null when it is malformed. Received events go
// through this on the server; the app makes them with makeEvent.
export function cleanEvent(e) {
  if (!isObj(e) || !ID_RE.test(e.id || "") || !EVENT_TYPES.includes(e.type) || !str(e.at, 40)) return null;
  const at = new Date(e.at);
  if (Number.isNaN(at.getTime())) return null;
  const p = isObj(e.payload) ? e.payload : {};
  let payload;
  switch (e.type) {
    case "answer": {
      const result = cleanResult(p.result);
      if (!result || !DAY_RE.test(p.day || "")) return null;
      payload = { result, day: p.day };
      break;
    }
    case "goal":
      if (!Number.isInteger(p.goal)) return null;
      payload = { goal: p.goal };
      break;
    case "buy":
    case "equip":
    case "use":
      if (!str(p.id, 60)) return null;
      payload = { id: p.id };
      break;
    case "setting":
      payload = cleanSettingPayload(p);
      if (!payload) return null;
      break;
    case "record":
      payload = cleanRecordPayload(p);
      if (!payload) return null;
      break;
    default:
      if (!isObj(p.state)) return null;
      payload = { state: normalizeProgress(p.state) };
  }
  return { id: e.id, at: at.toISOString(), type: e.type, payload };
}

// One event applied to a progress state. ctx: { gameIds } for the Explorer badge.
export function applyEvent(state, event, ctx = {}) {
  const p = event.payload;
  switch (event.type) {
    case "answer":
      return recordWord(state, p.result, { day: p.day, gameIds: ctx.gameIds || [] }).state;
    case "goal":
      return setDailyGoal(state, p.goal);
    case "buy":
      return buyItem(state, p.id).state;
    case "equip":
      return equipItem(state, p.id);
    case "use":
      return p.id === "extra-try" ? useExtraTry(state).state : state;
    case "setting":
      return applySetting(state, p);
    case "record":
      return applyRecord(state, p);
    case "baseline":
      return normalizeProgress(p.state);
    case "merge":
      return mergeProgress(state, normalizeProgress(p.state));
    default:
      return state;
  }
}

export function applyEvents(state, events, ctx) {
  return events.reduce((s, e) => applyEvent(s, e, ctx), state);
}

const newId = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`).replace(/[^A-Za-z0-9_-]/g, "");

export function makeEvent(type, payload, at = new Date()) {
  return { id: newId(), at: at.toISOString(), type, payload };
}
