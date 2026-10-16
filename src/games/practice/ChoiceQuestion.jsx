import React, { useState } from "react";
import { sounds } from "../../lib/sounds";
import { MAX_MISSES } from "./practiceLogic";
import { useQuestionControls } from "./questionControls";

// Four options in the learning language for one target word. A miss strikes that option out
// and lets the learner try again; after MAX_MISSES the answer is shown. Once the question is
// done every option shows its meaning underneath, so the learner links the two languages.
export default function ChoiceQuestion({ question, learningLang, nativeLang, done, onDone, prompt, tryAnother, label }) {
  const { target, options } = question;
  const [missed, setMissed] = useState([]);
  const [picked, setPicked] = useState(null);
  const [wobble, setWobble] = useState(null);

  // `wrongs`: the options picked before, kept to see how learners go wrong.
  const finish = (solved, wrongs) => {
    const misses = wrongs.length;
    return onDone({
      solved,
      wrong: wrongs.map((o) => o.learning),
      firstTry: solved && misses === 0,
      tries: misses + 1,
      triesLeft: MAX_MISSES - misses,
      answer: target.learning,
      meaning: target.native,
    });
  };
  useQuestionControls({ skip: () => !done && finish(false, missed) });

  const choose = (option) => {
    if (done || picked || missed.includes(option)) return;
    if (option === target) {
      setPicked(option);
      finish(true, missed);
      return;
    }
    const nextMissed = [...missed, option];
    setMissed(nextMissed);
    setWobble(option);
    // The last miss gets the session's "answer shown" sound instead.
    if (nextMissed.length < MAX_MISSES) sounds.miss();
    if (nextMissed.length >= MAX_MISSES) finish(false, nextMissed);
  };

  const stateOf = (option) => {
    if (option === target && picked) return "right";
    if (option === target && done) return "shown";
    if (missed.includes(option)) return "miss";
    return "";
  };

  return (
    <div className="lg-stack pg-question">
      {prompt}
      <div className="pg-choices" role="group" aria-label={label}>
        {options.map((option, i) => {
          const state = stateOf(option);
          const text = option.learning;
          const ariaLabel = done ? `${text}, ${option.native}` : state === "miss" ? `${text}, not this one` : undefined;
          return (
            <button
              key={text}
              type="button"
              lang={learningLang}
              className={`pg-choice${state ? ` pg-choice--${state}` : ""}${state === "right" ? " lg-pop" : ""}${
                state === "miss" && wobble === option ? " lg-wobble" : ""
              }`}
              onClick={() => choose(option)}
              disabled={done || state === "miss"}
              aria-label={ariaLabel}
            >
              <span className="pg-choice__mark" aria-hidden="true">
                {state === "right" || state === "shown" ? "✓" : ""}
              </span>
              <span className="pg-choice__words">
                <span className="pg-choice__text">{text}</span>
                {done && (
                  <span className="pg-choice__native lg-reveal" lang={nativeLang} style={{ "--i": i }}>
                    {option.native}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {!done && missed.length > 0 && (
        <p className="pg-hint" role="status">{tryAnother}</p>
      )}
    </div>
  );
}
