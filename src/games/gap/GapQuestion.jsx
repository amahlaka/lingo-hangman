import React, { useState } from "react";
import { useSettings } from "../../app/SettingsContext";
import { sounds } from "../../lib/sounds";
import { maxMissesFor, splitGap } from "./gapLogic";

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The sentence with its gap. Once answered the right word sits in the gap.
function Sentence({ question, done, solved, p }) {
  const { before, after } = splitGap(question.text);
  const answer = before ? question.answer : capitalize(question.answer);
  if (done && !question.answer) {
    return <p className="gp-sentence" lang="en">{question.sentence}</p>;
  }
  return (
    <p className="gp-sentence" lang="en">
      {before}
      <span className={`gp-slot${done ? ` gp-slot--${solved ? "right" : "shown"} lg-pop` : ""}`}>
        {done ? answer : <span className="gp-sr">{p.gapLabel}</span>}
      </span>
      {after}
    </p>
  );
}

// Why the answer is what it is: the item's own note, then the set's rule.
// English UI shows English with the Finnish underneath; Finnish UI shows Finnish.
function Explanation({ question, lang, p }) {
  const parts = [question.why, question.rule].filter(Boolean);
  return (
    <section className="gp-why lg-reveal" aria-label={p.why}>
      <h3 className="lg-caption gp-why__title">{p.why}</h3>
      {parts.map((part, i) =>
        lang === "en" ? (
          <div key={i} className="gp-why__part">
            <p className="gp-why__text">{part.en}</p>
            <p className="gp-why__fi" lang="fi">{part.fi}</p>
          </div>
        ) : (
          <div key={i} className="gp-why__part">
            <p className="gp-why__text" lang="fi">{part.fi}</p>
          </div>
        )
      )}
    </section>
  );
}

// Pick the word that fits the gap. A miss strikes that option out; when the
// misses run out (one, if there are only two options) the answer is shown.
// Either way the Finnish explanation appears under the sentence.
export default function GapQuestion({ question, done, onDone }) {
  const { t, lang } = useSettings();
  const p = t.practice;
  const atStart = question.text.startsWith("___");
  const maxMisses = maxMissesFor(question.options);
  const [missed, setMissed] = useState([]);
  const [picked, setPicked] = useState(null);
  const [wobble, setWobble] = useState(null);

  const finish = (solved, misses) =>
    onDone({
      solved,
      firstTry: solved && misses === 0,
      tries: misses + 1,
      triesLeft: maxMisses - misses,
      answer: question.sentence,
      meaning: question.fi,
    });

  const choose = (option) => {
    if (done || picked !== null || missed.includes(option)) return;
    if (option === question.answer) {
      setPicked(option);
      finish(true, missed.length);
      return;
    }
    const nextMissed = [...missed, option];
    setMissed(nextMissed);
    setWobble(option);
    if (nextMissed.length < maxMisses) sounds.miss();
    else finish(false, nextMissed.length);
  };

  const stateOf = (option) => {
    if (option === question.answer && picked !== null) return "right";
    if (option === question.answer && done) return "shown";
    if (missed.includes(option)) return "miss";
    return "";
  };

  const label = (option) => (option === "" ? p.noWord : atStart ? capitalize(option) : option);

  return (
    <div className="lg-stack pg-question gp-question">
      <div className="gp-prompt">
        <span className="lg-caption">
          {question.title}
          {lang === "en" && <span lang="fi"> · {question.titleFi}</span>}
        </span>
        <Sentence question={question} done={done} solved={picked !== null} p={p} />
        <p className="gp-translation" lang="fi">{question.fi}</p>
      </div>
      <div className="pg-choices gp-choices" role="group" aria-label={p.gapChoices}>
        {question.options.map((option) => {
          const state = stateOf(option);
          return (
            <button
              key={option || "none"}
              type="button"
              lang={option ? "en" : undefined}
              className={`pg-choice${state ? ` pg-choice--${state}` : ""}${state === "right" ? " lg-pop" : ""}${
                state === "miss" && wobble === option ? " lg-wobble" : ""
              }`}
              onClick={() => choose(option)}
              disabled={done || state === "miss"}
              aria-label={state === "miss" ? `${label(option)}, ${p.notThisOne}` : undefined}
            >
              <span className="pg-choice__mark" aria-hidden="true">
                {state === "right" || state === "shown" ? "✓" : ""}
              </span>
              <span className="pg-choice__words">
                <span className="pg-choice__text">{label(option)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {!done && missed.length > 0 && <p className="pg-hint" role="status">{p.tryAnother}</p>}
      {done && <Explanation question={question} lang={lang} p={p} />}
    </div>
  );
}
