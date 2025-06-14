import React from "react";
import { Button } from "@/components/ui/button";
import englishLayout from "./keyboardLayouts/english";
import finnishLayout from "./keyboardLayouts/finnish";
import swedishLayout from "./keyboardLayouts/swedish";

// Utility: QWERTY order for supported languages
const QWERTY_ORDER = [
  "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P",
  "A", "S", "D", "F", "G", "H", "J", "K", "L",
  "Z", "X", "C", "V", "B", "N", "M"
];

function getKeyboardRows(alphabet, lang) {
  // Use predefined layouts for supported languages
  if (lang === "en" || lang === "en-GB") return englishLayout;
  if (lang === "fi") return finnishLayout;
  if (lang === "sv") return swedishLayout;
  // Otherwise, fallback to grid
  const upperAlphabet = alphabet.map(l => l.toUpperCase());
  const rows = [];
  for (let i = 0; i < upperAlphabet.length; i += 10) {
    rows.push(upperAlphabet.slice(i, i + 10));
  }
  return rows;
}

export default function HangmanKeyboard({
  alphabet,
  lang, // <-- make sure this is passed from parent
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
  extraLetters = [],
  layout, // unused now, always use alphabet
}) {
  // Dynamically build rows from alphabet and lang
  const rows = getKeyboardRows(alphabet, lang);

  // Helper to render a row
  const renderRow = (row, rowIdx) => {
    const maxRowLength = Math.max(...rows.map(r => r.length));
    // Dynamically calculate offsets for any layout
    let leftPad = 0, rightPad = 0;
    const pad = maxRowLength - row.length;
    if (rows.length === 3) {
      if (rowIdx === 1) {
        // Middle row: half-key offset if needed
        leftPad = Math.floor(pad / 2) + (pad % 2 ? 0.5 : 0);
        rightPad = maxRowLength - row.length - leftPad;
      } else if (rowIdx === 2) {
        // Bottom row: center, but if odd, add extra 0.5 for more natural stagger
        leftPad = Math.floor(pad / 2) + (pad % 2 ? 0.5 : 0);
        rightPad = maxRowLength - row.length - leftPad;
      } else {
        leftPad = Math.floor(pad / 2);
        rightPad = pad - leftPad;
      }
    } else {
      leftPad = Math.floor(pad / 2);
      rightPad = pad - leftPad;
    }
    // Render half/one-and-half key offsets as empty spans with flex-[0.5] or flex-[1.5]
    const padSpan = (amt, key) => {
      const full = Math.floor(amt);
      const half = amt - full;
      return [
        ...Array(full).fill(null).map((_, i) => <span key={key + '-full-' + i} className="flex-1 max-w-[40px] min-w-0" />),
        half > 0 ? <span key={key + '-half'} className="flex-[0.5] max-w-[20px] min-w-0" /> : null
      ];
    };
    return (
      <div key={rowIdx} className="flex justify-center gap-1 w-full">
        {padSpan(leftPad, 'pad-left')}
        {row.map(l => {
          const isIncorrect = guesses.includes(l) && !letters.some(wl => isGuessable(wl) && wl === l);
          const isRemoved = removedLetters.includes(l);
          const isFifty = fiftyFifty.active && fiftyFifty.letters.includes(l);
          const isExploding = explodingLetter === l;
          const isNukeExploding = nukeExplodingLetters.includes(l);
          return (
            <span key={l} className="relative flex-1 max-w-[40px] min-w-0">
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
                  " w-full aspect-square px-0 py-0 border rounded hover:bg-gray-100 disabled:opacity-50 flex items-center justify-center text-2xl max-w-full max-h-full"
                }
              >
                <span className="block w-full h-full text-center align-middle mx-auto flex items-center justify-center">
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
        {padSpan(rightPad, 'pad-right')}
      </div>
    );
  };

  // Responsive: show on mobile portrait, hide on desktop
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-900 shadow-lg p-2 pb-4 rounded-t-lg w-full max-w-md mx-auto md:hidden flex flex-col items-center transition-all" style={{touchAction: 'manipulation'}}>
      <div className="flex flex-col gap-2 w-full">
        {rows.map(renderRow)}
        {extraLetters.length > 0 && (
          <div className="flex justify-center gap-1 w-full mt-1">
            {extraLetters.map(l => renderRow([l], l))}
          </div>
        )}
      </div>
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
