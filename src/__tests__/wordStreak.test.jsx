import React from "react";
import { act, renderHook } from "@testing-library/react";
import { ProgressProvider, useProgress } from "../app/ProgressContext";
import { SettingsProvider } from "../app/SettingsContext";

const right = { gameId: "hangman", word: "cat", lang: "en", solved: true, perfect: true, triesLeft: 6 };

describe("right in a row", () => {
  it("celebrates every five first-try answers and starts again with each round", () => {
    const wrapper = ({ children }) => (
      <SettingsProvider>
        <ProgressProvider storage={null}>{children}</ProgressProvider>
      </SettingsProvider>
    );
    const { result } = renderHook(() => useProgress(), { wrapper });
    let events;
    for (let i = 0; i < 4; i++) act(() => void (events = result.current.recordWord(right)));
    expect(events.wordStreak).toBe(4);
    act(() => result.current.resetWordStreak());
    for (let i = 0; i < 4; i++) act(() => void (events = result.current.recordWord(right)));
    expect(events.wordStreakMilestone).toBeNull();
    act(() => void (events = result.current.recordWord(right)));
    expect(events.wordStreakMilestone).toBe(5);
  });
});
