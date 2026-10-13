import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import { DAILY_GOAL_OPTIONS } from "../../lib/progress";

// Settings popover: language, theme, sound effects, daily goal and a link to
// focus areas and difficulty, the learner profile and the shop, plus any game-specific
// `actions` ([{ label, onClick }]) such as "Restart".
export default function SettingsMenu({ actions = [] }) {
  const { lang, setLang, theme, setTheme, sound, setSound, t } = useSettings();
  const { dailyGoal, setDailyGoal } = useProgress();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choice = (current, value, onPick, label) => (
    <button
      key={value}
      type="button"
      className={`lg-chip ${current === value ? "lg-chip--on" : ""}`}
      aria-pressed={current === value}
      onClick={() => onPick(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="lg-menu" ref={ref}>
      <button
        type="button"
        className="lg-btn lg-btn--quiet lg-icon-btn"
        aria-label={t.settings}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings size={22} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="lg-menu__panel" role="dialog" aria-label={t.settings}>
          {actions.length > 0 && (
            <div className="lg-stack">
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="lg-btn lg-btn--secondary"
                  onClick={() => {
                    setOpen(false);
                    a.onClick();
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          <div>
            <p className="lg-menu__label">{t.selectLanguage}</p>
            <div className="lg-chips">
              {choice(lang, "en", setLang, "English")}
              {choice(lang, "fi", setLang, "Suomi")}
            </div>
          </div>
          <div>
            <p className="lg-menu__label">{t.themeLabel}</p>
            <div className="lg-chips">
              {choice(theme, "light", setTheme, t.lightMode)}
              {choice(theme, "dark", setTheme, t.darkMode)}
              {choice(theme, "system", setTheme, t.systemMode)}
            </div>
          </div>
          <div>
            <p className="lg-menu__label">{t.soundLabel}</p>
            <div className="lg-chips">
              {choice(sound, true, setSound, t.soundOn)}
              {choice(sound, false, setSound, t.soundOff)}
            </div>
          </div>
          <div>
            <p className="lg-menu__label">{t.dailyGoalLabel}</p>
            <div className="lg-chips">
              {DAILY_GOAL_OPTIONS.map((g) => choice(dailyGoal, g, setDailyGoal, String(g)))}
            </div>
          </div>
          <Link to="/preferences" className="lg-btn lg-btn--secondary" onClick={() => setOpen(false)}>
            {t.preferencesTitle}
          </Link>
          <Link to="/profile" className="lg-btn lg-btn--quiet" onClick={() => setOpen(false)}>
            {t.profile.title}
          </Link>
          <Link to="/shop" className="lg-btn lg-btn--quiet" onClick={() => setOpen(false)}>
            {t.shop.title}
          </Link>
          <p className="lg-menu__foot">
            <a href="https://github.com/amahlaka/lingo-hangman" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <span> · Developed by Amahlaka</span>
          </p>
        </div>
      )}
    </div>
  );
}
