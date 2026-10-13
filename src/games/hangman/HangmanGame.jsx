import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import { fill } from "../../i18n";
import { ACHIEVEMENTS } from "../../lib/progress";
import { sounds } from "../../lib/sounds";
import { getAlphabet, languageLabel, loadWordSet, shuffle, wordInfo } from "../../lib/words";
import { DailyProgress, Feedback, GameScreen, ScorePill, TriesMeter, WordRecap, WordTiles, useConfetti } from "../../components/lingo";
import HangmanDrawing from "./HangmanDrawing";
import HangmanKeyboard from "./HangmanKeyboard";
import HintButtons, { HINT_COSTS } from "./HintButtons";

export const MAX_MISSES = 6;

// One game of hangman over a word set from the URL (`/play?words=...`, the
// shareable link format) or, without `words`, 5 random everyday words.
export default function HangmanGame() {
  const [params] = useSearchParams();
  const { t, lang } = useSettings();
  const { recordWord, dailyGoal } = useProgress();
  const { celebrate, confetti } = useConfetti();

  const search = params.toString();
  const wordSet = useMemo(() => loadWordSet(new URLSearchParams(search)), [search]);
  const { pairs: words, learningLang, nativeLang, swap: swapMode } = wordSet;

  // Words still to solve, by index into `words`. A lost word moves to the end.
  const [queue, setQueue] = useState(() => words.map((_, i) => i));
  const [roundNumber, setRoundNumber] = useState(1);
  const [totalRounds, setTotalRounds] = useState(words.length);
  const [guesses, setGuesses] = useState([]);
  const [swap, setSwap] = useState(() => swapMode && Math.random() < 0.5);
  // Points this session: XP earned minus hints spent.
  const [points, setPoints] = useState(0);
  const [plus, setPlus] = useState(null);
  // { solved, events } once the current word is finished.
  const [result, setResult] = useState(null);
  const [banner, setBanner] = useState(null);
  const [removed, setRemoved] = useState([]);
  const [highlighted, setHighlighted] = useState([]);
  const [newlyFound, setNewlyFound] = useState([]);
  const highlightTimer = useRef(null);

  useEffect(() => {
    const all = words.map((_, i) => i);
    setQueue(all);
    setRoundNumber(1);
    setTotalRounds(all.length);
    setGuesses([]);
    setResult(null);
    setBanner(null);
    setRemoved([]);
    setHighlighted([]);
  }, [words]);

  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  const allDone = queue.length === 0;

  useEffect(() => {
    if (allDone && words.length > 0) sounds.celebrate();
  }, [allDone, words.length]);
  const current = allDone ? null : words[queue[0]];
  const answer = current ? (swap ? current.native : current.learning) : "";
  const meaning = current ? (swap ? current.learning : current.native) : "";
  const guessLang = swap ? nativeLang : learningLang;
  const meaningLang = swap ? learningLang : nativeLang;
  const alphabet = useMemo(() => getAlphabet(guessLang), [guessLang]);
  const letters = answer.toUpperCase().split("");
  const isGuessable = (ch) => alphabet.includes(ch);
  const inWord = (l) => letters.some((ch) => isGuessable(ch) && ch === l);
  const misses = guesses.filter((g) => !inWord(g));
  const triesLeft = MAX_MISSES - misses.length;
  const isWon = Boolean(current) && letters.every((ch) => !isGuessable(ch) || guesses.includes(ch));
  const isLost = misses.length >= MAX_MISSES;
  const roundOver = isWon || isLost;
  const lastGuess = guesses[guesses.length - 1];
  const lastMiss = lastGuess && !inWord(lastGuess) ? lastGuess : null;

  // When this word appeared, for the answer time in the shared statistics.
  const shownAt = useRef(Date.now());
  useEffect(() => {
    shownAt.current = Date.now();
  }, [answer, roundNumber]);

  const finishRound = (solved, missCount) => {
    const events = recordWord({
      gameId: "hangman",
      word: answer,
      lang: guessLang,
      solved,
      triesLeft: MAX_MISSES - missCount,
      perfect: solved && missCount === 0,
      ms: Date.now() - shownAt.current,
    });
    setResult({ solved, events });
    setPoints((p) => p + events.xpGained);
    setPlus({ n: events.xpGained, key: Date.now() });
    if (solved) {
      celebrate("medium");
      sounds.correct();
    } else {
      sounds.shown();
    }
    // The large celebration: daily goal, level up or every 5 words in a row.
    let big = null;
    if (events.goalReached) big = { icon: "✓", title: fill(t.goalBanner, { n: dailyGoal }) };
    else if (events.levelUp) big = { icon: String(events.levelUp), title: fill(t.levelBanner, { n: events.levelUp }) };
    else if (events.wordStreakMilestone) {
      big = { icon: String(events.wordStreakMilestone), title: fill(t.streakBanner, { n: events.wordStreakMilestone }) };
    }
    if (big) {
      setTimeout(() => {
        celebrate("large");
        sounds.celebrate();
      }, 250);
    }
    else if (events.newAchievements.length > 0) {
      const badge = ACHIEVEMENTS.find((a) => a.id === events.newAchievements[0]);
      big = { icon: badge.medal, title: fill(t.newBadge, { name: badge.name }) };
    } else if (events.wordLearned) big = { icon: "✓", title: fill(t.learnedBanner, { word: answer }) };
    setBanner(big);
  };

  const handleGuess = (letter) => {
    if (roundOver || allDone || guesses.includes(letter) || removed.includes(letter)) return;
    setHighlighted([]);
    const next = [...guesses, letter];
    setGuesses(next);
    if (inWord(letter)) {
      setNewlyFound(letters.map((ch, i) => (ch === letter ? i : -1)).filter((i) => i >= 0));
    } else {
      setNewlyFound([]);
    }
    const nextMisses = next.filter((g) => !inWord(g)).length;
    const won = letters.every((ch) => !isGuessable(ch) || next.includes(ch));
    // The word's own sound (right or shown) covers the last guess.
    if (!won && nextMisses < MAX_MISSES) {
      if (inWord(letter)) sounds.found(next.filter(inWord).length - 1);
      else sounds.miss();
    }
    if (won) finishRound(true, nextMisses);
    else if (nextMisses >= MAX_MISSES) finishRound(false, nextMisses);
  };

  const handleNext = useCallback(() => {
    if (!roundOver || allDone) return;
    const [head, ...rest] = queue;
    if (isLost) {
      setQueue([...rest, head]);
      setTotalRounds((n) => n + 1);
    } else {
      setQueue(rest);
    }
    if (rest.length > 0 || isLost) setRoundNumber((n) => n + 1);
    setGuesses([]);
    setResult(null);
    setBanner(null);
    setRemoved([]);
    setHighlighted([]);
    setNewlyFound([]);
    setSwap(swapMode && Math.random() < 0.5);
  }, [roundOver, allDone, queue, isLost, swapMode]);

  const handleRestart = () => {
    setQueue(shuffle(words.map((_, i) => i)));
    setRoundNumber(1);
    setTotalRounds(words.length);
    setGuesses([]);
    setResult(null);
    setBanner(null);
    setRemoved([]);
    setHighlighted([]);
    setNewlyFound([]);
    setSwap(swapMode && Math.random() < 0.5);
  };

  // Physical keyboard: letters guess; Enter or Space goes to the next word.
  const guessRef = useRef(handleGuess);
  guessRef.current = handleGuess;
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (roundOver) {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          handleNext();
        }
        return;
      }
      const key = e.key.toUpperCase();
      if (key.length === 1 && alphabet.includes(key)) guessRef.current(key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [roundOver, alphabet, handleNext]);

  // Hints
  const notInWordLeft = alphabet.filter((l) => !inWord(l) && !guesses.includes(l) && !removed.includes(l));
  const missingLetters = letters.filter((ch) => isGuessable(ch) && !guesses.includes(ch));
  const hintAvailable = {
    fifty: !roundOver && highlighted.length === 0 && missingLetters.length > 0 && notInWordLeft.length > 0,
    remove: !roundOver && notInWordLeft.length > 0,
    clear: !roundOver && notInWordLeft.length >= 2,
  };
  const handleHint = (id) => {
    if (!hintAvailable[id] || points < HINT_COSTS[id]) return;
    setPoints((p) => p - HINT_COSTS[id]);
    if (id === "fifty") {
      const pair = shuffle([missingLetters[0], shuffle(notInWordLeft)[0]]);
      setHighlighted(pair);
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlighted([]), 5000);
    } else {
      const count = id === "remove" ? 1 : Math.min(notInWordLeft.length, 2 + Math.floor(Math.random() * 5));
      setRemoved((r) => [...r, ...shuffle(notInWordLeft).slice(0, count)]);
    }
  };

  const menuActions = [{ label: t.restart, onClick: handleRestart }];
  const score = (
    <ScorePill label={t.pointsLabel} value={points} plus={plus?.n} plusKey={plus?.key} />
  );

  if (words.length === 0) {
    return (
      <GameScreen title={t.hangmanName} menuActions={menuActions}>
        <main className="lg-board">
          <Feedback variant="info" title={t.noWords} />
        </main>
      </GameScreen>
    );
  }

  if (allDone) {
    return (
      <GameScreen title={t.hangmanName} score={score} menuActions={menuActions}>
        <main className="lg-board hm-done">
          {confetti}
          <h2 className="lg-display">{t.allDoneTitle}</h2>
          {lang === "en" && <p className="lg-caption" lang="fi">Kävit kaikki sanat läpi.</p>}
          <WordRecap
            title={t.recapTitle}
            words={words}
            learningLang={learningLang}
            nativeLang={nativeLang}
          />
          <DailyProgress />
        </main>
        <div className="lg-tray lg-tray--actions">
          <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={handleRestart} autoFocus>
            {t.playAgainSet}
          </button>
          <Link to="/" className="lg-btn lg-btn--quiet">{t.allGames}</Link>
        </div>
      </GameScreen>
    );
  }

  const tiles = letters.map((ch) => {
    if (ch === " ") return { char: ch, state: "space" };
    if (!isGuessable(ch)) return { char: ch, state: "fixed" };
    if (guesses.includes(ch)) return { char: ch, state: isWon ? "solved" : "found" };
    return { char: ch, state: isLost ? "revealed" : "empty" };
  });
  const tilesLabel = fill(t.wordLabel, {
    word: letters.map((ch) => (ch === " " || !isGuessable(ch) || guesses.includes(ch) ? ch : "_")).join(" "),
  });
  const info = !swap ? wordInfo(current.learning, learningLang) : null;
  const time = info?.time;

  return (
    <GameScreen title={t.hangmanName} score={score} menuActions={menuActions} className="hm-screen">
      <main className="lg-board hm-board">
        <p className="lg-caption hm-round">
          {t.round} {Math.min(roundNumber, totalRounds)} / {totalRounds}
        </p>
        <p className="hm-prompt" data-testid="native-word">
          {fill(t.guessPrompt, { language: languageLabel(guessLang) })} <strong>{meaning}</strong>
        </p>
        {time && <p className="lg-caption hm-time">{Array.isArray(time) ? time.join(" / ") : time}</p>}
        <div className="hm-stage">
          <HangmanDrawing misses={misses.length} label={`${t.hangmanDrawing}: ${misses.length} / ${MAX_MISSES}`} />
          <HintButtons points={points} available={hintAvailable} onHint={handleHint} t={t} />
        </div>
        <TriesMeter
          left={triesLeft}
          total={MAX_MISSES}
          label={triesLeft === 1 ? t.oneTryLeft : fill(t.triesLeft, { n: triesLeft })}
        />
        <div className="hm-word">
          {confetti}
          <WordTiles tiles={tiles} win={isWon} label={tilesLabel} popKeys={isWon ? [] : newlyFound} />
          {/* Once the word is done, its meaning appears right under it to link the two languages. */}
          {roundOver && (
            <div className="pg-meaning hm-meaning lg-reveal">
              <span className="lg-caption">{languageLabel(meaningLang)}</span>
              <p className="pg-meaning__text" lang={meaningLang} data-testid="meaning-reveal">{meaning}</p>
            </div>
          )}
        </div>
      </main>
      <div className="lg-tray">
        {roundOver ? (
          <div className="hm-result">
            {result?.solved ? (
              <Feedback
                variant="correct"
                title={<span data-testid="guessed">{fill(t.correctTitle, { word: answer })}</span>}
                fi={lang === "en" ? "Oikein!" : undefined}
              >
                {misses.length === 0 ? t.correctPerfect : fill(t.correctSpare, { n: triesLeft })}{" "}
                {fill(t.xpEarned, { n: result.events.xpGained })}
              </Feedback>
            ) : (
              <Feedback
                variant="retry"
                title={<span data-testid="guessed">{fill(t.retryTitle, { word: answer })}</span>}
                fi={lang === "en" ? "Ei haittaa, sana tulee uudelleen myöhemmin." : undefined}
              >
                {t.retryBody} {result && fill(t.xpEarned, { n: result.events.xpGained })}
              </Feedback>
            )}
            {banner && <Feedback variant="streak" title={banner.title} icon={banner.icon} />}
            <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={handleNext} autoFocus>
              {t.nextWord}
            </button>
          </div>
        ) : (
          <HangmanKeyboard
            alphabet={alphabet}
            lang={guessLang}
            guesses={guesses}
            inWord={inWord}
            removed={removed}
            highlighted={highlighted}
            lastMiss={lastMiss}
            disabled={roundOver}
            onGuess={handleGuess}
            t={t}
          />
        )}
      </div>
    </GameScreen>
  );
}
