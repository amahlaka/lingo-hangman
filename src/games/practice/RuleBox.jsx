import React, { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";

// Where PracticeSession puts the explanation once a question is answered, so
// it is seen without scrolling (see useRulePlacement in ./PracticeSession.jsx):
//   inline   in place, under the answers; it already fits on screen
//   tray     a faded preview in the bottom bar that opens upwards
//   step     its own view after "Next", on short screens
// Outside a PracticeSession the box always stays in place.
export const RuleContext = createContext(null);

// The faded preview in the bottom bar. Opening it lets the bar grow upwards.
function TrayRule({ children }) {
  const { t } = useSettings();
  const p = t.practice;
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const bodyRef = useRef(null);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (body) setClipped(body.scrollHeight > body.clientHeight + 1);
  }, []);

  return (
    <div className={`pg-tray-rule${open ? " pg-tray-rule--open" : ""}${clipped && !open ? " pg-tray-rule--clipped" : ""}`}>
      <div ref={bodyRef} className="pg-tray-rule__body">{children}</div>
      {(clipped || open) && (
        <button type="button" className="lg-btn lg-btn--quiet pg-tray-rule__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? p.ruleLess : p.ruleMore}
        </button>
      )}
    </div>
  );
}

// The explanation box ("Why" / "The rule") a question shows after answering,
// or before it when the learner paid to peek.
export function RuleBox({ label, className = "", children }) {
  const ctx = useContext(RuleContext);
  const box = (
    <section className={`gp-why lg-reveal${className ? ` ${className}` : ""}`} aria-label={label}>
      <h3 className="lg-caption gp-why__title">{label}</h3>
      {children}
    </section>
  );
  if (!ctx || ctx.mode === "inline") return <div ref={ctx?.inlineRef}>{box}</div>;
  if (ctx.mode === "tray") return ctx.traySlot ? createPortal(<TrayRule>{box}</TrayRule>, ctx.traySlot) : null;
  return ctx.stepSlot ? createPortal(box, ctx.stepSlot) : null;
}

// "Show the rule" before answering, for a few of this round's points. Only
// shown inside a PracticeSession; `onPeek` is called once the points are paid.
export function RulePeek({ onPeek }) {
  const ctx = useContext(RuleContext);
  const { t } = useSettings();
  const p = t.practice;
  if (!ctx?.peek) return null;
  const { cost, canAfford, pay } = ctx.peek;
  return (
    <div className="pg-peek">
      <button
        type="button"
        className="lg-btn lg-btn--quiet"
        disabled={!canAfford}
        onClick={() => {
          if (pay()) onPeek();
        }}
      >
        {fill(p.rulePeek, { n: cost })}
      </button>
      {!canAfford && <p className="lg-caption">{fill(p.rulePeekLater, { n: cost })}</p>}
    </div>
  );
}
