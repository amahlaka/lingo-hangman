import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "./SettingsContext";
import { GameScreen, typeClass } from "../components/lingo";
import { categoryGroups, categoryLabels } from "../lib/words";
import { DIFFICULTIES, getPreferences, onPreferencesChange, resetPreferences, setPreferences } from "../lib/preferences";

// Focus areas, difficulty and word-type settings for every game
// (src/lib/preferences.js). All optional; games fall back to all words when
// too few match.
export default function Preferences() {
  const { t, lang } = useSettings();
  const [prefs, setPrefs] = useState(getPreferences);
  useEffect(() => onPreferencesChange(setPrefs), []);

  const labels = categoryLabels(lang);
  const groups = categoryGroups(lang, t.focusOther);
  const toggleFocus = (cat) =>
    setPreferences({
      focus: prefs.focus.includes(cat) ? prefs.focus.filter((c) => c !== cat) : [...prefs.focus, cat],
    });
  // Picks every topic of a group, or clears them when all are picked already.
  const toggleGroup = (cats) => {
    const all = cats.every((c) => prefs.focus.includes(c));
    setPreferences({
      focus: all ? prefs.focus.filter((c) => !cats.includes(c)) : [...prefs.focus, ...cats.filter((c) => !prefs.focus.includes(c))],
    });
  };

  // One heading of the focus list. Opt-in topics (index.json "optIn") are
  // left out of games until picked, so their chips show a + until then.
  const renderGroup = (group) => {
    const all = group.categories.every((c) => prefs.focus.includes(c));
    return (
      <div key={group.id} className="lg-focus-group" role="group" aria-labelledby={`focus-${group.id}`}>
        <div className="lg-focus-group__head">
          <h3 id={`focus-${group.id}`} className="lg-focus-group__title">{group.label}</h3>
          {group.categories.length > 1 && (
            <button
              type="button"
              className="lg-btn lg-btn--quiet lg-focus-group__all"
              onClick={() => toggleGroup(group.categories)}
              aria-label={`${all ? t.focusGroupNone : t.focusGroupAll}: ${group.label}`}
            >
              {all ? t.focusGroupNone : t.focusGroupAll}
            </button>
          )}
        </div>
        <div className="lg-chips">
          {group.categories.map((cat) => {
            const on = prefs.focus.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                className={`lg-chip${on ? " lg-chip--on" : ""}${group.optIn ? " lg-chip--extra" : ""}`}
                aria-pressed={on}
                onClick={() => toggleFocus(cat)}
              >
                {group.optIn && <span className="lg-chip__mark" aria-hidden="true">{on ? "✓" : "+"}</span>}
                {labels[cat]}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

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
          <h2 className="lg-heading">{t.focusAreasLabel}</h2>
          <p className="lg-caption">{t.focusAreasHint}</p>
          {groups.filter((g) => !g.optIn).map(renderGroup)}
        </section>

        {groups.some((g) => g.optIn) && (
          <section className="lg-section lg-extra-topics">
            <h2 className="lg-heading">{t.extraTopicsLabel}</h2>
            <p className="lg-caption">{t.extraTopicsHint}</p>
            {groups.filter((g) => g.optIn).map(renderGroup)}
          </section>
        )}

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
