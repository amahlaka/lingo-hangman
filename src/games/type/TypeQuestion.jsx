import React, { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { TriesMeter } from "../../components/lingo";
import { fill } from "../../i18n";
import { sounds } from "../../lib/sounds";
import { RATE_SLOW, canSpeak, speak, stopSpeaking } from "../../lib/speech";
import ListenMore from "../practice/ListenMore";
import { PaidHints } from "../practice/RuleBox";
import {
  MAX_TYPE_TRIES,
  TYPE_HINT_COSTS,
  answerShape,
  checkTyped,
  revealNextLetter,
  revealNextWord,
} from "./typeLogic";

// The answer as blanks, with the letters a hint has shown. Each word stays on one line.
function Shape({ shape, label }) {
  const words = [[]];
  shape.forEach((c) => (c.ch === " " ? words.push([]) : words[words.length - 1].push(c)));
  return (
    <p className="ty-shape" aria-label={label}>
      {words.map((word, w) => (
        <span key={w} className="ty-shape__word" aria-hidden="true">
          {word.map((c, i) =>
            c.letter ? (
              <span key={i} className={`ty-shape__letter${c.shown ? " ty-shape__letter--shown" : ""}`}>{c.shown ? c.ch : ""}</span>
            ) : (
              <span key={i} className="ty-shape__mark">{c.ch}</span>
            )
          )}
        </span>
      ))}
    </p>
  );
}

// What the learner typed last time, word by word, marked as right or to check.
function Attempt({ result, p }) {
  const hint = result.close
    ? p.typeClose
    : result.words.some((w) => w.ok)
      ? result.missing === 1
        ? p.typeMissingOne
        : result.missing > 1
          ? fill(p.typeMissing, { n: result.missing })
          : p.typeCheckWords
      : p.typeNotYet;
  return (
    <div className="sy-heard" role="status">
      {result.words.length > 1 && (
        <p className="sy-heard__words" aria-hidden="true">
          {result.words.map((w, i) => (
            <span key={i} className={`sy-word sy-word--${w.ok ? "ok" : "again"}`}>{w.text}</span>
          ))}
        </p>
      )}
      <p className="pg-hint">{hint}</p>
    </div>
  );
}

// One thing to type. `question.mode` is "word" (see the Finnish, type the
// English) or "dictation" (hear the English sentence, type it).
export default function TypeQuestion({ question, done, onDone, p, learningLang, nativeLang, nativeLabel }) {
  const { target, mode, alternatives } = question;
  const text = target.learning.trim();
  const dictation = mode === "dictation";
  const [value, setValue] = useState("");
  const [misses, setMisses] = useState(0);
  const [result, setResult] = useState(null);
  const [firstLetters, setFirstLetters] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [solved, setSolved] = useState(false);
  const inputRef = useRef(null);

  // A sentence to type is heard first.
  useEffect(() => {
    if (dictation) speak(text, { lang: learningLang });
    return () => stopSpeaking();
  }, [dictation, text, learningLang]);

  const focusInput = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange?.(end, end);
  };

  const finish = (solved, missCount) =>
    onDone({
      solved,
      firstTry: solved && missCount === 0,
      tries: missCount + 1,
      triesLeft: Math.max(0, MAX_TYPE_TRIES - missCount),
      answer: text,
      meaning: target.native,
    });

  const submit = (e) => {
    e.preventDefault();
    if (done || !value.trim()) return;
    const checked = checkTyped(text, value, alternatives);
    if (checked.correct) {
      setResult(null);
      setSolved(true);
      finish(true, misses);
      return;
    }
    setResult(checked);
    const next = misses + 1;
    setMisses(next);
    if (next >= MAX_TYPE_TRIES) finish(false, next);
    else {
      sounds.miss();
      focusInput();
    }
  };

  const reveal = (upTo) => {
    if (!upTo) return;
    setValue(upTo);
    setRevealed(upTo.length);
    setResult(null);
    // After React has put the new text in the field.
    setTimeout(focusInput, 0);
  };

  const nextLetter = revealNextLetter(text, value, revealed);
  const nextWord = revealNextWord(text, value, revealed);
  const hints = [];
  if (!firstLetters) {
    hints.push({ id: "shape", label: fill(p.typeHintShape, { n: TYPE_HINT_COSTS.shape }), cost: TYPE_HINT_COSTS.shape, onBuy: () => setFirstLetters(true) });
  }
  if (dictation) {
    if (nextWord) hints.push({ id: "word", label: fill(p.typeHintWord, { n: TYPE_HINT_COSTS.word }), cost: TYPE_HINT_COSTS.word, onBuy: () => reveal(revealNextWord(text, value, revealed)) });
  } else {
    if (nextLetter) hints.push({ id: "letter", label: fill(p.typeHintLetter, { n: TYPE_HINT_COSTS.letter }), cost: TYPE_HINT_COSTS.letter, onBuy: () => reveal(revealNextLetter(text, value, revealed)) });
    if (canSpeak()) hints.push({ id: "hear", label: fill(p.typeHintHear, { n: TYPE_HINT_COSTS.hear }), cost: TYPE_HINT_COSTS.hear, onBuy: () => speak(text, { lang: learningLang }) });
  }

  const showShape = !done && (firstLetters || revealed > 0);
  const left = MAX_TYPE_TRIES - misses;
  const isPhrase = text.includes(" ");

  return (
    <div className="lg-stack pg-question ty-question">
      <div className="pg-prompt">
        {dictation ? (
          <>
            <div className="sy-listen">
              <button type="button" className="lg-btn lg-btn--secondary" onClick={() => speak(text, { lang: learningLang })}>
                <Volume2 size={20} strokeWidth={2} aria-hidden="true" />
                {p.listen}
              </button>
              <button type="button" className="lg-btn lg-btn--quiet" onClick={() => speak(text, { lang: learningLang, rate: RATE_SLOW })}>
                {p.listenSlowly}
              </button>
              <ListenMore text={text} lang={learningLang} p={p} />
            </div>
            <p className="lg-caption ty-support" lang={nativeLang} data-testid="prompt-native">
              {nativeLabel}: {target.native}
            </p>
          </>
        ) : (
          <>
            <span className="lg-caption">{nativeLabel}</span>
            <p className={`pg-prompt__word${isPhrase || target.native.includes(" ") ? " pg-prompt__word--phrase" : ""}`} lang={nativeLang} data-testid="prompt-word">
              {target.native}
            </p>
          </>
        )}
      </div>

      {showShape && <Shape shape={answerShape(text, { revealed, firstLetters })} label={p.typeShapeLabel} />}

      <form className="ty-form" onSubmit={submit}>
        <label className="ty-label" htmlFor="ty-answer">{dictation ? p.typeLabelSentence : p.typeLabelWord}</label>
        <div className="ty-row">
          <input
            id="ty-answer"
            ref={inputRef}
            className="lg-input ty-input"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (result) setResult(null);
            }}
            readOnly={done}
            lang={learningLang}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            autoFocus
          />
          <button type="submit" className="lg-btn lg-btn--primary" disabled={done || !value.trim()}>
            {p.check}
          </button>
        </div>
      </form>

      {result && !done && <Attempt result={result} p={p} />}
      {done && !solved && (
        <p className="ty-answer" lang={learningLang}>
          <span className="lg-caption">{p.typeAnswer}</span> <strong>{text}</strong>{" "}
          {canSpeak() && (
            <button type="button" className="lg-btn lg-btn--quiet ty-answer__listen" onClick={() => speak(text, { lang: learningLang })} aria-label={p.listen}>
              <Volume2 size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </p>
      )}

      {!done && misses > 0 && (
        <div className="sy-after-miss">
          <TriesMeter left={left} total={MAX_TYPE_TRIES} label={left === 1 ? p.sayTryLeft : fill(p.sayTriesLeft, { n: left })} />
          <button type="button" className="lg-btn lg-btn--quiet" onClick={() => finish(false, misses)}>
            {p.typeShowAnswer}
          </button>
        </div>
      )}

      {!done && <PaidHints hints={hints} />}
    </div>
  );
}
