import { useEffect } from "react";
import { playTracker } from "../lib/playTracker";

// Play statistics (src/lib/playTracker.js): App wraps every game page in
// TrackedGame, and each game calls useRoundFinished when its end screen shows.

export function TrackedGame({ id, children }) {
  useEffect(() => {
    const tracker = playTracker();
    tracker.openGame(id);
    return () => tracker.leaveGame(id);
  }, [id]);
  return children;
}

export function useRoundFinished(finished) {
  useEffect(() => {
    if (finished) playTracker().finishRound();
  }, [finished]);
}
