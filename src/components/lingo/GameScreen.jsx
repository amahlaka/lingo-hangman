import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { HeaderProgress } from "./DailyProgress";
import SettingsMenu from "./SettingsMenu";

// The frame every game screen uses. Three zones top to bottom: this header
// (back to games, title, streak and goal ring, `score`, settings), then the
// game's own board and controls as `children`.
// menuActions: extra settings-menu entries, e.g. [{ label: "Restart", onClick }].
export default function GameScreen({ title, score, menuActions, children, className = "" }) {
  const { t } = useSettings();
  return (
    <div className={`lg-screen ${className}`}>
      <header className="lg-header">
        <Link to="/" className="lg-btn lg-btn--quiet lg-icon-btn" aria-label={t.allGames}>
          <ArrowLeft size={22} strokeWidth={2} aria-hidden="true" />
        </Link>
        <h1 className="lg-header__title">{title}</h1>
        <div className="lg-header__end">
          {score}
          <HeaderProgress />
          <SettingsMenu actions={menuActions} />
        </div>
      </header>
      {children}
    </div>
  );
}
