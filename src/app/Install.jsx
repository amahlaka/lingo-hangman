import React, { useEffect, useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { useProgress } from "./ProgressContext";
import { Feedback, GameScreen } from "../components/lingo";
import { isInstalled, promptInstall } from "../lib/install";
import { useInstallWay } from "../lib/useInstallWay";
import { claimHomeOffer } from "../lib/homeOffers";

// Installing Lingo as an app (src/lib/install.js): a one-time hint on Home,
// and the /install page the settings menu links to for as long as the app
// isn't installed.

export const INSTALL_OFFER_AFTER_DAYS = 2;
const OFFER_KEY = "lingo.installOffer.v1";

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

// Safari on iPhone and iPad: Share, then Add to Home Screen.
function IosSteps({ i }) {
  return (
    <ol className="in-steps">
      <li>
        {i.iosShare} <Share size={18} aria-label={i.shareIcon} className="in-icon" />
      </li>
      <li>
        {i.iosAdd} <SquarePlus size={18} aria-hidden="true" className="in-icon" />
      </li>
    </ol>
  );
}

// Home: mentions installing once, from the second day of playing, where the
// browser can do it with a tap (its own dialog) or Safari's Share menu.
export function InstallOffer() {
  const { t } = useSettings();
  const { state } = useProgress();
  const i = t.install;
  const way = useInstallWay();
  const [view, setView] = useState(null);
  const daysPlayed = Object.values(state.days || {}).filter((d) => d.words > 0).length;
  const eligible = daysPlayed >= INSTALL_OFFER_AFTER_DAYS && (way === "prompt" || way === "ios") && !offerShown();

  useEffect(() => {
    if (!eligible || view) return;
    const show = claimHomeOffer("install");
    if (show) markShown();
    setView(show ? "show" : "hide");
  }, [eligible, view]);

  if (view !== "show") return null;
  // Installed from the dialog, or the dialog went away: nothing left to say.
  if (way !== "prompt" && way !== "ios") return null;

  const install = async () => {
    await promptInstall();
    setView("hide");
  };

  return (
    <section className="lg-section rm-offer in-offer">
      <h2 className="lg-heading"><Download size={20} aria-hidden="true" /> {i.offerTitle}</h2>
      <p>{i.offerText}</p>
      {way === "ios" && <IosSteps i={i} />}
      <div className="lg-row">
        {way === "prompt" && (
          <button type="button" className="lg-btn lg-btn--primary" onClick={install}>{i.installButton}</button>
        )}
        <button type="button" className="lg-btn lg-btn--quiet" onClick={() => setView("hide")}>
          {way === "ios" ? i.ok : i.notNow}
        </button>
      </div>
      <p className="lg-caption">{i.offerLater}</p>
    </section>
  );
}

// /install: how to install on this browser, or that it's installed already.
export default function Install() {
  const { t } = useSettings();
  const i = t.install;
  const way = useInstallWay();
  const [done, setDone] = useState(false);
  const installed = done || isInstalled();

  const install = async () => {
    if (await promptInstall()) setDone(true);
  };

  return (
    <GameScreen title={i.title}>
      <main className="lg-board lg-page">
        <p className="lg-body-lg">{i.intro}</p>
        {installed ? (
          <Feedback variant="correct" icon="✓" title={i.installed} />
        ) : (
          <section className="lg-section">
            {way === "prompt" && (
              <div className="lg-row">
                <button type="button" className="lg-btn lg-btn--primary" onClick={install}>
                  <Download size={18} aria-hidden="true" /> {i.installButton}
                </button>
              </div>
            )}
            {way === "ios" && <IosSteps i={i} />}
            {way === "android" && <p>{i.android}</p>}
            {way === "desktop" && <p>{i.desktop}</p>}
            {way === "mac-safari" && <p>{i.macSafari}</p>}
            {!way && <p>{i.unsupported}</p>}
          </section>
        )}
        <p className="lg-caption">{i.sameProgress}</p>
      </main>
    </GameScreen>
  );
}
