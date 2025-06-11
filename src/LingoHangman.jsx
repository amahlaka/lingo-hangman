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
  // Update t when lang changes, without reload
  const [tState, setTState] = useState(i18n[lang]);
  React.useEffect(() => {
    setTState(i18n[lang]);
  }, [lang]);
  const t = i18n[lang];
  const [restartFlag, setRestartFlag] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("lingoHangmanDarkMode");
      if (stored) return stored === "true";
      // Use system preference as default
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });
  React.useEffect(() => {
    // Always sync dark mode with system preference if no explicit user setting
    const stored = localStorage.getItem("lingoHangmanDarkMode");
    if (!stored) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const systemDark = mq.matches;
      if (systemDark !== darkMode) setDarkMode(systemDark);
      const handler = (e) => setDarkMode(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, []);
  React.useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("lingoHangmanDarkMode", darkMode);
  }, [darkMode]);

  return (
    <BrowserRouter>
      <div className="min-h-screen w-full bg-neutral-100 dark:bg-neutral-900 transition-colors">
        <div className="safe-top max-w-xl mx-auto p-4 bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100 min-h-screen transition-colors">
          <Routes>
            <Route
              path="/"
              element={
                <div>
                  <URLGenerator lang={lang} t={tState} setLang={setLang} darkMode={darkMode} setDarkMode={setDarkMode} />
                </div>
              }
            />
            <Route
              path="/play"
              element={
                <div>
                  <HangmanGame lang={lang} t={tState} restartFlag={restartFlag} setLang={setLang} darkMode={darkMode} setDarkMode={setDarkMode} />
                </div>
              }
            />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}