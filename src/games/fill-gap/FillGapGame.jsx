import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { getGapItems, getSentences, languageLabel } from "../../lib/words";
import { ExampleText, useLooseWordType } from "../../components/lingo";
import { sounds } from "../../lib/sounds";
import PracticeSession from "../practice/PracticeSession";
import { MAX_MISSES, buildGapRound, isGapCandidate, practicePool, usableWords } from "../practice/practiceLogic";
import { useQuestionControls } from "../practice/questionControls";

const GAP_ROUND = 8;

// An English sentence with one word missing and four words to choose from.
// The Finnish sentence sits above it so the right word is never a guess. Once
// answered, the word drops into the gap and the Finnish moves under the full
// sentence, as in Build the phrase.
export function GapQuestion({ question, done, onDone, p, learningLang, nativeLang, nativeLabel, uiLang }) {
  const typeOf = useLooseWordType();
  const { target, answer, options, before, after, explanation } = question;
  // A two-way choice (a / an) is over after one miss.
  const maxMisses = Math.min(MAX_MISSES, options.length - 1);
  const why = explanation && (explanation[uiLang] || explanation.fi || explanation.en);
  const [missed, setMissed] = useState([]);
  const [picked, setPicked] = useState(null);
  const [wobble, setWobble] = useState(null);

  // `wrongs`: the options picked before, kept to see how learners go wrong.
  const finish = (solved, wrongs) => {
    const misses = wrongs.length;
    return onDone({
      solved,
      wrong: wrongs.map((o) => String(o)),
      firstTry: solved && misses === 0,
      tries: misses + 1,
      triesLeft: maxMisses - misses,
      answer: target.learning,
      meaning: target.native,
    });
  };
  useQuestionControls({ skip: () => !done && finish(false, missed) });

  const choose = (option) => {
    if (done || picked || missed.includes(option)) return;
    if (option === answer) {
      setPicked(option);
      finish(true, missed);
      return;
    }
    const nextMissed = [...missed, option];
    setMissed(nextMissed);
    setWobble(option);
    if (nextMissed.length < maxMisses) sounds.miss();
    else finish(false, nextMissed);
  };

  const result = done ? (picked ? "right" : "shown") : null;

  return (
    <div className="lg-stack pg-question">
      {!result && (
        <div className="pg-prompt">
          <span className="lg-caption">{nativeLabel}</span>
          <p className="pg-meaning__text" lang={nativeLang} data-testid="prompt-word">{target.native}</p>
        </div>
      )}

      <p className={`fg-sentence${result ? ` fg-sentence--${result}` : ""}`} lang={learningLang} data-testid="gap-sentence">
        {before && <>{before} </>}
        {result ? (
          <span className="fg-gap fg-gap--filled lg-pop">{answer}</span>
        ) : (
          <span className="fg-gap" aria-label={p.gapBlank}>
            <span aria-hidden="true">&nbsp;</span>
          </span>
        )}
        {after}
      </p>

      {result && (
        <div className="pg-meaning lg-reveal">
          <span className="lg-caption">{nativeLabel}</span>
          <p className="pg-meaning__text" lang={nativeLang} data-testid="meaning-reveal">{target.native}</p>
          {why && <p className="lg-caption fg-why" data-testid="gap-explanation"><ExampleText text={why} /></p>}
        </div>
      )}

      <div className="pg-choices fg-choices" role="group" aria-label={p.gapIntro}>
        {options.map((option) => {
          const type = typeOf(option, learningLang);
          const state =
            option === answer && picked ? "right" : option === answer && done ? "shown" : missed.includes(option) ? "miss" : "";
          return (
            <button
              key={option}
              type="button"
              lang={learningLang}
              className={`pg-choice${state ? ` pg-choice--${state}` : ""}${state === "miss" && wobble === option ? " lg-wobble" : ""}${type.className}`}
              onClick={() => choose(option)}
              disabled={done || state === "miss"}
              aria-label={state === "miss" ? `${option}, not this one` : undefined}
            >
              <span className="pg-choice__mark" aria-hidden="true">{state === "right" || state === "shown" ? "✓" : ""}</span>
              <span className="pg-choice__words">
                <span className="pg-choice__text">{option}</span>
                {type.tag}
              </span>
            </button>
          );
        })}
      </div>
      {!done && missed.length > 0 && <p className="pg-hint" role="status">{p.tryAnother}</p>}
    </div>
  );
}

// Read a sentence with a missing word and choose the word that fits.
export default function FillGapGame() {
  const [params] = useSearchParams();
  const { t, lang } = useSettings();
  const p = t.practice;
  const search = params.toString();
  // A shared link gaps its own sentences. Otherwise the round mixes the word
  // bank's everyday gap sentences with every other sentence in it. Sentences
  // on a grammar or mixed-up-words topic are left to those games.
  const { pairs, sentences, items, learningLang, nativeLang } = useMemo(() => {
    const pool = practicePool(new URLSearchParams(search));
    const { learningLang: l, nativeLang: n } = pool;
    if (pool.fromLink) return { ...pool, sentences: pool.pairs.filter(isGapCandidate), items: [] };
    const onTopic = new Set(getGapItems({ lang: l }).filter((g) => g.topic).map((g) => g.id));
    const gaps = getGapItems({ lang: l, preferences: true });
    return {
      ...pool,
      sentences: usableWords(getSentences({ learningLang: l, nativeLang: n, preferences: true })).filter(
        (s) => isGapCandidate(s) && !onTopic.has(s.id)
      ),
      items: gaps.filter((g) => !g.topic),
    };
  }, [search]);
  const nativeLabel = nativeLang === "fi" ? p.finnish : languageLabel(nativeLang);

  return (
    <PracticeSession
      gameId="fill-the-gap"
      title={p.gapName}
      intro={p.gapIntro}
      learningLang={learningLang}
      nativeLang={nativeLang}
      buildQuestions={() => buildGapRound(sentences, pairs, GAP_ROUND, Math.random, { items, nativeLang })}
      renderQuestion={({ question, done, onDone }) => (
        <GapQuestion
          question={question}
          done={done}
          onDone={onDone}
          p={p}
          learningLang={learningLang}
          nativeLang={nativeLang}
          nativeLabel={nativeLabel}
          uiLang={lang}
        />
      )}
    />
  );
}
