import React, { useState, useEffect } from "react";
import i18n from "../i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import PresetsModal from "./PresetsModal";
import HamburgerMenu from "./HamburgerMenu";
import { COMMON_WORDS } from "../commonWords";

function toBase64Unicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export default function URLGenerator({ lang, t, setLang }) {
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
  ];

  const [pairs, setPairs] = useState([]);
  const [link, setLink] = useState("");
  const [swapMode, setSwapMode] = useState(false);
  const [learningLang, setLearningLang] = useState("en");
  const [nativeLang, setNativeLang] = useState("fi");
  const [presetsOpen, setPresetsOpen] = useState(false);
  const allCategories = Array.from(
    new Set(COMMON_WORDS.flatMap(w => w.categories || []))
  ).sort();
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [excludedCategories, setExcludedCategories] = useState([]);
  const [numToAdd, setNumToAdd] = useState(5);

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
      !(w.categories || []).some(cat => excludedCategories.includes(cat)) &&
      !usedPairs.has(`${w[mapLang(learningLang)].toLowerCase()}|${w[mapLang(nativeLang)].toLowerCase()}`)
  );

  useEffect(() => {
    if (numToAdd > filteredWords.length) setNumToAdd(filteredWords.length || 1);
    if (numToAdd < 1) setNumToAdd(1);
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
    const mapLang = code => (code === "en-GB" ? "en" : code);
    const validPairs = pairs.filter(p => p.learning && p.native);
    const json = JSON.stringify(validPairs);
    const encoded = encodeURIComponent(toBase64Unicode(json));
    const swapParam = swapMode ? "&swap=1" : "";
    const langParam = `&learningLang=${learningLang}&nativeLang=${nativeLang}`;
    const url = `${window.location.origin}${window.location.pathname}play?words=${encoded}${swapParam}${langParam}`;
    setLink(url);
    return url;
  };

  const handleStartGame = () => {
    const url = generateLink();
    const query = url.split("play?")[1] || "";
    navigate(`/play?${query}`);
  };

  const navigate = useNavigate();

  return (
    <Card className="mb-6">
      <CardContent className="p-4 space-y-4">
        <div className="flex justify-end mb-2">
          <HamburgerMenu lang={lang} setLang={setLang} onRestart={() => {}} />
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
