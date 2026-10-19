import React from "react";
import i18n from "../../i18n";
import RoundCard from "./RoundCard";

// One game's entry on the home screen. `game` is a registry entry (src/games/registry.js).
// A long press, right-click or its ⋯ button picks the round length.
export default function GameCard({ game, lang }) {
  const skills = (i18n[lang] || i18n.en).profile.skills;
  const fi = lang === "fi";
  const body = (
    <>
      <div className="lg-card__art" aria-hidden="true">{game.art}</div>
      <p className="lg-card__name">{fi ? game.nameFi : game.name}</p>
      <p className="lg-card__fi" lang={fi ? "en" : "fi"}>{fi ? game.name : game.nameFi}</p>
      <p className="lg-card__desc">
        {game.soon ? (fi ? "Tulossa myöhemmin." : "Coming later.") : (fi && game.descriptionFi) || game.description}
      </p>
      {!game.soon && (
        <div className="lg-card__meta">
          <span>{game.minutes} min</span>
          <span aria-hidden="true">·</span>
          <span>{skills[game.skill] || game.skill}</span>
        </div>
      )}
    </>
  );
  if (game.soon) return <div className="lg-card lg-card--soon">{body}</div>;
  return (
    <RoundCard className="lg-card" game={game}>
      {body}
    </RoundCard>
  );
}
