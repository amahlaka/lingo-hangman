import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { useProgress } from "./ProgressContext";
import { Feedback } from "../components/lingo";
import { fill } from "../i18n";
import { api } from "../lib/backend";
import {
  DEFAULT_REMINDER_TIME,
  enableReminders,
  localTimeZone,
  needsHomeScreen,
  permission,
  pushSupported,
  saveReminders,
  subscribeDevice,
  unsubscribeDevice,
} from "../lib/push";
import { claimHomeOffer } from "../lib/homeOffers";

// Reminders by web push (docs/backend.md, "Reminders"): the section under
// Account, and the one-time offer on Home after a few days of playing.

const KINDS = ["goal", "streak"];
// Days played before Home offers reminders, so a first visit never asks.
export const OFFER_AFTER_DAYS = 3;
const OFFER_KEY = "lingo.remindersOffer.v1";

const errorText = (t, code) => t.reminders.errors[code] || t.account.errors[code] || t.account.errors.other;

function Chip({ on, onClick, disabled, children }) {
  return (
    <button type="button" className={`lg-chip ${on ? "lg-chip--on" : ""}`} aria-pressed={on} onClick={onClick} disabled={disabled}>
      <span className="lg-chip__mark" aria-hidden="true">{on ? "✓" : ""}</span>
      {children}
    </button>
  );
}

export function RemindersSection() {
  const { t, lang } = useSettings();
  const r = t.reminders;
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [time, setTime] = useState(DEFAULT_REMINDER_TIME);

  useEffect(() => {
    let live = true;
    api("/push").then((res) => {
      if (!live || !res.ok) return;
      setView(res.data);
      setTime(res.data.time);
    });
    return () => {
      live = false;
    };
  }, []);

  // Home's offer links here.
  useEffect(() => {
    if (view?.available && window.location.hash === "#reminders") document.getElementById("reminders")?.scrollIntoView?.();
  }, [view]);

  if (!view?.available) return null;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await fn();
    setBusy(false);
    if (res?.ok === false) setError(errorText(t, res.error || res.data?.error || "offline"));
    else if (res?.view || res?.data) setView(res.view || res.data);
    return res;
  };

  const turnOn = () => run(() => enableReminders({ publicKey: view.publicKey, time, lang }));
  const turnOff = () => run(() => saveReminders({ enabled: false }));
  const save = (changes) => run(() => saveReminders({ ...changes, timeZone: localTimeZone(), lang }));
  const thisDeviceOn = () => run(() => subscribeDevice(view.publicKey));
  const thisDeviceOff = () => run(unsubscribeDevice);
  const test = async () => {
    const res = await run(() => api("/push/test", { method: "POST" }));
    if (res?.ok) setNote(r.testSent);
    // A device the push service no longer knows was just removed.
    else if (res?.status === 502) api("/push").then((v) => v.ok && setView(v.data));
  };
  const toggleKind = (kind) => {
    const kinds = view.kinds.includes(kind) ? view.kinds.filter((k) => k !== kind) : [...view.kinds, kind];
    save({ kinds });
  };

  const blocked = permission() === "denied";
  const homeScreen = needsHomeScreen();
  const canPush = pushSupported() && !homeScreen;

  return (
    <section className="lg-section" id="reminders">
      <h2 className="lg-heading">{r.title}</h2>
      <p className="lg-caption">{r.intro}</p>
      {homeScreen && <Feedback variant="info" icon="i" title={r.iosHome} />}
      {!homeScreen && !pushSupported() && <p className="lg-caption">{r.unsupported}</p>}
      {canPush && blocked && <Feedback variant="info" icon="i" title={r.denied} />}

      {canPush && (
        <div className="lg-stack">
          <Chip on={view.enabled} onClick={view.enabled ? turnOff : turnOn} disabled={busy || (blocked && !view.enabled)}>
            {r.on}
          </Chip>

          <label className="lg-field rm-time">
            {r.timeLabel}
            <input
              className="lg-input"
              type="time"
              step={900}
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                if (/^\d\d:\d\d$/.test(e.target.value) && e.target.value !== view.time) save({ time: e.target.value });
              }}
            />
          </label>

          {view.enabled && (
            <>
              <p className="lg-caption">{r.kindsLabel}</p>
              <div className="lg-chips">
                {KINDS.map((kind) => (
                  <Chip key={kind} on={view.kinds.includes(kind)} onClick={() => toggleKind(kind)} disabled={busy}>
                    {r.kinds[kind]}
                  </Chip>
                ))}
              </div>
              <p className="lg-caption">{view.thisDevice ? r.thisDeviceOn : r.thisDeviceOff}</p>
              <div className="lg-row">
                {view.thisDevice ? (
                  <>
                    <button type="button" className="lg-btn lg-btn--secondary" onClick={test} disabled={busy}>{r.test}</button>
                    <button type="button" className="lg-btn lg-btn--quiet" onClick={thisDeviceOff} disabled={busy}>{r.stopHere}</button>
                  </>
                ) : (
                  <button type="button" className="lg-btn lg-btn--secondary" onClick={thisDeviceOn} disabled={busy || blocked}>
                    <Bell size={18} aria-hidden="true" /> {r.startHere}
                  </button>
                )}
              </div>
              {view.devices > 1 && <p className="lg-caption">{fill(r.devices, { n: view.devices })}</p>}
            </>
          )}
          {note && <Feedback variant="correct" icon="✓" title={note} />}
          {error && <Feedback variant="retry" icon="!" title={error} />}
        </div>
      )}
    </section>
  );
}

function offerDismissed() {
  try {
    return Boolean(localStorage.getItem(OFFER_KEY));
  } catch {
    return true;
  }
}

function dismissOffer() {
  try {
    localStorage.setItem(OFFER_KEY, new Date().toISOString());
  } catch {
    // Storage blocked: the offer just comes back next visit.
  }
}

// Home: offered once, to a signed-in learner who has played on a few days
// and whose device can show reminders.
export function RemindersOffer() {
  const { t, lang } = useSettings();
  const { state, sync } = useProgress();
  const r = t.reminders;
  const [view, setView] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const daysPlayed = Object.values(state.days || {}).filter((d) => d.words > 0).length;
  const eligible =
    Boolean(sync.user) && daysPlayed >= OFFER_AFTER_DAYS && pushSupported() && !needsHomeScreen() && permission() !== "denied" && !offerDismissed();

  useEffect(() => {
    if (!eligible) return undefined;
    let live = true;
    // Shown only when no other Home offer has the day (src/lib/homeOffers.js).
    api("/push").then(
      (res) => live && res.ok && (!res.data.available || res.data.enabled || claimHomeOffer("reminders")) && setView(res.data)
    );
    return () => {
      live = false;
    };
  }, [eligible]);

  if (done) return <Feedback variant="correct" icon="✓" title={done} />;
  if (!eligible || !view?.available || view.enabled) return null;

  const yes = async () => {
    setBusy(true);
    setError(null);
    const res = await enableReminders({ publicKey: view.publicKey, lang });
    setBusy(false);
    if (res.ok) {
      dismissOffer();
      setDone(fill(r.offerDone, { time: res.view.time }));
    } else if (res.error === "denied" || res.error === "dismissed") {
      dismissOffer();
      setView(null);
    } else setError(errorText(t, res.error));
  };
  const no = () => {
    dismissOffer();
    setView(null);
  };

  return (
    <section className="lg-section rm-offer">
      <h2 className="lg-heading"><Bell size={20} aria-hidden="true" /> {r.offerTitle}</h2>
      <p>{fill(r.offerText, { time: DEFAULT_REMINDER_TIME })}</p>
      {error && <Feedback variant="retry" icon="!" title={error} />}
      <div className="lg-row">
        <button type="button" className="lg-btn lg-btn--primary" onClick={yes} disabled={busy}>{r.offerYes}</button>
        <button type="button" className="lg-btn lg-btn--quiet" onClick={no} disabled={busy}>{r.offerNo}</button>
      </div>
      <p className="lg-caption"><Link to="/account#reminders">{r.offerSettings}</Link></p>
    </section>
  );
}
