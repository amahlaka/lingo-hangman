import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import { useRoundFinished } from "../../app/PlayTracking";
import { fill } from "../../i18n";
import { ACHIEVEMENTS, badgeText } from "../../lib/progress";
import { sounds } from "../../lib/sounds";
import { canSpeak, speakSaved } from "../../lib/speech";
import { getAlphabet, guessPromptText, loadWordSet, meaningLabel, shuffle, wordInfo } from "../../lib/words";
import { DailyProgress, ExtraTryOffer, Feedback, GameScreen, ScorePill, TriesMeter, WordRecap, WordTiles, useConfetti, useExtraTry } from "../../components/lingo";
import HangmanDrawing from "./HangmanDrawing";
import HangmanKeyboard from "./HangmanKeyboard";
import HintButtons, { HINT_COSTS } from "./HintButtons";
import { FREE_HINTS } from "../practice/practiceLogic";
import { ReportButton, useReportSubject } from "../../app/FeedbackContext";
import { describeQuestion, itemRefFor } from "../../lib/feedback";

export const MAX_MISSES = 6;

// One game of hangman over a word set from the URL (`/play?words=...`, the
// shareable link format) or, without `words`, 5 random everyday words.
export default function HangmanGame() {
  const [params] = useSearchParams();
  const { t, lang } = useSettings();
  const { recordWord, resetWordStreak, dailyGoal } = useProgress();
  const { celebrate, confetti } = useConfetti();

  const search = params.toString();
  // Bumped to draw new random words when the set did not come from a link.
  const [draw, setDraw] = useState(0);
  // "Right in a row" counts within this set of words only.
  useEffect(() => resetWordStreak(), [search, draw, resetWordStreak]);
  const wordSet = useMemo(() => loadWordSet(new URLSearchParams(search)), [search, draw]);
  const { pairs: words, learningLang, nativeLang, swap: swapMode, fromLink } = wordSet;

  // Words still to solve, by index into `words`. A lost word moves to the end.
  const [queue, setQueue] = useState(() => words.map((_, i) => i));
  const [roundNumber, setRoundNumber] = useState(1);
  const [totalRounds, setTotalRounds] = useState(words.length);
  const [guesses, setGuesses] = useState([]);
  const [swap, setSwap] = useState(() => swapMode && Math.random() < 0.5);
  // Points this session: XP earned minus hints spent.
  const [points, setPoints] = useState(0);
  // Hints this game gives for free before they cost points.
  const [freeHints, setFreeHints] = useState(FREE_HINTS);
  const [plus, setPlus] = useState(null);
  // { solved, events } once the current word is finished.
  const [result, setResult] = useState(null);
  const [banner, setBanner] = useState(null);
  const [removed, setRemoved] = useState([]);
  // The 50-50 pair: stays marked until each letter is guessed or the word ends.
  const [highlighted, setHighlighted] = useState([]);
  const [fiftyUsed, setFiftyUsed] = useState(false);
  // Listen was bought for this word, so hearing it again is free.
  const [heard, setHeard] = useState(false);
  const [newlyFound, setNewlyFound] = useState([]);
  // True when the learner skipped the word: it is shown and comes back later.
  const [gaveUp, setGaveUp] = useState(false);
  // Extra tries from the shop used on this word, and whether the learner is
  // being asked to use one (out of tries, the word not finished yet).
  const [bonus, setBonus] = useState(0);
  const [offer, setOffer] = useState(false);
  const extraTry = useExtraTry();

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
    setFiftyUsed(false);
    setHeard(false);
    setFreeHints(FREE_HINTS);
    setGaveUp(false);
    setBonus(0);
    setOffer(false);
  }, [words]);

  const allDone = queue.length === 0;
  useRoundFinished(allDone && words.length > 0);

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
  const maxMisses = MAX_MISSES + bonus;
  const triesLeft = maxMisses - misses.length;
  const isWon = Boolean(current) && letters.every((ch) => !isGuessable(ch) || guesses.includes(ch));
  const isLost = gaveUp || (misses.length >= maxMisses && !offer);
  const roundOver = isWon || isLost;
  const lastGuess = guesses[guesses.length - 1];

  // What "Report a problem" is about: the word on screen.
  const reportSubject = useMemo(
    () => (current ? { game: "hangman", itemRef: itemRefFor(current, answer), context: { question: describeQuestion(current), answer, meaning } } : null),
    [current, answer, meaning]
  );
  useReportSubject(reportSubject);
  const lastMiss = lastGuess && !inWord(lastGuess) ? lastGuess : null;

  // When this word appeared, for the answer time in the shared statistics.
  const shownAt = useRef(Date.now());
  useEffect(() => {
    shownAt.current = Date.now();
  }, [answer, roundNumber]);

  const finishRound = (solved, missCount, wrongLetters = misses) => {
    const events = recordWord({
      gameId: "hangman",
      wrong: wrongLetters,
      skipped: missCount >= maxMisses && wrongLetters.length < maxMisses,
      word: answer,
      lang: guessLang,
      solved,
      triesLeft: Math.max(0, maxMisses - missCount),
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
    // A new level has its own card and confetti (LevelUpCard).
    if (big && !events.levelUp) {
      setTimeout(() => {
        celebrate("large");
        sounds.celebrate();
      }, 250);
    }
    else if (events.newAchievements.length > 0) {
      const badge = ACHIEVEMENTS.find((a) => a.id === events.newAchievements[0]);
      big = { icon: badge.medal, title: fill(t.newBadge, { name: badgeText(badge, lang).name }) };
    } else if (events.wordLearned) big = { icon: "✓", title: fill(t.learnedBanner, { word: answer }) };
    setBanner(big);
  };

  const handleGuess = (letter) => {
    if (roundOver || allDone || offer || guesses.includes(letter) || removed.includes(letter)) return;
    setHighlighted((h) => h.filter((l) => l !== letter));
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
    if (!won && nextMisses < maxMisses) {
      if (inWord(letter)) sounds.found(next.filter(inWord).length - 1);
      else sounds.miss();
    }
    const wrongLetters = next.filter((g) => !inWord(g));
    if (won) finishRound(true, nextMisses, wrongLetters);
    else if (nextMisses >= maxMisses) {
      if (extraTry.available) {
        sounds.miss();
        setOffer(true);
      } else finishRound(false, nextMisses, wrongLetters);
    }
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
    setFiftyUsed(false);
    setHeard(false);
    setNewlyFound([]);
    setGaveUp(false);
    setBonus(0);
    setOffer(false);
    setSwap(swapMode && Math.random() < 0.5);
  }, [roundOver, allDone, queue, isLost, swapMode]);

  const handleSkip = () => {
    if (roundOver || allDone) return;
    setGaveUp(true);
    finishRound(false, maxMisses);
  };

  const handleRestart = () => {
    if (!fromLink) {
      setDraw((d) => d + 1);
      return;
    }
    setQueue(shuffle(words.map((_, i) => i)));
    setRoundNumber(1);
    setTotalRounds(words.length);
    setGuesses([]);
    setResult(null);
    setBanner(null);
    setRemoved([]);
    setHighlighted([]);
    setFiftyUsed(false);
    setHeard(false);
    setFreeHints(FREE_HINTS);
    setNewlyFound([]);
    setGaveUp(false);
    setBonus(0);
    setOffer(false);
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
  const playing = !roundOver && !offer;
  const hintAvailable = {
    fifty: playing && !fiftyUsed && missingLetters.length > 0 && notInWordLeft.length > 0,
    listen: playing && canSpeak(),
    clear: playing && notInWordLeft.length >= 2,
  };
  // The game's free hints go first, then hints cost this session's points.
  const handleHint = (id) => {
    if (!hintAvailable[id]) return;
    const listen = () => speakSaved(answer, { lang: guessLang });
    if (id === "listen" && heard) {
      listen();
      return;
    }
    if (freeHints > 0) setFreeHints((n) => n - 1);
    else if (points >= HINT_COSTS[id]) setPoints((p) => p - HINT_COSTS[id]);
    else return;
    if (id === "fifty") {
      setHighlighted(shuffle([missingLetters[0], shuffle(notInWordLeft)[0]]));
      setFiftyUsed(true);
    } else if (id === "listen") {
      setHeard(true);
      listen();
    } else {
      const count = Math.min(notInWordLeft.length, 2 + Math.floor(Math.random() * 5));
      const gone = shuffle(notInWordLeft).slice(0, count);
      setRemoved((r) => [...r, ...gone]);
      setHighlighted((h) => h.filter((l) => !gone.includes(l)));
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
            {fromLink ? t.playAgainSet : t.playNewWords}
          </button>
          <Link to="/hangman/words" className="lg-btn lg-btn--quiet">{t.useYourOwnWords}</Link>
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
          {guessPromptText(t, guessLang)} <strong>{meaning}</strong>
        </p>
        {time && <p className="lg-caption hm-time">{Array.isArray(time) ? time.join(" / ") : time}</p>}
        <div className="hm-stage">
          {/* An extra try takes the last part of the figure away again. */}
          <HangmanDrawing misses={misses.length - bonus} label={`${t.hangmanDrawing}: ${misses.length - bonus} / ${MAX_MISSES}`} />
          <HintButtons points={points} free={freeHints} available={hintAvailable} heard={heard} onHint={handleHint} t={t} />
        </div>
        <TriesMeter
          left={triesLeft}
          total={maxMisses}
          label={triesLeft === 1 ? t.oneTryLeft : fill(t.triesLeft, { n: triesLeft })}
        />
        <div className="hm-word">
          {confetti}
          <WordTiles tiles={tiles} win={isWon} label={tilesLabel} popKeys={isWon ? [] : newlyFound} />
          {/* Once the word is done, its meaning appears right under it to link the two languages. */}
          {roundOver && (
            <div className="pg-meaning hm-meaning lg-reveal">
              <span className="lg-caption">{meaningLabel(t, meaningLang)}</span>
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
            <ReportButton />
          </div>
        ) : offer ? (
          <ExtraTryOffer
            onUse={() => {
              setBonus((b) => b + 1);
              setOffer(false);
            }}
            onDecline={() => {
              setOffer(false);
              finishRound(false, misses.length);
            }}
          />
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
        {playing && (
          <div className="pg-question-actions">
            <button type="button" className="lg-btn lg-btn--quiet" onClick={handleSkip}>
              {t.skipWord}
            </button>
            <ReportButton />
          </div>
        )}
      </div>
    </GameScreen>
  );
}
