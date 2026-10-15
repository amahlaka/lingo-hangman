// Reports of problems and content suggestions, sent to the optional backend
// (server/src/routes/feedback.js). They go through a small outbox in
// localStorage, so nothing typed is lost when the connection drops or the
// learner first has to sign in: flushFeedback() sends what is waiting.

import { api } from "./backend";

const OUTBOX_KEY = "lingo.feedback.outbox.v1";
const MAX_WAITING = 50;

export const REPORT_REASONS = ["wrong_answer", "typo", "bad_audio", "confusing", "other"];
// Say it: the microphone check can be what went wrong.
export const SAY_REPORT_REASONS = ["misheard", "bad_audio", "typo", "confusing", "other"];
export const reportReasonsFor = (game) => (game === "say" ? SAY_REPORT_REASONS : REPORT_REASONS);
export const SUGGESTION_KINDS = ["word", "phrase", "sentence"];

/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ === "undefined" ? "dev" : __APP_VERSION__;

function read(storage) {
  try {
    const list = JSON.parse(storage.getItem(OUTBOX_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(storage, list) {
  try {
    if (list.length) storage.setItem(OUTBOX_KEY, JSON.stringify(list));
    else storage.removeItem(OUTBOX_KEY);
  } catch {
    /* private mode: it is sent now or not at all */
  }
}

const newId = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9_-]/g, "");

// Text values (and numbers) of a question, a level deep, cut short: enough
// for the admin queue to show what the learner saw.
export function describeQuestion(question, depth = 0) {
  if (!question || typeof question !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(question)) {
    if (Object.keys(out).length >= 16) break;
    if (typeof value === "string") out[key] = value.slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (Array.isArray(value) && depth === 0) {
      const items = value.slice(0, 8).map((v) => (typeof v === "string" ? v.slice(0, 80) : typeof v === "object" ? describeQuestion(v, 1) : v));
      out[key] = items;
    } else if (value && typeof value === "object" && depth === 0) out[key] = describeQuestion(value, 1);
  }
  return out;
}

// The word base id a question is about, when it has one; else its answer
// (before the learner has finished, the word they are asked to say or write).
export function itemRefFor(question, answer) {
  const id = question?.itemId || question?.target?.id || question?.id;
  if (typeof id === "string" && id) return id.slice(0, 200);
  return `answer:${String(answer || question?.learning || "").slice(0, 180)}`;
}

export function pendingFeedback(storage = window.localStorage) {
  return read(storage).length;
}

// Adds a report ({ game, itemRef, reason, comment, context }) or a suggestion
// ({ kind, text, meaning, note }) to the outbox.
export function queueFeedback(type, body, storage = window.localStorage) {
  const list = read(storage).slice(-(MAX_WAITING - 1));
  list.push({ type, body: { ...body, clientId: newId() } });
  write(storage, list);
}

// Sends what is waiting. Resolves to { sent, waiting, signedOut, offline }.
export async function flushFeedback(storage = window.localStorage) {
  const list = read(storage);
  const keep = [];
  let sent = 0;
  let signedOut = false;
  let offline = false;
  for (const entry of list) {
    if (signedOut || offline) {
      keep.push(entry);
      continue;
    }
    const res = await api(entry.type === "suggestion" ? "/suggestions" : "/reports", { method: "POST", body: entry.body });
    if (res.ok) sent++;
    else if (res.status === 401) {
      signedOut = true;
      keep.push(entry);
    } else if (res.status === 0 || res.status === 429 || res.status >= 500) {
      offline = true;
      keep.push(entry);
    }
    // Anything else (400) can never be sent and is dropped.
  }
  write(storage, keep);
  return { sent, waiting: keep.length, signedOut, offline };
}
