import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { ExampleText, keepInView, useConfetti } from "../../components/lingo";
import { sounds } from "../../lib/sounds";
import { speak, stopSpeaking } from "../../lib/speech";
import { maxMissesFor } from "../gap/gapLogic";
import { storyAsks } from "./storyLogic";

// A classic story translated phrase by phrase. The English sentences appear
// one by one; for the highlighted phrase the learner picks its Finnish from
// two or three, and the picked phrases build the Finnish sentence under the
// English one, as words build a sentence in Build the phrase. A finished
// sentence is read aloud and cheered. Each phrase is recorded on its own
// (onItem); the story is done after the last.
export default function StoryQuestion({ question, onItem, onDone }) {
  const { t, lang } = useSettings();
  const k = t.story;
  const asks = useMemo(() => storyAsks(question), [question]);
  const [step, setStep] = useState(0);
  // Each phrase's result by "sentence-phrase": "right", "found" or "shown".
  const [results, setResults] = useState({});
  const [missed, setMissed] = useState([]);
  const [wobble, setWobble] = useState(null);
  const [cheer, setCheer] = useState(null);
  const { celebrate, confetti } = useConfetti();
  const askRef = useRef(null);
  const firstStep = useRef(true);

  const done = step >= asks.length;
  const [atSentence, atPhrase] = done ? [question.sentences.length - 1, -1] : asks[step];
  const phrase = done ? null : question.sentences[atSentence].phrases[atPhrase];

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
    const max = maxMissesFor(phrase.options);
    onItem({
      solved,
      wrong: wrongs,
      firstTry: solved && misses === 0,
      tries: misses + 1,
      triesLeft: solved ? max - misses : 0,
      // Recorded without the quotes and punctuation at its ends.
      answer: phrase.en.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ""),
      meaning: phrase.fi,
    });
    const next = { ...results, [`${atSentence}-${atPhrase}`]: solved && !misses ? "right" : solved ? "found" : "shown" };
    setResults(next);
    setMissed([]);
    const sentence = question.sentences[atSentence];
    if (atPhrase === sentence.phrases.length - 1) {
      const clean = sentence.phrases.every((_, pi) => next[`${atSentence}-${pi}`] === "right");
      setCheer({ sentence: atSentence, clean });
      if (clean) celebrate("medium");
      hear(sentence.en);
    }
    setStep((s) => s + 1);
    if (step + 1 >= asks.length) onDone({ board: true });
  };

  const choose = (option) => {
    if (!phrase || missed.includes(option)) return;
    if (option === phrase.fi) {
      finish(true, missed);
      return;
    }
    const nextMissed = [...missed, option];
    setWobble(option);
    if (nextMissed.length >= maxMissesFor(phrase.options)) {
      finish(false, nextMissed);
      return;
    }
    sounds.miss();
    setMissed(nextMissed);
  };

  const source = question.source && ((lang === "fi" && question.source.fi) || question.source.en);
  const note = done && question.note && (lang === "fi" ? question.note.fi || question.note.en : question.note.en);

  return (
    <div className="lg-stack pg-question st-question">
      <article className="st-story" aria-label={question.title}>
        <header className="st-head">
          <h2 className="st-head__title">{question.title}</h2>
          {question.titleFi && <span className="st-head__fi" lang="fi">{question.titleFi}</span>}
          {source && <span className="lg-caption">{source}</span>}
        </header>
        <div className="st-lines">
          {confetti}
          {question.sentences.slice(0, atSentence + 1).map((s, si) => {
            const now = !done && si === atSentence;
            const placed = s.phrases.filter((_, pi) => results[`${si}-${pi}`]);
            const complete = placed.length === s.phrases.length;
            return (
              <div key={si} className={`st-sentence${now ? " st-sentence--now" : ""} lg-reveal`}>
                <p className="st-sentence__en" lang="en">
                  {s.phrases.map((p, pi) => {
                    const result = results[`${si}-${pi}`];
                    const current = now && pi === atPhrase;
                    return (
                      <React.Fragment key={pi}>
                        {pi > 0 && " "}
                        {/* A span, not a button, so a long phrase wraps with the sentence. */}
                        <span
                          role="button"
                          tabIndex={0}
                          className={`st-phrase${current ? " st-phrase--now" : ""}${result ? ` st-phrase--${result}` : ""}`}
                          onClick={() => hear(p.en)}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), hear(p.en))}
                          aria-current={current ? "true" : undefined}
                        >
                          {p.en}
                        </span>
                      </React.Fragment>
                    );
                  })}
                </p>
                {complete ? (
                  <p className="st-sentence__fi" lang="fi">
                    <button type="button" className="st-sentence__hear" onClick={() => hear(s.en)} aria-label={fill(k.hearSentence, { sentence: s.en })}>
                      {s.phrases.map((p, pi) => (
                        <React.Fragment key={pi}>
                          {pi > 0 && " "}
                          <span className={`st-fi st-fi--${results[`${si}-${pi}`]}`}>{p.fi}</span>
                        </React.Fragment>
                      ))}
                    </button>
                  </p>
                ) : (
                  <div className="st-build" lang="fi" aria-label={k.yourTranslation}>
                    {placed.map((p, pi) => (
                      <span key={pi} className={`pg-chip pg-chip--placed st-chip st-chip--${results[`${si}-${pi}`]} lg-pop`}>{p.fi}</span>
                    ))}
                    <span className="pg-chip pg-chip--gap st-chip st-chip--next" aria-hidden="true">…</span>
                  </div>
                )}
                {cheer?.sentence === si && (
                  <p className={`st-cheer${cheer.clean ? " st-cheer--clean" : ""} lg-pop`} role="status">
                    {cheer.clean ? k.cleanSentence : k.cheers[si % k.cheers.length]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="lg-caption">{k.tapHelp}</p>
      </article>

      {phrase && (
        <div className="st-ask" ref={askRef}>
          <div className="st-ask__count">
            <span className="lg-caption">{fill(k.phraseOf, { n: step + 1, total: asks.length })}</span>
            <div className="lg-bar" aria-hidden="true">
              <div className="lg-bar__fill" style={{ width: `${(step / asks.length) * 100}%` }} />
            </div>
          </div>
          <p className="st-ask__q">{k.ask}</p>
          <p className="st-ask__part" lang="en">{phrase.en}</p>
          <div className="pg-bank st-options" role="group" aria-label={k.answers} lang="fi">
            {phrase.options.map((option) => {
              const miss = missed.includes(option);
              return (
                <button
                  key={`${step}-${option}`}
                  type="button"
                  className={`pg-chip st-option${miss ? " st-option--miss" : " lg-pop"}${miss && wobble === option ? " lg-wobble" : ""}`}
                  onClick={() => choose(option)}
                  disabled={miss}
                  aria-label={miss ? `${option}, ${t.practice.notThisOne}` : undefined}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {missed.length > 0 && <p className="pg-hint" role="status">{k.lookAgain}</p>}
        </div>
      )}
      {note && (
        <div className="gp-why">
          <p className="gp-why__text"><ExampleText text={note} /></p>
          {lang === "en" && question.note.fi && <p className="gp-why__fi" lang="fi"><ExampleText text={question.note.fi} /></p>}
        </div>
      )}
    </div>
  );
}
