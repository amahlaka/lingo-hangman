import React, { useState } from "react";
import { Link } from "react-router-dom";
import { History } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { fill } from "../i18n";
import { GAMES } from "../games/registry";
import { RESUME_STATE, clearRound, latestRound } from "../lib/resume";

// Home: the latest game left unfinished (src/lib/resume.js), after a back
// swipe or a closed tab. "Continue" opens it where it stopped; "No thanks"
// forgets it.
export default function ResumeCard() {
  const { t, lang } = useSettings();
  const r = t.resume;
  const [round, setRound] = useState(() => latestRound());
  const game = round && GAMES.find((g) => g.id === round.gameId);
  if (!round || !game) return null;

  const name = round.address.startsWith("/daily/free") ? t.daily.freeName : lang === "fi" ? game.nameFi : game.name;
  const where = Number.isFinite(round.left)
    ? fill(r.rushDetail, { n: round.n, s: round.left })
    : fill(round.gameId === "daily" ? r.dailyDetail : r.detail, { n: round.n, total: round.total });

  return (
    <section className="lg-section rm-offer rs-card">
      <h2 className="lg-heading"><History size={20} aria-hidden="true" /> {r.homeTitle}</h2>
      <p><strong>{name}</strong> · {where}</p>
      <div className="lg-row">
        <Link className="lg-btn lg-btn--primary" to={round.address} state={RESUME_STATE}>{r.continue}</Link>
        <button
          type="button"
          className="lg-btn lg-btn--quiet"
          onClick={() => {
            clearRound(round.address);
            setRound(null);
          }}
        >
          {r.homeNo}
        </button>
      </div>
    </section>
  );
}
