import React, { useState, useEffect } from "react";
import i18n from "../i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import HamburgerMenu from "./HamburgerMenu";
import HangmanDrawing from "./HangmanDrawing";
import { useSearchParams } from "react-router-dom";
import { COMMON_WORDS } from "../commonWords";

const MAX_ATTEMPTS = 6;
const STORAGE_KEY = "lingoHangmanProgress";
const SCORE_KEY = "lingoHangmanScore";

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

export default function HangmanGame({ lang, t, restartFlag }) {
  const [params] = useSearchParams();
  const encoded = params.get("words");
  const swapMode = params.get("swap") === "1";
  const learningLang = params.get("learningLang") || "en";
  const nativeLang = params.get("nativeLang") || "fi";
  const words = encoded ? decodeWords(encoded) : [
    { learning: "car", native: "auto" },
    { learning: "traffic light", native: "liikennevalo" }
  ];

  const getInitialIndex = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseInt(saved, 10) || 0;
    const guessed = JSON.parse(localStorage.getItem("lingoHangmanGuessedWords") || "[]");
    const unguessedIndexes = words
      .map((w, i) => (!guessed.includes((w.learning || "").toLowerCase()) ? i : null))
      .filter(i => i !== null);
    if (unguessedIndexes.length === 0) return 0;
    return unguessedIndexes[Math.floor(Math.random() * unguessedIndexes.length)];
  };

  const getInitialGuesses = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("lingoHangmanGuesses") || "[]");
      const savedIndex = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      if (
        Array.isArray(saved) &&
        savedIndex === getInitialIndex()
      ) {
        return saved;
      }
    } catch {}
    return [];
  };

  const [currentIndex, setCurrentIndex] = useState(getInitialIndex);
  const [guesses, setGuesses] = useState(getInitialGuesses);
  const [score, setScore] = useState(() => {
    const saved = localStorage.getItem(SCORE_KEY);
    return saved ? JSON.parse(saved) : { correct: 0, incorrect: 0 };
  });
  const [guessedWords, setGuessedWords] = useState(() => {
    const saved = localStorage.getItem("lingoHangmanGuessedWords");
    return saved ? JSON.parse(saved) : [];
  });
  const [guessedStats, setGuessedStats] = useState(() => {
    const saved = localStorage.getItem("lingoHangmanGuessedStats");
    return saved ? JSON.parse(saved) : {};
  });
  const [wordAttempts, setWordAttempts] = useState(() => {
    const saved = localStorage.getItem("lingoHangmanWordAttempts");
    return saved ? JSON.parse(saved) : {};
  });
  const [totalScore, setTotalScore] = useState(() => {
    const saved = localStorage.getItem("lingoHangmanTotalScore");
    return saved ? parseInt(saved, 10) : 0;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, currentIndex.toString());
    localStorage.setItem("lingoHangmanGuesses", JSON.stringify(guesses));
    localStorage.setItem(SCORE_KEY, JSON.stringify(score));
    localStorage.setItem("lingoHangmanGuessedWords", JSON.stringify(guessedWords));
    localStorage.setItem("lingoHangmanGuessedStats", JSON.stringify(guessedStats));
    localStorage.setItem("lingoHangmanWordAttempts", JSON.stringify(wordAttempts));
    localStorage.setItem("lingoHangmanTotalScore", totalScore.toString());
  }, [currentIndex, guesses, score, guessedWords, guessedStats, wordAttempts, totalScore]);

  const [swap, setSwap] = useState(false);
  useEffect(() => {
    if (swapMode) {
      setSwap(Math.random() < 0.5);
    } else {
      setSwap(false);
    }
  }, [currentIndex, restartFlag]);

  const current = words[currentIndex % words.length];
  const learning = swap ? current.native : current.learning;
  const native = swap ? current.learning : current.native;
  const letters = learning.toUpperCase().split("");
  const isGuessable = (char) => /^[A-Z]$/.test(char);
  const incorrect = guesses.filter(
    g => !letters.some(l => isGuessable(l) && l === g)
  );
  const correctGuesses = guesses.filter(
    g => letters.some(l => isGuessable(l) && l === g)
  );
  const countLetterInWord = (letter, wordArr) =>
    wordArr.reduce((acc, l) => (l === letter ? acc + 1 : acc), 0);
  useEffect(() => {
    const wordKey = learning.toLowerCase();
    if (!guessedWords.includes(wordKey)) {
      setWordAttempts(prev => ({
        ...prev,
        [wordKey]: (prev[wordKey] || 0) + 1
      }));
    }
  }, [currentIndex]);
  const [currentAttempts, setCurrentAttempts] = useState(0);
  useEffect(() => {
    setCurrentAttempts(guesses.length);
  }, [guesses]);
  const handleGuess = (letter) => {
    if (guesses.includes(letter)) return;
    setGuesses([...guesses, letter]);
  };
  const isWon = letters.every(
    l => !isGuessable(l) || guesses.includes(l)
  );
  const isLost = incorrect.length >= MAX_ATTEMPTS;
  const [roundScored, setRoundScored] = useState(false);
  useEffect(() => {
    if ((isWon || isLost) && !roundScored) {
      let roundScore = 0;
      for (const g of correctGuesses) {
        roundScore += 10 * countLetterInWord(g, letters);
      }
      roundScore -= 10 * incorrect.length;
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
  const getNextUnguessedIndex = (currentIdx, guessedWordsArr) => {
    const total = words.length;
    for (let i = 1; i <= total; ++i) {
      const idx = (currentIdx + i) % total;
      const wordKey = (words[idx].learning || "").toLowerCase();
      if (!guessedWordsArr.includes(wordKey)) return idx;
    }
    return null;
  };
  useEffect(() => {
    if (isWon) {
      const wordKey = (learning || "").toLowerCase();
      if (!guessedWords.includes(wordKey)) {
        setGuessedWords(prev => [...prev, wordKey]);
      }
    }
  }, [isWon]);
  const handleNext = () => {
    if (isWon) setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
    if (isLost) setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));
    const nextIndex = getNextUnguessedIndex(currentIndex, isWon
      ? [...guessedWords, (learning || "").toLowerCase()]
      : guessedWords
    );
    if (nextIndex === null) {
      return;
    }
    setCurrentIndex(nextIndex);
    setGuesses([]);
    setCurrentAttempts(0);
    setRoundScored(false);
    localStorage.setItem(STORAGE_KEY, nextIndex.toString());
    localStorage.setItem("lingoHangmanGuesses", JSON.stringify([]));
  };
  const handleRestart = () => {
    setScore({ correct: 0, incorrect: 0 });
    setGuessedWords([]);
    setGuessedStats({});
    setWordAttempts({});
    setCurrentIndex(0);
    setGuesses([]);
    setTotalScore(0);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SCORE_KEY);
    localStorage.removeItem("lingoHangmanGuessedWords");
    localStorage.removeItem("lingoHangmanGuessedStats");
    localStorage.removeItem("lingoHangmanWordAttempts");
    localStorage.removeItem("lingoHangmanTotalScore");
    localStorage.removeItem("lingoHangmanGuesses");
  };
  useEffect(() => {
    setScore({ correct: 0, incorrect: 0 });
    setGuessedWords([]);
    setGuessedStats({});
    setWordAttempts({});
    setCurrentIndex(0);
    setGuesses([]);
    setTotalScore(0);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SCORE_KEY);
    localStorage.removeItem("lingoHangmanGuessedWords");
    localStorage.removeItem("lingoHangmanGuessedStats");
    localStorage.removeItem("lingoHangmanWordAttempts");
    localStorage.removeItem("lingoHangmanTotalScore");
    localStorage.removeItem("lingoHangmanGuesses");
  }, [restartFlag]);
  if (!current) return <div>{t.noWords}</div>;
  const timeValue = COMMON_WORDS.find(w => w[learningLang] === current.learning)?.time;
  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <Card>
        <CardContent className="text-center p-4">
          <div className="flex justify-end mb-2">
            <HamburgerMenu lang={lang} setLang={() => {}} onRestart={handleRestart} />
          </div>
          <h2 className="text-xl font-semibold">{t.meaning}: {native}</h2>
          {timeValue && (
            <div className="mb-2 text-blue-600 dark:text-blue-300 text-base">
              {Array.isArray(timeValue) ? timeValue.join(" / ") : timeValue}
            </div>
          )}
          <div className="text-right text-sm font-semibold mb-2">
            {t.score}: {totalScore}
          </div>
          <HangmanDrawing incorrect={incorrect.length} t={t} />
          <div className="text-2xl tracking-widest my-4">
            {letters.map((l, i) => (
              <span key={i} className="inline-block w-6">
                {l === ' '
                  ? ' '
                  : isGuessable(l)
                    ? (guesses.includes(l) ? l : "_")
                    : l}
              </span>
            ))}
          </div>
          <div className="text-red-500">{t.wrongGuesses}: {incorrect.join(", ")}</div>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {getAlphabet(learningLang).map(l => {
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
          </div>
          {(isWon || isLost) && (
            <div className="mt-4 space-y-2">
              <p className="text-lg font-semibold">
                {isWon ? t.guessed : `${t.answerWas}: ${learning.toUpperCase()}`}
              </p>
              <p>{t.score}: {t.correct} {score.correct} / {t.incorrect} {score.incorrect}</p>
              <Button onClick={handleNext}>
                {t.nextWord}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
