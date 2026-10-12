import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { CategoryChips, GameScreen } from "../../components/lingo";
import {
  ALL_CATEGORIES,
  DEFAULT_CATEGORIES,
  DEFAULT_LEARNING_LANG,
  DEFAULT_NATIVE_LANG,
  LANGUAGE_OPTIONS,
  buildWordsQuery,
  categoryLabels,
  filterCommonWords,
  pickCommonWords,
} from "../../lib/words";

const WORD_COUNTS = [5, 10, 15];

// Hangman's start screen: pick categories and go, or type your own word pairs
// and share them as a /play?words=... link.
export default function HangmanSetup() {
  const { t, lang } = useSettings();
  const navigate = useNavigate();
  const [included, setIncluded] = useState(DEFAULT_CATEGORIES.filter((c) => ALL_CATEGORIES.includes(c)));
  const [excluded, setExcluded] = useState([]);
  const [count, setCount] = useState(5);
  const [learningLang, setLearningLang] = useState(DEFAULT_LEARNING_LANG);
  const [nativeLang, setNativeLang] = useState(DEFAULT_NATIVE_LANG);
  const [swap, setSwap] = useState(false);
  const [pairs, setPairs] = useState([]);
  const [link, setLink] = useState("");

  const validPairs = pairs.filter((p) => p.learning.trim() && p.native.trim());
  const matchCount = filterCommonWords({ learningLang, nativeLang, include: included, exclude: excluded }).length;

  const wordsForGame = () =>
    validPairs.length > 0
      ? validPairs
      : pickCommonWords({ count, learningLang, nativeLang, include: included, exclude: excluded });

  const queryFor = (list) => buildWordsQuery({ pairs: list, learningLang, nativeLang, swap });

  const start = () => navigate(`/play?${queryFor(wordsForGame())}`);

  const makeLink = () => setLink(`${window.location.origin}/play?${queryFor(wordsForGame())}`);

  const fillFromCategories = () => {
    const picked = pickCommonWords({ count, learningLang, nativeLang, include: included, exclude: excluded });
    setPairs(picked.map(({ learning, native }) => ({ learning, native })));
  };

  const updatePair = (i, field, value) =>
    setPairs((ps) => ps.map((p, j) => (j === i ? { ...p, [field]: value } : p)));

  const canStart = validPairs.length > 0 || matchCount > 0;

  return (
    <GameScreen title={t.hangmanName}>
      <main className="lg-board lg-page">
        <p className="lg-body-lg">{t.hangmanSetupIntro}</p>

        <section className="lg-section">
          <h2 className="lg-heading">{t.selectCategories}</h2>
          <p className="lg-caption">{t.categoryHint}</p>
          <CategoryChips
            all={ALL_CATEGORIES}
            labels={categoryLabels(lang)}
            included={included}
            excluded={excluded}
            onChange={({ included: inc, excluded: exc }) => {
              setIncluded(inc);
              setExcluded(exc);
            }}
          />
          <p className="lg-caption">{t.presetsMatchCount.replace("{count}", matchCount)}</p>
        </section>

        <section className="lg-section">
          <h2 className="lg-heading">{t.wordsPerGame}</h2>
          <div className="lg-chips">
            {WORD_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                className={`lg-chip ${count === n ? "lg-chip--on" : ""}`}
                aria-pressed={count === n}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        <div className="lg-cta">
          <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={start} disabled={!canStart}>
            {t.startGame}
          </button>
        </div>

        <details className="lg-details">
          <summary className="lg-heading">{t.yourWords}</summary>
          <div className="lg-stack">
            <p className="lg-caption">{t.customWordsHint}</p>
            <div className="lg-row">
              <label className="lg-field">
                <span>{t.learningLangLabel}</span>
                <select className="lg-input" value={learningLang} onChange={(e) => setLearningLang(e.target.value)}>
                  {LANGUAGE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="lg-field">
                <span>{t.nativeLangLabel}</span>
                <select className="lg-input" value={nativeLang} onChange={(e) => setNativeLang(e.target.value)}>
                  {LANGUAGE_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {pairs.map((pair, i) => (
              <div key={i} className="lg-pair">
                <input
                  className="lg-input"
                  placeholder={t.learningWordPlaceholder}
                  aria-label={t.learningWordPlaceholder}
                  value={pair.learning}
                  onChange={(e) => updatePair(i, "learning", e.target.value)}
                />
                <input
                  className="lg-input"
                  placeholder={t.nativeWordPlaceholder}
                  aria-label={t.nativeWordPlaceholder}
                  value={pair.native}
                  onChange={(e) => updatePair(i, "native", e.target.value)}
                />
                <button
                  type="button"
                  className="lg-btn lg-btn--quiet lg-icon-btn"
                  aria-label={`${t.removeWord}: ${pair.learning || i + 1}`}
                  onClick={() => setPairs((ps) => ps.filter((_, j) => j !== i))}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            ))}
            <div className="lg-row">
              <button
                type="button"
                className="lg-btn lg-btn--secondary"
                onClick={() => setPairs((ps) => [...ps, { learning: "", native: "" }])}
              >
                <Plus size={18} aria-hidden="true" /> {t.addWord}
              </button>
              <button type="button" className="lg-btn lg-btn--secondary" onClick={fillFromCategories}>
                {t.addCommonWords.replace("5", String(count))}
              </button>
              {pairs.length > 0 && (
                <button type="button" className="lg-btn lg-btn--quiet" onClick={() => setPairs([])}>
                  {t.clearWords}
                </button>
              )}
            </div>
            <label className="lg-check">
              <input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} />
              <span>{t.swapModeShort}</span>
            </label>
            <div className="lg-row">
              <button type="button" className="lg-btn lg-btn--secondary" onClick={makeLink} disabled={!canStart}>
                {t.shareLink}
              </button>
            </div>
            {link && (
              <input
                className="lg-input"
                readOnly
                value={link}
                aria-label={t.shareLink}
                onFocus={(e) => e.target.select()}
              />
            )}
          </div>
        </details>
      </main>
    </GameScreen>
  );
}
