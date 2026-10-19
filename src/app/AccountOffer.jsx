import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { useProgress } from "./ProgressContext";
import { api, backendAvailable } from "../lib/backend";
import { claimHomeOffer } from "../lib/homeOffers";

// Home: suggests an account once, to a learner without one who has played on
// a few days. Accounts stay optional (docs/backend.md): no answer is needed,
// and the offer never comes back once it has been shown.

export const ACCOUNT_OFFER_AFTER_DAYS = 3;
const OFFER_KEY = "lingo.accountOffer.v1";

function offerShown() {
  try {
    return Boolean(localStorage.getItem(OFFER_KEY));
  } catch {
    return true;
  }
}

function markShown() {
  try {
    localStorage.setItem(OFFER_KEY, new Date().toISOString());
  } catch {
    // Storage blocked: offerShown() already reads that as shown.
  }
}

export default function AccountOffer() {
  const { t } = useSettings();
  const { state, sync } = useProgress();
  const a = t.accountOffer;
  // null until checked, then "show" or "hide".
  const [view, setView] = useState(null);
  const daysPlayed = Object.values(state.days || {}).filter((d) => d.words > 0).length;
  const eligible = !sync.user && daysPlayed >= ACCOUNT_OFFER_AFTER_DAYS && !offerShown();

  useEffect(() => {
    if (!eligible || view) return undefined;
    let live = true;
    (async () => {
      // Only when accounts can be reached and this browser isn't signed in,
      // and no other Home offer has the day (src/lib/homeOffers.js).
      const show = (await backendAvailable()) && (await api("/me")).status === 401 && claimHomeOffer("account");
      if (!live) return;
      if (show) markShown();
      setView(show ? "show" : "hide");
    })();
    return () => {
      live = false;
    };
  }, [eligible, view]);

  if (view !== "show") return null;

  return (
    <section className="lg-section rm-offer">
      <h2 className="lg-heading"><UserPlus size={20} aria-hidden="true" /> {a.title}</h2>
      <p>{a.text}</p>
      <div className="lg-row">
        <Link className="lg-btn lg-btn--primary" to="/account">{a.yes}</Link>
        <button type="button" className="lg-btn lg-btn--quiet" onClick={() => setView("hide")}>{a.no}</button>
      </div>
    </section>
  );
}
