import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { GameScreen } from "../../components/lingo";
import {
  DEFAULT_LEARNING_LANG,
  DEFAULT_NATIVE_LANG,
  LANGUAGE_OPTIONS,
  buildWordsQuery,
  pickCommonWords,
} from "../../lib/words";

// Type your own word pairs for hangman, then play them or share them as a
// /play?words=... link. Plain hangman (/hangman) skips this and uses the word bank.
export default function HangmanCustomWords() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const [learningLang, setLearningLang] = useState(DEFAULT_LEARNING_LANG);
  const [nativeLang, setNativeLang] = useState(DEFAULT_NATIVE_LANG);
  const [swap, setSwap] = useState(false);
  const [pairs, setPairs] = useState([{ learning: "", native: "" }]);
  const [link, setLink] = useState("");

  const validPairs = pairs.filter((p) => p.learning.trim() && p.native.trim());

  const queryFor = (list) => buildWordsQuery({ pairs: list, learningLang, nativeLang, swap });

  const start = () => navigate(`/play?${queryFor(validPairs)}`);

  const makeLink = () => setLink(`${window.location.origin}/play?${queryFor(validPairs)}`);

  const addCommonWords = () => {
    const picked = pickCommonWords({ learningLang, nativeLang, preferences: true });
    setPairs((ps) => [...ps.filter((p) => p.learning.trim() || p.native.trim()), ...picked.map(({ learning, native }) => ({ learning, native }))]);
  };

  const updatePair = (i, field, value) =>
    setPairs((ps) => ps.map((p, j) => (j === i ? { ...p, [field]: value } : p)));

  const canStart = validPairs.length > 0;

  return (
    <GameScreen title={t.yourWords}>
      <main className="lg-board lg-page">
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
            <button type="button" className="lg-btn lg-btn--secondary" onClick={addCommonWords}>
              {t.addCommonWords}
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
            <button type="button" className="lg-btn lg-btn--primary" onClick={start} disabled={!canStart}>
              {t.startGame}
            </button>
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
      </main>
    </GameScreen>
  );
}
