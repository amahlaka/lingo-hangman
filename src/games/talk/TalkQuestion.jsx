import React, { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { sounds } from "../../lib/sounds";
import { canSpeak, speak, stopSpeaking } from "../../lib/speech";
import { MAX_MISSES } from "../practice/practiceLogic";
import { keepInView } from "../../components/lingo";
import { nextTurn } from "./talkLogic";

// How long the other speaker "types" before their line appears.
export const REPLY_DELAY = 900;

// One line of the conversation. Tapping it reads it aloud again; the Finnish
// has its own button so hearing a line again doesn't give its meaning away.
function Bubble({ line, who, state, open, onTap, onFinnish, i }) {
  const { t } = useSettings();
  return (
    <li className={`tk-line${line.mine ? " tk-line--mine" : ""}`}>
      <span className="tk-line__who">{who}</span>
      <button
        type="button"
        className={`tk-bubble${state ? ` tk-bubble--${state}` : ""}${line.mine ? " lg-pop" : " lg-reveal"}`}
        style={{ "--i": i }}
        onClick={onTap}
      >
        <span className="tk-bubble__en" lang="en">{line.en}</span>
        {open && line.fi && <span className="tk-bubble__fi" lang="fi">{line.fi}</span>}
        {canSpeak() && <Volume2 className="tk-bubble__icon" size={16} aria-hidden="true" />}
      </button>
      {line.fi && (
        <button type="button" className="tk-fi-toggle" onClick={onFinnish} aria-pressed={open}>
          {open ? t.talk.hideFinnish : t.talk.showFinnish}
        </button>
      )}
    </li>
  );
}

// A conversation: the other speaker's lines appear one by one (read aloud),
// and on each of the learner's turns they pick their reply from three. A miss
// strikes that reply out; after MAX_MISSES the right one is put in for them.
// Each of the learner's lines is recorded on its own (onItem); the question is
// done when the conversation ends.
export default function TalkQuestion({ question, onItem, onDone }) {
  const { t } = useSettings();
  const k = t.talk;
  const { lines } = question;
  // Lines shown so far, and the result of each of the learner's lines.
  const [shown, setShown] = useState(() => nextTurn(lines, 0));
  const [results, setResults] = useState({});
  const [missed, setMissed] = useState([]);
  const [wobble, setWobble] = useState(null);
  const [typing, setTyping] = useState(false);
  const [open, setOpen] = useState(() => new Set());
  const timer = useRef(null);
  const finished = useRef(false);
  const endRef = useRef(null);

  const turn = shown < lines.length && lines[shown].mine ? lines[shown] : null;
  // A role ("Waiter") in the UI language; people's names stay as they are.
  const roleName = (name) => k.roles?.[name] || name;

  // Read the other speaker's newest line aloud as it appears.
  useEffect(() => {
    const last = lines[shown - 1];
    if (last && !last.mine) speak(last.en, { lang: "en" });
  }, [shown, lines]);

  // Keep the newest line (and the replies to pick from) on screen.
  const firstShown = useRef(shown);
  useEffect(() => {
    if (shown > firstShown.current) keepInView(endRef.current);
  }, [shown, typing]);

  useEffect(() => {
    if (shown >= lines.length && !typing && !finished.current) {
      finished.current = true;
      onDone({ board: true });
    }
  }, [shown, typing, lines.length, onDone]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      stopSpeaking();
    },
    []
  );

  const advance = () => {
    const after = shown + 1;
    const until = nextTurn(lines, after);
    if (until === after) {
      setShown(after);
      return;
    }
    // The other speaker answers after a short pause, one line at a time.
    setTyping(true);
    setShown(after);
    const step = (at) => {
      timer.current = setTimeout(() => {
        setShown(at + 1);
        if (at + 1 < until) step(at + 1);
        else setTyping(false);
      }, REPLY_DELAY);
    };
    step(after);
  };

  const finishTurn = (solved, wrongs) => {
    const misses = wrongs.length;
    onItem({
      solved,
      wrong: wrongs,
      firstTry: solved && misses === 0,
      tries: misses + 1,
      triesLeft: solved ? MAX_MISSES - misses : 0,
      answer: turn.en,
      meaning: turn.fi,
    });
    setResults((r) => ({ ...r, [shown]: solved ? "right" : "shown" }));
    setMissed([]);
    advance();
  };

  const choose = (option) => {
    if (!turn || typing || missed.includes(option)) return;
    if (option === turn.en) {
      finishTurn(true, missed);
      return;
    }
    const nextMissed = [...missed, option];
    setWobble(option);
    if (nextMissed.length >= MAX_MISSES) {
      finishTurn(false, nextMissed);
      return;
    }
    sounds.miss();
    setMissed(nextMissed);
  };

  const hear = (i) => speak(lines[i].en, { lang: "en" });

  const toggleFinnish = (i) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="lg-stack pg-question tk-question">
      <div className="tk-scene">
        <span className="lg-caption">
          {question.title}
          {question.titleFi && <span lang="fi"> · {question.titleFi}</span>}
        </span>
        <p className="tk-role">{fill(k.youAre, { name: roleName(question.you), partner: roleName(question.partner) })}</p>
        <p className="lg-caption">{k.tapLines}</p>
      </div>
      <ol className="tk-chat" aria-live="polite">
        {lines.slice(0, shown).map((line, i) => (
          <Bubble key={i} i={0} line={line} who={roleName(line.speaker)} state={results[i]} open={open.has(i)} onTap={() => hear(i)} onFinnish={() => toggleFinnish(i)} />
        ))}
        {typing && (
          <li className="tk-line" aria-hidden="true">
            <span className="tk-typing"><span /><span /><span /></span>
          </li>
        )}
      </ol>
      {turn && !typing && (
        <>
          <p className="lg-caption tk-prompt">{shown === 0 ? k.youStart : k.yourTurn}</p>
          <div className="pg-choices tk-choices" role="group" aria-label={k.replies}>
            {turn.options.map((option) => {
              const miss = missed.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  lang="en"
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
          {missed.length > 0 && (
            <p className="pg-hint" role="status">{k.why[turn.why?.[missed[missed.length - 1]]] || k.tryAnother}</p>
          )}
        </>
      )}
      <span ref={endRef} aria-hidden="true" />
    </div>
  );
}
