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

  useEffect(() => {
    saveProgress(state, store);
  }, [state, store]);

  // Report one finished word. Returns what happened, for celebrations:
  // { xpGained, levelUp, goalReached, streakChange, newAchievements,
  //   wordLearned, wordStreak, wordStreakMilestone }
  const recordWord = useCallback((result) => {
    const { state: next, events } = recordWordPure(stateRef.current, result, {
      gameIds: gameIdsRef.current,
    });
    stateRef.current = next;
    setState(next);
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
    };
  }, [state, wordStreak, recordWord, setDailyGoal]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used inside <ProgressProvider>");
  return ctx;
}
