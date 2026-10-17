import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Delete, Volume2 } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import { useRoundFinished } from "../../app/PlayTracking";
import { fill } from "../../i18n";
import { DailyProgress, Feedback, GameScreen, keepInView, useConfetti } from "../../components/lingo";
import { addDays, dayKey } from "../../lib/progress";
import { sounds } from "../../lib/sounds";
import { canSpeak, speak } from "../../lib/speech";
import { getItems } from "../../lib/words";
import englishLayout from "../hangman/keyboardLayouts/english";
import {
  HEAR_AFTER, MAX_GUESSES, WORD_LENGTH, dailyCandidates, dailyFor, finishDaily, isOver, isWon, letterStates, loadDaily,
  saveDaily, scoreGuess,
} from "./dailyLogic";

// One row of the board: a guess with its letters marked, the word being
// typed, or an empty row.
function Row({ letters, marks, current, shake, k }) {
  const cells = Array.from({ length: WORD_LENGTH }, (_, i) => letters[i] || "");
  const label = marks
    ? cells.map((l, i) => `${l} ${k.marks[marks[i]]}`).join(", ")
    : cells.join("") || k.emptyRow;
  return (
    <li className={`dw-row${shake ? " lg-wobble" : ""}`} aria-label={label}>
      {cells.map((l, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`dw-cell${marks ? ` dw-cell--${marks[i]} lg-reveal` : l ? " dw-cell--typed" : ""}${current && i === letters.length ? " dw-cell--next" : ""}`}
          style={marks ? { "--i": i } : undefined}
        >
          {l}
        </span>
      ))}
    </li>
  );
}

// Daily word: guess today's five-letter English word in six tries from its
// Finnish meaning. Any five letters can be tried; each guess shows which
// letters are in the right place and which are in the word. The game is
// recorded once, when it ends, and the record and streak are kept on the device.
export default function DailyGame() {
  const { t } = useSettings();
  const k = t.daily;
  const { recordWord } = useProgress();
  const { celebrate, confetti } = useConfetti();
  const today = dayKey();
  const candidates = useMemo(() => dailyCandidates(getItems({ type: "word" })), []);
  const [state, setState] = useState(() => dailyFor(loadDaily(), today, candidates));
  const [typed, setTyped] = useState("");
  const [shake, setShake] = useState(false);
  const [message, setMessage] = useState(null);
  const [copied, setCopied] = useState(false);
  const startedAt = useRef(Date.now());
  const resultRef = useRef(null);

  const word = state.word;
  const answer = word?.word || "";
  const over = word ? isOver(state.guesses, answer) : false;
  const won = word ? isWon(state.guesses, answer) : false;
  const keys = useMemo(() => letterStates(state.guesses, answer), [state.guesses, answer]);

  useEffect(() => saveDaily(state), [state]);

  // Record the day's game once, when it ends.
  useEffect(() => {
    if (!word || !over || state.recorded) return;
    recordWord({
      gameId: "daily",
      word: word.word.toLowerCase(),
      lang: "en",
      solved: won,
      triesLeft: won ? MAX_GUESSES - state.guesses.length : 0,
      perfect: won && state.guesses.length <= 2,
      ms: Date.now() - startedAt.current,
    });
    setState((s) => finishDaily(s, { won, key: today, yesterday: addDays(today, -1) }));
    if (won) {
      celebrate("large");
      sounds.celebrate();
    } else {
      sounds.shown();
    }
  }, [over]);
  // The result (and the XP it earned) appears under the keyboard's place:
  // bring it up above the bottom bar.
  useEffect(() => {
    if (over) keepInView(resultRef.current);
  }, [over]);
  // After the effect above, so the answer is in before the round ends.
  useRoundFinished(over);

  const type = (letter) => {
    if (over || typed.length >= WORD_LENGTH) return;
    setMessage(null);
    sounds.tap();
    setTyped((s) => s + letter);
  };
  const erase = () => {
    if (over) return;
    setMessage(null);
    setTyped((s) => s.slice(0, -1));
  };
  const submit = () => {
    if (over) return;
    if (typed.length < WORD_LENGTH) {
      setShake(true);
      setTimeout(() => setShake(false), 320);
      setMessage(fill(k.tooShort, { n: WORD_LENGTH }));
      return;
    }
    const guesses = [...state.guesses, typed];
    setState((s) => ({ ...s, guesses }));
    setTyped("");
    if (typed !== answer && guesses.length < MAX_GUESSES) {
      const hits = scoreGuess(typed, answer).filter((m) => m === "hit").length;
      if (hits > 0) sounds.found(hits);
      else sounds.miss();
    }
  };

  // Typing on a real keyboard works too.
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") submit();
      else if (e.key === "Backspace") erase();
      else if (/^[a-zA-Z]$/.test(e.key)) type(e.key.toUpperCase());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const copyResult = async () => {
    const text = won
      ? fill(k.shareWon, { n: state.guesses.length, max: MAX_GUESSES })
      : fill(k.shareLost, { max: MAX_GUESSES });
    try {
      await navigator.clipboard.writeText(`${text} ${window.location.origin}/daily`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!word) {
    return (
      <GameScreen title={k.name}>
        <main className="lg-board">
          <Feedback variant="info" title={t.practice.notEnoughWords} />
        </main>
      </GameScreen>
    );
  }

  const rows = Array.from({ length: MAX_GUESSES }, (_, i) => i);
  const canHear = canSpeak() && (over || state.guesses.length >= HEAR_AFTER);
  return (
    <GameScreen title={k.name} className="dw-screen">
      <main className="lg-board dw-board">
        {confetti}
        <div className="pg-prompt dw-clue">
          <span className="lg-caption">{k.clue}</span>
          <p className="pg-prompt__word pg-prompt__word--phrase" lang="fi">{word.fi}</p>
          {canHear && (
            <button type="button" className="lg-btn lg-btn--quiet" onClick={() => speak(word.word.toLowerCase(), { lang: "en" })}>
              <Volume2 size={18} aria-hidden="true" /> {over ? t.practice.listen : k.hear}
            </button>
          )}
        </div>
        <ol className="dw-grid" aria-label={k.board}>
          {rows.map((i) => {
            const guess = state.guesses[i];
            if (guess) return <Row key={i} letters={guess} marks={scoreGuess(guess, answer)} k={k} />;
            const isCurrent = !over && i === state.guesses.length;
            return <Row key={i} letters={isCurrent ? typed : ""} current={isCurrent} shake={isCurrent && shake} k={k} />;
          })}
        </ol>
        {!over && (
          <p className="lg-caption dw-status" role="status">
            {message || fill(k.triesLeft, { n: MAX_GUESSES - state.guesses.length })}
          </p>
        )}
        {over && (
          <div className="dw-result" ref={resultRef}>
            {won ? (
              <Feedback variant="correct" title={fill(k.wonTitle, { word: answer.toLowerCase() })}>
                {state.guesses.length === 1 ? k.wonFirst : fill(k.wonBody, { n: state.guesses.length })}
              </Feedback>
            ) : (
              <Feedback variant="retry" title={fill(k.lostTitle, { word: answer.toLowerCase() })}>
                {k.lostBody}
              </Feedback>
            )}
            {word.ipa && <p className="lg-caption" lang="en">{answer.toLowerCase()} {word.ipa}</p>}
            <dl className="pg-stats">
              <div><dt>{k.played}</dt><dd>{state.played}</dd></div>
              <div><dt>{k.wins}</dt><dd>{state.won}</dd></div>
              <div><dt>{k.streak}</dt><dd>{state.streak}</dd></div>
              <div><dt>{k.bestStreak}</dt><dd>{state.bestStreak}</dd></div>
            </dl>
            <p className="lg-caption">{k.tomorrow}</p>
            <DailyProgress />
          </div>
        )}
      </main>
      <div className="lg-tray">
        {over ? (
          <div className="lg-tray--actions dw-actions">
            <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={copyResult}>
              {copied ? k.copied : k.copy}
            </button>
            <Link to="/" className="lg-btn lg-btn--quiet">{t.allGames}</Link>
          </div>
        ) : (
          <div className="hm-keyboard dw-keyboard" style={{ touchAction: "manipulation" }} role="group" aria-label={k.keyboard}>
            {englishLayout.map((row, r) => (
              <div key={r} className="hm-keyboard__row">
                {r === 2 && (
                  <button type="button" className="lg-key dw-key--wide" onClick={submit}>
                    {k.enter}
                  </button>
                )}
                {row.map((l) => {
                  const s = keys[l];
                  const cls = ["lg-key"];
                  if (s === "hit") cls.push("lg-key--hit");
                  if (s === "near") cls.push("lg-key--hint");
                  if (s === "miss") cls.push("lg-key--miss");
                  return (
                    <button
                      key={l}
                      type="button"
                      className={cls.join(" ")}
                      onClick={() => type(l)}
                      aria-label={s ? `${l}, ${k.marks[s]}` : l}
                    >
                      {l}
                    </button>
                  );
                })}
                {r === 2 && (
                  <button type="button" className="lg-key dw-key--wide" onClick={erase} aria-label={k.erase}>
                    <Delete size={20} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </GameScreen>
  );
}
