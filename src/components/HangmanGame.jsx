import React, { useState, useEffect } from "react";
import i18n from "../i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import HamburgerMenu from "./HamburgerMenu";
import HangmanDrawing from "./HangmanDrawing";
import { useSearchParams } from "react-router-dom";
import { COMMON_WORDS } from "../commonWords";
import PowerupButtons from "./PowerupButtons";

const MAX_ATTEMPTS = 6;

function fromBase64Unicode(str) {
  return decodeURIComponent(escape(atob(str)));
}

function decodeWords(encoded) {
  try {
    const decoded = fromBase64Unicode(decodeURIComponent(encoded));
    return JSON.parse(decoded);
  } catch {
    return [
      { learning: "car", native: "auto" },
      { learning: "traffic light", native: "liikennevalo" }
    ];
  }
}

const getAlphabet = (lang) => {
  switch (lang) {
    case "fi": return "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖ".split("");
    case "de": return "AÄBCDEFGHIJKLMNOÖPQRSßTUÜVWXYZ".split("");
    case "fr": return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    case "es": return "AÁBCDEÉFGHIÍJKLMNÑOÓPQRSTUÚÜVWXYZ".split("");
    case "it": return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    case "sv": return "AÅÄBCDEFGHIJKLMNOPQRSTUVWXYZÖ".split("");
    case "pt": return "AÁÂÃÀBCÇDEÉÊFGHIÍJKLMNOÓÔÕPQRSTUÚÜVWXYZ".split("");
    case "nl": return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    case "pl": return "AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ".split("");
    case "cs": return "AÁBCČDĎEÉĚFGHIÍJKLMNŇOÓPQRŘSŠTŤUÚŮVWXZÝŽ".split("");
    case "ro": return "AĂÂBCDEFGHIÎJKLMNOPQRSȘTȚUVWXYZ".split("");
    case "hu": return "AÁBCDEÉFGHIÍJKLMNOÓÖŐPQRSTUÚÜŰVWXYZ".split("");
    case "tr": return "AÂBCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split("");
    case "en-GB":
    case "en":
    default:
      return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  }
};

// Utility to shuffle an array (Fisher-Yates)
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function HangmanGame({ lang, t, restartFlag, testWords = "", setLang, darkMode, setDarkMode }) {
  const [params] = useSearchParams();
  if (testWords !== "") {
    // If testWords is provided, use it instead of URL params
    params.set("words", testWords);
  }
  const encoded = params.get("words");
  const swapMode = params.get("swap") === "1";
  const learningLang = params.get("learningLang") || "en";
  const nativeLang = params.get("nativeLang") || "fi";
  // Shuffle words if loaded from URL param, otherwise pick 5 random from COMMON_WORDS (en-GB/fi)
  const words = React.useMemo(() => {
    if (encoded) {
      return shuffleArray(decodeWords(encoded));
    }
    // Pick 5 random words from COMMON_WORDS with en-GB and fi
    const filtered = COMMON_WORDS.filter(w => w["en-GB"] && w["fi"]);
    const shuffled = shuffleArray(filtered);
    return shuffled.slice(0, 5).map(w => ({ learning: w["en-GB"], native: w["fi"] }));
  }, [encoded]);

  const getInitialIndex = () => {
    return 0;
  };

  const getInitialGuesses = () => {
    return [];
  };

  const [currentIndex, setCurrentIndex] = useState(getInitialIndex);
  const [guesses, setGuesses] = useState(getInitialGuesses);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  // State for tracking guessed stats, attempts per word, and total score
  const [guessedWords, setGuessedWords] = useState([]);
  const [guessedStats, setGuessedStats] = useState({});
  const [wordAttempts, setWordAttempts] = useState({});
  const [totalScore, setTotalScore] = useState(0);
  // Track words order for moving lost words to end
  const [wordsOrder, setWordsOrder] = useState(words.map((_, i) => i));
  // Track total rounds (can increase if words are retried)
  const [totalRounds, setTotalRounds] = useState(words.length);
  // Popup for all words guessed
  const [showAllGuessed, setShowAllGuessed] = useState(false);

  // State for swapping learning/native word display
  const [swap, setSwap] = useState(false);
  useEffect(() => {
    // Randomly swap question/answer if swapMode is enabled
    if (swapMode) {
      setSwap(Math.random() < 0.5);
    } else {
      setSwap(false);
    }
  }, [currentIndex, restartFlag]);

  // Get the current word and its display forms
  const current = words[wordsOrder[currentIndex % wordsOrder.length]];
  const learning = swap ? current.native : current.learning;
  const native = swap ? current.learning : current.native;
  const letters = learning.toUpperCase().split("");
  // Helper to check if a character is guessable (must be in the current alphabet for the language)
  const alphabet = getAlphabet(swap ? nativeLang : learningLang);
  const isGuessable = (char) => alphabet.includes(char);
  // Incorrect guesses: guessed letters not in the word
  const incorrect = guesses.filter(
    g => !letters.some(l => isGuessable(l) && l === g)
  );
  // Correct guesses: guessed letters that are in the word
  const correctGuesses = guesses.filter(
    g => letters.some(l => isGuessable(l) && l === g)
  );
  // Count occurrences of a letter in the word
  const countLetterInWord = (letter, wordArr) =>
    wordArr.reduce((acc, l) => (l === letter ? acc + 1 : acc), 0);

  // Track attempts for each word
  useEffect(() => {
    const wordKey = learning.toLowerCase();
    if (!guessedWords.includes(wordKey)) {
      setWordAttempts(prev => ({
        ...prev,
        [wordKey]: (prev[wordKey] || 0) + 1
      }));
    }
  }, [currentIndex]);

  // Track number of guesses for the current word
  const [currentAttempts, setCurrentAttempts] = useState(0);
  useEffect(() => {
    setCurrentAttempts(guesses.length);
  }, [guesses]);

  // Handle a letter guess
  const handleGuess = (letter) => {
    if (guesses.includes(letter)) return;
    // If 50-50 is active, end the effect instantly
    if (fiftyFifty.active) {
      setFiftyFifty({ active: false, letters: [] });
      setPowerupCooldown(false);
    }
    setGuesses(prevGuesses => {
      const newGuesses = [...prevGuesses, letter];
      // Calculate score increment for this guess
      let scoreDelta = 0;
      if (letters.some(l => isGuessable(l) && l === letter)) {
        scoreDelta += 10 * countLetterInWord(letter, letters);
      } else {
        scoreDelta -= 10;
      }
      setTotalScore(prev => prev + scoreDelta);
      return newGuesses;
    });
  };

  // Check win/loss conditions
  const isWon = letters.every(
    l => !isGuessable(l) || guesses.includes(l)
  );
  const isLost = incorrect.length >= MAX_ATTEMPTS;
  const [roundScored, setRoundScored] = useState(false);

  // Keyboard support for guessing letters
  useEffect(() => {
    if (isWon || isLost) return;
    const onKeyDown = (e) => {
      const key = e.key.toUpperCase();
      const currentAlphabet = getAlphabet(swap ? nativeLang : learningLang);
      if (key.length === 1 && currentAlphabet.includes(key)) {
        handleGuess(key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [guesses, isWon, isLost, learningLang, nativeLang, swap]);

  // Allow space/enter to start next round after win/loss
  useEffect(() => {
    if (!(isWon || isLost)) return;
    const onNextKey = (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", onNextKey);
    return () => window.removeEventListener("keydown", onNextKey);
  }, [isWon, isLost]);

  // Score the round when won or lost
  useEffect(() => {
    if ((isWon || isLost) && !roundScored) {
      let roundScore = 0;
      if (isWon) {
        roundScore += 50;
        if (incorrect.length === 0) {
          roundScore += 25;
        }
      } else if (isLost) {
        roundScore -= 25;
      }
      setTotalScore(prev => prev + roundScore);
      setRoundScored(true);
    }
  }, [isWon, isLost, roundScored]);

  // Find the next unguessed word index
  const getNextUnguessedIndex = (currentIdx, guessedWordsArr) => {
    const total = wordsOrder.length;
    for (let i = 1; i <= total; ++i) {
      const idx = (currentIdx + i) % total;
      const wordKey = (words[wordsOrder[idx]].learning || "").toLowerCase();
      if (!guessedWordsArr.includes(wordKey)) return idx;
    }
    return null;
  };

  // Mark word as guessed if won
  useEffect(() => {
    if (isWon) {
      const wordKey = (learning || "").toLowerCase();
      if (!guessedWords.includes(wordKey)) {
        if (swapMode) {
          // Mark both directions as guessed
          const altKey = (swap ? current.learning : current.native).toLowerCase();
          setGuessedWords(prev => Array.from(new Set([...prev, wordKey, altKey])));
        } else {
          setGuessedWords(prev => [...prev, wordKey]);
        }
      }
    }
  }, [isWon]);

  // Track rounds played to prevent round counter from decreasing
  const [roundsPlayed, setRoundsPlayed] = useState(1);
  useEffect(() => {
    // Update rounds played only if not all guessed
    if (!showAllGuessed && currentIndex + 1 > roundsPlayed) {
      setRoundsPlayed(currentIndex + 1);
    }
  }, [currentIndex, showAllGuessed]);

  const handleNext = () => {
    if (showAllGuessed) return; // Prevent further play after all guessed
    if (isWon) setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
    if (isLost) setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
    let newWordsOrder = [...wordsOrder];
    if (isLost) {
      // Move current word to end
      const idx = currentIndex % wordsOrder.length;
      const [lostIdx] = newWordsOrder.splice(idx, 1);
      newWordsOrder.push(lostIdx);
      setWordsOrder(newWordsOrder);
      setTotalRounds(r => r + 1); // Increment total rounds for retry
    }
    const nextIndex = getNextUnguessedIndex(currentIndex, isWon
      ? [...guessedWords, (learning || "").toLowerCase()]
      : guessedWords
    );
    if (nextIndex === null) {
      setShowAllGuessed(true);
      return;
    }
    setCurrentIndex(nextIndex);
    setGuesses([]);
    setCurrentAttempts(0);
    setRoundScored(false);
    setRoundsPlayed(rp => Math.max(rp, nextIndex + 1));
  };
  const handleRestart = () => {
    setScore({ correct: 0, incorrect: 0 });
    setGuessedWords([]);
    setGuessedStats({});
    setWordAttempts({});
    setCurrentIndex(0);
    setGuesses([]);
    setTotalScore(0);
    setWordsOrder(words.map((_, i) => i));
    setTotalRounds(words.length); // Reset total rounds
    setShowAllGuessed(false);
    setRoundsPlayed(1);
    // re-randomize word order
    setWordsOrder(shuffleArray(words.map((_, i) => i)));
    setRoundScored(false);
    setSwap(swapMode ? Math.random() < 0.5 : false);
  };
  useEffect(() => {
    setScore({ correct: 0, incorrect: 0 });
    setGuessedWords([]);
    setGuessedStats({});
    setWordAttempts({});
    setCurrentIndex(0);
    setGuesses([]);
    setTotalScore(0);
    setWordsOrder(words.map((_, i) => i));
    setTotalRounds(words.length); // Reset total rounds
    setShowAllGuessed(false);
  }, [restartFlag]);
  if (!current) return <div>{t.noWords}</div>;
  const timeValue = COMMON_WORDS.find(w => w[learningLang] === current.learning)?.time;
  // Powerup state
  const [removedLetters, setRemovedLetters] = useState([]);
  const [fiftyFifty, setFiftyFifty] = useState({ active: false, letters: [] });
  const [powerupCooldown, setPowerupCooldown] = useState(false);
  const [explodingLetter, setExplodingLetter] = useState(null); // For explosion effect
  const [nukeExplodingLetters, setNukeExplodingLetters] = useState([]); // For nuke explosion effect

  // Remove incorrect letter powerup
  const handleRemoveIncorrect = () => {
    if (totalScore < 25 || powerupCooldown) return;
    // Find all available incorrect letters
    const available = getAlphabet(swap ? nativeLang : learningLang).filter(l =>
      !letters.some(wl => isGuessable(wl) && wl === l) &&
      !guesses.includes(l) &&
      !removedLetters.includes(l)
    );
    if (available.length === 0) return;
    const idx = Math.floor(Math.random() * available.length);
    const toRemove = available[idx];
    setExplodingLetter(toRemove); // Start explosion effect
    setTimeout(() => {
      setRemovedLetters(prev => [...prev, toRemove]);
      setExplodingLetter(null);
    }, 500); // Explosion duration
    setTotalScore(prev => prev - 25);
    setPowerupCooldown(true);
    setTimeout(() => setPowerupCooldown(false), 800); // Prevent spamming
  };

  // 50-50 powerup
  const handleFiftyFifty = () => {
    if (totalScore < 15 || fiftyFifty.active || powerupCooldown) return;
    // Find missing letters in the word
    const missing = letters.filter(l => isGuessable(l) && !guesses.includes(l));
    if (missing.length === 0) return;
    const nextMissing = missing[0];
    // Find all available letters (not guessed, not removed)
    const available = getAlphabet(swap ? nativeLang : learningLang).filter(l =>
      !guesses.includes(l) && !removedLetters.includes(l)
    );
    // Pick a random incorrect letter
    const incorrects = available.filter(l => !letters.some(wl => isGuessable(wl) && wl === l));
    let randomIncorrect = incorrects.length > 0 ? incorrects[Math.floor(Math.random() * incorrects.length)] : null;
    // If no incorrects, just pick another missing letter or any available
    if (!randomIncorrect) {
      const alt = available.find(l => l !== nextMissing);
      randomIncorrect = alt || nextMissing;
    }
    setFiftyFifty({ active: true, letters: [nextMissing, randomIncorrect] });
    setTotalScore(prev => prev - 15);
    setPowerupCooldown(true);
    setTimeout(() => {
      setFiftyFifty({ active: false, letters: [] });
      setPowerupCooldown(false);
    }, 5000); // Highlight for 2 seconds
  };

  // Nuke powerup
  const handleNuke = () => {
    if (totalScore < 100 || powerupCooldown) return;
    // Find all available incorrect letters
    const available = getAlphabet(swap ? nativeLang : learningLang).filter(l =>
      !letters.some(wl => isGuessable(wl) && wl === l) &&
      !guesses.includes(l) &&
      !removedLetters.includes(l)
    );
    if (available.length === 0) return;
    const count = Math.min(available.length, Math.floor(Math.random() * 5) + 2); // 2-6
    const shuffled = shuffleArray(available);
    const toRemove = shuffled.slice(0, count);
    setNukeExplodingLetters(toRemove);
    setTimeout(() => {
      setRemovedLetters(prev => [...prev, ...toRemove]);
      setNukeExplodingLetters([]);
    }, 500); // Explosion duration
    setTotalScore(prev => prev - 100);
    setPowerupCooldown(true);
    setTimeout(() => setPowerupCooldown(false), 1000); // Prevent spamming
  };

  // Reset powerups on new word
  useEffect(() => {
    setRemovedLetters([]);
    setFiftyFifty({ active: false, letters: [] });
    setPowerupCooldown(false);
    setNukeExplodingLetters([]);
  }, [currentIndex, restartFlag]);

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <Card>
        <CardContent className="text-center p-4">
          {/* Menu and round indicator on the same row */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex-1 flex justify-center">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {(showAllGuessed ? (t.round || "Round") + ": " + totalRounds + " / " + totalRounds : (t.round || "Round") + ": " + roundsPlayed + " / " + totalRounds)}
              </span>
            </div>
            <HamburgerMenu lang={lang} setLang={setLang} onRestart={handleRestart} darkMode={darkMode} setDarkMode={setDarkMode} />
          </div>
          <h2 className="text-xl font-semibold" data-testid="native-word">{t.meaning}: {native}</h2>
          {timeValue && (
            <div className="mb-2 text-blue-600 dark:text-blue-300 text-base">
              {Array.isArray(timeValue) ? timeValue.join(" / ") : timeValue}
            </div>
          )}
          <div className="text-right text-sm font-semibold mb-2">
            {t.score}: {totalScore}
          </div>
          {/* Drawing and Powerups side by side */}
          <div className="flex flex-row justify-center items-start gap-4 mb-2 relative">
            <div className="flex-shrink-0">
              <HangmanDrawing incorrect={incorrect.length} t={t} />
            </div>
            <PowerupButtons
              totalScore={totalScore}
              powerupCooldown={powerupCooldown}
              swap={swap}
              nativeLang={nativeLang}
              learningLang={learningLang}
              getAlphabet={getAlphabet}
              letters={letters}
              isGuessable={isGuessable}
              guesses={guesses}
              removedLetters={removedLetters}
              handleRemoveIncorrect={handleRemoveIncorrect}
              handleFiftyFifty={handleFiftyFifty}
              handleNuke={handleNuke}
              fiftyFifty={fiftyFifty}
              t={t}
            />
          </div>
          <div className="text-2xl tracking-widest my-4">
            {(() => {
              const maxPerLine = 12;
              const wordGroups = [];
              let currentGroup = [];
              let currentLen = 0;
              for (let i = 0; i < letters.length; i++) {
                const l = letters[i];
                if (l === ' ' && currentLen >= maxPerLine) {
                  wordGroups.push(currentGroup);
                  currentGroup = [];
                  currentLen = 0;
                }
                currentGroup.push({ l, i });
                currentLen++;
              }
              if (currentGroup.length) wordGroups.push(currentGroup);
              return wordGroups.map((group, idx) => (
                <div key={idx} className="flex justify-center">
                  {group.map(({ l, i }) => (
                    <span key={i} className="inline-block w-6" data-testid={`letter-${i}`}>
                      {l === ' '
                        ? ' '
                        : isGuessable(l)
                          ? (guesses.includes(l) ? l : "_")
                          : l}
                    </span>
                  ))}
                </div>
              ));
            })()}
          </div>
          <div className="text-red-500" data-testid="word-display">{t.wrongGuesses}: {incorrect.join(", ")}</div>
          <div className="mt-4 flex flex-wrap gap-2 justify-center relative">
            {getAlphabet(swap ? nativeLang : learningLang).map(l => {
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
          {showAllGuessed && (
            <div className="fixed inset-0 flex items-center justify-center bg-neutral-950/80 z-50">
              <div className="bg-white dark:bg-gray-800 p-8 rounded shadow-lg text-center">
                <h3 className="text-2xl font-bold mb-4">{t.allGuessed || "All words completed!"}</h3>
                <p className="mb-4">{t.score}: {totalScore}</p>
                <Button onClick={handleRestart}>{t.restart || "Restart"}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Add this to your CSS (e.g., index.css or a global stylesheet):
// .animate-explode {
//   animation: explode 0.5s linear;
// }
// @keyframes explode {
//   0% { transform: scale(1) rotate(0deg); opacity: 1; }
//   60% { transform: scale(1.4) rotate(20deg); opacity: 0.7; }
//   100% { transform: scale(0.2) rotate(-30deg); opacity: 0; }
// }
