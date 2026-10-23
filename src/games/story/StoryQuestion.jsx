import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { keepInView, useConfetti } from "../../components/lingo";
import { sounds } from "../../lib/sounds";
import { speak, stopSpeaking } from "../../lib/speech";
import { maxMissesFor } from "../gap/gapLogic";
import { storyAsks } from "./storyLogic";

// A story read one part at a time. The sentences appear one by one; in each,
// the learner picks the Finnish meaning of every highlighted word or phrase
// from two or three. A found meaning stays under its part, and a finished
// sentence shows its whole Finnish and is read aloud. Each part is recorded on
// its own (onItem); the story is done after the last.
export default function StoryQuestion({ question, onItem, onDone }) {
  const { t, lang } = useSettings();
  const k = t.story;
  const asks = useMemo(() => storyAsks(question), [question]);
  const [step, setStep] = useState(0);
  // Each asked piece's result by "sentence-piece": "right" or "shown".
  const [results, setResults] = useState({});
  const [missed, setMissed] = useState([]);
  const [wobble, setWobble] = useState(null);
  const [cheer, setCheer] = useState(null);
  const { celebrate, confetti } = useConfetti();
  const askRef = useRef(null);
  const firstStep = useRef(true);

  const done = step >= asks.length;
  const [atSentence, atPiece] = done ? [question.sentences.length - 1, -1] : asks[step];
  const piece = done ? null : question.sentences[atSentence].pieces[atPiece];
  // Sentences up to the one being asked; a sentence with nothing to ask
  // comes along with the one before it.
  let shown = atSentence + 1;
  while (!done && shown < question.sentences.length && !question.sentences[shown].pieces.some((p) => p.fi)) shown += 1;
  const finished = (si) => question.sentences[si].pieces.every((p, pi) => !p.fi || results[`${si}-${pi}`]);

  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    keepInView(askRef.current);
  }, [step]);

  useEffect(() => () => stopSpeaking(), []);

  const hear = (text) => speak(text, { lang: "en" });

  const finish = (solved, wrongs) => {
    const misses = wrongs.length;
    const max = maxMissesFor(piece.options);
    onItem({
      solved,
      wrong: wrongs,
      firstTry: solved && misses === 0,
      tries: misses + 1,
      triesLeft: solved ? max - misses : 0,
      answer: piece.en,
      meaning: piece.fi,
    });
    const key = `${atSentence}-${atPiece}`;
    const next = { ...results, [key]: solved && !misses ? "right" : solved ? "found" : "shown" };
    setResults(next);
    setMissed([]);
    const sentence = question.sentences[atSentence];
    const sentenceDone = sentence.pieces.every((p, pi) => !p.fi || next[`${atSentence}-${pi}`]);
    if (sentenceDone) {
      const clean = sentence.pieces.every((p, pi) => !p.fi || next[`${atSentence}-${pi}`] === "right");
      setCheer({ sentence: atSentence, text: k.cheers[atSentence % k.cheers.length], clean });
      if (clean) celebrate("medium");
      hear(sentence.en);
    }
    setStep((s) => s + 1);
    if (step + 1 >= asks.length) onDone({ board: true });
  };

  const choose = (option) => {
    if (!piece || missed.includes(option)) return;
    if (option === piece.fi) {
      finish(true, missed);
      return;
    }
    const nextMissed = [...missed, option];
    setWobble(option);
    if (nextMissed.length >= maxMissesFor(piece.options)) {
      finish(false, nextMissed);
      return;
    }
    sounds.miss();
    setMissed(nextMissed);
  };

  return (
    <div className="lg-stack pg-question st-question">
      <article className="st-story" aria-label={question.title}>
        <span className="lg-caption">
          {t.read.kinds[question.kind] || ""}
          {t.read.kinds[question.kind] ? " · " : ""}
          {question.title}
          {question.titleFi && <span lang="fi"> · {question.titleFi}</span>}
        </span>
        <div className="st-lines">
          {confetti}
          {question.sentences.slice(0, shown).map((s, si) => {
            const complete = finished(si);
            return (
              <div key={si} className={`st-sentence${si === atSentence && !done ? " st-sentence--now" : ""} lg-reveal`}>
                <p className="st-sentence__en" lang="en">
                  {s.speaker && <strong className="st-who">{s.speaker}: </strong>}
                  {s.pieces.map((p, pi) => {
                    const result = results[`${si}-${pi}`];
                    const now = si === atSentence && pi === atPiece;
                    const cls = `st-piece${p.fi ? " st-piece--asked" : ""}${now ? " st-piece--now" : ""}${result ? ` st-piece--${result}` : ""}`;
                    return (
                      <React.Fragment key={pi}>
                        {pi > 0 && " "}
                        <span className={cls}>
                          <button type="button" className="st-piece__en" onClick={() => hear(p.en)} aria-current={now ? "true" : undefined}>
                            {p.text}
                          </button>
                          {result && <span className="st-piece__fi lg-pop" lang="fi">{p.fi}</span>}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </p>
                {complete && s.fi && (
                  <p className="st-sentence__fi lg-reveal" lang="fi">
                    <button type="button" className="st-sentence__hear" onClick={() => hear(s.en)} aria-label={fill(k.hearSentence, { sentence: s.en })}>
                      {s.fi}
                    </button>
                  </p>
                )}
                {cheer?.sentence === si && (
                  <p className={`st-cheer${cheer.clean ? " st-cheer--clean" : ""} lg-pop`} role="status">{cheer.clean ? k.cleanSentence : cheer.text}</p>
                )}
              </div>
            );
          })}
        </div>
        <p className="lg-caption">{k.tapHelp}</p>
      </article>

      {piece && (
        <div className="st-ask" ref={askRef}>
          <div className="st-ask__count">
            <span className="lg-caption">{fill(k.partOf, { n: step + 1, total: asks.length })}</span>
            <div className="lg-bar" aria-hidden="true">
              <div className="lg-bar__fill" style={{ width: `${(step / asks.length) * 100}%` }} />
            </div>
          </div>
          <p className="st-ask__q">
            {k.askBefore}
            <span className="st-ask__part" lang="en">{piece.en}</span>
            {k.askAfter}
          </p>
          {lang === "en" && <p className="st-ask__fi" lang="fi">{k.askFi}</p>}
          <div className="pg-choices st-choices" role="group" aria-label={k.answers}>
            {piece.options.map((option) => {
              const miss = missed.includes(option);
              return (
                <button
                  key={`${step}-${option}`}
                  type="button"
                  lang="fi"
                  className={`pg-choice${miss ? " pg-choice--miss" : ""}${miss && wobble === option ? " lg-wobble" : ""}`}
                  onClick={() => choose(option)}
                  disabled={miss}
                  aria-label={miss ? `${option}, ${t.practice.notThisOne}` : undefined}
                >
                  <span className="pg-choice__mark" aria-hidden="true" />
                  <span className="pg-choice__words">
                    <span className="pg-choice__text">{option}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {missed.length > 0 && <p className="pg-hint" role="status">{k.lookAgain}</p>}
        </div>
      )}
    </div>
  );
}
