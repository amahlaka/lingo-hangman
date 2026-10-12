import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import i18n from "../i18n";
import { setSoundEnabled } from "../lib/sounds";

// App-wide settings: interface language (en/fi), theme (light/dark/system) and
// sound effects (on/off).
// Games read them with useSettings().

const LANG_KEY = "lingoHangmanLang";
const THEME_KEY = "theme";
const SOUND_KEY = "lingoSound";

const SettingsContext = createContext(null);

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore: settings then last for this visit only
  }
}

function detectLang() {
  const stored = readStorage(LANG_KEY);
  if (stored && i18n[stored]) return stored;
  const browserLang = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2);
  return i18n[browserLang] ? browserLang : "en";
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function SettingsProvider({ children, initialLang }) {
  const [lang, setLangState] = useState(() => initialLang || detectLang());
  const [theme, setThemeState] = useState(() => {
    const stored = readStorage(THEME_KEY);
    return stored === "dark" || stored === "light" ? stored : "system";
  });
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const [sound, setSoundState] = useState(() => readStorage(SOUND_KEY) !== "off");

  useEffect(() => {
    setSoundEnabled(sound);
  }, [sound]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const dark = theme === "dark" || (theme === "system" && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.lang = lang;
  }, [dark, lang]);

  const value = useMemo(
    () => ({
      lang,
      t: { ...i18n.en, ...i18n[lang] },
      setLang: (next) => {
        setLangState(next);
        writeStorage(LANG_KEY, next);
      },
      theme,
      dark,
      setTheme: (next) => {
        setThemeState(next);
        writeStorage(THEME_KEY, next === "system" ? null : next);
      },
      sound,
      setSound: (on) => {
        setSoundState(on);
        writeStorage(SOUND_KEY, on ? null : "off");
      },
    }),
    [lang, theme, dark, sound]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
