import React from "react";
import { useSettings } from "./SettingsContext";
import { GameScreen } from "../components/lingo";

// /privacy: what Lingo keeps, on the device and (only with an account) on its
// server. Keep in step with docs/backend.md when the backend stores more.
export default function Privacy() {
  const { t } = useSettings();
  const p = t.privacy;
  return (
    <GameScreen title={p.title}>
      <main className="lg-board lg-page">
        <p className="lg-body-lg">{p.intro}</p>
        <section className="lg-section">
          <h2 className="lg-heading">{p.deviceTitle}</h2>
          <p>{p.deviceText}</p>
        </section>
        <section className="lg-section">
          <h2 className="lg-heading">{p.countsTitle}</h2>
          <p>{p.countsText}</p>
        </section>
        <section className="lg-section">
          <h2 className="lg-heading">{p.accountTitle}</h2>
          <ul className="pv-list">
            {p.accountItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section className="lg-section">
          <h2 className="lg-heading">{p.whereTitle}</h2>
          <p>{p.whereText}</p>
        </section>
        <section className="lg-section">
          <h2 className="lg-heading">{p.rightsTitle}</h2>
          <p>{p.rightsText}</p>
        </section>
        <p className="lg-caption">{p.contact}</p>
      </main>
    </GameScreen>
  );
}
