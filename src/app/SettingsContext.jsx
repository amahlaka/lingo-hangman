import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import i18n from "../i18n";
import { setSoundEnabled } from "../lib/sounds";
import { setSpeechVoice } from "../lib/speech";
import { DEFAULT_VOICE, voiceById } from "../lib/speechClips";
import { localChanged, onRemoteChange, readLocal } from "../lib/localSettings";

// App-wide settings: interface language (en/fi), theme (light/dark/system),
// sound effects (on/off) and the voice that reads words aloud (female/male).
// Games read them with useSettings(). Signed in, they follow the learner to
// their other devices (src/lib/localSettings.js).

const LANG_KEY = "lingoHangmanLang";
const THEME_KEY = "theme";
const SOUND_KEY = "lingoSound";
const VOICE_KEY = "lingoVoice";

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

  const [voice, setVoiceState] = useState(() => voiceById(readStorage(VOICE_KEY)).id);

  // The account's settings arrived from another device.
  useEffect(
    () =>
      onRemoteChange((keys) => {
        if (keys.includes("lang")) setLangState(detectLang());
        if (keys.includes("theme")) setThemeState(readLocal("theme"));
        if (keys.includes("sound")) setSoundState(readLocal("sound"));
        if (keys.includes("voice")) setVoiceState(voiceById(readLocal("voice")).id);
      }),
    []
  );

  useEffect(() => {
    setSoundEnabled(sound);
  }, [sound]);

  useEffect(() => {
    setSpeechVoice(voice);
  }, [voice]);

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
        localChanged("lang");
      },
      theme,
      dark,
      setTheme: (next) => {
        setThemeState(next);
        writeStorage(THEME_KEY, next === "system" ? null : next);
        localChanged("theme");
      },
      sound,
      setSound: (on) => {
        setSoundState(on);
        writeStorage(SOUND_KEY, on ? null : "off");
        localChanged("sound");
      },
      voice,
      setVoice: (next) => {
        const id = voiceById(next).id;
        setVoiceState(id);
        setSpeechVoice(id);
        writeStorage(VOICE_KEY, id === DEFAULT_VOICE ? null : id);
        localChanged("voice");
      },
    }),
    [lang, theme, dark, sound, voice]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
