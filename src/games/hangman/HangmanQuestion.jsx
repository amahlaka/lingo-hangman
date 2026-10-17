import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { sounds } from "../../lib/sounds";
import { getAlphabet, guessPromptText } from "../../lib/words";
import { TriesMeter, WordTiles } from "../../components/lingo";
import { useQuestionControls } from "../practice/questionControls";
import HangmanDrawing from "./HangmanDrawing";
import HangmanKeyboard from "./HangmanKeyboard";
import { MAX_MISSES } from "./HangmanGame";

// One hangman word as a PracticeSession question (Quick play): guess the
// English word for the Finnish meaning, one letter at a time, with six misses.
export default function HangmanQuestion({ question, done, onDone, learningLang, nativeLang }) {
  const { t } = useSettings();
  const answer = question.target.learning;
  const alphabet = useMemo(() => getAlphabet(learningLang), [learningLang]);
  const [guesses, setGuesses] = useState([]);
  const [found, setFound] = useState([]);
  const letters = answer.toUpperCase().split("");
  const isGuessable = (ch) => alphabet.includes(ch);
  const inWord = (l) => letters.some((ch) => isGuessable(ch) && ch === l);
  const misses = guesses.filter((g) => !inWord(g));
  const won = letters.every((ch) => !isGuessable(ch) || guesses.includes(ch));
  const left = MAX_MISSES - misses.length;

  // `wrongLetters`: the letters guessed that aren't in the word.
  const finish = (solved, missCount, wrongLetters = misses) =>
    onDone({
      solved,
      wrong: wrongLetters,
      firstTry: solved && missCount === 0,
      tries: missCount + 1,
      triesLeft: solved ? MAX_MISSES - missCount : 0,
      answer,
      meaning: question.target.native,
    });
  useQuestionControls({ skip: () => !done && finish(false, MAX_MISSES) });

  const guess = (letter) => {
    if (done || guesses.includes(letter)) return;
    const next = [...guesses, letter];
    setGuesses(next);
    setFound(inWord(letter) ? letters.map((ch, i) => (ch === letter ? i : -1)).filter((i) => i >= 0) : []);
    const nextMisses = next.filter((g) => !inWord(g)).length;
    const wrongLetters = next.filter((g) => !inWord(g));
    if (letters.every((ch) => !isGuessable(ch) || next.includes(ch))) finish(true, nextMisses, wrongLetters);
    else if (nextMisses >= MAX_MISSES) finish(false, nextMisses, wrongLetters);
    else if (inWord(letter)) sounds.found(next.filter(inWord).length - 1);
    else sounds.miss();
  };

  // Letters typed on a physical keyboard guess too.
  const guessRef = useRef(guess);
  guessRef.current = guess;
  useEffect(() => {
    if (done) return undefined;
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      const key = e.key.toUpperCase();
      if (key.length === 1 && alphabet.includes(key)) guessRef.current(key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [done, alphabet]);

  const tiles = letters.map((ch) => {
    if (ch === " ") return { char: ch, state: "space" };
    if (!isGuessable(ch)) return { char: ch, state: "fixed" };
    if (guesses.includes(ch)) return { char: ch, state: won ? "solved" : "found" };
    return { char: ch, state: done ? "revealed" : "empty" };
  });
  const label = fill(t.wordLabel, {
    word: letters.map((ch) => (ch === " " || !isGuessable(ch) || guesses.includes(ch) ? ch : "_")).join(" "),
  });
  const lastGuess = guesses[guesses.length - 1];

  return (
    <div className="lg-stack pg-question hq-question">
      <p className="hm-prompt" data-testid="native-word">
        {guessPromptText(t, learningLang)}{" "}
        <strong lang={nativeLang}>{question.target.native}</strong>
      </p>
      <div className="hm-stage">
        <HangmanDrawing misses={misses.length} label={`${t.hangmanDrawing}: ${misses.length} / ${MAX_MISSES}`} />
      </div>
      <TriesMeter left={left} total={MAX_MISSES} label={left === 1 ? t.oneTryLeft : fill(t.triesLeft, { n: left })} />
      <div className="hm-word">
        <WordTiles tiles={tiles} win={won} label={label} popKeys={won ? [] : found} />
      </div>
      {!done && (
        <HangmanKeyboard
          alphabet={alphabet}
          lang={learningLang}
          guesses={guesses}
          inWord={inWord}
          removed={[]}
          highlighted={[]}
          lastMiss={lastGuess && !inWord(lastGuess) ? lastGuess : null}
          disabled={done}
          onGuess={guess}
          t={t}
        />
      )}
    </div>
  );
}
