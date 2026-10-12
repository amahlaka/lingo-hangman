import React from "react";

// The words from a finished round, each with its meaning underneath, so the end
// screen is one more look at both languages together.
// words: [{ learning, native, solved? }]; `solved: false` marks a word that was shown.
export default function WordRecap({ title, words, learningLang, nativeLang }) {
  if (!words.length) return null;
  return (
    <section className="lg-recap" aria-label={title}>
      <h3 className="lg-caption lg-recap__title">{title}</h3>
      <ul className="lg-recap__list">
        {words.map((w, i) => (
          <li
            key={`${w.learning}-${i}`}
            className={`lg-recap__item lg-reveal${w.solved === false ? " lg-recap__item--shown" : ""}`}
            style={{ "--i": i }}
          >
            <span className="lg-recap__learning" lang={learningLang}>{w.learning}</span>
            <span className="lg-recap__native" lang={nativeLang}>{w.native}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
