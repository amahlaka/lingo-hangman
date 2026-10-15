import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  dayKey,
  dayStats,
  learnedWordCount,
  levelInfo,
  loadProgress,
  normalizeProgress,
  progressSummary,
  recordWord as recordWordPure,
  saveProgress,
  setDailyGoal as setDailyGoalPure,
  streakStatus,
} from "../lib/progress";
import {
  accentVars,
  buyItem as buyItemPure,
  equipItem as equipItemPure,
  equippedValues,
  gemBalance,
} from "../lib/cosmetics";
import { useSettings } from "./SettingsContext";
import GemToast from "../components/lingo/GemToast";
import SyncChoice from "./SyncChoice";
import { api, backendAvailable } from "../lib/backend";
import { MAX_BATCH, emptySync, loadSync, saveSync } from "../lib/sync";
import { applyEvents, cleanEvent, makeEvent } from "../lib/syncEvents";

// Shared progress for every game. See src/lib/progress.js for the rules and
// src/games/README.md for how a game reports a finished word.

const ProgressContext = createContext(null);

const WORD_STREAK_MILESTONE = 5;
// How long after a change the events are sent, so a round sends once.
const SYNC_DELAY_MS = 3000;

// gameIds: ids of all playable games, for the "play every game" achievement.
export function ProgressProvider({ children, storage, gameIds = [] }) {
  const store = storage === undefined ? globalThis.localStorage : storage;
  const [state, setState] = useState(() => loadProgress(store));
  // Words solved in a row during this visit; not saved.
  const [wordStreak, setWordStreak] = useState(0);
  const wordStreakRef = useRef(0);
  const gameIdsRef = useRef(gameIds);
  gameIdsRef.current = gameIds;
  const stateRef = useRef(state);
  stateRef.current = state;
  // The last gems earned, for the "+N gems" toast.
  const [gemToast, setGemToast] = useState(null);
  const clearGemToast = useCallback(() => setGemToast(null), []);

  useEffect(() => {
    saveProgress(state, store);
  }, [state, store]);

  // ---- Sync (only while signed in; see src/lib/sync.js) ----
  const syncRef = useRef(null);
  if (syncRef.current === null) syncRef.current = loadSync(store);
  const linkedUser = (sync) => (sync.paused ? null : sync.user);
  const [syncUser, setSyncUser] = useState(linkedUser(syncRef.current));
  // { email, account, device } while the learner chooses how to combine.
  const [syncChoice, setSyncChoice] = useState(null);
  const sending = useRef(false);
  const timer = useRef(null);

  const writeSync = useCallback(
    (next) => {
      syncRef.current = next;
      saveSync(next, store);
      setSyncUser(linkedUser(next));
    },
    [store]
  );

  // Send waiting events; the reply is the account's progress, and this
  // device's state becomes that plus anything recorded meanwhile.
  const flushSync = useCallback(async () => {
    clearTimeout(timer.current);
    const sync = syncRef.current;
    if (!sync.user || sync.paused || sending.current) return;
    sending.current = true;
    const batch = sync.outbox.slice(0, MAX_BATCH);
    const res = await api("/sync", {
      method: "POST",
      body: { events: batch, gameIds: gameIdsRef.current, ...(sync.reset ? { reset: true } : {}) },
    });
    sending.current = false;
    if (!res.ok) {
      // A bad batch would block every later one; drop it (the progress itself stays on this device).
      if (res.status === 400) writeSync({ ...syncRef.current, outbox: syncRef.current.outbox.slice(batch.length) });
      return;
    }
    const sent = new Set(batch.map((e) => e.id));
    const rest = syncRef.current.outbox.filter((e) => !sent.has(e.id));
    writeSync({ ...syncRef.current, outbox: rest, reset: false });
    const next = applyEvents(normalizeProgress(res.data.state), rest, { gameIds: gameIdsRef.current });
    stateRef.current = next;
    setState(next);
    if (rest.length) flushSync();
  }, [writeSync]);

  const queueEvent = useCallback(
    (type, payload) => {
      const sync = syncRef.current;
      const event = cleanEvent(makeEvent(type, payload));
      if (!sync.user || !event) return;
      writeSync({ ...sync, outbox: [...sync.outbox, event] });
      clearTimeout(timer.current);
      timer.current = setTimeout(flushSync, SYNC_DELAY_MS);
    },
    [writeSync, flushSync]
  );

  const link = useCallback(
    (email, outbox, reset = false) => writeSync({ ...emptySync(), user: email, outbox, reset }),
    [writeSync]
  );

  // Link this device to the signed-in account: the first time, the device's
  // progress joins the account (or the learner chooses, when both have some).
  const connectSync = useCallback(async () => {
    const res = await api("/sync");
    if (!res.ok) return;
    const { email, state: account } = res.data;
    const device = stateRef.current;
    const deviceHas = device.totals.words > 0 || device.xp > 0;
    // Already linked: carry on. (An account that has nothing, say one deleted
    // and made again, takes this device's progress as new below.)
    if (syncRef.current.user === email && (account || !deviceHas)) {
      writeSync({ ...syncRef.current, paused: false });
      return flushSync();
    }
    const accountHas = Boolean(account && account.totals.words > 0);
    if (deviceHas && accountHas) {
      setSyncChoice({ email, account: progressSummary(account), device: progressSummary(device), accountState: account });
      return;
    }
    if (deviceHas) link(email, [makeEvent(account ? "merge" : "baseline", { state: device })]);
    else link(email, []);
    return flushSync();
  }, [flushSync, link, writeSync]);

  // "combine" | "account" | "device"
  const resolveSyncChoice = useCallback(
    (how) => {
      const choice = syncChoice;
      if (!choice) return;
      setSyncChoice(null);
      const device = stateRef.current;
      if (how === "combine") link(choice.email, [makeEvent("merge", { state: device })]);
      else if (how === "device") link(choice.email, [makeEvent("baseline", { state: device })], true);
      else link(choice.email, []);
      flushSync();
    },
    [syncChoice, link, flushSync]
  );

  // Signing out keeps the progress on this device and stops sending it.
  // Changes still wait in the outbox, for when the same account signs in again.
  const disconnectSync = useCallback(() => {
    clearTimeout(timer.current);
    setSyncChoice(null);
    writeSync({ ...syncRef.current, paused: true });
  }, [writeSync]);

  useEffect(() => {
    let live = true;
    backendAvailable().then((ok) => live && ok && connectSync());
    const onOnline = () => flushSync();
    const onHide = () => document.visibilityState === "hidden" && flushSync();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      live = false;
      clearTimeout(timer.current);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [connectSync, flushSync]);

  // Report one finished word. Returns what happened, for celebrations:
  // { xpGained, levelUp, goalReached, streakChange, newAchievements,
  //   wordLearned, gemsGained, gemReasons, wordStreak, wordStreakMilestone }
  const recordWord = useCallback((result) => {
    const day = dayKey();
    const { state: next, events } = recordWordPure(stateRef.current, result, {
      day,
      gameIds: gameIdsRef.current,
    });
    stateRef.current = next;
    setState(next);
    queueEvent("answer", { result, day });
    if (events.gemsGained) setGemToast({ n: events.gemsGained, reasons: events.gemReasons, key: Date.now() });
    const nextWordStreak = result.solved ? wordStreakRef.current + 1 : 0;
    wordStreakRef.current = nextWordStreak;
    setWordStreak(nextWordStreak);
    return {
      ...events,
      wordStreak: nextWordStreak,
      wordStreakMilestone:
        nextWordStreak > 0 && nextWordStreak % WORD_STREAK_MILESTONE === 0 ? nextWordStreak : null,
    };
  }, [queueEvent]);

  const setDailyGoal = useCallback((goal) => {
    const next = setDailyGoalPure(stateRef.current, goal);
    stateRef.current = next;
    setState(next);
    queueEvent("goal", { goal });
  }, [queueEvent]);

  // Shop: buy an item with gems (and put it in use), or switch to an owned
  // one. buyItem returns { ok, reason } like cosmetics.buyItem.
  const buyItem = useCallback((id) => {
    const { state: next, ok, reason } = buyItemPure(stateRef.current, id);
    if (ok) {
      stateRef.current = next;
      setState(next);
      queueEvent("buy", { id });
    }
    return { ok, reason };
  }, [queueEvent]);

  const equipItem = useCallback((id) => {
    const next = equipItemPure(stateRef.current, id);
    stateRef.current = next;
    setState(next);
    queueEvent("equip", { id });
  }, [queueEvent]);

  // The bought accent colour replaces the lake tokens on <html>.
  const cosmetics = useMemo(() => equippedValues(state), [state]);
  const { dark } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    const vars = accentVars(cosmetics.accent, dark);
    for (const [name, value] of Object.entries(vars)) {
      if (cosmetics.accent === "lake") root.style.removeProperty(name);
      else root.style.setProperty(name, value);
    }
  }, [cosmetics.accent, dark]);

  const value = useMemo(() => {
    const todayStats = dayStats(state, dayKey());
    return {
      state,
      xp: state.xp,
      level: levelInfo(state.xp),
      streak: streakStatus(state),
      today: todayStats,
      dailyGoal: state.dailyGoal,
      learnedWords: learnedWordCount(state),
      wordStreak,
      recordWord,
      setDailyGoal,
      gems: gemBalance(state),
      cosmetics,
      buyItem,
      equipItem,
      sync: { user: syncUser, connect: connectSync, disconnect: disconnectSync },
    };
  }, [state, wordStreak, recordWord, setDailyGoal, cosmetics, buyItem, equipItem, syncUser, connectSync, disconnectSync]);

  return (
    <ProgressContext.Provider value={value}>
      {children}
      <GemToast toast={gemToast} onDone={clearGemToast} />
      {syncChoice && <SyncChoice choice={syncChoice} onChoose={resolveSyncChoice} />}
    </ProgressContext.Provider>
  );
}

// For shared pieces that also render outside the providers (in tests):
// the progress, or null.
export function useOptionalProgress() {
  return useContext(ProgressContext);
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used inside <ProgressProvider>");
  return ctx;
}
