import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { Feedback, GameScreen } from "../../components/lingo";
import { fill } from "../../i18n";
import { canRecord } from "../../lib/micRecorder";
import { askToBeVerified, pronounceStatus } from "../../lib/pronounce";
import {
  buildSayRightRound, loadBest, roundAverage, roundSounds, saveBest, sayRightPool, tipFor, weakestSounds,
} from "./sayRightLogic";
import { buildReadRound, readPool } from "./readAloudLogic";
import ReadAloudQuestion from "./ReadAloudQuestion";
import PracticeSession from "../practice/PracticeSession";
import { practicePool } from "../practice/practiceLogic";
import SayRightQuestion from "./SayRightQuestion";

export const SAY_RIGHT_KEYS = {
  correctTitle: "sayRightCorrectTitle",
  correctFirstTry: "sayRightCorrectFirstTry",
  correctLater: "sayRightCorrectLater",
  retryTitle: "sayRightRetryTitle",
};

// A sound with the title of its word bank tip and a link to its lesson.
function SoundLine({ symbol, lang, p, extra = null }) {
  const tip = tipFor(symbol);
  const title = tip ? tip.title?.[lang] || tip.title?.en : null;
  return (
    <li>
      <span className="sr-tip__symbol">/{symbol}/</span> {title}
      {extra}
      {tip?.lesson && (
        <>
          {" "}
          <Link to={`/sounds?set=${encodeURIComponent(tip.lesson)}`}>{p.sayRightLesson}</Link>
        </>
      )}
    </li>
  );
}

// The end screen's average score, a new best, the sounds to practise from
// this round and the weakest sounds over every round on this device.
function RoundSummary({ results, p, lang, mode }) {
  const average = roundAverage(results);
  const [best] = useState(() => loadBest(mode));
  const [isBest] = useState(() => saveBest(average, mode));
  const practise = roundSounds(results);
  const [history] = useState(() => weakestSounds());
  const roundSymbols = new Set(practise.map((s) => s.symbol));
  const lasting = history.filter((s) => !roundSymbols.has(s.symbol));
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
            {practise.map(({ symbol }) => <SoundLine key={symbol} symbol={symbol} lang={lang} p={p} />)}
          </ul>
        </div>
      )}
      {lasting.length > 0 && (
        <div className="sr-summary__sounds">
          <p className="lg-caption">{p.sayRightHistoryTitle}</p>
          <ul className="sr-summary__list">
            {lasting.map(({ symbol, rate }) => (
              <SoundLine
                key={symbol}
                symbol={symbol}
                lang={lang}
                p={p}
                extra={<span className="lg-caption"> · {fill(p.sayRightHistoryRate, { n: Math.round(rate * 100) })}</span>}
              />
            ))}
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

export const MODES = ["words", "read"];

// Words or Read aloud, under the instruction.
function ModeSwitch({ mode, onChange, p }) {
  return (
    <div className="sr-modes lg-seg" role="group" aria-label={p.sayRightModeLabel}>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          className={`lg-seg__opt${mode === m ? " lg-seg__opt--on" : ""}`}
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
        >
          {m === "read" ? p.sayRightModeRead : p.sayRightModeWords}
        </button>
      ))}
    </div>
  );
}

// Say a word bank word, or read a sentence or two aloud, and get a score for
// every sound. Verified players only: the clip is scored by the server's
// phoneme recogniser (Talkies).
export default function SayRightGame() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t, lang } = useSettings();
  const p = t.practice;
  const mode = params.get("mode") === "read" ? "read" : "words";
  const search = (() => {
    const rest = new URLSearchParams(params);
    rest.delete("mode");
    return rest.toString();
  })();
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
  const passages = useMemo(() => readPool(), []);

  const ask = async () => {
    const s = await askToBeVerified();
    if (s) setStatus(s);
  };
  const chooseMode = (m) => {
    const next = new URLSearchParams(params);
    if (m === "read") next.set("mode", "read");
    else next.delete("mode");
    const q = next.toString();
    navigate(`/say-right${q ? `?${q}` : ""}`, { replace: true });
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

  const introExtra = (
    <>
      <ModeSwitch mode={mode} onChange={chooseMode} p={p} />
      {typeof left === "number" && left <= 20 && <p className="lg-caption">{fill(p.sayRightLeft, { n: left })}</p>}
    </>
  );

  if (mode === "read") {
    return (
      <PracticeSession
        key="read"
        gameId="say-right"
        title={p.sayRightName}
        intro={p.sayRightReadIntro}
        introExtra={introExtra}
        learningLang={learningLang}
        nativeLang={nativeLang}
        meaningInFeedback={false}
        keys={SAY_RIGHT_KEYS}
        endTitleKey="endTitleSentences"
        recapTitleKey="recapSentences"
        empty={p.sayRightNoPassages}
        buildQuestions={() => buildReadRound(passages).map((passage) => ({ id: passage.id, learning: passage.text.en, native: passage.text[nativeLang] || "", passage }))}
        endNote={(results) => <RoundSummary results={results} p={p} lang={lang} mode="read" />}
        renderQuestion={({ question, done, onDone }) => (
          <ReadAloudQuestion
            passage={question.passage}
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

  return (
    <PracticeSession
      key="words"
      gameId="say-right"
      title={p.sayRightName}
      intro={p.sayRightIntro}
      introExtra={introExtra}
      learningLang={learningLang}
      nativeLang={nativeLang}
      meaningInFeedback={false}
      keys={SAY_RIGHT_KEYS}
      buildQuestions={() => buildSayRightRound(pairs)}
      endNote={(results) => <RoundSummary results={results} p={p} lang={lang} mode="words" />}
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
