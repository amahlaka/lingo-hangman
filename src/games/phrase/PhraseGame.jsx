import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { languageLabel } from "../../lib/words";
import { sounds } from "../../lib/sounds";
import PracticeSession from "../practice/PracticeSession";
import {
  MAX_MISSES,
  buildPhrasePuzzle,
  buildRound,
  checkPhrase,
  correctPrefixLength,
  isPhraseCandidate,
  practicePool,
} from "../practice/practiceLogic";

const PHRASE_ROUND = 6;

function PhraseQuestion({ puzzle, done, onDone, p, learningLang, nativeLang, nativeLabel }) {
  const [placed, setPlaced] = useState([]);
  const [misses, setMisses] = useState(0);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState(null);

  const bank = puzzle.chips.filter((c) => !placed.includes(c));
  const placedWords = placed.map((c) => c.word);
  const full = placed.length === puzzle.answer.length;

  const finish = (solved, missCount) => {
    setResult(solved ? "right" : "shown");
    onDone({
      solved,
      firstTry: solved && missCount === 0,
      tries: missCount + 1,
      triesLeft: MAX_MISSES - missCount,
      answer: puzzle.text,
      meaning: puzzle.target.native,
    });
  };

  const add = (chip) => {
    if (done) return;
    sounds.tap();
    setHint("");
    setPlaced((list) => [...list, chip]);
  };
  const remove = (chip) => {
    if (done) return;
    setHint("");
    setPlaced((list) => list.filter((c) => c !== chip));
  };

  const check = () => {
    if (!full || done) return;
    if (checkPhrase(placedWords, puzzle.answer)) {
      finish(true, misses);
      return;
    }
    const nextMisses = misses + 1;
    setMisses(nextMisses);
    if (nextMisses >= MAX_MISSES) {
      finish(false, nextMisses);
      return;
    }
    sounds.miss();
    const keep = correctPrefixLength(placedWords, puzzle.answer);
    // Keep the words that are already right and hand the rest back.
    setPlaced((list) => list.slice(0, keep));
    setHint(keep === 0 ? p.phraseNotYet : keep === 1 ? p.phrasePrefixOne : fill(p.phrasePrefix, { n: keep }));
  };

  const shownWords = result === "shown" ? puzzle.answer.map((word, id) => ({ id, word })) : placed;

  return (
    <div className="lg-stack pg-question">
      {/* Once done, the sentence moves under the built phrase so both languages sit together. */}
      {!result && (
        <div className="pg-prompt">
          <span className="lg-caption">{nativeLabel}</span>
          <p className="pg-prompt__word pg-prompt__word--phrase" lang={nativeLang} data-testid="prompt-word">{puzzle.target.native}</p>
        </div>
      )}

      <div
        className={`pg-phrase${result ? ` pg-phrase--${result}` : ""}${result === "right" ? " lg-tiles--win" : ""}`}
        aria-label={p.yourPhrase}
        aria-live="polite"
        lang={learningLang}
      >
        {shownWords.length === 0 && <span className="pg-phrase__empty">{p.emptyPhrase}</span>}
        {shownWords.map((chip, i) => (
          <button
            key={chip.id}
            type="button"
            className="pg-chip pg-chip--placed"
            style={{ "--i": i }}
            onClick={() => remove(chip)}
            disabled={done}
          >
            {chip.word}
          </button>
        ))}
        {(full || result) && puzzle.ending && <span className="pg-phrase__ending">{puzzle.ending}</span>}
      </div>

      {result && (
        <div className="pg-meaning lg-reveal">
          <span className="lg-caption">{nativeLabel}</span>
          <p className="pg-meaning__text" lang={nativeLang} data-testid="meaning-reveal">{puzzle.target.native}</p>
        </div>
      )}

      {!done && (
        <>
          <div className="pg-bank" role="group" aria-label={p.wordsToUse} lang={learningLang}>
            {bank.map((chip) => (
              <button key={chip.id} type="button" className="pg-chip lg-pop" onClick={() => add(chip)}>
                {chip.word}
              </button>
            ))}
          </div>
          {hint && <p className="pg-hint" role="status">{hint}</p>}
          <div className="lg-row">
            <button type="button" className="lg-btn lg-btn--primary" onClick={check} disabled={!full}>
              {p.check}
            </button>
            {placed.length > 0 && (
              <button type="button" className="lg-btn lg-btn--quiet" onClick={() => { setPlaced([]); setHint(""); }}>
                {p.startOver}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// See a Finnish sentence, tap its English words into the right order.
export default function PhraseGame() {
  const [params] = useSearchParams();
  const { t } = useSettings();
  const p = t.practice;
  const search = params.toString();
  const { pairs, learningLang, nativeLang } = useMemo(() => {
    const pool = practicePool(new URLSearchParams(search));
    return { ...pool, pairs: pool.pairs.filter(isPhraseCandidate) };
  }, [search]);
  const nativeLabel = nativeLang === "fi" ? p.finnish : languageLabel(nativeLang);

  return (
    <PracticeSession
      gameId="phrase"
      title={p.phraseName}
      intro={p.phraseIntro}
      learningLang={learningLang}
      nativeLang={nativeLang}
      buildQuestions={() => buildRound(pairs, PHRASE_ROUND).map((w) => buildPhrasePuzzle(w))}
      renderQuestion={({ question, done, onDone }) => (
        <PhraseQuestion
          puzzle={question}
          done={done}
          onDone={onDone}
          p={p}
          learningLang={learningLang}
          nativeLang={nativeLang}
          nativeLabel={nativeLabel}
        />
      )}
    />
  );
}
