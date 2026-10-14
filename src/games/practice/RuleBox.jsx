import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";

// Where PracticeSession puts the explanation once a question is answered, so
// it is seen without scrolling (see useRulePlacement in ./PracticeSession.jsx):
//   inline   in place, under the answers; it already fits on screen
//   tray     a faded preview in the bottom bar that opens upwards
//   step     its own view after "Next", on short screens
// Outside a PracticeSession the box always stays in place.
// The context also carries the round's points while a question is open:
// `peek` for RulePeek and `points: { xp, pay(cost) }` for other paid hints.
export const RuleContext = createContext(null);

// Scrolling down while the bar holds a cut-off rule opens it: the learner is
// looking for the rest of it.
const SWIPE = 24;
function useScrollToOpen(active, onOpen) {
  useEffect(() => {
    if (!active) return undefined;
    let touchY = null;
    const onWheel = (e) => {
      if (e.deltaY > 0) onOpen();
    };
    const onTouchStart = (e) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e) => {
      const y = e.touches[0]?.clientY;
      if (touchY !== null && y !== undefined && touchY - y > SWIPE) onOpen();
    };
    const onKey = (e) => {
      if (["ArrowDown", "PageDown", "End"].includes(e.key)) onOpen();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, onOpen]);
}

// The faded preview in the bottom bar. Opening it lets the bar grow upwards.
// `lead` (how to read the word, say) sits above it, always in full.
function TrayRule({ lead, children }) {
  const { t } = useSettings();
  const p = t.practice;
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  // Once the learner closes it themselves, scrolling leaves it closed.
  const [closed, setClosed] = useState(false);
  const bodyRef = useRef(null);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (body) setClipped(body.scrollHeight > body.clientHeight + 1);
  }, []);

  const openIt = useCallback(() => setOpen(true), []);
  useScrollToOpen(clipped && !open && !closed, openIt);

  return (
    <>
      {lead && <div className="pg-tray-lead">{lead}</div>}
      {children && (
        <div className={`pg-tray-rule${open ? " pg-tray-rule--open" : ""}${clipped && !open ? " pg-tray-rule--clipped" : ""}`}>
          <div ref={bodyRef} className="pg-tray-rule__body">{children}</div>
          {(clipped || open) && (
            <button
              type="button"
              className="lg-btn lg-btn--quiet pg-tray-rule__toggle"
              aria-expanded={open}
              onClick={() => {
                if (open) setClosed(true);
                setOpen(!open);
              }}
            >
              {open ? p.ruleLess : p.ruleMore}
            </button>
          )}
        </div>
      )}
    </>
  );
}

// The explanation box ("Why" / "The rule") a question shows after answering,
// or before it when the learner paid to peek. `lead` is what else the answer
// reveals (how to read the word): it goes wherever the rule goes, so the bottom
// bar never covers it, and stays next to "Next" when the rule gets its own view.
// With a lead, the rule itself (children) is optional.
export function RuleBox({ label, className = "", lead = null, children }) {
  const ctx = useContext(RuleContext);
  const box = children ? (
    <section className={`gp-why lg-reveal${className ? ` ${className}` : ""}`} aria-label={label}>
      <h3 className="lg-caption gp-why__title">{label}</h3>
      {children}
    </section>
  ) : null;
  if (!ctx || ctx.mode === "inline") {
    return (
      <div ref={ctx?.inlineRef} className="pg-reveal">
        {lead}
        {box}
      </div>
    );
  }
  if (ctx.mode === "tray") return ctx.traySlot ? createPortal(<TrayRule lead={lead}>{box}</TrayRule>, ctx.traySlot) : null;
  return (
    <>
      {lead && ctx.traySlot && createPortal(<div className="pg-tray-lead">{lead}</div>, ctx.traySlot)}
      {box && ctx.stepSlot && createPortal(box, ctx.stepSlot)}
    </>
  );
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

// Hints bought with this round's points before answering, as one row of quiet
// buttons: [{ id, label, cost, onBuy }]. Only shown inside a PracticeSession.
export function PaidHints({ hints }) {
  const ctx = useContext(RuleContext);
  const { t } = useSettings();
  const p = t.practice;
  if (!ctx?.points || !hints.length) return null;
  const { xp, pay } = ctx.points;
  const cheapest = Math.min(...hints.map((h) => h.cost));
  return (
    <div className="pg-peek">
      <div className="pg-peek__row">
        {hints.map((h) => (
          <button
            key={h.id}
            type="button"
            className="lg-btn lg-btn--quiet"
            disabled={xp < h.cost}
            onClick={() => {
              if (pay(h.cost)) h.onBuy();
            }}
          >
            {h.label}
          </button>
        ))}
      </div>
      {xp < cheapest && <p className="lg-caption">{fill(p.hintsLater, { n: cheapest })}</p>}
    </div>
  );
}
