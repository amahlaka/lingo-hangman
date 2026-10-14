import React, { useEffect, useMemo, useState } from "react";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import { getPreferences, onPreferencesChange } from "../../lib/preferences";
import { getContent } from "../../lib/content";
import { COLOR_FAMILIES, autoHints, colorFamily, hardLevels, pairLevel, slotKind, wordClassOf } from "../../lib/wordTypes";

// Shared word-type hints for every game (rules in src/lib/wordTypes.js):
// colour classes for word chips, the small label under a word or place, the
// colour key, and whether a sentence gets its hints for free.

// The word-type settings from the practice settings page, kept up to date.
export function useTypePrefs() {
  const [prefs, setPrefs] = useState(getPreferences);
  useEffect(() => onPreferencesChange(setPrefs), []);
  return { colors: prefs.typeColors, autoHelp: prefs.typeHelp };
}

// Class names that colour an element by its word type ({ cls } from
// parseWordType, or a bare class like "verb"), or "" when colours are off.
export function typeClass(type, colors) {
  const cls = typeof type === "string" ? type : type?.cls;
  return colors && cls ? ` lg-wt lg-wt--${colorFamily(cls)}` : "";
}

// The small label naming a word type. `place`: name the place in the sentence
// (subject, object, or the word class elsewhere) instead of the word class.
export function TypeLabel({ type, place = false }) {
  const { t } = useSettings();
  const kind = place ? slotKind(type) : type?.cls;
  if (!kind) return null;
  return <span className={`lg-wt-label lg-wt-label--${colorFamily(type.cls)}`}>{t.wordTypes[kind] || kind}</span>;
}

// The colour key for the word types in `types`, in a fixed order.
export function TypeKey({ types }) {
  const { t } = useSettings();
  const present = new Set((types || []).filter(Boolean).map((x) => colorFamily(x.cls)));
  const families = COLOR_FAMILIES.filter((f) => present.has(f));
  if (!families.length) return null;
  return (
    <ul className="lg-wt-key" aria-label={t.practice.typeKey}>
      {families.map((f) => (
        <li key={f} className={`lg-wt-key__item lg-wt lg-wt--${f}`}>{t.typeFamilies[f]}</li>
      ))}
    </ul>
  );
}

// Whether `pair` (a word bank sentence) shows its word types for free: the
// learner left automatic help on, and it is an easy sentence that has been hard
// lately (see autoHints).
export function useAutoTypeHelp(pair, lang) {
  const { state } = useProgress();
  const { autoHelp } = useTypePrefs();
  const hard = useMemo(() => {
    const items = getContent()
      .items.filter((i) => i.type === "word" && Array.isArray(i.wordTypes))
      .map((i) => ({ learning: i.text?.[lang] || i.text?.en, level: i.level }));
    return hardLevels(state, items, lang);
  }, [state, lang]);
  if (!autoHelp || !pair) return false;
  return autoHints(state, { learning: pair.learning, level: pairLevel(pair) }, hard, lang);
}

// For games with loose English words (choices, tiles): the colour class and the
// label for `word` when the learner colours words by type and the word bank
// knows its class. Returns { className, tag }, both empty otherwise.
export function useLooseWordType() {
  const { colors } = useTypePrefs();
  return (word, lang = "en") => {
    const cls = colors && String(lang).startsWith("en") ? wordClassOf(word) : null;
    if (!cls) return { className: "", tag: null };
    return { className: typeClass(cls, true), tag: <TypeLabel type={{ cls }} /> };
  };
}
