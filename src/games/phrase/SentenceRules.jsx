import React from "react";
import { Link } from "react-router-dom";
import { useSettings } from "../../app/SettingsContext";
import { ExampleText, GameScreen, TypeKey, TypeLabel, typeClass } from "../../components/lingo";
import { getItem } from "../../lib/words";
import { SENTENCE_RULES, typedExamples } from "../../lib/wordTypes";

// One example sentence as coloured word chips, each labelled with what it is
// in the sentence (subject, verb, object, or its word class).
function TypedSentence({ example }) {
  return (
    <div className="pg-phrase pg-phrase--slots sr-example" lang="en">
      {example.words.map((word, i) => (
        <div key={i} className="pg-slot">
          <span className={`pg-chip pg-chip--placed${typeClass(example.types[i], true)}`}>{word}</span>
          <TypeLabel type={example.types[i]} place />
        </div>
      ))}
    </div>
  );
}

// How English sentences are built: the word base's `sentence-…` rules, each
// with examples shown word by word. A page of its own at /phrase/rules, and
// over a Build the phrase round (`onClose` returns to it).
export default function SentenceRules({ onClose }) {
  const { t, lang } = useSettings();
  const p = t.practice;
  const rules = SENTENCE_RULES.map(getItem).filter(Boolean);
  const allTypes = rules.flatMap((r) => typedExamples(r).flatMap((ex) => ex.types));

  return (
    <GameScreen title={p.sentenceRules}>
      <main className="lg-board lg-page sr-page">
        <p className="lg-body-lg">{p.sentenceRulesIntro}</p>
        <TypeKey types={allTypes} />
        {rules.map((rule) => (
          <section key={rule.id} className="lg-section sr-rule" aria-labelledby={`sr-${rule.id}`}>
            <h2 className="lg-heading" id={`sr-${rule.id}`}>
              {lang === "fi" ? rule.title.fi || rule.title.en : rule.title.en}
            </h2>
            {lang === "en" && rule.title.fi && <p className="lg-caption" lang="fi">{rule.title.fi}</p>}
            <p className="gp-why__text" lang={lang === "fi" ? "fi" : "en"}>
              <ExampleText text={lang === "fi" ? rule.explanation.fi || rule.explanation.en : rule.explanation.en} />
            </p>
            {typedExamples(rule).map((ex) => (
              <figure key={ex.en} className="sr-figure">
                <TypedSentence example={ex} />
                {ex.fi && <figcaption className="lg-caption" lang="fi">{ex.fi}</figcaption>}
              </figure>
            ))}
          </section>
        ))}
      </main>
      <div className="lg-tray lg-tray--actions">
        {onClose ? (
          <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={onClose} autoFocus>
            {p.sentenceRulesBack}
          </button>
        ) : (
          <Link to="/phrase" className="lg-btn lg-btn--primary lg-btn--hero">{p.sentenceRulesPractise}</Link>
        )}
      </div>
    </GameScreen>
  );
}
