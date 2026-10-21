import React, { useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { History } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import i18n, { fill } from "../../i18n";
import { clearRound, loadRound, saveRound } from "../../lib/resume";
import GameScreen from "./GameScreen";

// A game page's unfinished round (src/lib/resume.js). The address is the one
// the page opened at, so a round is only offered where it was played.
//   saved      the round saved here, or null; { gameId, n, total, data }
//   auto       true when the page was opened to continue it (Home's card)
//   save(meta, data), clear()
// `check(data)` says whether a saved round can still be played.
export function useResume(check = () => true) {
  const location = useLocation();
  const [address] = useState(() => location.pathname + location.search);
  const [saved] = useState(() => {
    const round = loadRound(address);
    if (round && check(round.data)) return round;
    if (round) clearRound(address);
    return null;
  });
  const auto = Boolean(saved && location.state?.resume);
  const save = useCallback((meta, data) => saveRound(address, meta, data) || clearRound(address), [address]);
  const clear = useCallback(() => clearRound(address), [address]);
  return { address, saved, auto, save, clear };
}

// "Continue your game?": shown in place of a new round when one was left
// unfinished here. `detail` says where it stopped; `children` can show more
// (the round's progress dots).
export default function ResumeOffer({ title, detail, detailFi, onContinue, onFresh, children }) {
  const { t, lang } = useSettings();
  const r = t.resume;
  const helper = lang === "en";
  return (
    <GameScreen title={title}>
      <main className="lg-board pg-done rs-offer">
        <span className="rs-offer__icon lg-pop" aria-hidden="true">
          <History size={28} strokeWidth={2} />
        </span>
        <h2 className="lg-display">{r.title}</h2>
        {helper && <p className="lg-caption" lang="fi">{i18n.fi.resume.title}</p>}
        {detail && <p className="lg-body-lg">{detail}</p>}
        {helper && detailFi && <p className="lg-caption" lang="fi">{detailFi}</p>}
        {children}
      </main>
      <div className="lg-tray lg-tray--actions">
        <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={onContinue} autoFocus>
          {r.continue}
        </button>
        <button type="button" className="lg-btn lg-btn--quiet" onClick={onFresh}>
          {r.fresh}
        </button>
      </div>
    </GameScreen>
  );
}

// The usual "You were on 3 of 10, with 20 points." in English and Finnish.
export function resumeDetail(t, { n, total, points }) {
  const key = points ? "detailPoints" : "detail";
  return {
    detail: fill(t.resume[key], { n, total, points }),
    detailFi: fill(i18n.fi.resume[key], { n, total, points }),
  };
}

