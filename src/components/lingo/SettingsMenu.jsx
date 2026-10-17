import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChartNoAxesColumn,
  CircleUser,
  Flag,
  Gem,
  Headphones,
  Lightbulb,
  Monitor,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { useProgress } from "../../app/ProgressContext";
import { DAILY_GOAL_OPTIONS } from "../../lib/progress";
import { backendAvailable } from "../../lib/backend";
import { useFeedback } from "../../app/FeedbackContext";

// Settings popover, top to bottom: game-specific `actions` ([{ label, onClick }])
// such as "Restart" and (with the optional backend) reporting a problem with
// the question on screen; one compact row each for language, theme, sound
// effects, voice and daily goal; then a grid of places to go: Practice
// settings, profile, shop and, with the backend, account, hear a sentence and
// suggest content.
export default function SettingsMenu({ actions = [] }) {
  const { lang, setLang, theme, setTheme, sound, setSound, voice, setVoice, t } = useSettings();
  const { dailyGoal, setDailyGoal } = useProgress();
  const { subject, openReport } = useFeedback();
  const [open, setOpen] = useState(false);
  const [hasBackend, setHasBackend] = useState(false);
  const ref = useRef(null);

  // Asked only once the menu opens, so screens never wait on the network.
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    backendAvailable().then((ok) => live && setHasBackend(ok));
    return () => {
      live = false;
    };
  }, [open]);

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

  // One compact row: the label on the left, a small segmented choice on the
  // right. Options are { value, label } with an optional icon, which then
  // stands in for the text (kept as the accessible name).
  const row = (label, current, onPick, options, groupLabel = label) => (
    <div className="lg-menu__row">
      <span className="lg-menu__rowlabel">{label}</span>
      <div className="lg-seg" role="group" aria-label={groupLabel}>
        {options.map(({ value, label: text, Icon }) => (
          <button
            key={String(value)}
            type="button"
            className={`lg-seg__opt ${current === value ? "lg-seg__opt--on" : ""}`}
            aria-pressed={current === value}
            aria-label={Icon ? text : undefined}
            title={Icon ? text : undefined}
            onClick={() => onPick(value)}
          >
            {Icon ? <Icon size={18} strokeWidth={2} aria-hidden="true" /> : text}
          </button>
        ))}
      </div>
    </div>
  );

  const close = () => setOpen(false);
  const places = [
    { to: "/preferences", label: t.preferencesTitle, Icon: SlidersHorizontal },
    { to: "/profile", label: t.profile.title, Icon: ChartNoAxesColumn },
    { to: "/shop", label: t.shop.title, Icon: Gem },
    ...(hasBackend
      ? [
          { to: "/account", label: t.account.title, Icon: CircleUser },
          { to: "/hear", label: t.hear.title, Icon: Headphones },
          { to: "/suggest", label: t.feedback.suggestLink, Icon: Lightbulb },
        ]
      : []),
  ];
  const showReport = hasBackend && subject;

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
          {(actions.length > 0 || showReport) && (
            <div className="lg-menu__actions">
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="lg-btn lg-btn--secondary"
                  onClick={() => {
                    close();
                    a.onClick();
                  }}
                >
                  {a.label}
                </button>
              ))}
              {showReport && (
                <button
                  type="button"
                  className="lg-btn lg-btn--quiet"
                  onClick={() => {
                    close();
                    openReport();
                  }}
                >
                  <Flag size={16} aria-hidden="true" /> {t.feedback.reportButton}
                </button>
              )}
            </div>
          )}
          <div className="lg-menu__rows">
            {row(t.menuLanguage, lang, setLang, [
              { value: "en", label: "English" },
              { value: "fi", label: "Suomi" },
            ])}
            {row(t.themeLabel, theme, setTheme, [
              { value: "light", label: t.lightMode, Icon: Sun },
              { value: "dark", label: t.darkMode, Icon: Moon },
              { value: "system", label: t.systemMode, Icon: Monitor },
            ])}
            {row(t.soundLabel, sound, setSound, [
              { value: true, label: t.soundOn, Icon: Volume2 },
              { value: false, label: t.soundOff, Icon: VolumeX },
            ])}
            {row(t.voiceLabel, voice, setVoice, [
              { value: "female", label: t.voiceFemale },
              { value: "male", label: t.voiceMale },
            ])}
            {row(
              t.menuGoal,
              dailyGoal,
              setDailyGoal,
              DAILY_GOAL_OPTIONS.map((g) => ({ value: g, label: String(g) })),
              t.dailyGoalLabel
            )}
          </div>
          <nav className="lg-menu__places" aria-label={t.settings}>
            {places.map(({ to, label, Icon }) => (
              <Link key={to} to={to} className="lg-menu__place" onClick={close}>
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <p className="lg-menu__foot">
            <a href="https://github.com/amahlaka/lingo-hangman" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <span> · Developed by Amahlaka · </span>
            <Link to="/privacy" onClick={close}>{t.privacy.title}</Link>
          </p>
        </div>
      )}
    </div>
  );
}
