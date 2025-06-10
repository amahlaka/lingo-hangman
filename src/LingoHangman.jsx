import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BrowserRouter,
  Routes,
  Route,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { Dialog } from "@headlessui/react"; // or use your modal/dialog component
import { COMMON_WORDS } from "./commonWords";

const MAX_ATTEMPTS = 6;
const STORAGE_KEY = "lingoHangmanProgress";
const SCORE_KEY = "lingoHangmanScore";
const LANG_KEY = "lingoHangmanLang";

const i18n = {
  en: {
    generateLink: "Generate Link",
    addWord: "Add Word",
    learningWordPlaceholder: "Learning language word",
    nativeWordPlaceholder: "Native translation",
    noWords: "No words configured!",
    meaning: "Meaning",
    hangmanDrawing: "Hangman Drawing",
    wrongGuesses: "Wrong guesses",
    guessed: "You guessed it!",
    answerWas: "The word was",
    nextWord: "Next Word",
    score: "Score",
    correct: "✅",
    incorrect: "❌",
    generateGameLinkTitle: "Generate Game Link",
    selectLanguage: "Select Language",
    congratsTitle: "Congratulations!",
    congratsMsg: "You've guessed all words correctly at least once!",
    closeStr: "Close",
    restart: "Restart",
    swapModeLabel: "Occasionally swap question/answer direction",
    learningLangLabel: "Learning language",
    nativeLangLabel: "Native language",
    addCommonWords: "Add 5 common words",
    newGame: "New Game",
    presets: "Presets",
    selectCategories: "Select categories",
    howManyToAdd: "How many to add:",
    addSelected: "Add selected",
    unexclude: "Unexclude",
    exclude: "Exclude",
    word: "word",
    s: "s",
    match: "match",
    the: "the",
    selected: "selected",
    categories: "categories",
    removeWord: "Remove word",
    removeIcon: "×",
    presetsMatchCount: "{count} matching words in selected categories.",
    removeAllWords: "Remove all words"
  },
  fi: {
    generateLink: "Luo linkki",
    addWord: "Lisää sana",
    learningWordPlaceholder: "Opittava sana",
    nativeWordPlaceholder: "Käännös omalla kielellä",
    noWords: "Ei sanoja määritetty!",
    meaning: "Merkitys",
    hangmanDrawing: "Hirsipuupiirros",
    wrongGuesses: "Väärät arvaukset",
    guessed: "Arvasit oikein!",
    answerWas: "Sana oli",
    nextWord: "Seuraava sana",
    score: "Pisteet",
    correct: "✅",
    incorrect: "❌",
    generateGameLinkTitle: "Luo pelilinkki",
    selectLanguage: "Valitse kieli",
    congratsTitle: "Onnittelut!",
    congratsMsg: "Arvasit kaikki sanat oikein!",
    restart: "Aloita alusta",
    swapModeLabel: "Vaihda kysymyksen ja vastauksen suuntaa satunnaisesti",
    learningLangLabel: "Opittava kieli",
    nativeLangLabel: "Oma kieli",
    addCommonWords: "Lisää 5 yleistä sanaa",
    newGame: "Uusi peli",
    presets: "Oletukset",
    selectCategories: "Valitse kategoriat",
    howManyToAdd: "Kuinka monta lisätään:",
    addSelected: "Lisää valitut",
    closeStr: "Sulje",
    unexclude: "Poista sulku",
    exclude: "Sulje pois",
    word: "sana",
    s: "t",
    match: "ottelu",
    the: "se",
    selected: "valitut",
    categories: "kategoriat",
    removeWord: "Poista sana",
    removeIcon: "×",
    presetsMatchCount: "{count} sanaa valituissa kategorioissa.",
    removeAllWords: "Poista kaikki sanat"
  }
};

// Unicode-safe base64 encode/decode helpers
function toBase64Unicode(str) {
  // Encode to base64, handling Unicode
  return btoa(unescape(encodeURIComponent(str)));
}
function fromBase64Unicode(str) {
  // Decode from base64, handling Unicode
  return decodeURIComponent(escape(atob(str)));
}

function decodeWords(encoded) {
  try {
    const decoded = fromBase64Unicode(decodeURIComponent(encoded));
    return JSON.parse(decoded);
  } catch {
    return [
      { learning: "car", native: "auto" },
      { learning: "traffic light", native: "liikennevalo" }
    ];
  }
}

function HangmanDrawing({ incorrect, t }) {
  // Use lighter colors in dark mode
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const gallowsStroke = isDark ? "#bbb" : "#444";
  const bodyStroke = isDark ? "#eee" : "#222";

  return (
    <div className="flex flex-col items-center my-4">
      <svg width="120" height="160" viewBox="0 0 120 160">
        {/* Gallows */}
        <line x1="10" y1="150" x2="110" y2="150" stroke={gallowsStroke} strokeWidth="4" />
        <line x1="40" y1="150" x2="40" y2="20" stroke={gallowsStroke} strokeWidth="4" />
        <line x1="40" y1="20" x2="90" y2="20" stroke={gallowsStroke} strokeWidth="4" />
        <line x1="90" y1="20" x2="90" y2="40" stroke={gallowsStroke} strokeWidth="4" />
        {/* Head */}
        {incorrect > 0 && (
          <circle cx="90" cy="55" r="15" stroke={bodyStroke} strokeWidth="3" fill="none" />
        )}
        {/* Body */}
        {incorrect > 1 && (
          <line x1="90" y1="70" x2="90" y2="110" stroke={bodyStroke} strokeWidth="3" />
        )}
        {/* Left Arm */}
        {incorrect > 2 && (
          <line x1="90" y1="80" x2="70" y2="100" stroke={bodyStroke} strokeWidth="3" />
        )}
        {/* Right Arm */}
        {incorrect > 3 && (
          <line x1="90" y1="80" x2="110" y2="100" stroke={bodyStroke} strokeWidth="3" />
        )}
        {/* Left Leg */}
        {incorrect > 4 && (
          <line x1="90" y1="110" x2="75" y2="135" stroke={bodyStroke} strokeWidth="3" />
        )}
        {/* Right Leg */}
        {incorrect > 5 && (
          <line x1="90" y1="110" x2="105" y2="135" stroke={bodyStroke} strokeWidth="3" />
        )}
      </svg>
    </div>
  );
}

function HamburgerMenu({ lang, setLang, onRestart }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Dark mode toggle logic
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  return (
    <div className="relative">
      <button
        className="p-2 rounded border bg-gray-100 dark:bg-gray-800 dark:text-gray-100"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        type="button"
      >
        <svg width="24" height="24" fill="none" stroke="currentColor">
          <rect width="24" height="24" fill="none" />
          <line x1="5" y1="7" x2="19" y2="7" strokeWidth="2" />
          <line x1="5" y1="12" x2="19" y2="12" strokeWidth="2" />
          <line x1="5" y1="17" x2="19" y2="17" strokeWidth="2" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50"
        >
          <div className="p-4 space-y-3">
            <div>
              <label className="mr-2 font-medium text-gray-900 dark:text-gray-100">{i18n[lang].selectLanguage}:</label>
              <select
                value={lang}
                onChange={(e) => {
                  const newLang = e.target.value;
                  setLang(newLang);
                  localStorage.setItem(LANG_KEY, newLang);
                }}
                className="border rounded px-2 py-1 w-full mt-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="en" className="text-gray-900 dark:text-gray-900">English</option>
                <option value="fi" className="text-gray-900 dark:text-gray-900">Suomi</option>
              </select>
            </div>
            <button
              className="w-full px-3 py-1 rounded border bg-gray-100 dark:bg-gray-800 dark:text-gray-100"
              onClick={() => setIsDark((d) => !d)}
              aria-label="Toggle dark mode"
              type="button"
            >
              {isDark ? "🌙 Dark" : "☀️ Light"}
            </button>
            <button
              className="w-full px-3 py-1 rounded border border-red-400 text-red-600 bg-white dark:bg-gray-900"
              onClick={() => {
                setOpen(false);
                onRestart();
              }}
              type="button"
            >
              {i18n[lang].restart || "Restart"}
            </button>
            <button
              className="w-full px-3 py-1 rounded border border-blue-400 text-blue-600 bg-white dark:bg-gray-900"
              onClick={() => {
                setOpen(false);
                window.location.href = window.location.origin + window.location.pathname + "#/";
              }}
              type="button"
            >
              {i18n[lang].newGame || "New Game"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PresetsModal({ open, onClose, categories, setCategories, allCategories, onAdd, matchCount, numToAdd, setNumToAdd, excludedCategories, setExcludedCategories, t }) {
  // Helper to toggle exclusion
  const toggleExclude = (cat) => {
    if (excludedCategories.includes(cat)) {
      setExcludedCategories(excludedCategories.filter(c => c !== cat));
    } else {
      setExcludedCategories([...excludedCategories, cat]);
      // Also remove from included if present
      setCategories(categories.filter(c => c !== cat));
    }
  };
  // Helper to toggle inclusion
  const toggleInclude = (cat) => {
    if (categories.includes(cat)) {
      setCategories(categories.filter(c => c !== cat));
    } else {
      setCategories([...categories, cat]);
      // Also remove from excluded if present
      setExcludedCategories(excludedCategories.filter(c => c !== cat));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="fixed z-50 inset-0 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-lg max-w-md w-full p-6 z-10">
        <Dialog.Title className="text-lg font-bold mb-2">{t.selectCategories || "Select categories"}</Dialog.Title>
        <div className="flex flex-wrap gap-2 mb-4">
          {allCategories.map(cat => (
            <div key={cat} className="flex items-center gap-1 cursor-pointer border rounded px-2 py-1"
              style={{
                background: excludedCategories.includes(cat)
                  ? "#fee2e2"
                  : categories.includes(cat)
                  ? "#d1fae5"
                  : undefined,
                borderColor: excludedCategories.includes(cat)
                  ? "#f87171"
                  : categories.includes(cat)
                  ? "#34d399"
                  : "#d1d5db"
              }}
            >
              <input
                type="checkbox"
                checked={categories.includes(cat)}
                onChange={() => toggleInclude(cat)}
                className="accent-blue-600"
                disabled={excludedCategories.includes(cat)}
              />
              <span className="text-sm">{cat}</span>
              <button
                type="button"
                className={`ml-1 text-xs px-1 rounded ${excludedCategories.includes(cat) ? "bg-red-500 text-white" : "bg-gray-200 dark:bg-gray-700"}`}
                onClick={() => toggleExclude(cat)}
                aria-label={excludedCategories.includes(cat) ? (t.unexclude || "Unexclude") : (t.exclude || "Exclude")}
                style={{ minWidth: 22 }}
              >
                {excludedCategories.includes(cat) ? (t.unexcludeIcon || "✖") : (t.excludeIcon || "🚫")}
              </button>
            </div>
          ))}
        </div>
        <div className="mb-4 text-sm">
          {/* Use a full sentence from translation with template values */}
          {t.presetsMatchCount
            ? t.presetsMatchCount.replace("{count}", matchCount)
            : `${matchCount} matching words in selected categories.`}
        </div>
        <div className="mb-4 flex items-center gap-2">
          <label htmlFor="numToAdd" className="text-sm">{t.howManyToAdd || "How many to add:"}</label>
          <input
            id="numToAdd"
            type="number"
            min={1}
            max={matchCount}
            value={numToAdd}
            onChange={e => setNumToAdd(Math.max(1, Math.min(matchCount, Number(e.target.value) || 1)))}
            className="w-16 border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            disabled={matchCount === 0}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={onAdd} disabled={matchCount === 0}>{t.addSelected || "Add selected"}</Button>
          <Button variant="outline" onClick={onClose}>{t.closeStr || "Close"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

function URLGenerator({ lang, t }) {
  // Add language options for Latin alphabet languages, including en (US) and en-GB
  const languageOptions = [
    { code: "en", label: "English (US)" },
    { code: "en-GB", label: "English (UK)" },
    { code: "fi", label: "Finnish" },
    { code: "de", label: "German" },
    { code: "fr", label: "French" },
    { code: "es", label: "Spanish" },
    { code: "it", label: "Italian" },
    { code: "sv", label: "Swedish" },
    { code: "pt", label: "Portuguese" },
    { code: "nl", label: "Dutch" },
    { code: "pl", label: "Polish" },
    { code: "cs", label: "Czech" },
    { code: "ro", label: "Romanian" },
    { code: "hu", label: "Hungarian" },
    { code: "tr", label: "Turkish" },
    // Add more as needed
  ];

  const [pairs, setPairs] = useState([]);
  const [link, setLink] = useState("");
  const [swapMode, setSwapMode] = useState(false);
  const [learningLang, setLearningLang] = useState("en");
  const [nativeLang, setNativeLang] = useState("fi");

  // Presets modal state
  const [presetsOpen, setPresetsOpen] = useState(false);
  // Gather all unique categories from COMMON_WORDS
  const allCategories = Array.from(
    new Set(COMMON_WORDS.flatMap(w => w.categories || []))
  ).sort();
  // By default, no categories selected
  const [selectedCategories, setSelectedCategories] = useState([]);

  // New: excluded categories state
  const [excludedCategories, setExcludedCategories] = useState([]);

  // New: number of words to add from presets
  const [numToAdd, setNumToAdd] = useState(5);

  // Filter words by selected and excluded categories
  const mapLang = code => (code === "en-GB" ? "en" : code);
  const usedPairs = new Set(pairs.map(
    p => `${(p.learning || "").toLowerCase()}|${(p.native || "").toLowerCase()}`
  ));
  const filteredWords = COMMON_WORDS.filter(
    w =>
      w[mapLang(learningLang)] &&
      w[mapLang(nativeLang)] &&
      (selectedCategories.length === 0 ||
        (w.categories || []).some(cat => selectedCategories.includes(cat))) &&
      // Exclude if any excluded category matches
      !(w.categories || []).some(cat => excludedCategories.includes(cat)) &&
      !usedPairs.has(`${w[mapLang(learningLang)].toLowerCase()}|${w[mapLang(nativeLang)].toLowerCase()}`)
  );

  // Keep numToAdd in sync with matchCount
  useEffect(() => {
    if (numToAdd > filteredWords.length) setNumToAdd(filteredWords.length || 1);
    if (numToAdd < 1) setNumToAdd(1);
    // eslint-disable-next-line
  }, [filteredWords.length]);

  const addRandomCommonWords = () => {
    const shuffled = filteredWords.sort(() => Math.random() - 0.5).slice(0, numToAdd);
    const newPairs = shuffled.map(w => ({
      learning: w[mapLang(learningLang)],
      native: w[mapLang(nativeLang)]
    }));
    setPairs([...pairs, ...newPairs]);
    setPresetsOpen(false);
  };

  const handleChange = (index, field, value) => {
    const newPairs = [...pairs];
    newPairs[index][field] = value;
    setPairs(newPairs);
  };

  const addPair = () => {
    setPairs([...pairs, { learning: "", native: "" }]);
  };

  const removePair = (index) => {
    setPairs(pairs.filter((_, i) => i !== index));
  };

  const generateLink = () => {
    // Map en-GB to en for the link param as well
    const mapLang = code => (code === "en-GB" ? "en" : code);
    const validPairs = pairs.filter(p => p.learning && p.native);
    const json = JSON.stringify(validPairs);
    const encoded = encodeURIComponent(toBase64Unicode(json));
    const swapParam = swapMode ? "&swap=1" : "";
    const langParam = `&learningLang=${learningLang}&nativeLang=${nativeLang}`;
    const url = `${window.location.origin}${window.location.pathname}play?words=${encoded}${swapParam}${langParam}`;
    setLink(url);
    return url; // Return for use in Start Game
  };

  const handleStartGame = () => {
    const url = generateLink();
    // Extract the query string from the generated link
    const query = url.split("play?")[1] || "";
    navigate(`/play?${query}`);
  };

  const navigate = useNavigate();

  return (
    <Card className="mb-6">
      <CardContent className="p-4 space-y-4">
        <div className="flex justify-end mb-2">
          <HamburgerMenu lang={lang} setLang={t => {}} onRestart={() => {}} />
        </div>
        <h2 className="text-lg font-bold">{t.generateGameLinkTitle}</h2>
        <div className="flex gap-4 mb-2 items-end">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="learningLang">
              {t.learningLangLabel || "Learning language"}
            </label>
            <select
              id="learningLang"
              value={learningLang}
              onChange={e => setLearningLang(e.target.value)}
              className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              {languageOptions.map(opt => (
                <option key={opt.code} value={opt.code}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="nativeLang">
              {t.nativeLangLabel || "Native language"}
            </label>
            <select
              id="nativeLang"
              value={nativeLang}
              onChange={e => setNativeLang(e.target.value)}
              className="border rounded px-2 py-1 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              {languageOptions.map(opt => (
                <option key={opt.code} value={opt.code}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-4 mb-2 items-end">
          <Button
            type="button"
            onClick={() => setPresetsOpen(true)}
          >
            {t.presets || "Presets"}
          </Button>
        </div>
        <PresetsModal
          open={presetsOpen}
          onClose={() => setPresetsOpen(false)}
          categories={selectedCategories}
          setCategories={setSelectedCategories}
          allCategories={allCategories}
          onAdd={addRandomCommonWords}
          matchCount={filteredWords.length}
          numToAdd={numToAdd}
          setNumToAdd={setNumToAdd}
          excludedCategories={excludedCategories}
          setExcludedCategories={setExcludedCategories}
          t={t}
        />
        {pairs.map((pair, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input
              placeholder={t.learningWordPlaceholder}
              value={pair.learning}
              onChange={(e) => handleChange(idx, "learning", e.target.value)}
            />
            <Input
              placeholder={t.nativeWordPlaceholder}
              value={pair.native}
              onChange={(e) => handleChange(idx, "native", e.target.value)}
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="h-8 w-8 px-0 py-0"
              onClick={() => removePair(idx)}
              aria-label={t.removeWord || "Remove word"}
              disabled={pairs.length <= 1}
            >
              {t.removeIcon || "×"}
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            id="swapMode"
            type="checkbox"
            checked={swapMode}
            onChange={e => setSwapMode(e.target.checked)}
            className="accent-blue-600"
          />
          <label htmlFor="swapMode" className="text-sm cursor-pointer">
            {t.swapModeLabel || "Occasionally swap question/answer direction"}
          </label>
        </div>
        <Button onClick={addPair}>{t.addWord}</Button>
        <Button onClick={generateLink}>{t.generateLink}</Button>
        {/* Add Start Game button */}
        <Button
          variant="secondary"
          onClick={handleStartGame}
          disabled={pairs.length === 0 || pairs.some(p => !p.learning || !p.native)}
        >
          Start Game
        </Button>
        <Button
          variant="destructive"
          onClick={() => setPairs([])}
          disabled={pairs.length === 0}
        >
          {t.removeAllWords || "Remove all words"}
        </Button>
        {link && (
          <div className="mt-2">
            <Input readOnly value={link} onClick={(e) => e.target.select()} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CongratsModal({ open, onClose, t, guessedStats, words, onRestart }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-sm w-full text-center">
        <h2 className="text-2xl font-bold mb-4">{t.congratsTitle || "Congratulations!"}</h2>
        <p className="mb-6">{t.congratsMsg || "You've guessed all words correctly at least once!"}</p>
        <div className="mb-6 text-left">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="pb-1 text-left">{t.meaning}</th>
                <th className="pb-1 text-left">{t.nativeWordPlaceholder}</th>
                <th className="pb-1 text-right">{t.attempts || "Attempts"}</th>
              </tr>
            </thead>
            <tbody>
              {words.map((w, i) => {
                const key = w.learning.toLowerCase();
                const attempts = guessedStats[key]?.attempts ?? "-";
                return (
                  <tr key={key}>
                    <td className="pr-2">{w.learning}</td>
                    <td className="pr-2">{w.native}</td>
                    <td className="text-right">{attempts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={onClose}>{t.closeStr || "Close"}</Button>
          <Button variant="outline" onClick={onRestart}>{t.restart || "Restart"}</Button>
        </div>
      </div>
    </div>
  );
}

function HangmanGame({ lang, t, restartFlag }) {
  const [params] = useSearchParams();
  const encoded = params.get("words");
  const swapMode = params.get("swap") === "1";
  const learningLang = params.get("learningLang") || "en";
  const nativeLang = params.get("nativeLang") || "fi";
  const words = encoded ? decodeWords(encoded) : [
    { learning: "car", native: "auto" },
    { learning: "traffic light", native: "liikennevalo" }
  ];

  // Pick a random index for the first word on initial mount, only from unguessed words
  const getInitialIndex = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseInt(saved, 10) || 0;
    // Only pick from unguessed words
    const guessed = JSON.parse(localStorage.getItem("lingoHangmanGuessedWords") || "[]");
    const unguessedIndexes = words
      .map((w, i) => (!guessed.includes((w.learning || "").toLowerCase()) ? i : null))
      .filter(i => i !== null);
    if (unguessedIndexes.length === 0) return 0;
    return unguessedIndexes[Math.floor(Math.random() * unguessedIndexes.length)];
  };

  // Restore guesses from localStorage if available and for the same word
  const getInitialGuesses = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("lingoHangmanGuesses") || "[]");
      const savedIndex = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      if (
        Array.isArray(saved) &&
        savedIndex === getInitialIndex()
      ) {
        return saved;
      }
    } catch {}
    return [];
  };

  const [currentIndex, setCurrentIndex] = useState(getInitialIndex);
  const [guesses, setGuesses] = useState(getInitialGuesses);
  const [score, setScore] = useState(() => {
    const saved = localStorage.getItem(SCORE_KEY);
    return saved ? JSON.parse(saved) : { correct: 0, incorrect: 0 };
  });

  // Track which words have been guessed correctly at least once
  const [guessedWords, setGuessedWords] = useState(() => {
    const saved = localStorage.getItem("lingoHangmanGuessedWords");
    return saved ? JSON.parse(saved) : [];
  });
  const [guessedStats, setGuessedStats] = useState(() => {
    const saved = localStorage.getItem("lingoHangmanGuessedStats");
    return saved ? JSON.parse(saved) : {};
  });
  const [showCongrats, setShowCongrats] = useState(false);

  // Track how many rounds (plays) for each word
  const [wordAttempts, setWordAttempts] = useState(() => {
    const saved = localStorage.getItem("lingoHangmanWordAttempts");
    return saved ? JSON.parse(saved) : {};
  });

  // Add a new state for the total score
  const [totalScore, setTotalScore] = useState(() => {
    const saved = localStorage.getItem("lingoHangmanTotalScore");
    return saved ? parseInt(saved, 10) : 0;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, currentIndex.toString());
    localStorage.setItem("lingoHangmanGuesses", JSON.stringify(guesses));
    localStorage.setItem(SCORE_KEY, JSON.stringify(score));
    localStorage.setItem("lingoHangmanGuessedWords", JSON.stringify(guessedWords));
    localStorage.setItem("lingoHangmanGuessedStats", JSON.stringify(guessedStats));
    localStorage.setItem("lingoHangmanWordAttempts", JSON.stringify(wordAttempts));
    localStorage.setItem("lingoHangmanTotalScore", totalScore.toString());
  }, [currentIndex, guesses, score, guessedWords, guessedStats, wordAttempts, totalScore]);

  // For each round, randomly decide if swap is active (if swapMode is enabled)
  const [swap, setSwap] = useState(false);

  useEffect(() => {
    if (swapMode) {
      setSwap(Math.random() < 0.5);
    } else {
      setSwap(false);
    }
    // eslint-disable-next-line
  }, [currentIndex, restartFlag]);

  const current = words[currentIndex % words.length];
  // If swap, swap learning/native for this round
  const learning = swap ? current.native : current.learning;
  const native = swap ? current.learning : current.native;
  const letters = learning.toUpperCase().split("");

  // Only require guessing for A-Z letters
  const isGuessable = (char) => /^[A-Z]$/.test(char);

  // Track which letters have been guessed incorrectly for this round
  const incorrect = guesses.filter(
    g => !letters.some(l => isGuessable(l) && l === g)
  );

  // Track which letters have been guessed correctly for this round
  const correctGuesses = guesses.filter(
    g => letters.some(l => isGuessable(l) && l === g)
  );

  // Helper to count how many times a letter appears in the word
  const countLetterInWord = (letter, wordArr) =>
    wordArr.reduce((acc, l) => (l === letter ? acc + 1 : acc), 0);
  // On each round start, increment attempts for this word if not already guessed
  useEffect(() => {
    const wordKey = learning.toLowerCase();
    if (!guessedWords.includes(wordKey)) {
      setWordAttempts(prev => ({
        ...prev,
        [wordKey]: (prev[wordKey] || 0) + 1
      }));
    }
    // eslint-disable-next-line
  }, [currentIndex]);

  // Track attempts for current word
  const [currentAttempts, setCurrentAttempts] = useState(0);



  useEffect(() => {
    setCurrentAttempts(guesses.length);
    // eslint-disable-next-line
  }, [guesses]);

  const handleGuess = (letter) => {
    if (guesses.includes(letter)) return;
    setGuesses([...guesses, letter]);
  };

  // Win if all guessable letters are guessed
  const isWon = letters.every(
    l => !isGuessable(l) || guesses.includes(l)
  );
  const isLost = incorrect.length >= MAX_ATTEMPTS;

  // Track if the round has been scored already
  const [roundScored, setRoundScored] = useState(false);

  // Calculate and update score when round ends
  useEffect(() => {
    if ((isWon || isLost) && !roundScored) {
      let roundScore = 0;
      // +10 for each correctly guessed letter instance (including duplicates)
      for (const g of correctGuesses) {
        roundScore += 10 * countLetterInWord(g, letters);
      }
      // -10 for each incorrect letter guessed
      roundScore -= 10 * incorrect.length;
      // +50 for solving the word, -25 for failing
      if (isWon) {
        roundScore += 50;
        // Bonus: no mistakes
        if (incorrect.length === 0) {
          roundScore += 25;
        }
      } else if (isLost) {
        roundScore -= 25;
      }
      setTotalScore(prev => prev + roundScore);
      setRoundScored(true);
    }
    // eslint-disable-next-line
  }, [isWon, isLost, roundScored]);

  // Helper to get the next unguessed word index
  const getNextUnguessedIndex = (currentIdx, guessedWordsArr) => {
    const total = words.length;
    for (let i = 1; i <= total; ++i) {
      const idx = (currentIdx + i) % total;
      const wordKey = (words[idx].learning || "").toLowerCase();
      if (!guessedWordsArr.includes(wordKey)) return idx;
    }
    return null;
  };

  // When the user wins, mark the word as guessed
  useEffect(() => {
    if (isWon) {
      const wordKey = (learning || "").toLowerCase();
      if (!guessedWords.includes(wordKey)) {
        setGuessedWords(prev => [...prev, wordKey]);
      }
    }
    // eslint-disable-next-line
  }, [isWon]);

  // Helper to get the set of unique learning words (case-insensitive)
  const uniqueLearningWords = Array.from(new Set(words.map(w => (w.learning || "").toLowerCase())));

  // If all words are guessed, show congrats modal
  useEffect(() => {
    if (
      words.length > 0 &&
      guessedWords.length === words.length
    ) {
      setShowCongrats(true);
    }
  }, [guessedWords, words.length]);

  // Block further play if all words are guessed
  if (showCongrats) {
    return (
      <CongratsModal
        open={showCongrats}
        onClose={handleCloseCongrats}
        onRestart={handleRestart}
        t={{
          ...t,
          congratsTitle: t.congratsTitle || "Congratulations!",
          congratsMsg: t.congratsMsg || "You've guessed all words correctly at least once!",
          close: t.closeStr || "Close",
          attempts: t.attempts || "Attempts",
          restart: t.restart || "Restart"
        }}
        guessedStats={guessedStats}
        words={Array.from(new Set(words.map(w => JSON.stringify(w)))).map(s => JSON.parse(s))}
      />
    );
  }

  const handleNext = () => {
    // Prevent advancing if all words are guessed
    if (guessedWords.length === words.length) {
      setShowCongrats(true);
      return;
    }
    if (isWon) setScore(prev => ({ ...prev, correct: prev.correct + 1 }));
    if (isLost) setScore(prev => ({ ...prev, incorrect: prev.incorrect + 1 }));

    // Find next unguessed word
    const nextIndex = getNextUnguessedIndex(currentIndex, isWon
      ? [...guessedWords, (learning || "").toLowerCase()]
      : guessedWords
    );
    if (nextIndex === null) {
      setShowCongrats(true);
      return;
    }
    setCurrentIndex(nextIndex);
    setGuesses([]);
    setCurrentAttempts(0);
    setRoundScored(false);
    localStorage.setItem(STORAGE_KEY, nextIndex.toString());
    localStorage.setItem("lingoHangmanGuesses", JSON.stringify([]));
  };

  const handleRestart = () => {
    setScore({ correct: 0, incorrect: 0 });
    setGuessedWords([]);
    setGuessedStats({});
    setWordAttempts({});
    setCurrentIndex(0);
    setGuesses([]);
    setShowCongrats(false);
    setTotalScore(0);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SCORE_KEY);
    localStorage.removeItem("lingoHangmanGuessedWords");
    localStorage.removeItem("lingoHangmanGuessedStats");
    localStorage.removeItem("lingoHangmanWordAttempts");
    localStorage.removeItem("lingoHangmanTotalScore");
    localStorage.removeItem("lingoHangmanGuesses");
  };

  const handleCloseCongrats = () => {
    handleRestart();
  };

  // Reset all state when restartFlag changes
  useEffect(() => {
    setScore({ correct: 0, incorrect: 0 });
    setGuessedWords([]);
    setGuessedStats({});
    setWordAttempts({});
    setCurrentIndex(0);
    setGuesses([]);
    setShowCongrats(false);
    setTotalScore(0);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SCORE_KEY);
    localStorage.removeItem("lingoHangmanGuessedWords");
    localStorage.removeItem("lingoHangmanGuessedStats");
    localStorage.removeItem("lingoHangmanWordAttempts");
    localStorage.removeItem("lingoHangmanTotalScore");
    localStorage.removeItem("lingoHangmanGuesses");
    // eslint-disable-next-line
  }, [restartFlag]);

  if (!current) return <div>{t.noWords}</div>;

  // Show time value if present
  // search the common words for the current word
  // if found, get the time value
  // first check if url has the learning language set, then search the common words for the current word in that language
  // use the learning language value as the key and the current word's learning value as the search term
  const timeValue = COMMON_WORDS.find(w => w[learningLang] === current.learning)?.time;
  


  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <CongratsModal
        open={showCongrats}
        onClose={handleCloseCongrats}
        onRestart={handleRestart}
        t={{
          ...t,
          congratsTitle: t.congratsTitle || "Congratulations!",
          congratsMsg: t.congratsMsg || "You've guessed all words correctly at least once!",
          close: t.closeStr || "Close",
          attempts: t.attempts || "Attempts",
          restart: t.restart || "Restart"
        }}
        guessedStats={guessedStats}
        words={Array.from(new Set(words.map(w => JSON.stringify(w)))).map(s => JSON.parse(s))}
      />
      <Card>
        <CardContent className="text-center p-4">
          <div className="flex justify-end mb-2">
            <HamburgerMenu lang={lang} setLang={t => {}} onRestart={handleRestart} />
          </div>
          <h2 className="text-xl font-semibold">{t.meaning}: {native}</h2>
          {timeValue && (
            <div className="mb-2 text-blue-600 dark:text-blue-300 text-base">
              {Array.isArray(timeValue) ? timeValue.join(" / ") : timeValue}
            </div>
          )}
          <div className="text-right text-sm font-semibold mb-2">
            {t.score}: {totalScore}
          </div>
          <HangmanDrawing incorrect={incorrect.length} t={t} />
          <div className="text-2xl tracking-widest my-4">
            {letters.map((l, i) => (
              <span key={i} className="inline-block w-6">
                {l === ' '
                  ? ' '
                  : isGuessable(l)
                    ? (guesses.includes(l) ? l : "_")
                    : l}
              </span>
            ))}
          </div>
          <div className="text-red-500">{t.wrongGuesses}: {incorrect.join(", ")}</div>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {getAlphabet(learningLang).map(l => {
              const isIncorrect = guesses.includes(l) && !letters.some(wl => isGuessable(wl) && wl === l);
              return (
                <Button
                  key={l}
                  variant="outline"
                  size="sm"
                  disabled={guesses.includes(l) || isWon || isLost}
                  onClick={() => handleGuess(l)}
                  className={isIncorrect ? "text-red-600 px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50" : "px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50"}
                >
                  {l}
                </Button>
              );
            })}
          </div>
          {(isWon || isLost) && (
            <div className="mt-4 space-y-2">
              <p className="text-lg font-semibold">
                {isWon ? t.guessed : `${t.answerWas}: ${learning.toUpperCase()}`}
              </p>
              <p>{t.score}: {t.correct} {score.correct} / {t.incorrect} {score.incorrect}</p>
              <Button onClick={handleNext}>
                {t.nextWord}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Helper: get alphabet for the current learning language
const getAlphabet = (lang) => {
  switch (lang) {
    case "fi": // Finnish
      return "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖ".split("");
    case "de": // German
      return "AÄBCDEFGHIJKLMNOÖPQRSßTUÜVWXYZ".split("");
    case "fr": // French
      // French uses accents but for hangman, base letters are enough
      return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    case "es": // Spanish
      return "AÁBCDEÉFGHIÍJKLMNÑOÓPQRSTUÚÜVWXYZ".split("");
    case "it": // Italian
      return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    case "sv": // Swedish
      return "AÅÄBCDEFGHIJKLMNOPQRSTUVWXYZÖ".split("");
    case "pt": // Portuguese
      return "AÁÂÃÀBCÇDEÉÊFGHIÍJKLMNOÓÔÕPQRSTUÚÜVWXYZ".split("");
    case "nl": // Dutch
      return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    case "pl": // Polish
      return "AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ".split("");
    case "cs": // Czech
      return "AÁBCČDĎEÉĚFGHIÍJKLMNŇOÓPQRŘSŠTŤUÚŮVWXZÝŽ".split("");
    case "ro": // Romanian
      return "AĂÂBCDEFGHIÎJKLMNOPQRSȘTȚUVWXYZ".split("");
    case "hu": // Hungarian
      return "AÁBCDEÉFGHIÍJKLMNOÓÖŐPQRSTUÚÜŰVWXYZ".split("");
    case "tr": // Turkish
      return "AÂBCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split("");
    case "en-GB":
    case "en":
    default:
      return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  }
};

export default function LingoHangman() {
  const detectBrowserLanguage = () => {
    const storedLang = localStorage.getItem(LANG_KEY);
    if (storedLang) return storedLang;
    const browserLang = navigator.language.slice(0, 2);
    return i18n[browserLang] ? browserLang : "en";
  };

  const [lang, setLang] = useState(detectBrowserLanguage);
  const t = i18n[lang];
  // Provide a restart handler for the menu
  const [restartFlag, setRestartFlag] = useState(0);

  return (
    <BrowserRouter>
      <div className="min-h-screen w-full bg-gray-100 dark:bg-gray-900 transition-colors">
        <div className="max-w-xl mx-auto p-4 bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 min-h-screen transition-colors">
          <Routes>
            <Route
              path="/"
              element={
                <div>
                  {/* Optionally, you can move HamburgerMenu into the Card in URLGenerator as well */}
                  <URLGenerator lang={lang} t={t} />
                </div>
              }
            />
            <Route
              path="/play"
              element={
                <div>
                  <HangmanGame lang={lang} t={t} restartFlag={restartFlag} />
                </div>
              }
            />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}