// Play statistics on the app's side (docs/backend.md, "Play statistics";
// rules in ./playSession.js). Two things are sent, and only when the backend
// answers:
//
// - For everyone: "a visit" once per browser tab, and "a game started" at a
//   round's first answer. The API only adds 1 to an hourly count.
// - Signed in only: each play session (when it began and ended, which games
//   and how many rounds) and each round left unfinished, with a reason
//   guessed from how it was going. Without an account these are not kept.
//
// The open session and round are saved on the device, so a session cut off
// by the app being killed is still sent at the next start.

import { api, backendAvailable } from "./backend";
import { dayKey } from "./progress";
import { loadSync } from "./sync";
import { MAX_SESSION_MS, PEEK_MS, SESSION_GAP_MS, answerOutcome, giveUpReason } from "./playSession";

export const PLAY_KEY = "lingo.play.v1";
export const VISIT_KEY = "lingo.visit.v1";
const MAX_OUTBOX = 50;
const CHECK_EVERY_MS = 60_000;

const randomId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const emptyState = () => ({ session: null, game: null, round: null, outbox: { sessions: [], giveUps: [] } });

function load(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(PLAY_KEY) || "null");
    if (!saved || typeof saved !== "object" || !saved.outbox) return emptyState();
    return { ...emptyState(), ...saved };
  } catch {
    return emptyState();
  }
}

// Signed in and syncing: the same check as ProgressContext's, read from the
// sync record, so it is right from the first moment of a page load.
const syncedAccount = (storage) => {
  const sync = loadSync(storage);
  return Boolean(sync.user && !sync.paused);
};

// storage: localStorage; tabStorage: sessionStorage (one visit per tab);
// now: clock; post(path, body, keepalive) -> { ok, status }; available(): Promise<boolean>;
// isSignedIn(): whether a learner is signed in.
export function createPlayTracker({
  storage = globalThis.localStorage,
  tabStorage = globalThis.sessionStorage,
  now = () => Date.now(),
  post = (path, body, keepalive) => api(path, { method: "POST", body, keepalive }),
  available = backendAvailable,
  isSignedIn = () => syncedAccount(storage),
} = {}) {
  let state = load(storage);
  let sending = false;
  let pendingLeave = null;
  // A game still open in what was saved means the app was closed without
  // the page saying so (killed on a phone); wrapped up before anything else.
  let recovered = false;
  const recover = () => {
    if (recovered) return;
    recovered = true;
    const t = now();
    if (state.game) {
      // The round ended at its last answer.
      const r = state.round;
      closeGame("closed", r ? Math.max(r.lastAt || 0, r.openedAt || 0) : t);
    }
    if (state.session && t - state.session.lastAt > SESSION_GAP_MS) endSession();
    save();
  };

  const save = () => {
    try {
      storage?.setItem(PLAY_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: this visit's numbers are still sent.
    }
  };

  const count = (body, keepalive = false) =>
    available().then((ok) => ok && post("/play/count", body, keepalive)).catch(() => {});

  const gameEntry = (id) => {
    const games = state.session.games;
    if (!games[id]) games[id] = { rounds: 0, finished: 0 };
    return games[id];
  };

  function endSession() {
    const s = state.session;
    state.session = null;
    if (!s || !isSignedIn() || Object.keys(s.games).length === 0) return;
    const end = Math.min(s.lastAt, s.startedAt + MAX_SESSION_MS);
    const out = state.outbox.sessions;
    out.push({ id: s.id, day: s.day, startedAt: new Date(s.startedAt).toISOString(), endedAt: new Date(end).toISOString(), games: s.games });
    if (out.length > MAX_OUTBOX) out.splice(0, out.length - MAX_OUTBOX);
  }

  // Play happened at t: carry on the session, or start one (ending the last
  // if it was quiet for too long).
  function touch(t) {
    if (state.session && t - state.session.lastAt > SESSION_GAP_MS) endSession();
    if (!state.session) {
      state.session = { id: randomId(), day: dayKey(new Date(t)), startedAt: t, lastAt: t, games: {} };
      if (state.game) gameEntry(state.game);
    } else {
      state.session.lastAt = t;
    }
  }

  // The round in the open game ends without its end screen.
  function abandonRound(how, t) {
    const r = state.round;
    state.round = null;
    if (!r || r.done || !isSignedIn()) return;
    if (r.answers === 0 && t - r.openedAt < PEEK_MS) return;
    const out = state.outbox.giveUps;
    out.push({
      id: randomId(),
      at: new Date(t).toISOString(),
      game: r.game,
      reason: giveUpReason(r, t),
      how,
      answers: r.answers,
      ms: Math.max(0, Math.round(t - (r.startedAt || r.openedAt))),
    });
    if (out.length > MAX_OUTBOX) out.splice(0, out.length - MAX_OUTBOX);
  }

  function closeGame(how, t) {
    abandonRound(how, t);
    if (state.session && t - state.session.lastAt <= SESSION_GAP_MS) state.session.lastAt = Math.max(state.session.lastAt, t);
    state.game = null;
  }

  function finishPendingLeave() {
    if (!pendingLeave) return;
    clearTimeout(pendingLeave.timer);
    pendingLeave = null;
    closeGame("left", now());
    save();
  }

  async function flush(keepalive = false) {
    const { sessions, giveUps } = state.outbox;
    if (!isSignedIn() || sending || sessions.length + giveUps.length === 0) return;
    sending = true;
    try {
      if (!(await available())) return;
      const res = await post("/play/sessions", { sessions, giveUps }, keepalive);
      // Sent, refused as bad, or signed out: either way these are done.
      if (res.ok || res.status === 400 || res.status === 401) {
        const sentS = new Set(sessions.map((s) => s.id));
        const sentG = new Set(giveUps.map((g) => g.id));
        state.outbox = {
          sessions: state.outbox.sessions.filter((s) => !sentS.has(s.id)),
          giveUps: state.outbox.giveUps.filter((g) => !sentG.has(g.id)),
        };
        save();
      }
    } finally {
      sending = false;
    }
  }

  const tracker = {
    // The learner signed in or out. Sessions are only kept while signed in,
    // so signing out drops any still waiting.
    signedInChanged() {
      recover();
      if (!isSignedIn()) {
        state.outbox = { sessions: [], giveUps: [] };
        save();
      } else flush();
    },

    // At app start: count the visit, and send what is waiting.
    start() {
      recover();
      flush();
      try {
        if (!tabStorage?.getItem(VISIT_KEY)) {
          tabStorage?.setItem(VISIT_KEY, "1");
          count({ visit: true });
        }
      } catch {
        count({ visit: true });
      }
    },

    // A game's page opened (also when moving between pages of one game).
    openGame(id, t = now()) {
      recover();
      if (pendingLeave && pendingLeave.id === id) {
        clearTimeout(pendingLeave.timer);
        pendingLeave = null;
        return;
      }
      finishPendingLeave();
      state.game = id;
      touch(t);
      gameEntry(id);
      state.round = { game: id, openedAt: t, startedAt: null, lastAt: t, answers: 0, recent: [], done: false };
      save();
    },

    // A game's page closed. Waits a moment, since the next page may be the
    // same game (hangman's own-words page, then the game).
    leaveGame(id) {
      recover();
      if (state.game !== id) return;
      finishPendingLeave();
      pendingLeave = { id, timer: setTimeout(finishPendingLeave, 0) };
    },

    // An answer was recorded (ProgressContext.recordWord).
    answer(result, t = now()) {
      recover();
      if (!state.game) return;
      touch(t);
      let r = state.round;
      if (!r || r.done) r = state.round = { game: state.game, openedAt: t, startedAt: null, lastAt: t, answers: 0, recent: [], done: false };
      if (r.answers === 0) {
        r.startedAt = t;
        gameEntry(state.game).rounds += 1;
        count({ game: state.game });
      }
      r.answers += 1;
      r.lastAt = t;
      r.recent = [...r.recent, answerOutcome(result)].slice(-3);
      save();
    },

    // The round reached its end screen.
    finishRound(t = now()) {
      recover();
      const r = state.round;
      if (!r || r.done || r.answers === 0 || !state.game) return;
      r.done = true;
      touch(t);
      gameEntry(state.game).finished += 1;
      save();
    },

    // The page is going away (closed, reloaded or left).
    pageClosed(t = now()) {
      recover();
      if (pendingLeave) {
        clearTimeout(pendingLeave.timer);
        pendingLeave = null;
      }
      if (state.game) closeGame("closed", t);
      endSession();
      save();
      flush(true);
    },

    // Ends a session that has gone quiet; runs every minute.
    check(t = now()) {
      recover();
      if (state.session && t - state.session.lastAt > SESSION_GAP_MS) {
        endSession();
        save();
        flush();
      }
    },

    flush,
    // For tests.
    get state() {
      return state;
    },
  };
  return tracker;
}

let shared = null;
export function playTracker() {
  if (!shared) shared = createPlayTracker();
  return shared;
}

// Starts tracking for this page: the visit, page close and the quiet check.
// Returns a function that stops it.
export function startPlayTracking(tracker = playTracker()) {
  tracker.start();
  const onHide = () => tracker.pageClosed();
  const timer = setInterval(() => tracker.check(), CHECK_EVERY_MS);
  window.addEventListener("pagehide", onHide);
  return () => {
    clearInterval(timer);
    window.removeEventListener("pagehide", onHide);
  };
}
