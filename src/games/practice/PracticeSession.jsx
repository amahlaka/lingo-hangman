import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import i18n, { fill } from "../../i18n";
import { ACHIEVEMENTS } from "../../lib/progress";
import { DailyProgress, Feedback, GameScreen, ScorePill, useConfetti } from "../../components/lingo";
import { addResult, emptyTally } from "./practiceLogic";

// The large celebration banner for what this answer unlocked, as in hangman.
function bannerFor(events, { t, dailyGoal, answer }) {
  if (events.goalReached) return { big: true, icon: "✓", title: fill(t.goalBanner, { n: dailyGoal }) };
  if (events.levelUp) return { big: true, icon: String(events.levelUp), title: fill(t.levelBanner, { n: events.levelUp }) };
  if (events.wordStreakMilestone) {
    const n = events.wordStreakMilestone;
    return { big: true, icon: String(n), title: fill(t.streakBanner, { n }) };
  }
  if (events.newAchievements.length > 0) {
    const badge = ACHIEVEMENTS.find((a) => a.id === events.newAchievements[0]);
    if (badge) return { icon: badge.medal, title: fill(t.newBadge, { name: badge.name }) };
  }
  if (events.wordLearned) return { icon: "✓", title: fill(t.learnedBanner, { word: answer }) };
  return null;
}

// One round of a practice game: the GameScreen header with points, progress
// dots, celebrations, the feedback banner, the single "Next" step and the end
// screen. Each game only renders one question and calls
// onDone({ solved, firstTry, tries, triesLeft, answer, meaning }) when it is answered.
//
// Props:
//   gameId, title, intro   game identity and its one-line instruction
//   learningLang           language of the answers, reported with each word
//   buildQuestions()       returns this round's questions
//   renderQuestion({ question, done, onDone })
//   empty                  message shown when there are too few words
export default function PracticeSession({ gameId, title, intro, learningLang, buildQuestions, renderQuestion, empty }) {
  const { t, lang } = useSettings();
  const { recordWord, dailyGoal } = useProgress();
  const { celebrate, confetti } = useConfetti();
  const p = t.practice;
  const fi = i18n.fi.practice;
  const helper = lang === "en";

  const [questions, setQuestions] = useState(buildQuestions);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [tally, setTally] = useState(emptyTally);
  const [current, setCurrent] = useState(null);
  const [plus, setPlus] = useState(null);
  const [roundKey, setRoundKey] = useState(0);
  const nextRef = useRef(null);
  const timer = useRef(null);

  const finished = questions.length > 0 && index >= questions.length;

  useEffect(() => () => clearTimeout(timer.current), []);

  // Put focus on the one next step as soon as it appears.
  useEffect(() => {
    if (current && nextRef.current) nextRef.current.focus();
  }, [current]);

  useEffect(() => {
    if (finished) celebrate("large");
  }, [finished, celebrate]);

  const handleDone = (outcome) => {
    if (current) return;
    const events = recordWord({
      gameId,
      word: outcome.answer,
      lang: learningLang,
      solved: outcome.solved,
      triesLeft: outcome.solved ? outcome.triesLeft : 0,
      perfect: outcome.solved && outcome.firstTry,
    });
    const banner = bannerFor(events, { t, dailyGoal, answer: outcome.answer });
    setCurrent({ ...outcome, xp: events.xpGained, banner });
    setTally((s) => addResult(s, { ...outcome, xp: events.xpGained }));
    setResults((r) => [...r, outcome]);
    setPlus({ n: events.xpGained, key: Date.now() });
    if (outcome.solved) celebrate("medium");
    if (banner?.big) timer.current = setTimeout(() => celebrate("large"), 250);
  };

  const goNext = () => {
    setCurrent(null);
    setIndex((i) => i + 1);
  };

  const restart = () => {
    setQuestions(buildQuestions());
    setIndex(0);
    setResults([]);
    setTally(emptyTally());
    setCurrent(null);
    setRoundKey((k) => k + 1);
  };

  const score = <ScorePill label={t.pointsLabel} value={tally.xp} plus={plus?.n} plusKey={plus?.key} />;
  const menuActions = [{ label: t.restart, onClick: restart }];

  if (!questions.length) {
    return (
      <GameScreen title={title} menuActions={menuActions}>
        <main className="lg-board">
          <Feedback variant="info" title={empty || p.notEnoughWords} />
        </main>
      </GameScreen>
    );
  }

  if (finished) {
    return (
      <GameScreen title={title} score={score} menuActions={menuActions}>
        <main className="lg-board pg-done">
          {confetti}
          <h2 className="lg-display">{fill(p.endTitle, { n: questions.length })}</h2>
          {helper && <p className="lg-caption" lang="fi">{fill(fi.endTitle, { n: questions.length })}</p>}
          <dl className="pg-stats">
            <div><dt>{p.endCorrect}</dt><dd>{tally.correct} / {questions.length}</dd></div>
            <div><dt>{p.endFirstTry}</dt><dd>{tally.firstTry}</dd></div>
            <div><dt>{p.endBestRun}</dt><dd>{tally.bestRun}</dd></div>
            <div><dt>{t.pointsLabel}</dt><dd>{tally.xp}</dd></div>
          </dl>
          <DailyProgress />
          <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={restart} autoFocus>
            {p.playAgain}
          </button>
          <Link to="/" className="lg-btn lg-btn--quiet">{t.allGames}</Link>
        </main>
      </GameScreen>
    );
  }

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const progressLabel = fill(p.progress, { n: index + 1, total: questions.length });

  return (
    <GameScreen title={title} score={score} menuActions={menuActions} className="pg-screen">
      <main className="lg-board pg-board">
        <p className="lg-body-lg pg-intro">{intro}</p>
        <div className="pg-dots" aria-label={progressLabel}>
          {questions.map((_, i) => {
            const r = results[i];
            const state = r ? (r.solved ? "right" : "shown") : i === index ? "now" : "";
            return <span key={i} className={`pg-dots__dot${state ? ` pg-dots__dot--${state}` : ""}`} />;
          })}
          <span className="lg-caption">{progressLabel}</span>
        </div>
        <div className="pg-card">
          {confetti}
          <React.Fragment key={`${roundKey}-${index}`}>
            {renderQuestion({ question, done: Boolean(current), onDone: handleDone })}
          </React.Fragment>
        </div>
      </main>
      {current && (
        <div className="lg-tray">
          <div className="pg-result">
            {current.solved ? (
              <Feedback
                variant="correct"
                title={fill(p.correctTitle, { answer: current.answer })}
                fi={helper ? fill(fi.meansIn, { answer: current.answer, fi: current.meaning }) : undefined}
              >
                {current.firstTry ? p.correctFirstTry : fill(p.correctLater, { n: current.tries })}{" "}
                {fill(t.xpEarned, { n: current.xp })}
              </Feedback>
            ) : (
              <Feedback
                variant="retry"
                title={fill(p.retryTitle, { answer: current.answer })}
                fi={helper ? fi.retryBody : undefined}
              >
                {p.retryBody} {fill(t.xpEarned, { n: current.xp })}
              </Feedback>
            )}
            {current.banner && <Feedback variant="streak" icon={current.banner.icon} title={current.banner.title} />}
            <button type="button" ref={nextRef} className="lg-btn lg-btn--primary lg-btn--hero" onClick={goNext}>
              {isLast ? p.seeResults : p.next}
            </button>
          </div>
        </div>
      )}
    </GameScreen>
  );
}
