import React, { useEffect, useRef, useState } from "react";
import { Mic, Volume2 } from "lucide-react";
import { TriesMeter } from "../../components/lingo";
import { fill } from "../../i18n";
import { getItem } from "../../lib/words";
import { sounds } from "../../lib/sounds";
import { isBlockingError, isOnDeviceFailure, listenOnce } from "../../lib/speechRecognition";
import { RATE_SLOW, speak, stopSpeaking } from "../../lib/speech";
import ListenMore from "../practice/ListenMore";
import { MAX_SAY_TRIES, checkSaid } from "./sayLogic";
import { useProgress } from "../../app/ProgressContext";
import { wordStanding } from "../../lib/adaptive";
import { wordKey } from "../../lib/progress";
import { useQuestionControls } from "../practice/questionControls";

// What the recogniser heard, with the target's words marked as heard or not.
function HeardLine({ result, done, p }) {
  if (result.nothing) return <p className="pg-hint" role="status">{p.sayNothing}</p>;
  const someHeard = result.words.some((w) => w.ok);
  const hint = result.matched || done
    ? null
    : result.close
      ? p.sayClose
      : result.words.length > 1 && someHeard
        ? p.sayPartly
        : p.sayNotYet;
  return (
    <div className="sy-heard" role="status">
      <p className="sy-heard__said">
        <span className="lg-caption">{p.sayHeard}</span> <q lang="en">{result.heard}</q>
      </p>
      {(result.words.length > 1 || result.matched) && (
        <p className="sy-heard__words" aria-hidden="true">
          {result.words.map((w, i) => (
            <span
              key={i}
              className={`sy-word sy-word--${w.ok ? "ok" : "again"}${result.matched && w.ok ? " lg-pop" : ""}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              {w.text}
            </span>
          ))}
        </p>
      )}
      {hint && <p className="pg-hint">{hint}</p>}
    </div>
  );
}

// One word to say. In "mic" mode the browser listens and checks it; in "self"
// mode (no speech recognition, or no microphone) the learner checks themselves.
export default function SayQuestion({
  word, learningLang, nativeLang, done, onDone, p, mode, selfNote, privacy, prepareOnDevice, onBlocked, onOnDeviceFailed,
}) {
  const [misses, setMisses] = useState(0);
  const [state, setState] = useState("idle"); // idle | preparing | listening
  const [result, setResult] = useState(null);
  // The Finnish reading shows from the start, except for words the learner
  // already says well; those keep it one free tap away.
  const { state: progress } = useProgress();
  const [showSay, setShowSay] = useState(() => {
    const words = progress?.words || {};
    const entry = words[wordKey(word.learning, learningLang)] || words[wordKey(word.learning, "en")];
    return wordStanding(entry) !== "known";
  });
  const session = useRef(null);
  const alive = useRef(true);
  // What the microphone heard on each try, for problem reports.
  const heardNow = useRef([]);
  const text = word.learning;

  // Play the model first, so the learner hears it before they speak.
  useEffect(() => {
    alive.current = true;
    speak(text, { lang: learningLang });
    return () => {
      alive.current = false;
      stopSpeaking();
      const s = session.current;
      session.current = null;
      if (s) s.abort();
    };
  }, [text, learningLang]);

  const finish = (solved, missCount) =>
    onDone({
      solved,
      firstTry: solved && missCount === 0,
      tries: missCount + 1,
      triesLeft: Math.max(0, MAX_SAY_TRIES - missCount),
      answer: text,
      meaning: word.native,
      heard: heardNow.current,
      // What was heard on the wrong tries (the last one is the right one when solved).
      wrong: (solved && missCount > 0 ? heardNow.current.slice(0, -1) : solved ? [] : heardNow.current).filter((h) => typeof h === "string" && h),
    });
  useQuestionControls({
    skip: () => !done && finish(false, misses),
    reportExtra: () => ({ heard: heardNow.current, recognition: mode === "self" ? "none" : privacy }),
  });

  const listen = async () => {
    if (state === "listening") {
      if (session.current) session.current.stop();
      return;
    }
    if (done || state !== "idle") return;
    stopSpeaking();
    let onDevice = privacy === "local";
    if (privacy === "downloadable") {
      setState("preparing");
      onDevice = await prepareOnDevice();
      if (!alive.current) return;
    }
    setResult(null);
    setState("listening");
    let s = listenOnce({ lang: learningLang, onDevice });
    session.current = s;
    let { alternatives, error } = await s.done;
    if (!alive.current || session.current !== s) return;
    // The browser said it could listen on the device but then couldn't: carry
    // on with its online service, for this tap and the rest of the round.
    if (onDevice && !alternatives.length && isOnDeviceFailure(error)) {
      onOnDeviceFailed?.(error);
      s = listenOnce({ lang: learningLang, onDevice: false });
      session.current = s;
      ({ alternatives, error } = await s.done);
      if (!alive.current || session.current !== s) return;
    }
    session.current = null;
    setState("idle");
    if (!alternatives.length) {
      if (isBlockingError(error)) onBlocked(error);
      else setResult({ nothing: true });
      return;
    }
    const checked = checkSaid(text, alternatives);
    setResult(checked);
    heardNow.current = [...heardNow.current, checked.heard].slice(-MAX_SAY_TRIES);
    if (checked.matched) {
      finish(true, misses);
      return;
    }
    const next = misses + 1;
    setMisses(next);
    if (next >= MAX_SAY_TRIES) finish(false, next);
    else sounds.miss();
  };

  // The word bank's IPA, always shown, and its reading in the learner's own
  // language ("waader"), shown once paid for or answered.
  const item = getItem(word.id);
  const ipa = item?.ipa?.[learningLang] || item?.ipa?.en;
  const reading = item?.say?.[nativeLang];
  const isPhrase = text.trim().includes(" ");
  const listening = state === "listening";
  const left = MAX_SAY_TRIES - misses;

  return (
    <div className="lg-stack pg-question sy-question">
      <div className="pg-prompt">
        <p className={`pg-prompt__word${isPhrase ? " pg-prompt__word--phrase" : ""}`} lang={learningLang} data-testid="prompt-word">
          {text}
        </p>
        {ipa && <p className="sy-ipa" data-testid="prompt-ipa">{ipa}</p>}
        <p className="lg-caption" lang={nativeLang}>{word.native}</p>
        {reading && (showSay || done) && (
          <p className="snd-say sy-say">
            <span className="lg-caption">{p.sayLike}</span> <strong lang={nativeLang}>{reading}</strong>
          </p>
        )}
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
      </div>

      {mode === "mic" ? (
        <>
          <div className="sy-mic-area">
            <button
              type="button"
              className={`sy-mic${listening ? " sy-mic--on" : ""}`}
              onClick={listen}
              disabled={done || state === "preparing"}
              aria-pressed={listening}
            >
              <span className="sy-mic__circle" aria-hidden="true">
                <Mic size={36} strokeWidth={2} />
              </span>
              <span className="sy-mic__label">
                {listening ? p.sayListening : state === "preparing" ? p.sayPreparing : misses > 0 && !done ? p.sayAgain : p.sayTap}
              </span>
            </button>
          </div>
          {result && <HeardLine result={result} done={done} p={p} />}
          {!done && misses > 0 && (
            <div className="sy-after-miss">
              <TriesMeter left={left} total={MAX_SAY_TRIES} label={left === 1 ? p.sayTryLeft : fill(p.sayTriesLeft, { n: left })} />
            </div>
          )}
          <p className="lg-caption sy-privacy">{privacy === "local" ? p.sayPrivacyLocal : p.sayPrivacyOnline}</p>
        </>
      ) : (
        <>
          {selfNote && <p className="lg-caption sy-self-note">{selfNote}</p>}
          {!done && (
            <div className="sy-self">
              <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={() => finish(true, 0)}>
                {p.saySaidIt}
              </button>
            </div>
          )}
        </>
      )}
      {!done && reading && !showSay && (
        <button type="button" className="lg-btn lg-btn--quiet sy-show-say" onClick={() => setShowSay(true)}>
          {p.hintSay}
        </button>
      )}
    </div>
  );
}
