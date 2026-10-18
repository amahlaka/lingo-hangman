import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Mic, Volume2 } from "lucide-react";
import { TriesMeter } from "../../components/lingo";
import { fill } from "../../i18n";
import { sounds } from "../../lib/sounds";
import { RATE_SLOW, speak, stopSpeaking } from "../../lib/speech";
import { recordClip } from "../../lib/micRecorder";
import { scoreClip } from "../../lib/pronounce";
import { scorePronunciation, soundsToPractise } from "../../lib/phonemes";
import { useQuestionControls } from "../practice/questionControls";
import { GREAT_SCORE, MAX_SAY_RIGHT_TRIES, PASS_SCORE, firstTip, ipaOf, rankKey } from "./sayRightLogic";

// Counts up to `value` once, for a little moment of suspense.
function useCountUp(value, ms = 700) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (typeof value !== "number") return undefined;
    if (typeof window === "undefined" || !window.requestAnimationFrame || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return shown;
}

// The word's IPA with every sound marked as said right, nearly or not yet.
export function SoundMap({ result, p }) {
  const words = [];
  for (const s of result.sounds) (words[s.word] ||= []).push(s);
  return (
    <div className="sr-map">
      <p className="sr-map__ipa" aria-label={p.sayRightSoundsLabel}>
        /
        {words.map((w, wi) => (
          <span key={wi} className="sr-map__word">
            {w.map((s, i) => (
              <span
                key={i}
                className={`sr-sound sr-sound--${s.status}`}
                title={s.status === "ok" ? p.sayRightSoundOk : s.status === "close" ? p.sayRightSoundClose : p.sayRightSoundMiss}
                style={{ animationDelay: `${(wi * 4 + i) * 60}ms` }}
              >
                {s.text}
              </span>
            ))}
          </span>
        ))}
        /
      </p>
      <p className="sr-key lg-caption" aria-hidden="true">
        <span className="sr-key__item sr-sound--ok">{p.sayRightSoundOk}</span>
        <span className="sr-key__item sr-sound--close">{p.sayRightSoundClose}</span>
        <span className="sr-key__item sr-sound--miss">{p.sayRightSoundMiss}</span>
      </p>
      {result.heard && (
        <p className="lg-caption sr-heard">
          {p.sayHeard} <span className="sr-heard__ipa">/{result.heard.replace(/\s+/g, "")}/</span>
        </p>
      )}
    </div>
  );
}

// The score of the last try, with its name.
function ScoreBadge({ score, best, p }) {
  const shown = useCountUp(score);
  const pass = score >= PASS_SCORE;
  return (
    <div className={`sr-score${pass ? " sr-score--pass" : ""}`} role="status">
      <span className="sr-score__num lg-pop" aria-label={fill(p.sayRightScoreLabel, { n: score })}>{shown}</span>
      <span className="sr-score__of" aria-hidden="true">/100</span>
      <span className="sr-score__rank">{p[rankKey(score)]}</span>
      {best !== null && best > score && <span className="lg-caption">{fill(p.sayRightBestTry, { n: best })}</span>}
    </div>
  );
}

// A word bank tip on a missed sound.
function SoundTip({ found, lang, p }) {
  const { sound, tip } = found;
  const text = (m) => m?.[lang] || m?.en;
  return (
    <aside className="sr-tip">
      <p className="sr-tip__title">
        <span className="sr-tip__symbol">/{sound.symbol}/</span> {text(tip.title)}
      </p>
      <p className="sr-tip__body">{text(tip.tip).replace(/\*/g, "")}</p>
      <div className="sr-tip__actions">
        {tip.example && (
          <button type="button" className="lg-btn lg-btn--quiet" onClick={() => speak(tip.example, { lang: "en" })}>
            <Volume2 size={18} strokeWidth={2} aria-hidden="true" />
            {fill(p.sayRightHearExample, { word: tip.example })}
          </button>
        )}
        {tip.lesson && (
          <Link className="lg-btn lg-btn--quiet" to={`/sounds?set=${encodeURIComponent(tip.lesson)}`}>
            {p.sayRightLesson}
          </Link>
        )}
      </div>
    </aside>
  );
}

const ERROR_KEYS = {
  "no-speech": "sayNothing",
  "not-allowed": "sayRightMicBlocked",
  "audio-capture": "sayRightMicBlocked",
  unsupported: "sayRightNoRecorder",
  pronounce_limit: "sayRightLimit",
  pronounce_busy: "sayRightBusy",
  pronounce_queue_full: "sayRightBusy",
  network: "sayRightOffline",
};

// One word to say. The clip is recorded, scored on the server and shown sound
// by sound; the best of up to three tries counts.
export default function SayRightQuestion({ word, learningLang, nativeLang, done, onDone, p, lang, onLeft }) {
  const [state, setState] = useState("idle"); // idle | recording | scoring
  const [level, setLevel] = useState(0);
  const [tries, setTries] = useState([]); // scored results, newest last
  const [error, setError] = useState(null);
  const rec = useRef(null);
  const alive = useRef(true);
  const text = word.learning;
  const ipa = ipaOf(word);

  useEffect(() => {
    alive.current = true;
    speak(text, { lang: learningLang });
    return () => {
      alive.current = false;
      stopSpeaking();
      rec.current?.cancel();
      rec.current = null;
    };
  }, [text, learningLang]);

  const best = tries.length ? tries.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const last = tries.at(-1) || null;

  const finish = (all = tries) => {
    const top = all.length ? all.reduce((a, b) => (b.score > a.score ? b : a)) : null;
    const score = top ? top.score : 0;
    const solved = score >= PASS_SCORE;
    const firstPass = all.findIndex((r) => r.score >= PASS_SCORE);
    onDone({
      solved,
      firstTry: solved && firstPass === 0,
      tries: solved ? firstPass + 1 : Math.max(1, all.length),
      triesLeft: Math.max(0, MAX_SAY_RIGHT_TRIES - all.length),
      answer: text,
      meaning: word.native,
      score,
      practise: top ? soundsToPractise(top) : [],
      wrong: [],
    });
  };
  useQuestionControls({
    skip: () => !done && finish(),
    reportExtra: () => ({ heard: tries.map((r) => r.heard), scores: tries.map((r) => r.score) }),
  });

  const start = async () => {
    if (state === "recording") {
      rec.current?.stop();
      return;
    }
    if (done || state !== "idle") return;
    stopSpeaking();
    setError(null);
    setLevel(0);
    setState("recording");
    const r = recordClip({ onLevel: (v) => alive.current && setLevel(v) });
    rec.current = r;
    const clip = await r.done;
    if (!alive.current || rec.current !== r) return;
    rec.current = null;
    if (!clip.wav) {
      setState("idle");
      if (clip.error) setError(clip.error);
      return;
    }
    setState("scoring");
    const res = await scoreClip(clip.wav);
    if (!alive.current) return;
    setState("idle");
    if (res.error) {
      setError(res.error);
      if (res.error === "pronounce_limit") onLeft?.(0);
      return;
    }
    if (typeof res.left === "number") onLeft?.(res.left);
    const scored = scorePronunciation(ipa, res.phones);
    if (scored.nothing) {
      setError("no-speech");
      return;
    }
    const all = [...tries, scored].slice(-MAX_SAY_RIGHT_TRIES);
    setTries(all);
    if (scored.score >= PASS_SCORE) sounds.correct();
    else sounds.miss();
    if (scored.score >= GREAT_SCORE || all.length >= MAX_SAY_RIGHT_TRIES) finish(all);
  };

  const recording = state === "recording";
  const scoring = state === "scoring";
  const left = MAX_SAY_RIGHT_TRIES - tries.length;
  const practise = last ? soundsToPractise(last) : [];
  const tip = last ? firstTip(practise) : null;
  const isPhrase = text.trim().includes(" ");

  return (
    <div className="lg-stack pg-question sy-question sr-question">
      <div className="pg-prompt">
        <p className={`pg-prompt__word${isPhrase ? " pg-prompt__word--phrase" : ""}`} lang={learningLang} data-testid="prompt-word">
          {text}
        </p>
        {!last && <p className="sy-ipa" data-testid="prompt-ipa">{ipa}</p>}
        <p className="lg-caption" lang={nativeLang}>{word.native}</p>
        <div className="sy-listen">
          <button type="button" className="lg-btn lg-btn--secondary" onClick={() => speak(text, { lang: learningLang })}>
            <Volume2 size={20} strokeWidth={2} aria-hidden="true" />
            {p.listen}
          </button>
          <button type="button" className="lg-btn lg-btn--quiet" onClick={() => speak(text, { lang: learningLang, rate: RATE_SLOW })}>
            {p.listenSlowly}
          </button>
        </div>
      </div>

      {last && <ScoreBadge score={last.score} best={best && best !== last ? best.score : null} p={p} />}
      {last && <SoundMap result={last} p={p} />}
      {last && tip && <SoundTip found={tip} lang={lang} p={p} />}

      {!done && (
        <div className="sy-mic-area">
          <button
            type="button"
            className={`sy-mic${recording ? " sy-mic--on" : ""}`}
            onClick={start}
            disabled={scoring}
            aria-pressed={recording}
          >
            <span className="sy-mic__circle" aria-hidden="true" style={recording ? { transform: `scale(${1 + level * 0.12})` } : undefined}>
              <Mic size={36} strokeWidth={2} />
            </span>
            <span className="sy-mic__label">
              {recording ? p.sayRightRecording : scoring ? p.sayRightScoring : tries.length ? p.sayAgain : p.sayTap}
            </span>
          </button>
        </div>
      )}
      {error && !recording && !scoring && (
        <p className="pg-hint" role="status">{p[ERROR_KEYS[error] || "sayRightFailed"]}</p>
      )}
      {!done && tries.length > 0 && (
        <div className="sy-after-miss">
          <TriesMeter left={left} total={MAX_SAY_RIGHT_TRIES} label={left === 1 ? p.sayTryLeft : fill(p.sayTriesLeft, { n: left })} />
          <button type="button" className="lg-btn lg-btn--secondary" onClick={() => finish()} disabled={recording || scoring}>
            {p.sayRightKeep}
          </button>
        </div>
      )}
      {!done && <p className="lg-caption sy-privacy">{p.sayRightPrivacy}</p>}
    </div>
  );
}
