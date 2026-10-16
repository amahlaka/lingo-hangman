import React, { useState } from "react";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { ExampleText } from "../../components/lingo";
import { sounds } from "../../lib/sounds";
import { speak } from "../../lib/speech";
import { maxMissesFor } from "../gap/gapLogic";

// A short text to read, then its questions one at a time. Tapping a sentence
// reads it aloud and shows it in Finnish, as often as the learner likes. Each
// question is recorded on its own (onItem); the text is done after the last.
export default function ReadQuestion({ question, onItem, onDone }) {
  const { t, lang } = useSettings();
  const k = t.read;
  const p = t.practice;
  const [open, setOpen] = useState(() => new Set());
  const [at, setAt] = useState(0);
  const [missed, setMissed] = useState([]);
  const [wobble, setWobble] = useState(null);
  // Answered questions: { picked, solved }.
  const [answers, setAnswers] = useState([]);
  const done = at >= question.questions.length;

  const tap = (i) => {
    speak(question.sentences[i].en, { lang: "en" });
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const finish = (q, solved, wrongs) => {
    const misses = wrongs.length;
    const max = maxMissesFor(q.options);
    onItem({
      solved,
      wrong: wrongs,
      firstTry: solved && misses === 0,
      tries: misses + 1,
      triesLeft: solved ? max - misses : 0,
      answer: q.answer,
      meaning: q.fi || q.en,
    });
    setAnswers((a) => [...a, { solved }]);
    setMissed([]);
    const next = at + 1;
    setAt(next);
    if (next >= question.questions.length) onDone({ board: true });
  };

  const choose = (option) => {
    if (done) return;
    const q = question.questions[at];
    if (missed.includes(option)) return;
    if (option === q.answer) {
      finish(q, true, missed);
      return;
    }
    const nextMissed = [...missed, option];
    setWobble(option);
    if (nextMissed.length >= maxMissesFor(q.options)) {
      finish(q, false, nextMissed);
      return;
    }
    sounds.miss();
    setMissed(nextMissed);
  };

  const current = done ? null : question.questions[at];
  return (
    <div className="lg-stack pg-question rd-question">
      <article className="rd-text" aria-label={question.title}>
        <span className="lg-caption">
          {k.kinds[question.kind] || ""}
          {k.kinds[question.kind] ? " · " : ""}
          {question.title}
          {question.titleFi && <span lang="fi"> · {question.titleFi}</span>}
        </span>
        <div className="rd-lines">
          {question.sentences.map((s, i) => (
            <button key={i} type="button" className="rd-line" onClick={() => tap(i)} aria-expanded={open.has(i)}>
              <span lang="en">
                {s.speaker && <strong className="rd-line__who">{s.speaker}: </strong>}
                {s.en}
              </span>
              {open.has(i) && s.fi && <span className="rd-line__fi lg-reveal" lang="fi">{s.fi}</span>}
            </button>
          ))}
        </div>
        <p className="lg-caption">{k.tapHelp}</p>
      </article>

      <ol className="rd-answered">
        {question.questions.slice(0, at).map((q, i) => (
          <li key={i} className={`rd-answered__item rd-answered__item--${answers[i]?.solved ? "right" : "shown"}`}>
            <span lang="en">{q.en}</span>
            <strong lang="en">{q.answer}</strong>
          </li>
        ))}
      </ol>

      {current && (
        <div className="rd-ask">
          <p className="lg-caption">{fill(k.questionOf, { n: at + 1, total: question.questions.length })}</p>
          <p className="rd-ask__q" lang="en">{current.en}</p>
          {lang === "en" && current.fi && <p className="rd-ask__fi" lang="fi">{current.fi}</p>}
          <div className="pg-choices" role="group" aria-label={k.answers}>
            {current.options.map((option) => {
              const miss = missed.includes(option);
              return (
                <button
                  key={`${at}-${option}`}
                  type="button"
                  lang="en"
                  className={`pg-choice${miss ? " pg-choice--miss" : ""}${miss && wobble === option ? " lg-wobble" : ""}`}
                  onClick={() => choose(option)}
                  disabled={miss}
                  aria-label={miss ? `${option}, ${p.notThisOne}` : undefined}
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
      {done && question.note && (
        <div className="gp-why">
          <p className="gp-why__text"><ExampleText text={lang === "fi" ? question.note.fi || question.note.en : question.note.en} /></p>
          {lang === "en" && question.note.fi && <p className="gp-why__fi" lang="fi"><ExampleText text={question.note.fi} /></p>}
        </div>
      )}
    </div>
  );
}
