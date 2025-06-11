import React, { useState, useEffect } from "react";
import i18n from "../i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import HamburgerMenu from "./HamburgerMenu";
import HangmanDrawing from "./HangmanDrawing";
import { useSearchParams } from "react-router-dom";
import { COMMON_WORDS } from "../commonWords";

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
      if (key.length === 1 && getAlphabet(learningLang).includes(key)) {
        handleGuess(key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [guesses, isWon, isLost, learningLang]);

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

  const handleNext = () => {
    if (isWon) setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
    if (isLost) setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
    let newWordsOrder = [...wordsOrder];
    if (isLost) {
      // Move current word to end
      const idx = currentIndex % wordsOrder.length;
      const [lostIdx] = newWordsOrder.splice(idx, 1);
      newWordsOrder.push(lostIdx);
      setWordsOrder(newWordsOrder);
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
    setShowAllGuessed(false);
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
    setShowAllGuessed(false);
  }, [restartFlag]);
  if (!current) return <div>{t.noWords}</div>;
  const timeValue = COMMON_WORDS.find(w => w[learningLang] === current.learning)?.time;
  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <Card>
        <CardContent className="text-center p-4">
          <div className="flex justify-end mb-2">
            <HamburgerMenu lang={lang} setLang={setLang} onRestart={handleRestart} darkMode={darkMode} setDarkMode={setDarkMode} />
          </div>
          {/* Show current round and rounds left */}
          <div className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t.round || "Round"}: {currentIndex + 1} / {wordsOrder.length}
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
          <HangmanDrawing incorrect={incorrect.length} t={t} />
          {/* Split word into lines if too long */}
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
              return (
                <Button
                  key={l}
                  variant="outline"
                  size="sm"
                  disabled={guesses.includes(l) || isWon || isLost}
                  onClick={() => handleGuess(l)}
                  className={isIncorrect ? "text-red-600 px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50" : "px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50"}
                >
                  {l}
                </Button>
              );
            })}
            {(isWon || isLost) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 rounded z-10">
                <p className="text-lg font-semibold mb-2" data-testid="guessed">
                  {isWon ? t.guessed : `${t.answerWas}: ${learning.toUpperCase()}`}
                </p>
                <p className="mb-2">
                  {isWon
                    ? `${t.score}: ${t.correct} ${score.correct + 1} / ${t.incorrect} ${score.incorrect}`
                    : `${t.score}: ${t.correct} ${score.correct} / ${t.incorrect} ${score.incorrect + 1}`}
                </p>
                <p className="mb-2">
                  {t.totalScore || "Total score"}: {totalScore} 

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
