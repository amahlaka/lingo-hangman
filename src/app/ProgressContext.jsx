import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  dayKey,
  dayStats,
  learnedWordCount,
  levelInfo,
  loadProgress,
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

// Shared progress for every game. See src/lib/progress.js for the rules and
// src/games/README.md for how a game reports a finished word.

const ProgressContext = createContext(null);

const WORD_STREAK_MILESTONE = 5;

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

  // Report one finished word. Returns what happened, for celebrations:
  // { xpGained, levelUp, goalReached, streakChange, newAchievements,
  //   wordLearned, gemsGained, gemReasons, wordStreak, wordStreakMilestone }
  const recordWord = useCallback((result) => {
    const { state: next, events } = recordWordPure(stateRef.current, result, {
      gameIds: gameIdsRef.current,
    });
    stateRef.current = next;
    setState(next);
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
  }, []);

  const setDailyGoal = useCallback((goal) => {
    setState((s) => setDailyGoalPure(s, goal));
  }, []);

  // Shop: buy an item with gems (and put it in use), or switch to an owned
  // one. buyItem returns { ok, reason } like cosmetics.buyItem.
  const buyItem = useCallback((id) => {
    const { state: next, ok, reason } = buyItemPure(stateRef.current, id);
    if (ok) {
      stateRef.current = next;
      setState(next);
    }
    return { ok, reason };
  }, []);

  const equipItem = useCallback((id) => {
    const next = equipItemPure(stateRef.current, id);
    stateRef.current = next;
    setState(next);
  }, []);

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
    };
  }, [state, wordStreak, recordWord, setDailyGoal, cosmetics, buyItem, equipItem]);

  return (
    <ProgressContext.Provider value={value}>
      {children}
      <GemToast toast={gemToast} onDone={clearGemToast} />
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
