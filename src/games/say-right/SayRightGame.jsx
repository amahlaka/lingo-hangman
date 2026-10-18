import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { Feedback, GameScreen } from "../../components/lingo";
import { fill } from "../../i18n";
import { canRecord } from "../../lib/micRecorder";
import { askToBeVerified, pronounceStatus } from "../../lib/pronounce";
import { tipFor, buildSayRightRound, loadBest, roundAverage, roundSounds, saveBest, sayRightPool } from "./sayRightLogic";
import PracticeSession from "../practice/PracticeSession";
import { practicePool } from "../practice/practiceLogic";
import SayRightQuestion from "./SayRightQuestion";

export const SAY_RIGHT_KEYS = {
  correctTitle: "sayRightCorrectTitle",
  correctFirstTry: "sayRightCorrectFirstTry",
  correctLater: "sayRightCorrectLater",
  retryTitle: "sayRightRetryTitle",
};

// The end screen's average score, a new best, and the sounds to practise.
function RoundSummary({ results, p, lang }) {
  const average = roundAverage(results);
  const [best] = useState(() => loadBest());
  const [isBest] = useState(() => saveBest(average));
  const practise = roundSounds(results);
  if (average === null) return null;
  return (
    <section className="sr-summary">
      <p className="sr-summary__avg">
        <span className="lg-caption">{p.sayRightAverage}</span>
        <strong className="sr-summary__num">{average}</strong>
      </p>
      {isBest ? (
        <Feedback variant="streak" icon="★" title={best ? fill(p.sayRightNewBest, { n: best }) : p.sayRightFirstBest} />
      ) : (
        <p className="lg-caption">{fill(p.sayRightYourBest, { n: best })}</p>
      )}
      {practise.length > 0 && (
        <div className="sr-summary__sounds">
          <p className="lg-caption">{p.sayRightPractiseSounds}</p>
          <ul className="sr-summary__list">
            {practise.map(({ symbol }) => {
              const tip = tipFor(symbol);
              const title = tip ? tip.title?.[lang] || tip.title?.en : null;
              return (
                <li key={symbol}>
                  <span className="sr-tip__symbol">/{symbol}/</span> {title}
                  {tip?.lesson && (
                    <>
                      {" "}
                      <Link to={`/sounds?set=${encodeURIComponent(tip.lesson)}`}>{p.sayRightLesson}</Link>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// Why the game can't start, with what the learner can do about it.
function Gate({ gate, p, onAsk }) {
  const body = {
    loading: p.sayRightChecking,
    offline: p.sayRightUnavailable,
    unavailable: p.sayRightUnavailable,
    signedOut: p.sayRightSignIn,
    notVerified: p.sayRightNotVerified,
    requested: p.sayRightRequested,
    noRecorder: p.sayRightNoRecorder,
    limit: p.sayRightLimit,
  }[gate];
  return (
    <GameScreen title={p.sayRightName}>
      <main className="lg-board lg-page sr-gate">
        <p className="lg-body-lg">{p.sayRightAbout}</p>
        <Feedback variant="info" title={gate === "loading" ? p.sayRightChecking : p.sayRightForVerified}>
          {gate === "loading" ? null : body}
        </Feedback>
        <div className="lg-row">
          {gate === "signedOut" && <Link className="lg-btn lg-btn--primary" to="/account">{p.sayRightSignInButton}</Link>}
          {gate === "notVerified" && (
            <button type="button" className="lg-btn lg-btn--primary" onClick={onAsk}>{p.sayRightAsk}</button>
          )}
          {gate !== "loading" && <Link className="lg-btn lg-btn--quiet" to="/say">{p.sayRightTrySayIt}</Link>}
        </div>
      </main>
    </GameScreen>
  );
}

// Say a word bank word and get a score for every sound. Verified players only:
// the clip is scored by the server's phoneme recogniser (Talkies).
export default function SayRightGame() {
  const [params] = useSearchParams();
  const { t, lang } = useSettings();
  const p = t.practice;
  const search = params.toString();
  const [status, setStatus] = useState(null);
  const [left, setLeft] = useState(null);

  useEffect(() => {
    let live = true;
    pronounceStatus().then((s) => {
      if (!live) return;
      setStatus(s);
      setLeft(typeof s?.left === "number" ? s.left : null);
    });
    return () => {
      live = false;
    };
  }, []);

  const { pairs, learningLang, nativeLang } = useMemo(() => {
    const pool = practicePool(new URLSearchParams(search));
    return { ...pool, pairs: sayRightPool(pool.pairs) };
  }, [search]);

  const ask = async () => {
    const s = await askToBeVerified();
    if (s) setStatus(s);
  };

  const gate = !status
    ? "loading"
    : status.offline
      ? "offline"
      : status.signedOut
        ? "signedOut"
        : !status.available
          ? "unavailable"
          : !status.allowed
            ? status.requested
              ? "requested"
              : "notVerified"
            : !canRecord()
              ? "noRecorder"
              : status.left === 0
                ? "limit"
                : null;
  if (gate) return <Gate gate={gate} p={p} onAsk={ask} />;

  return (
    <PracticeSession
      gameId="say-right"
      title={p.sayRightName}
      intro={p.sayRightIntro}
      introExtra={typeof left === "number" && left <= 20 ? <p className="lg-caption">{fill(p.sayRightLeft, { n: left })}</p> : null}
      learningLang={learningLang}
      nativeLang={nativeLang}
      meaningInFeedback={false}
      keys={SAY_RIGHT_KEYS}
      buildQuestions={() => buildSayRightRound(pairs)}
      endNote={(results) => <RoundSummary results={results} p={p} lang={lang} />}
      renderQuestion={({ question, done, onDone }) => (
        <SayRightQuestion
          word={question}
          learningLang={learningLang}
          nativeLang={nativeLang}
          done={done}
          onDone={onDone}
          p={p}
          lang={lang}
          onLeft={setLeft}
        />
      )}
    />
  );
}
