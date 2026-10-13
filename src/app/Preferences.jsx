import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "./SettingsContext";
import { GameScreen } from "../components/lingo";
import { ALL_CATEGORIES, categoryLabels } from "../lib/words";
import { DIFFICULTIES, getPreferences, onPreferencesChange, resetPreferences, setPreferences } from "../lib/preferences";

// Focus areas and difficulty for every game (src/lib/preferences.js). Both are
// optional; games fall back to all words when too few match.
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
