import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import { fill } from "../../i18n";
import { DailyProgress, Feedback, GameScreen, ScorePill, WordRecap, useConfetti } from "../../components/lingo";
import { sounds } from "../../lib/sounds";
import { practicePool } from "../practice/practiceLogic";
import {
  MISS_PAUSE_MS, RUSH_SECONDS, buildRushQuestions, comboBonus, comboMultiplier, readBest, rushPoints, rushPool, saveBest,
} from "./rushLogic";

const TICK_MS = 100;

// Word rush: a Finnish word, four English options, as many as you can in a
// minute. Right answers in a row raise the multiplier and add bonus time; a
// miss shows the answer for a moment and resets the run. Every answer is
// recorded like in the other games.
export default function RushGame() {
  const [params] = useSearchParams();
  const { t } = useSettings();
  const k = t.rush;
  const { recordWord } = useProgress();
  const { celebrate, confetti } = useConfetti();
  const search = params.toString();
  const { pairs, learningLang, nativeLang } = useMemo(() => {
    const pool = practicePool(new URLSearchParams(search));
    return { ...pool, pairs: rushPool(pool.pairs) };
  }, [search]);

  const [phase, setPhase] = useState("ready"); // ready | playing | done
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [score, setScore] = useState(0);
  const [plus, setPlus] = useState(null);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [results, setResults] = useState([]);
  const [missed, setMissed] = useState(null);
  const [bonus, setBonus] = useState(null);
  const [best, setBest] = useState(readBest);
  const [newBest, setNewBest] = useState(false);
  const shownAt = useRef(0);
  const pause = useRef(null);

  const left = Math.max(0, endsAt - now);
  const question = questions[index];

  useEffect(() => {
    if (phase !== "playing") return undefined;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => () => clearTimeout(pause.current), []);

  // Time's up, or every word has been asked.
  useEffect(() => {
    if (phase !== "playing" || (left > 0 && index < questions.length)) return;
    clearTimeout(pause.current);
    setPhase("done");
    if (score > best) {
      saveBest(score);
      setBest(score);
      setNewBest(true);
    }
    celebrate("large");
    sounds.celebrate();
  }, [phase, left, index, questions.length]);

  const start = () => {
    const at = Date.now();
    setQuestions(buildRushQuestions(pairs));
    setIndex(0);
    setScore(0);
    setPlus(null);
    setCombo(0);
    setBestCombo(0);
    setResults([]);
    setMissed(null);
    setBonus(null);
    setNewBest(false);
    setNow(at);
    setEndsAt(at + RUSH_SECONDS * 1000);
    shownAt.current = at;
    setPhase("playing");
  };

  const record = (solved, wrong) => {
    const at = Date.now();
    const events = recordWord({
      gameId: "rush",
      word: question.target.learning,
      lang: learningLang,
      solved,
      wrong: wrong ? [wrong] : undefined,
      triesLeft: 0,
      perfect: solved,
      ms: at - shownAt.current,
    });
    shownAt.current = at;
    setResults((r) => [...r, { learning: question.target.learning, native: question.target.native, solved }]);
    if (events.goalReached || events.levelUp || events.wordStreakMilestone) celebrate("large");
  };

  const next = () => {
    shownAt.current = Date.now();
    setMissed(null);
    setIndex((i) => i + 1);
  };

  const choose = (option) => {
    if (phase !== "playing" || missed || !question) return;
    if (option === question.target) {
      const run = combo + 1;
      const points = rushPoints(run);
      const extra = comboBonus(run);
      setCombo(run);
      setBestCombo((b) => Math.max(b, run));
      setScore((s) => s + points);
      setPlus({ n: points, key: Date.now() });
      if (extra) {
        setEndsAt((e) => e + extra * 1000);
        setBonus({ n: extra, key: Date.now() });
        celebrate("medium");
      }
      sounds.found(run - 1);
      record(true);
      next();
      return;
    }
    setCombo(0);
    setMissed(option);
    sounds.miss();
    record(false, option.learning);
    pause.current = setTimeout(next, MISS_PAUSE_MS);
  };

  // Number keys 1-4 pick an option.
  useEffect(() => {
    if (phase !== "playing" || !question) return undefined;
    const onKey = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= question.options.length) choose(question.options[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const scorePill = <ScorePill label={k.score} value={score} plus={plus?.n} plusKey={plus?.key} />;
  const menuActions = [{ label: t.restart, onClick: start }];

  if (pairs.length < 4) {
    return (
      <GameScreen title={k.name}>
        <main className="lg-board">
          <Feedback variant="info" title={t.practice.notEnoughWords} />
        </main>
      </GameScreen>
    );
  }

  if (phase === "ready") {
    return (
      <GameScreen title={k.name}>
        <main className="lg-board wr-ready">
          <p className="wr-ready__clock" aria-hidden="true">{RUSH_SECONDS}</p>
          <h2 className="lg-display">{k.readyTitle}</h2>
          <p className="lg-body-lg">{fill(k.readyBody, { n: RUSH_SECONDS })}</p>
          <p className="lg-caption">{k.readyCombo}</p>
          {best > 0 && <p className="lg-caption">{fill(k.bestSoFar, { n: best })}</p>}
        </main>
        <div className="lg-tray lg-tray--actions">
          <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={start} autoFocus>
            {k.start}
          </button>
        </div>
      </GameScreen>
    );
  }

  if (phase === "done") {
    const right = results.filter((r) => r.solved).length;
    return (
      <GameScreen title={k.name} score={scorePill} menuActions={menuActions}>
        <main className="lg-board pg-done">
          {confetti}
          <h2 className="lg-display">{newBest ? fill(k.newBest, { n: score }) : fill(k.endTitle, { n: score })}</h2>
          <dl className="pg-stats">
            <div><dt>{k.endRight}</dt><dd>{right} / {results.length}</dd></div>
            <div><dt>{k.endCombo}</dt><dd>{bestCombo}</dd></div>
            <div><dt>{k.endBest}</dt><dd>{best}</dd></div>
          </dl>
          <WordRecap title={t.practice.recapTitle} words={results} learningLang={learningLang} nativeLang={nativeLang} />
          <DailyProgress />
        </main>
        <div className="lg-tray lg-tray--actions">
          <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={start} autoFocus>
            {t.practice.playAgain}
          </button>
          <Link to="/" className="lg-btn lg-btn--quiet">{t.allGames}</Link>
        </div>
      </GameScreen>
    );
  }

  // Every word asked: the end screen follows straight after this render.
  if (!question) {
    return (
      <GameScreen title={k.name} score={scorePill} menuActions={menuActions}>
        <main className="lg-board wr-board" />
      </GameScreen>
    );
  }

  const seconds = Math.ceil(left / 1000);
  const share = Math.min(1, left / (RUSH_SECONDS * 1000));
  const multiplier = comboMultiplier(combo);
  return (
    <GameScreen title={k.name} score={scorePill} menuActions={menuActions} className="wr-screen">
      <main className="lg-board wr-board">
        {confetti}
        <div className="wr-status">
          <div
            className={`wr-timer${seconds <= 10 ? " wr-timer--low" : ""}`}
            role="timer"
            aria-label={fill(k.secondsLeft, { n: seconds })}
          >
            <span className="wr-timer__bar" style={{ transform: `scaleX(${share})` }} />
          </div>
          <span className="wr-seconds" aria-hidden="true">{seconds}</span>
          {bonus && <span key={bonus.key} className="wr-bonus" aria-live="polite">{fill(k.bonus, { n: bonus.n })}</span>}
        </div>
        <div className="wr-combo" aria-live="polite">
          {multiplier > 1 && <span key={multiplier} className="wr-combo__x lg-pop">{fill(k.multiplier, { n: multiplier })}</span>}
          {combo >= 2 && <span className="lg-caption">{fill(k.inARow, { n: combo })}</span>}
        </div>
        <div className="pg-prompt">
          <span className="lg-caption">{t.practice.finnish}</span>
          <p key={index} className="pg-prompt__word wr-word lg-pop" lang={nativeLang} data-testid="prompt-word">
            {question.target.native}
          </p>
        </div>
        <div className="pg-choices wr-choices" role="group" aria-label={k.options}>
          {question.options.map((option, i) => {
            const state = missed ? (option === question.target ? "shown" : option === missed ? "miss" : "") : "";
            return (
              <button
                key={`${index}-${option.learning}`}
                type="button"
                lang={learningLang}
                className={`pg-choice${state ? ` pg-choice--${state}` : ""}${state === "miss" ? " lg-wobble" : ""}`}
                onClick={() => choose(option)}
                disabled={Boolean(missed)}
              >
                <span className="pg-choice__mark" aria-hidden="true">{state === "shown" ? "✓" : i + 1}</span>
                <span className="pg-choice__words">
                  <span className="pg-choice__text">{option.learning}</span>
                </span>
              </button>
            );
          })}
        </div>
      </main>
    </GameScreen>
  );
}
