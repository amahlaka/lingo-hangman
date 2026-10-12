import React from "react";
import { Link } from "react-router-dom";

// One game's entry on the home screen. `game` is a registry entry (src/games/registry.js).
export default function GameCard({ game, lang }) {
  const fiName = game.nameFi;
  const body = (
    <>
      <div className="lg-card__art" aria-hidden="true">{game.art}</div>
      <p className="lg-card__name">{lang === "fi" ? fiName : game.name}</p>
      <p className="lg-card__fi" lang={lang === "fi" ? "en" : "fi"}>{lang === "fi" ? game.name : fiName}</p>
      <p className="lg-card__desc">{game.soon ? (lang === "fi" ? "Tulossa myöhemmin." : "Coming later.") : game.description}</p>
      {!game.soon && (
        <div className="lg-card__meta">
          <span>{game.minutes} min</span>
          <span aria-hidden="true">·</span>
          <span>{game.skill}</span>
        </div>
      )}
    </>
  );
  if (game.soon) return <div className="lg-card lg-card--soon">{body}</div>;
  return (
    <Link className="lg-card" to={game.path}>
      {body}
    </Link>
  );
}
