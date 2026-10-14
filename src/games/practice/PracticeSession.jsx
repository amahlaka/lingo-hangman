import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import i18n, { fill } from "../../i18n";
import { ACHIEVEMENTS } from "../../lib/progress";
import { DailyProgress, Feedback, GameScreen, ScorePill, WordRecap, useConfetti } from "../../components/lingo";
import { sounds } from "../../lib/sounds";
import { RULE_PEEK_COST, addResult, emptyTally } from "./practiceLogic";
import { RuleContext } from "./RuleBox";

// Below this screen height the bottom bar has no room for the rule, so it gets
// its own view after "Next" instead.
const SHORT_SCREEN = 560;

// Once a question is answered, decide where its explanation goes (see RuleBox).
// It is first drawn in place; if it ends up under the bottom bar it moves.
function useRulePlacement(current, trayRef) {
  const [mode, setMode] = useState("inline");
  const inlineRef = useRef(null);
  useLayoutEffect(() => {
    if (!current) {
      setMode("inline");
      return;
    }
    const box = inlineRef.current;
    if (!box || mode !== "inline") return;
    const view = window.innerHeight;
    const trayTop = trayRef.current ? trayRef.current.getBoundingClientRect().top : view;
    if (box.getBoundingClientRect().bottom <= Math.min(trayTop, view)) return;
    setMode(view < SHORT_SCREEN ? "step" : "tray");
  }, [current]);
  return { mode, inlineRef };
}

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
// A question that holds several words (a Word Pairs board) instead calls
// onItem(outcome) for each word as it is finished, then onDone({ board: true })
// once the whole question is done.
//
// Every answer is recorded with how long it took and, when the question has
// one, its lesson (`lesson`, `lessonId` or `setId`). A question may also carry
// its own `gameId` and `meaningInFeedback`; Quick play mixes games that way.
//
// Props:
//   gameId, title, intro   game identity and its one-line instruction
//   learningLang           language of the answers, reported with each word
//   nativeLang             language of the meanings, shown in the end-of-round word list
//   buildQuestions()       returns this round's questions
//   renderQuestion({ question, done, onDone, onItem })
//   empty                  message shown when there are too few words
//   endTitleKey, recapTitleKey  practice strings for the end screen ("words" by default)
//   meaningInFeedback      false when the question already shows the meaning
//   keys                   practice string keys to use instead of correctTitle,
//                          correctFirstTry, correctLater and retryTitle
//   endExtra               optional element shown above "All games" on the end screen
//   endNote(results)       optional element under the end screen numbers; each
//                          result carries the `question` it answered
//   boardExtra             optional element under the question card (Say it's
//                          mic debug panel)
export default function PracticeSession({
  gameId, title, intro, learningLang, nativeLang, buildQuestions, renderQuestion, empty,
  endTitleKey = "endTitle", recapTitleKey = "recapTitle", meaningInFeedback = true, keys, endExtra = null,
  endNote = null, boardExtra = null,
}) {
  const { t, lang } = useSettings();
  const { recordWord, dailyGoal } = useProgress();
  const { celebrate, confetti } = useConfetti();
  const p = t.practice;
  const fi = i18n.fi.practice;
  const helper = lang === "en";
  const k = { correctTitle: "correctTitle", correctFirstTry: "correctFirstTry", correctLater: "correctLater", retryTitle: "retryTitle", ...keys };

  const [questions, setQuestions] = useState(buildQuestions);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [marks, setMarks] = useState([]);
  const [tally, setTally] = useState(emptyTally);
  const [current, setCurrent] = useState(null);
  const [plus, setPlus] = useState(null);
  const [roundKey, setRoundKey] = useState(0);
  const nextRef = useRef(null);
  const trayRef = useRef(null);
  const [traySlot, setTraySlot] = useState(null);
  const [stepSlot, setStepSlot] = useState(null);
  // In "step" placement, true while the rule's own view is showing.
  const [ruleStep, setRuleStep] = useState(false);
  const rule = useRulePlacement(current, trayRef);
  const timer = useRef(null);
  // Words finished so far in a multi-word question, and the biggest banner they earned.
  const board = useRef({ items: [], banner: null });
  // When the current question (or the board's last word) appeared, for answer times.
  const shownAt = useRef(Date.now());

  const finished = questions.length > 0 && index >= questions.length;

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index, roundKey]);

  // Put focus on the one next step as soon as it appears.
  useEffect(() => {
    if (current && nextRef.current) nextRef.current.focus();
  }, [current]);

  useEffect(() => {
    if (!finished) return;
    celebrate("large");
    sounds.celebrate();
  }, [finished, celebrate]);

  const record = (outcome) => {
    const question = questions[index];
    const now = Date.now();
    const events = recordWord({
      gameId: question?.gameId || gameId,
      lesson: question?.lesson || question?.lessonId || question?.setId || undefined,
      word: outcome.answer,
      lang: learningLang,
      solved: outcome.solved,
      triesLeft: outcome.solved ? outcome.triesLeft : 0,
      perfect: outcome.solved && outcome.firstTry,
      ms: now - shownAt.current,
    });
    shownAt.current = now;
    const banner = bannerFor(events, { t, dailyGoal, answer: outcome.answer });
    setTally((s) => addResult(s, { ...outcome, xp: events.xpGained }));
    setResults((r) => [...r, { ...outcome, question }]);
    setPlus({ n: events.xpGained, key: Date.now() });
    return { xp: events.xpGained, banner };
  };

  const bigCelebration = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      celebrate("large");
      sounds.celebrate();
    }, 250);
  };

  const handleItem = (outcome) => {
    if (current) return;
    const { xp, banner } = record(outcome);
    const b = board.current;
    b.items.push({ ...outcome, xp });
    if (banner && (!b.banner || (banner.big && !b.banner.big))) b.banner = banner;
    sounds.correct();
    if (banner?.big) bigCelebration();
  };

  const handleDone = (outcome) => {
    if (current) return;
    if (outcome.board) {
      const { items, banner } = board.current;
      board.current = { items: [], banner: null };
      setCurrent({
        board: true,
        solved: true,
        total: items.length,
        firstTry: items.filter((i) => i.firstTry).length,
        xp: items.reduce((n, i) => n + i.xp, 0),
        banner,
      });
      setMarks((m) => [...m, "right"]);
      celebrate("medium");
      return;
    }
    const { xp, banner } = record(outcome);
    setCurrent({ ...outcome, xp, banner });
    setMarks((m) => [...m, outcome.solved ? "right" : "shown"]);
    if (outcome.solved) {
      celebrate("medium");
      sounds.correct();
    } else {
      sounds.shown();
    }
    if (banner?.big) bigCelebration();
  };

  const goNext = () => {
    // A question that only moved its reading into the bar has no rule to show.
    if (rule.mode === "step" && !ruleStep && stepSlot?.childElementCount) {
      setRuleStep(true);
      stepSlot?.scrollIntoView?.({ block: "start" });
      return;
    }
    setRuleStep(false);
    setCurrent(null);
    setIndex((i) => i + 1);
  };

  const restart = () => {
    setQuestions(buildQuestions());
    setIndex(0);
    setResults([]);
    setMarks([]);
    board.current = { items: [], banner: null };
    setTally(emptyTally());
    setCurrent(null);
    setRuleStep(false);
    setRoundKey((k) => k + 1);
  };

  // Help before answering (seeing the rule, word-type hints) costs some of
  // this round's points. `pay(cost)` returns false when there aren't enough.
  const pay = (cost) => {
    if (tally.xp < cost) return false;
    setTally((s) => ({ ...s, xp: s.xp - cost }));
    setPlus({ n: -cost, key: Date.now() });
    return true;
  };
  const points = current ? null : { xp: tally.xp, pay };
  const peek = current
    ? null
    : { cost: RULE_PEEK_COST, canAfford: tally.xp >= RULE_PEEK_COST, pay: () => pay(RULE_PEEK_COST) };
  const ruleContext = { mode: rule.mode, inlineRef: rule.inlineRef, traySlot, stepSlot, peek, points };

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
          <h2 className="lg-display">{fill(p[endTitleKey], { n: results.length })}</h2>
          {helper && <p className="lg-caption" lang="fi">{fill(fi[endTitleKey], { n: results.length })}</p>}
          <dl className="pg-stats">
            <div><dt>{p.endCorrect}</dt><dd>{tally.correct} / {results.length}</dd></div>
            <div><dt>{p.endFirstTry}</dt><dd>{tally.firstTry}</dd></div>
            <div><dt>{p.endBestRun}</dt><dd>{tally.bestRun}</dd></div>
            <div><dt>{t.pointsLabel}</dt><dd>{tally.xp}</dd></div>
          </dl>
          {endNote && endNote(results)}
          <WordRecap
            title={p[recapTitleKey]}
            words={results.map((r) => ({ learning: r.answer, native: r.meaning, solved: r.solved }))}
            learningLang={learningLang}
            nativeLang={nativeLang}
          />
          <DailyProgress />
        </main>
        <div className="lg-tray lg-tray--actions">
          <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={restart} autoFocus>
            {p.playAgain}
          </button>
          {endExtra}
          <Link to="/" className="lg-btn lg-btn--quiet">{t.allGames}</Link>
        </div>
      </GameScreen>
    );
  }

  const question = questions[index];
  const showMeaning = question.meaningInFeedback ?? meaningInFeedback;
  const isLast = index === questions.length - 1;
  const progressLabel = fill(p.progress, { n: index + 1, total: questions.length });

  return (
    <GameScreen title={title} score={score} menuActions={menuActions} className="pg-screen">
      <main className="lg-board pg-board">
        <p className="lg-body-lg pg-intro">{intro}</p>
        <div className="pg-dots" aria-label={progressLabel}>
          {questions.map((_, i) => {
            const state = marks[i] || (i === index ? "now" : "");
            return <span key={i} className={`pg-dots__dot${state ? ` pg-dots__dot--${state}` : ""}`} />;
          })}
          <span className="lg-caption">{progressLabel}</span>
        </div>
        <RuleContext.Provider value={ruleContext}>
          <div className="pg-card" hidden={ruleStep}>
            {confetti}
            <React.Fragment key={`${roundKey}-${index}`}>
              {renderQuestion({ question, done: Boolean(current), onDone: handleDone, onItem: handleItem })}
            </React.Fragment>
          </div>
          <div ref={setStepSlot} className="pg-card pg-rule-step" hidden={!ruleStep} />
        </RuleContext.Provider>
        {boardExtra}
      </main>
      {current && (
        <div className="lg-tray" ref={trayRef}>
          <div className="pg-result">
            {ruleStep ? null : current.board ? (
              <Feedback
                variant="correct"
                title={p.pairsDoneTitle}
                fi={helper ? fi.pairsDoneTitle : undefined}
              >
                {current.firstTry === current.total
                  ? p.pairsAllFirstTry
                  : fill(p.pairsFirstTry, { n: current.firstTry, total: current.total })}{" "}
                {fill(t.xpEarned, { n: current.xp })}
              </Feedback>
            ) : current.solved ? (
              <Feedback
                variant="correct"
                title={fill(p[k.correctTitle], { answer: current.answer })}
                fi={helper && showMeaning ? fill(fi.meansIn, { answer: current.answer, fi: current.meaning }) : undefined}
              >
                {current.firstTry ? p[k.correctFirstTry] : fill(p[k.correctLater], { n: current.tries })}{" "}
                {fill(t.xpEarned, { n: current.xp })}
              </Feedback>
            ) : (
              <Feedback
                variant="retry"
                title={fill(p[k.retryTitle], { answer: current.answer })}
                fi={helper ? fi.retryBody : undefined}
              >
                {p.retryBody} {fill(t.xpEarned, { n: current.xp })}
              </Feedback>
            )}
            {!ruleStep && current.banner && <Feedback variant="streak" icon={current.banner.icon} title={current.banner.title} />}
            <div ref={setTraySlot} className="pg-tray-slot" />
            <button type="button" ref={nextRef} className="lg-btn lg-btn--primary lg-btn--hero" onClick={goNext}>
              {isLast ? p.seeResults : p.next}
            </button>
          </div>
        </div>
      )}
    </GameScreen>
  );
}
