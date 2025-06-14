import React from "react";
import { Button } from "@/components/ui/button";

export default function HangmanKeyboard({
  alphabet,
  guesses,
  isWon,
  isLost,
  isGuessable,
  letters,
  handleGuess,
  removedLetters,
  fiftyFifty,
  explodingLetter,
  nukeExplodingLetters,
  t,
  score,
  totalScore,
  handleNext,
  learning,
}) {
  // Incorrect guesses: guessed letters not in the word
  const incorrect = guesses.filter(
    g => !letters.some(l => isGuessable(l) && l === g)
  );
  return (
    <div className="mt-4 flex flex-row flex-wrap gap-2 justify-center relative self-end">
      {alphabet.map(l => {
        const isIncorrect = guesses.includes(l) && !letters.some(wl => isGuessable(wl) && wl === l);
        const isRemoved = removedLetters.includes(l);
        const isFifty = fiftyFifty.active && fiftyFifty.letters.includes(l);
        const isExploding = explodingLetter === l;
        const isNukeExploding = nukeExplodingLetters.includes(l);
        return (
          <span key={l} className="relative">
            <Button
              variant="outline"
              size="sm"
              disabled={guesses.includes(l) || isWon || isLost || isRemoved || isExploding || isNukeExploding}
              onClick={() => handleGuess(l)}
              className={
                (isRemoved ? "opacity-80 !border-red-400 !text-red-400" : "") +
                (isFifty ? " !bg-yellow-200 !border-yellow-500 !text-black animate-pulse" : "") +
                (isIncorrect ? " text-red-600" : "") +
                (isExploding || isNukeExploding ? " animate-explode" : "") +
                " px-0 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 flex items-center justify-center text-2xl w-10 h-10 min-w-0 min-h-0"
              }
            >
              <span className="block w-6 h-6 text-center align-middle mx-auto">
                {isRemoved ? "💥" : l}
              </span>
            </Button>
            {(isExploding || isNukeExploding) && (
              <span className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <span className="text-2xl animate-bounce">💥</span>
              </span>
            )}
          </span>
        );
      })}
      {(isWon || isLost) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 rounded z-10">
          <p className="text-lg font-semibold mb-2" data-testid="guessed">
            {isWon ? t.guessed : `${t.answerWas}: ${learning.toUpperCase()}`}
          </p>
          <p className="mb-2">
            {isWon
              ? `${t.correct} ${score.correct + 1} / ${t.incorrect} ${score.incorrect}`
              : `${t.correct} ${score.correct} / ${t.incorrect} ${score.incorrect + 1}`}
          </p>
          <p className="mb-2">
            {t.score || "Total score"}: {totalScore} 
          </p>
          <Button onClick={handleNext}>
            {t.nextWord}
          </Button>
        </div>
      )}
    </div>
  );
}
