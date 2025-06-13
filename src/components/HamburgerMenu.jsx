import React, { useState, useEffect, useRef } from "react";
import i18n from "../i18n";

const LANG_KEY = "lingoHangmanLang";

export default function HamburgerMenu({ lang, setLang, onRestart, darkMode, setDarkMode }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (localStorage.theme === "dark") return "dark";
    if (localStorage.theme === "light") return "light";
    return "system";
  });
  const menuRef = useRef(null);

  useEffect(() => {
    // Apply theme logic on mount and whenever theme changes
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.theme = "dark";
    } else if (theme === "light") {
      document.documentElement.classList.remove("dark");
      localStorage.theme = "light";
    } else {
      localStorage.removeItem("theme");
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", systemDark);
    }
    // Optionally update parent darkMode state for legacy compatibility
    setDarkMode(theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  }, [theme, setDarkMode]);

  // Listen for system theme changes if in system mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => {
      document.documentElement.classList.toggle("dark", e.matches);
      setDarkMode(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, setDarkMode]);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative">
      <button
        className="p-2 rounded"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        type="button"
      >
        <svg width="24" height="24" fill="none" stroke="currentColor">
          <line x1="5" y1="7" x2="19" y2="7" strokeWidth="2" />
          <line x1="5" y1="12" x2="19" y2="12" strokeWidth="2" />
          <line x1="5" y1="17" x2="19" y2="17" strokeWidth="2" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg z-50"
        >
          <div className="p-4 space-y-3">
            <div>
              <label className="mr-2 font-medium">{i18n[lang].selectLanguage}:</label>
              <select
                value={lang}
                onChange={(e) => {
                  const newLang = e.target.value;
                  setLang(newLang);
                  localStorage.setItem(LANG_KEY, newLang);
                }}
                className="border rounded px-2 py-1 w-full mt-1 bg-white dark:bg-neutral-800"
              >
                <option value="en">English</option>
                <option value="fi">Suomi</option>
              </select>
            </div>
            <button
              className="w-full px-3 py-1 rounded border border-red-400 text-red-600 bg-white dark:bg-neutral-900"
              onClick={() => {
                setOpen(false);
                onRestart();
              }}
              type="button"
            >
              {i18n[lang].restart || "Restart"}
            </button>
            <button
              className="w-full px-3 py-1 rounded border border-blue-400 text-blue-600 bg-white dark:bg-neutral-900"
              onClick={() => {
                setOpen(false);
                window.location.href = window.location.origin;
              }}
              type="button"
            >
              {i18n[lang].newGame || "New Game"}
            </button>
            <div className="flex flex-col gap-2">
              <button
                className={`w-full px-3 py-1 rounded border bg-neutral-100 dark:bg-neutral-800 ${theme === "light" ? "ring-2 ring-blue-400" : ""}`}
                onClick={() => setTheme("light")}
                aria-label="Light mode"
                type="button"
              >
                ☀️ {i18n[lang].lightMode || "Light"}
              </button>
              <button
                className={`w-full px-3 py-1 rounded border bg-neutral-100 dark:bg-neutral-800 ${theme === "dark" ? "ring-2 ring-blue-400" : ""}`}
                onClick={() => setTheme("dark")}
                aria-label="Dark mode"
                type="button"
              >
                🌙 {i18n[lang].darkMode || "Dark"}
              </button>
              <button
                className={`w-full px-3 py-1 rounded border bg-neutral-100 dark:bg-neutral-800 ${theme === "system" ? "ring-2 ring-blue-400" : ""}`}
                onClick={() => setTheme("system")}
                aria-label="System mode"
                type="button"
              >
                🖥️ {i18n[lang].systemMode || "System"}
              </button>
            </div>
            <div className="flex justify-end items-center gap-2 mt-2">
              <a href="https://github.com/amahlaka/lingo-hangman" target="_blank" rel="noopener noreferrer" aria-label="GitHub Repository" className="inline-block"
                 referrerPolicy="origin-when-cross-origin">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.01.08-2.11 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.91.08 2.11.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                </svg>
              </a>
              <span style={{fontSize: '0.95rem', color: '#888'}}>Developed by Amahlaka</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
