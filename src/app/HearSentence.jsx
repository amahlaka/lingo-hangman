import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Volume2 } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { Feedback, GameScreen } from "../components/lingo";
import { fill } from "../i18n";
import { api, backendAvailable } from "../lib/backend";
import { RATE_SLOW, speakOnDemand, stopSpeaking } from "../lib/speech";
import { askForMoreSpeech, refreshOnDemandSpeech } from "../lib/tts";

export const MAX_HEAR_TEXT = 200;
const ENGLISH_RE = /^[\p{Script=Latin}0-9\s.,!?'"’‘“”\-–—:;()&%$€£/]*$/u;

// /hear: type any English and hear it in the app's own voice (on-demand
// speech, src/lib/tts.js). Signed-in learners get a few new sentences a day;
// sentences heard before are free. Without the backend, or past the limit,
// the browser's voice reads it.
export default function HearSentence() {
  const { t } = useSettings();
  const h = t.hear;
  // null while loading, else "unavailable" | "signedOut" | "off" | "on"
  const [state, setState] = useState(null);
  const [status, setStatus] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!(await backendAvailable())) return live && setState("unavailable");
      const res = await api("/tts/status");
      if (!live) return;
      if (res.status === 401) return setState("signedOut");
      if (!res.ok || !res.data.available) return setState("off");
      setStatus(res.data);
      setState("on");
      refreshOnDemandSpeech();
    })();
    return () => {
      live = false;
      stopSpeaking();
    };
  }, []);

  const clean = text.trim().replace(/\s+/g, " ");
  const invalid = clean && (!ENGLISH_RE.test(clean) || !/\p{L}/u.test(clean));

  const hear = async (rate) => {
    if (!clean || invalid || busy) return;
    setBusy(true);
    setNote(null);
    const r = await speakOnDemand(clean, { rate });
    setBusy(false);
    if (r.left !== null && status) setStatus((s) => ({ ...s, left: r.left }));
    if (r.error === "tts_limit") setNote(h.limitReached);
    else if (r.error && r.error !== "off") setNote(h.failed);
  };

  const ask = async () => {
    const next = await askForMoreSpeech();
    if (next) setStatus(next);
  };

  return (
    <GameScreen title={h.title}>
      <main className="lg-board lg-page">
        <p className="lg-body-lg">{h.intro}</p>
        <form
          className="lg-section lg-stack fb-form"
          onSubmit={(e) => {
            e.preventDefault();
            hear();
          }}
        >
          <label className="lg-field">
            <span>{h.label}</span>
            <textarea
              className="lg-input"
              lang="en"
              rows={3}
              maxLength={MAX_HEAR_TEXT}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="lg-caption">{fill(h.count, { n: text.length, max: MAX_HEAR_TEXT })}</p>
          {invalid && <p className="pg-hint" role="status">{h.notEnglish}</p>}
          <div className="lg-row">
            <button type="submit" className="lg-btn lg-btn--primary" disabled={!clean || invalid || busy}>
              <Volume2 size={18} aria-hidden="true" /> {busy ? h.making : h.play}
            </button>
            <button type="button" className="lg-btn lg-btn--secondary" disabled={!clean || invalid || busy} onClick={() => hear(RATE_SLOW)}>
              {h.slow}
            </button>
          </div>
          {note && <p className="pg-hint" role="status">{note}</p>}
        </form>

        {state === "on" && status && (
          <section className="lg-section lg-stack">
            <p>{status.left > 0 ? fill(status.left === 1 ? h.leftOne : h.left, { n: status.left }) : h.none}</p>
            <p className="lg-caption">{h.freeAgain}</p>
            {status.tier === "extended" ? (
              <p className="lg-caption">{h.extended}</p>
            ) : status.requested ? (
              <p className="lg-caption">{h.asked}</p>
            ) : (
              <div>
                <button type="button" className="lg-btn lg-btn--quiet" onClick={ask}>{h.ask}</button>
              </div>
            )}
          </section>
        )}
        {state === "signedOut" && (
          <Feedback variant="info" icon="i" title={h.signInTitle}>
            {h.signInBody} <Link to="/account">{h.signInLink}</Link>
          </Feedback>
        )}
        {(state === "unavailable" || state === "off") && <Feedback variant="info" icon="i" title={h.browserVoice} />}
        <p className="lg-caption">
          {h.privacy} <Link to="/privacy">{t.privacy.title}</Link>
        </p>
      </main>
    </GameScreen>
  );
}
