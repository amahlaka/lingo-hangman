import React, { useState } from "react";
import { useSettings } from "../../app/SettingsContext";
import { sounds } from "../../lib/sounds";
import { MAX_MISSES } from "../practice/practiceLogic";
import { useQuestionControls } from "../practice/questionControls";
import { Explanation } from "../gap/GapQuestion";
import { RulePeek } from "../practice/RuleBox";

// A sentence with one mistake. First the learner taps the wrong word, then
// picks the word that fixes it. Misses in both steps count together; after
// MAX_MISSES the mistake and its fix are shown. The rule appears after.
export default function MistakeQuestion({ question, done, onDone }) {
  const { t, lang } = useSettings();
  const k = t.mistake;
  const p = t.practice;
  const [found, setFound] = useState(false);
  const [missedTiles, setMissedTiles] = useState([]);
  const [missedFixes, setMissedFixes] = useState([]);
  const [fixed, setFixed] = useState(false);
  const [wobble, setWobble] = useState(null);
  const [peeked, setPeeked] = useState(false);
  const misses = missedTiles.length + missedFixes.length;

  const finish = (solved, wrongs) =>
    onDone({
      solved,
      wrong: wrongs,
      firstTry: solved && wrongs.length === 0,
      tries: wrongs.length + 1,
      triesLeft: MAX_MISSES - wrongs.length,
      answer: question.sentence,
      meaning: question.fi,
    });
  const wrongsSoFar = () => [...missedTiles.map((i) => question.tiles[i].text), ...missedFixes];
  useQuestionControls({ skip: () => !done && finish(false, wrongsSoFar()) });

  const miss = (wrongs) => {
    if (wrongs.length >= MAX_MISSES) {
      finish(false, wrongs);
      return true;
    }
    sounds.miss();
    return false;
  };

  const tapTile = (i) => {
    if (done || found || missedTiles.includes(i)) return;
    if (question.tiles[i].wrong) {
      setFound(true);
      sounds.found();
      return;
    }
    setWobble(`tile-${i}`);
    setMissedTiles((m) => [...m, i]);
    miss([...wrongsSoFar(), question.tiles[i].text]);
  };

  const chooseFix = (option) => {
    if (done || !found || missedFixes.includes(option)) return;
    if (option === question.answer) {
      setFixed(true);
      finish(true, wrongsSoFar());
      return;
    }
    setWobble(`fix-${option}`);
    setMissedFixes((m) => [...m, option]);
    miss([...wrongsSoFar(), option]);
  };

  const tileState = (tile, i) => {
    if (tile.wrong && (found || done)) return fixed ? "fixed" : done ? "shown" : "found";
    if (missedTiles.includes(i)) return "miss";
    return "";
  };

  const label = (option) => (option === "" ? k.leaveOut : option);

  return (
    <div className="lg-stack pg-question sm-question">
      <div className="gp-prompt">
        <span className="lg-caption">{found || done ? question.title : k.findIt}</span>
        <p className="sm-sentence" lang="en" role="group" aria-label={k.sentenceLabel}>
          {question.tiles.map((tile, i) => {
            const state = tileState(tile, i);
            const showFix = tile.wrong && done;
            return (
              <React.Fragment key={i}>
                <button
                  type="button"
                  className={`sm-tile${state ? ` sm-tile--${state}` : ""}${wobble === `tile-${i}` ? " lg-wobble" : ""}${
                    state === "found" ? " lg-pop" : ""
                  }`}
                  onClick={() => tapTile(i)}
                  disabled={done || found || state === "miss"}
                  aria-label={state === "miss" ? `${tile.text}, ${p.notThisOne}` : undefined}
                >
                  {tile.text}
                </button>
                {showFix && (
                  <span className={`sm-fix sm-fix--${fixed ? "right" : "shown"} lg-pop`}>
                    {question.answer || k.leftOut}
                  </span>
                )}{" "}
              </React.Fragment>
            );
          })}
        </p>
        <p className="gp-translation" lang="fi">{question.fi}</p>
      </div>
      {found && !done && (
        <>
          <p className="lg-caption sm-step" role="status">{k.fixIt}</p>
          <div className="pg-choices gp-choices" role="group" aria-label={k.fixLabel}>
            {question.fixes.map((option) => {
              const missed = missedFixes.includes(option);
              return (
                <button
                  key={option || "none"}
                  type="button"
                  lang={option ? "en" : undefined}
                  className={`pg-choice${missed ? " pg-choice--miss" : ""}${wobble === `fix-${option}` ? " lg-wobble" : ""}`}
                  onClick={() => chooseFix(option)}
                  disabled={missed}
                  aria-label={missed ? `${label(option)}, ${p.notThisOne}` : undefined}
                >
                  <span className="pg-choice__mark" aria-hidden="true" />
                  <span className="pg-choice__words">
                    <span className="pg-choice__text">{label(option)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {!done && misses > 0 && <p className="pg-hint" role="status">{found ? p.tryAnother : k.notThatWord}</p>}
      {done && <Explanation parts={[question.why, question.rule].filter(Boolean)} lang={lang} p={p} />}
      {!done && peeked && <Explanation parts={[question.rule]} lang={lang} p={p} />}
      {!done && !peeked && question.rule && <RulePeek onPeek={() => setPeeked(true)} />}
    </div>
  );
}
