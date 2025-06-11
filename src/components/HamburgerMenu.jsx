import React, { useState, useEffect, useRef } from "react";
import i18n from "../i18n";

const LANG_KEY = "lingoHangmanLang";

export default function HamburgerMenu({ lang, setLang, onRestart }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

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
        className="p-2 rounded border bg-gray-100 dark:bg-gray-800"
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
              <label className="mr-2 font-medium">{i18n[lang].selectLanguage}:</label>
              <select
                value={lang}
                onChange={(e) => {
                  const newLang = e.target.value;
                  setLang(newLang);
                  localStorage.setItem(LANG_KEY, newLang);
                }}
                className="border rounded px-2 py-1 w-full mt-1 bg-white dark:bg-gray-800"
              >
                <option value="en">English</option>
                <option value="fi">Suomi</option>
              </select>
            </div>
            <button
              className="w-full px-3 py-1 rounded border bg-gray-100 dark:bg-gray-800"
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
                window.location.href = window.location.origin;
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
