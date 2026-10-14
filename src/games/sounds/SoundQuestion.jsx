import React, { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { ExampleText } from "../../components/lingo";
import i18n, { fill } from "../../i18n";
import { sounds } from "../../lib/sounds";
import { RATE_SLOW, canSpeak, speak, stopSpeaking } from "../../lib/speech";
import { BY_EAR, markedIndexes, maxMissesFor } from "./soundsLogic";
import { RuleBox, RulePeek } from "../practice/RuleBox";

const LEARNING_LANG = "en-GB";

// The word with the lesson's letters picked out: "[k]nife" shows the k marked.
export function MarkedWord({ word, silent = false, className = "" }) {
  if (!word.parts) return <span className={className} lang="en">{word.text}</span>;
  const { before, marked, after } = word.parts;
  return (
    <span className={className} lang="en">
      {before}
      <span className={silent ? "snd-mark snd-mark--silent" : "snd-mark"}>{marked}</span>
      {after}
    </span>
  );
}

export function ListenButtons({ text, s, autoPlay = false }) {
  useEffect(() => {
    if (!autoPlay) return undefined;
    speak(text, { lang: LEARNING_LANG });
    return stopSpeaking;
  }, [text, autoPlay]);
  if (!canSpeak()) return null;
  return (
    <div className="pg-prompt--listen snd-listen">
      <button type="button" className="pg-listen" onClick={() => speak(text, { lang: LEARNING_LANG })}>
        <Volume2 size={28} strokeWidth={2} aria-hidden="true" />
        <span>{s.listen}</span>
      </button>
      <button type="button" className="lg-btn lg-btn--quiet" onClick={() => speak(text, { lang: LEARNING_LANG, rate: RATE_SLOW })}>
        {s.slowly}
      </button>
    </div>
  );
}

// English with the Finnish underneath in the English interface; only Finnish
// in the Finnish one.
function Both({ text, lang, className = "" }) {
  if (!text) return null;
  if (lang === "fi") return <p className={`${className}__text`} lang="fi"><ExampleText text={text.fi || text.en} /></p>;
  return (
    <>
      <p className={`${className}__text`}><ExampleText text={text.en} /></p>
      {text.fi && <p className={`${className}__fi`} lang="fi"><ExampleText text={text.fi} /></p>}
    </>
  );
}

// What the learner sees once the question is done: how to read the word the
// Finnish way, what it means, and a note or the lesson's rule. The reading
// travels with the rule (see RuleBox), so the bottom bar never covers it.
function AfterAnswer({ question, showRule, lang, s }) {
  const { word } = question;
  // Heard-word questions already show the reading and meaning on each option.
  const onOptions = BY_EAR.includes(question.kind);
  const say = !onOptions && word.say;
  const meaning = !onOptions && word.fi;
  const lead = say || meaning ? (
    <div className="snd-after__lead">
      {say && (
        <p className="snd-say">
          <span className="lg-caption">{s.sayLike}</span> <strong lang="fi">{word.say}</strong>
        </p>
      )}
      {meaning && <p className="snd-meaning" lang="fi">{word.fi}</p>}
    </div>
  ) : null;
  const hasRule = Boolean(word.note || showRule);
  if (!lead && !hasRule) return null;
  return (
    <div className="snd-after lg-reveal">
      <RuleBox label={s.rule} className="snd-why" lead={lead}>
        {hasRule && (
          <>
            {word.note && <div className="gp-why__part"><Both text={word.note} lang={lang} className="gp-why" /></div>}
            {showRule && <div className="gp-why__part"><Both text={question.explanation} lang={lang} className="gp-why" /></div>}
          </>
        )}
      </RuleBox>
    </div>
  );
}

// One pronunciation question; see lessonQuestions in ./soundsLogic.js for the
// three kinds. A miss strikes that option out; when the misses run out the
// answer is shown. Either way the word's Finnish reading and meaning appear.
export default function SoundQuestion({ question, done, onDone, showRule = false }) {
  const { t, lang } = useSettings();
  const s = t.sounds;
  const fi = i18n.fi.sounds;
  const helper = lang === "en";
  const { word, kind } = question;
  const silentAt = markedIndexes(word);
  const optionCount = kind === "silent" ? question.letters.length : question.options.length;
  const maxMisses = maxMissesFor(optionCount);
  const [missed, setMissed] = useState([]);
  const [picked, setPicked] = useState(null);
  const [wobble, setWobble] = useState(null);
  const [peeked, setPeeked] = useState(false);
  // Only the lesson's rule can be peeked at; the word's own note gives the answer away.
  const canPeek = showRule && Boolean(question.explanation);

  const isRight = (key) => (kind === "silent" ? silentAt.includes(key) : key === question.answer);

  const finish = (solved, misses) =>
    onDone({
      solved,
      firstTry: solved && misses === 0,
      tries: misses + 1,
      triesLeft: maxMisses - misses,
      answer: word.text,
      meaning: word.fi || (word.say ? `"${word.say}"` : ""),
    });

  const choose = (key) => {
    if (done || picked !== null || missed.includes(key)) return;
    if (isRight(key)) {
      setPicked(key);
      finish(true, missed.length);
      return;
    }
    const nextMissed = [...missed, key];
    setMissed(nextMissed);
    setWobble(key);
    if (nextMissed.length < maxMisses) sounds.miss();
    else finish(false, nextMissed.length);
  };

  const stateOf = (key) => {
    if (isRight(key) && (picked === key || (picked !== null && kind === "silent"))) return "right";
    if (isRight(key) && done) return "shown";
    if (missed.includes(key)) return "miss";
    return "";
  };

  const choiceClass = (key) => {
    const state = stateOf(key);
    return `${state ? ` pg-choice--${state}` : ""}${state === "right" && picked === key ? " lg-pop" : ""}${
      state === "miss" && wobble === key ? " lg-wobble" : ""
    }`;
  };

  const ask =
    kind === "silent" ? [s.askSilent, fi.askSilent]
    : kind === "sound" ? [fill(s.askSound, { letters: word.parts?.marked }), fill(fi.askSound, { letters: word.parts?.marked })]
    : kind === "pairs" ? [s.askPair, fi.askPair]
    : [s.askLetter, fi.askLetter];

  return (
    <div className="lg-stack pg-question snd-question">
      <div className="pg-prompt snd-prompt">
        <span className="lg-caption">
          {lang === "fi" ? question.title.fi || question.title.en : question.title.en}
          {helper && question.title.fi && <span lang="fi"> · {question.title.fi}</span>}
        </span>
        {kind === "sound" && <MarkedWord word={word} className="pg-prompt__word snd-word-big" />}
        {BY_EAR.includes(kind) && done && <span className="pg-prompt__word snd-word-big" lang="en">{word.text}</span>}
        <ListenButtons text={word.speak} s={s} autoPlay />
        <p className="lg-body-lg snd-ask">{ask[0]}</p>
        {helper && <p className="lg-caption" lang="fi">{ask[1]}</p>}
      </div>

      {kind === "silent" && (
        <div className="snd-tiles" role="group" aria-label={s.lettersTiles} lang="en">
          {question.letters.map((letter, i) => {
            const state = stateOf(i);
            const silent = done && silentAt.includes(i);
            return (
              <button
                key={i}
                type="button"
                className={`snd-tile${choiceClass(i).replace(/pg-choice--/g, "snd-tile--")}${silent ? " snd-tile--silent" : ""}`}
                onClick={() => choose(i)}
                disabled={done || state === "miss"}
                aria-label={silent ? `${letter}, ${s.silentMark}` : state === "miss" ? `${letter}, ${t.practice.notThisOne}` : undefined}
              >
                {letter}
              </button>
            );
          })}
        </div>
      )}

      {kind !== "silent" && (
        <div className="pg-choices snd-choices" role="group" aria-label={kind === "sound" ? s.soundChoices : kind === "pairs" ? s.pairChoices : s.letterChoices}>
          {question.options.map((option, i) => {
            const state = stateOf(option.id);
            const label = lang === "fi" && option.label.fi ? option.label.fi : option.label.en;
            return (
              <button
                key={option.id}
                type="button"
                lang={BY_EAR.includes(kind) ? "en" : undefined}
                className={`pg-choice${choiceClass(option.id)}${kind === "letters" ? " snd-letter" : ""}`}
                onClick={() => choose(option.id)}
                disabled={done || state === "miss"}
                aria-label={state === "miss" ? `${label}, ${t.practice.notThisOne}` : undefined}
              >
                <span className="pg-choice__mark" aria-hidden="true">
                  {state === "right" || state === "shown" ? "✓" : ""}
                </span>
                <span className="pg-choice__words">
                  <span className="pg-choice__text">{label}</span>
                  {kind === "sound" && helper && option.label.fi && (
                    <span className="pg-choice__native" lang="fi">{option.label.fi}</span>
                  )}
                  {BY_EAR.includes(kind) && done && (option.say || option.fi) && (
                    <span className="pg-choice__native lg-reveal" lang="fi" style={{ "--i": i }}>
                      {[option.say, option.fi].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!done && missed.length > 0 && <p className="pg-hint" role="status">{t.practice.tryAnother}</p>}
      {!done && peeked && (
        <RuleBox label={s.rule} className="snd-why">
          <div className="gp-why__part"><Both text={question.explanation} lang={lang} className="gp-why" /></div>
        </RuleBox>
      )}
      {!done && !peeked && canPeek && <RulePeek onPeek={() => setPeeked(true)} />}
      {done && <AfterAnswer question={question} showRule={showRule} lang={lang} s={s} />}
    </div>
  );
}
