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
import { phoneCounts } from "../../lib/pronunciationStats";
import { useQuestionControls } from "../practice/questionControls";
import { ERROR_KEYS, ScoreBadge, SoundMap } from "./SayRightQuestion";
import { GREAT_SCORE, PASS_SCORE, recordSounds, tipFor } from "./sayRightLogic";
import {
  MAX_READ_TRIES, READ_MAX_MS, READ_PAUSE_MS, passageWords, readingPace, weakSounds, wordResults, wordsToPractise,
} from "./readAloudLogic";

const EDGE_PUNCT = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu;

// The passage as written, each piece with the index of the word it is (or
// null for a lone dash): [{ raw, word }].
function pieces(text) {
  let w = 0;
  return String(text || "")
    .trim()
    .split(/\s+/)
    .map((raw) => ({ raw, word: raw.replace(EDGE_PUNCT, "") ? w++ : null }));
}

// The passage with every word marked by how it was read; a word opens its sounds.
function Reading({ text, words, open, onOpen, p }) {
  return (
    <p className="sr-reading" aria-label={p.sayRightReadWordsLabel}>
      {pieces(text).map(({ raw, word }, i) => {
        const result = word === null ? null : words[word];
        if (!result) return <span key={i} className="sr-reading__plain">{raw} </span>;
        return (
          <React.Fragment key={i}>
            <button
              type="button"
              className={`sr-word sr-word--${result.status}${open === word ? " sr-word--open" : ""}`}
              aria-pressed={open === word}
              aria-label={`${result.text}: ${result.skipped ? p.sayRightReadSkipped : result.status === "ok" ? p.sayRightSoundOk : result.status === "close" ? p.sayRightSoundClose : p.sayRightSoundMiss}`}
              onClick={() => onOpen(open === word ? null : word)}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {raw}
            </button>{" "}
          </React.Fragment>
        );
      })}
    </p>
  );
}

// One word of the reading opened: its sounds, and a button to hear it.
function WordDetail({ word, p }) {
  return (
    <div className="sr-word-detail">
      <p className="sr-word-detail__title">
        <strong>{word.text}</strong> <span className="lg-caption">{word.ipa}</span>
        {word.skipped && <span className="lg-caption"> · {p.sayRightReadSkipped}</span>}
      </p>
      <SoundMap result={{ sounds: word.sounds, heard: "" }} p={p} />
      <button type="button" className="lg-btn lg-btn--quiet" onClick={() => speak(word.text, { lang: "en" })}>
        <Volume2 size={18} strokeWidth={2} aria-hidden="true" />
        {fill(p.sayRightHearExample, { word: word.text })}
      </button>
    </div>
  );
}

// What the reading shows: pace, the weak sounds with their tips and the words to practise.
export function ReadAnalysis({ analysis, lang, p }) {
  const { pace, weak, practise } = analysis;
  const text = (m) => m?.[lang] || m?.en;
  return (
    <div className="sr-analysis">
      {pace && (
        <p className="sr-pace">
          <strong>{fill(p.sayRightPace, { n: pace.wpm })}</strong>{" "}
          <span className="lg-caption">{p[{ slow: "sayRightPaceSlow", steady: "sayRightPaceSteady", quick: "sayRightPaceQuick" }[pace.band]]}</span>
        </p>
      )}
      {weak.length > 0 ? (
        <section className="sr-analysis__part">
          <h3 className="sr-analysis__title">{p.sayRightWeakSounds}</h3>
          <ul className="sr-weak">
            {weak.map((w) => {
              const tip = tipFor(w.symbol);
              return (
                <li key={w.symbol} className="sr-tip">
                  <p className="sr-tip__title">
                    <span className="sr-tip__symbol">/{w.symbol}/</span> {tip ? text(tip.title) : null}
                  </p>
                  {w.words.length > 0 && <p className="lg-caption sr-weak__words">{fill(p.sayRightWeakIn, { words: w.words.join(", ") })}</p>}
                  {tip && <p className="sr-tip__body">{text(tip.tip).replace(/\*/g, "")}</p>}
                  {tip && (tip.example || tip.lesson) && (
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
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="lg-caption">{p.sayRightAllGood}</p>
      )}
      {practise.length > 0 && (
        <section className="sr-analysis__part">
          <h3 className="sr-analysis__title">{p.sayRightWordsToPractise}</h3>
          <ul className="sr-practise">
            {practise.map((w) => (
              <li key={w.text}>
                <button type="button" className="lg-btn lg-btn--quiet sr-practise__word" onClick={() => speak(w.text, { lang: "en", rate: RATE_SLOW })}>
                  <Volume2 size={18} strokeWidth={2} aria-hidden="true" />
                  <span>{w.text}</span> <span className="lg-caption">{w.ipa}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// The analysis of one scored reading.
export function analyseReading(result, words, seconds) {
  const byWord = wordResults(result, words);
  return {
    words: byWord,
    pace: readingPace(words.length, seconds),
    weak: weakSounds(result, words),
    practise: wordsToPractise(byWord),
  };
}

// One passage to read aloud. The clip is scored on the server like a word in
// Say it right, then shown word by word with the weak sounds and words to
// practise; the best of two readings counts.
export default function ReadAloudQuestion({ passage, learningLang, nativeLang, done, onDone, p, lang, onLeft }) {
  const [state, setState] = useState("idle"); // idle | recording | scoring
  const [level, setLevel] = useState(0);
  const [tries, setTries] = useState([]); // [{ score, result, analysis }], newest last
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [showSay, setShowSay] = useState(false);
  const rec = useRef(null);
  const alive = useRef(true);
  const text = passage.text.en;
  const words = passageWords(passage);
  const reading = passage.say?.[nativeLang] || null;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopSpeaking();
      rec.current?.cancel();
      rec.current = null;
    };
  }, [text]);

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
      triesLeft: Math.max(0, MAX_READ_TRIES - all.length),
      answer: text,
      meaning: passage.text[nativeLang] || "",
      score,
      mode: "read",
      phones: phoneCounts(all.map((r) => r.result)),
      ...(top?.analysis.pace ? { wpm: top.analysis.pace.wpm } : {}),
      practise: top ? soundsToPractise(top.result) : [],
      wrong: [],
    });
  };
  useQuestionControls({
    skip: () => !done && finish(),
    reportExtra: () => ({ heard: tries.map((r) => r.result.heard), scores: tries.map((r) => r.score) }),
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
    const r = recordClip({ onLevel: (v) => alive.current && setLevel(v), maxMs: READ_MAX_MS, pauseMs: READ_PAUSE_MS });
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
    const result = scorePronunciation(passage.ipa.en, res.phones);
    if (result.nothing) {
      setError("no-speech");
      return;
    }
    recordSounds(result);
    const scored = { score: result.score, result, analysis: analyseReading(result, words, clip.seconds) };
    const all = [...tries, scored].slice(-MAX_READ_TRIES);
    setTries(all);
    setOpen(null);
    if (result.score >= PASS_SCORE) sounds.correct();
    else sounds.miss();
    if (result.score >= GREAT_SCORE || all.length >= MAX_READ_TRIES) finish(all);
  };

  const recording = state === "recording";
  const scoring = state === "scoring";
  const left = MAX_READ_TRIES - tries.length;

  return (
    <div className="lg-stack pg-question sy-question sr-question sr-read">
      <div className="pg-prompt">
        {!last && (
          <p className="sr-passage" lang={learningLang} data-testid="prompt-passage">
            {text}
          </p>
        )}
        {last && (
          <>
            <Reading text={text} words={last.analysis.words} open={open} onOpen={setOpen} p={p} />
            {open === null ? (
              <p className="lg-caption">{p.sayRightReadTapWord}</p>
            ) : (
              <WordDetail word={last.analysis.words[open]} p={p} />
            )}
          </>
        )}
        <p className="lg-caption" lang={nativeLang}>{passage.text[nativeLang]}</p>
        {reading && showSay && (
          <p className="snd-say sy-say" data-testid="prompt-reading">
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
          {reading && !showSay && (
            <button type="button" className="lg-btn lg-btn--quiet" onClick={() => setShowSay(true)}>
              {p.sayRightShowReading}
            </button>
          )}
        </div>
      </div>

      {last && <ScoreBadge score={last.score} best={best && best !== last ? best.score : null} p={p} />}
      {/* Right under the score, so it is never hidden below the microphone. */}
      {!done && tries.length > 0 && (
        <div className="sy-after-miss sr-keep">
          <button
            type="button"
            className={`lg-btn ${best && best.score >= PASS_SCORE ? "lg-btn--primary" : "lg-btn--secondary"}`}
            onClick={() => finish()}
            disabled={recording || scoring}
          >
            {p.sayRightKeep}
          </button>
          <TriesMeter left={left} total={MAX_READ_TRIES} label={left === 1 ? p.sayTryLeft : fill(p.sayTriesLeft, { n: left })} />
        </div>
      )}
      {last && <ReadAnalysis analysis={last.analysis} lang={lang} p={p} />}

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
              {recording ? p.sayRightReadRecording : scoring ? p.sayRightScoring : tries.length ? p.sayRightReadAgain : p.sayRightReadTap}
            </span>
          </button>
        </div>
      )}
      {error && !recording && !scoring && (
        <p className="pg-hint" role="status">{p[ERROR_KEYS[error] || "sayRightFailed"]}</p>
      )}
      {!done && <p className="lg-caption sy-privacy">{p.sayRightPrivacy}</p>}
    </div>
  );
}
