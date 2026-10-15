import React, { useEffect, useRef } from "react";
import { useSettings } from "./SettingsContext";
import { fill } from "../i18n";

// Asked once, when a device that already has progress signs in to an account
// that has some too: keep both, use the account's, or use this device's.
export default function SyncChoice({ choice, onChoose }) {
  const { t } = useSettings();
  const s = t.sync;
  const first = useRef(null);
  useEffect(() => first.current?.focus(), []);
  const line = (p) => fill(s.summary, { level: p.level, words: p.words, learned: p.learned });
  return (
    <div className="fb-backdrop">
      <div className="fb-sheet" role="dialog" aria-modal="true" aria-labelledby="sync-title">
        <h2 id="sync-title" className="lg-heading">{s.choiceTitle}</h2>
        <p>{s.choiceIntro}</p>
        <ul className="ac-list">
          <li className="ac-item">
            <span className="ac-item__text">
              <span className="ac-item__name">{s.accountLabel}</span>
              <span className="lg-caption">{line(choice.account)}</span>
            </span>
          </li>
          <li className="ac-item">
            <span className="ac-item__text">
              <span className="ac-item__name">{s.deviceLabel}</span>
              <span className="lg-caption">{line(choice.device)}</span>
            </span>
          </li>
        </ul>
        <div className="lg-stack">
          <button type="button" ref={first} className="lg-btn lg-btn--primary" onClick={() => onChoose("combine")}>{s.combine}</button>
          <p className="lg-caption">{s.combineHint}</p>
          <button type="button" className="lg-btn lg-btn--secondary" onClick={() => onChoose("account")}>{s.useAccount}</button>
          <button type="button" className="lg-btn lg-btn--secondary" onClick={() => onChoose("device")}>{s.useDevice}</button>
          <p className="lg-caption">{s.replaceHint}</p>
        </div>
      </div>
    </div>
  );
}
