import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import URLGenerator from "./components/URLGenerator";
import HangmanGame from "./components/HangmanGame";
import i18n from "./i18n";

const LANG_KEY = "lingoHangmanLang";

export default function LingoHangman() {
  const detectBrowserLanguage = () => {
    const storedLang = localStorage.getItem(LANG_KEY);
    if (storedLang) return storedLang;
    const browserLang = navigator.language.slice(0, 2);
    return i18n[browserLang] ? browserLang : "en";
  };

  const [lang, setLang] = useState(detectBrowserLanguage);
  const t = i18n[lang];
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