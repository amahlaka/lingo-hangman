import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "./SettingsContext";
import { GameScreen, typeClass } from "../components/lingo";
import { ALL_CATEGORIES, categoryLabels } from "../lib/words";
import { DIFFICULTIES, RECOGNITION, getPreferences, onPreferencesChange, resetPreferences, setPreferences } from "../lib/preferences";

// Focus areas, difficulty and word-type settings for every game
// (src/lib/preferences.js). All optional; games fall back to all words when
// too few match.
export default function Preferences() {
  const { t, lang } = useSettings();
  const [prefs, setPrefs] = useState(getPreferences);
  useEffect(() => onPreferencesChange(setPrefs), []);

  const labels = categoryLabels(lang);
  const toggleFocus = (cat) =>
    setPreferences({
      focus: prefs.focus.includes(cat) ? prefs.focus.filter((c) => c !== cat) : [...prefs.focus, cat],
    });

  return (
    <GameScreen title={t.preferencesTitle}>
      <main className="lg-board lg-page">
        <p className="lg-body-lg">{t.preferencesIntro}</p>

        <section className="lg-section">
          <h2 className="lg-heading">{t.difficultyLabel}</h2>
          <div className="lg-chips">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={`lg-chip ${prefs.difficulty === d ? "lg-chip--on" : ""}`}
                aria-pressed={prefs.difficulty === d}
                onClick={() => setPreferences({ difficulty: d })}
              >
                {t.difficulty[d]}
              </button>
            ))}
          </div>
        </section>

        <section className="lg-section">
          <h2 className="lg-heading">{t.wordTypesTitle}</h2>
          {[
            ["typeColors", t.typeColorsLabel, t.typeColorsHint],
            ["typeHelp", t.typeHelpLabel, t.typeHelpHint],
          ].map(([key, label, hint]) => (
            <div key={key} className="lg-pref">
              <button
                type="button"
                className={`lg-chip ${prefs[key] ? "lg-chip--on" : ""}`}
                aria-pressed={prefs[key]}
                onClick={() => setPreferences({ [key]: !prefs[key] })}
              >
                <span className="lg-chip__mark" aria-hidden="true">{prefs[key] ? "✓" : ""}</span>
                {label}
              </button>
              <p className="lg-caption">{hint}</p>
            </div>
          ))}
          {prefs.typeColors && (
            <div className="lg-pref__sample">
              {[["verb", "verb"], ["noun", "noun"], ["adjective", "adjective"], ["adverb", "adverb"], ["pronoun", "pronoun"], ["question", "question"], ["small", "article"]].map(
                ([family, cls]) => (
                  <span key={family} className={`pg-chip pg-chip--typed${typeClass(cls, true)}`}>
                    <span className="pg-chip__word">{t.typeFamilies[family]}</span>
                  </span>
                )
              )}
            </div>
          )}
        </section>

        <section className="lg-section">
          <h2 className="lg-heading">{t.recognitionTitle}</h2>
          <p className="lg-caption">{t.recognitionHint}</p>
          <div className="lg-chips">
            {RECOGNITION.map((r) => (
              <button
                key={r}
                type="button"
                className={`lg-chip ${prefs.recognition === r ? "lg-chip--on" : ""}`}
                aria-pressed={prefs.recognition === r}
                onClick={() => setPreferences({ recognition: r })}
              >
                {t.recognition[r]}
              </button>
            ))}
          </div>
          <p className="lg-caption">{t.recognitionHints[prefs.recognition]}</p>
        </section>

        <section className="lg-section">
          <h2 className="lg-heading">{t.focusAreasLabel}</h2>
          <p className="lg-caption">{t.focusAreasHint}</p>
          <div className="lg-chips">
            {ALL_CATEGORIES.map((cat) => {
              const on = prefs.focus.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  className={`lg-chip ${on ? "lg-chip--on" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggleFocus(cat)}
                >
                  {labels[cat]}
                </button>
              );
            })}
          </div>
        </section>

        <div className="lg-row">
          <Link to="/" className="lg-btn lg-btn--primary">{t.allGames}</Link>
          {(prefs.focus.length > 0 || prefs.difficulty !== "any") && (
            <button type="button" className="lg-btn lg-btn--quiet" onClick={resetPreferences}>
              {t.clearPreferences}
            </button>
          )}
        </div>
      </main>
    </GameScreen>
  );
}
