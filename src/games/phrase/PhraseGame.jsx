import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { getItem, languageLabel } from "../../lib/words";
import { sounds } from "../../lib/sounds";
import { OPTION_HINT_COST, SLOT_HINT_COST, sentenceLesson, sentencePattern, sentenceTypes } from "../../lib/wordTypes";
import { ExampleText, TypeKey, TypeLabel, typeClass, useAutoTypeHelp, useTypePrefs } from "../../components/lingo";
import PracticeSession from "../practice/PracticeSession";
import SentenceRules from "./SentenceRules";
import { PaidHints, RuleBox } from "../practice/RuleBox";
import {
  MAX_MISSES,
  RULE_PEEK_COST,
  buildPhrasePuzzle,
  buildRound,
  checkPhrase,
  correctPlaces,
  isPhraseCandidate,
  practicePool,
} from "../practice/practiceLogic";

const PHRASE_ROUND = 6;

// The sentence-structure rule a question practises (a `sentence-…` rule item),
// in English with the Finnish under it, or in Finnish for the Finnish UI.
function SentenceRule({ rule, lang, p }) {
  const title = lang === "fi" ? rule.title.fi || rule.title.en : rule.title.en;
  return (
    <RuleBox label={`${p.sentenceRule}: ${title}`}>
      {lang === "en" ? (
        <div className="gp-why__part">
          <p className="gp-why__text"><ExampleText text={rule.explanation.en} /></p>
          {rule.explanation.fi && <p className="gp-why__fi" lang="fi"><ExampleText text={rule.explanation.fi} /></p>}
        </div>
      ) : (
        <div className="gp-why__part">
          <p className="gp-why__text" lang="fi"><ExampleText text={rule.explanation.fi || rule.explanation.en} /></p>
        </div>
      )}
    </RuleBox>
  );
}

export function PhraseQuestion({ puzzle, done, onDone, p, learningLang, nativeLang, nativeLabel }) {
  const { lang } = useSettings();
  // Words locked in their place ({ [place]: chip }): the ones a beginner is
  // given, and after a check every word that was in the right place. The
  // learner's other words (`free`) fill the open places in order.
  const [locked, setLocked] = useState(() =>
    Object.fromEntries((puzzle.given || []).map((i) => [i, puzzle.chips.find((c) => c.id === i)]))
  );
  const [free, setFree] = useState([]);
  const [misses, setMisses] = useState(0);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState(null);
  const [bought, setBought] = useState({ slots: false, options: false, rule: false });

  // Word-type hints: what kind of word each chip is and what each place in the
  // sentence is. Paid for with points, or free on easy sentences that have
  // been hard lately.
  const types = useMemo(
    () => (learningLang.startsWith("en") ? sentenceTypes(puzzle.target, puzzle.answer) : null),
    [puzzle, learningLang]
  );
  const { colors } = useTypePrefs();
  const auto = useAutoTypeHelp(types ? puzzle.target : null, learningLang) && Boolean(types);
  const showSlots = Boolean(types) && (auto || bought.slots);
  const showOptions = Boolean(types) && (auto || bought.options);
  const ruleId = types ? sentencePattern(types, puzzle.answer, puzzle.text) : null;
  const rule = ruleId ? getItem(ruleId) : null;
  const typeOf = (chip) => (types ? types[chip.id] : null);

  const lockedChips = Object.values(locked);
  const hasLocked = lockedChips.length > 0;
  const layout = [];
  for (let i = 0, k = 0; i < puzzle.answer.length; i++) layout.push(locked[i] || free[k++] || null);
  const bank = puzzle.chips.filter((c) => !free.includes(c) && !lockedChips.includes(c));
  const full = layout.every(Boolean);

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
    setFree((list) => [...list, chip]);
  };
  const remove = (chip) => {
    if (done || lockedChips.includes(chip)) return;
    setHint("");
    setFree((list) => list.filter((c) => c !== chip));
  };

  const check = () => {
    if (!full || done) return;
    const placedWords = layout.map((c) => c.word);
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
    // Keep every word that is in the right place and hand the rest back.
    const keep = correctPlaces(placedWords, puzzle.answer);
    const before = lockedChips.length;
    setLocked(Object.fromEntries(keep.map((i) => [i, layout[i]])));
    setFree([]);
    const found = keep.length - before;
    setHint(found <= 0 ? p.phraseNotYet : found === 1 ? p.phraseKeptOne : fill(p.phraseKept, { n: found }));
  };

  const shownWords = result === "shown" ? puzzle.answer.map((word, id) => ({ id, word })) : layout;

  const chipButton = (chip, i, { inBank = false, label = false } = {}) => {
    const isLocked = !inBank && !result && lockedChips.includes(chip);
    return (
    <button
      key={chip.id}
      type="button"
      className={`pg-chip${inBank ? " lg-pop" : " pg-chip--placed"}${isLocked ? " pg-chip--locked" : ""}${typeClass(typeOf(chip), colors)}${label ? " pg-chip--typed" : ""}`}
      style={inBank ? undefined : { "--i": i }}
      onClick={() => (inBank ? add(chip) : remove(chip))}
      disabled={!inBank && (done || isLocked)}
      title={isLocked ? p.phraseLocked : undefined}
    >
      <span className="pg-chip__word">{chip.word}</span>
      {label && <TypeLabel type={typeOf(chip)} />}
    </button>
    );
  };

  const buy = (key) => () => setBought((b) => ({ ...b, [key]: true }));
  const hints = done
    ? []
    : [
        types && !showSlots && { id: "slots", label: fill(p.hintSlots, { n: SLOT_HINT_COST }), cost: SLOT_HINT_COST, onBuy: buy("slots") },
        types && !showOptions && { id: "options", label: fill(p.hintOptions, { n: OPTION_HINT_COST }), cost: OPTION_HINT_COST, onBuy: buy("options") },
        rule && !bought.rule && { id: "rule", label: fill(p.rulePeek, { n: RULE_PEEK_COST }), cost: RULE_PEEK_COST, onBuy: buy("rule") },
      ].filter(Boolean);

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
        className={`pg-phrase${showSlots ? " pg-phrase--slots" : ""}${result ? ` pg-phrase--${result}` : ""}${result === "right" ? " lg-tiles--win" : ""}`}
        aria-label={p.yourPhrase}
        aria-live="polite"
        lang={learningLang}
      >
        {showSlots
          ? puzzle.answer.map((_, i) => (
              // One place per word, labelled with what goes there.
              <div key={i} className="pg-slot" data-testid="phrase-slot">
                {shownWords[i] ? (
                  chipButton(shownWords[i], i)
                ) : (
                  <span className={`pg-slot__box${typeClass(types[i], colors)}`} aria-hidden="true" />
                )}
                <TypeLabel type={types[i]} place />
              </div>
            ))
          : shownWords.map((chip, i) =>
              chip ? (
                chipButton(chip, i, { label: showOptions })
              ) : (
                // Open places show only once some words are locked in theirs.
                hasLocked && <span key={`open-${i}`} className="pg-slot__box" data-testid="open-place" aria-hidden="true" />
              )
            )}
        {!showSlots && !shownWords.some(Boolean) && <span className="pg-phrase__empty">{p.emptyPhrase}</span>}
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
            {bank.map((chip, i) => chipButton(chip, i, { inBank: true, label: showOptions }))}
          </div>
          {hint && <p className="pg-hint" role="status">{hint}</p>}
          <div className="lg-row">
            <button type="button" className="lg-btn lg-btn--primary" onClick={check} disabled={!full}>
              {p.check}
            </button>
            {free.length > 0 && (
              <button type="button" className="lg-btn lg-btn--quiet" onClick={() => { setFree([]); setHint(""); }}>
                {p.startOver}
              </button>
            )}
          </div>
          {auto && <p className="lg-caption pg-auto-hint">{p.hintsAuto}</p>}
        </>
      )}
      {colors && types && <TypeKey types={types} />}
      {!done && <PaidHints hints={hints} />}
      {rule && (done || bought.rule) && <SentenceRule rule={rule} lang={lang} p={p} />}
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
  // The sentence rules open over the round, which stays where it was.
  const [rulesOpen, setRulesOpen] = useState(false);
  const english = learningLang.startsWith("en");
  const intro = english ? (
    <>
      {p.phraseIntro}{" "}
      <button type="button" className="lg-link-btn" onClick={() => setRulesOpen(true)}>{p.sentenceRulesLink}</button>
    </>
  ) : (
    p.phraseIntro
  );

  return (
    <>
      {rulesOpen && <SentenceRules onClose={() => setRulesOpen(false)} />}
      <div hidden={rulesOpen}>
        <PracticeSession
          gameId="phrase"
          title={p.phraseName}
          intro={intro}
          learningLang={learningLang}
          nativeLang={nativeLang}
          buildQuestions={() =>
            buildRound(pairs, PHRASE_ROUND).map((w) => {
              const puzzle = buildPhrasePuzzle(w);
              return english ? { ...puzzle, lesson: sentenceLesson(w) } : puzzle;
            })
          }
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
      </div>
    </>
  );
}
