import React from "react";
import { Button } from "@/components/ui/button";

export default function PowerupButtons({
  totalScore,
  powerupCooldown,
  swap,
  nativeLang,
  learningLang,
  getAlphabet,
  letters,
  isGuessable,
  guesses,
  removedLetters,
  handleRemoveIncorrect,
  handleFiftyFifty,
  handleNuke,
  fiftyFifty,
  t
}) {
  return (
    <div className="flex flex-col gap-2 items-stretch absolute right-0 top-0">
      <Button
        size="sm"
        variant="secondary"
        disabled={totalScore < 25 || powerupCooldown || getAlphabet(swap ? nativeLang : learningLang).filter(l => !letters.some(wl => isGuessable(wl) && wl === l) && !guesses.includes(l) && !removedLetters.includes(l)).length === 0}
        onClick={handleRemoveIncorrect}
        className="px-2 py-1 border rounded disabled:opacity-50 w-10 h-10 flex items-center justify-center"
        title={t.removeIncorrectDesc || "Remove an incorrect letter (25 points)"}
      >
        <span className="flex flex-col items-center justify-center">
          <span>💣</span>
          <span className="text-xs font-semibold">(25)</span>
        </span>
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={totalScore < 15 || fiftyFifty.active || powerupCooldown || letters.filter(l => isGuessable(l) && !guesses.includes(l)).length === 0}
        onClick={handleFiftyFifty}
        className="px-2 py-1 border rounded disabled:opacity-50 w-10 h-10 flex items-center justify-center"
        title={t.fiftyFiftyDesc || "50-50: Highlight 2 letters, one is correct (15 points)"}
      >
        <span className="flex flex-col items-center justify-center">
          <span>🎲</span>
          <span className="text-xs font-semibold">(15)</span>
        </span>
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={totalScore < 100 || powerupCooldown || getAlphabet(swap ? nativeLang : learningLang).filter(l => !letters.some(wl => isGuessable(wl) && wl === l) && !guesses.includes(l) && !removedLetters.includes(l)).length < 2}
        onClick={handleNuke}
        className="px-2 py-1 border rounded disabled:opacity-50 w-10 h-10 flex items-center justify-center"
        title={t.nukeDesc || "Nuke: Remove 2-6 incorrect letters (100 points)"}
      >
        <span className="flex flex-col items-center justify-center">
          <span>☢️</span>
          <span className="text-xs font-semibold">(100)</span>
        </span>
      </Button>
    </div>
  );
}
