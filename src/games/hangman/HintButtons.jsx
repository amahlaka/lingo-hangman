import React from "react";
import { Dices, Eraser, Gift, Lock, Wand2 } from "lucide-react";
import { fill } from "../../i18n";

export const HINT_COSTS = { fifty: 5, remove: 8, clear: 25 };

// Hints for this game: the first few are free (`free` left), then they are
// bought with this session's points. Each is an icon with its cost (a gift
// while free, a lock when out of reach) over a short line saying what it
// does, with the full description as its accessible name.
export default function HintButtons({ points, free = 0, available, onHint, t }) {
  const hints = [
    { id: "fifty", Icon: Dices, name: t.hintFifty, short: t.hintFiftyShort, desc: t.hintFiftyDesc },
    { id: "remove", Icon: Eraser, name: t.hintRemove, short: t.hintRemoveShort, desc: t.hintRemoveDesc },
    { id: "clear", Icon: Wand2, name: t.hintClear, short: t.hintClearShort, desc: t.hintClearDesc },
  ];
  return (
    <div className="hm-hints" role="group" aria-label={t.hints}>
      {hints.map(({ id, Icon, name, short, desc }) => {
        const cost = HINT_COSTS[id];
        const affordable = free > 0 || points >= cost;
        const enabled = available[id] && affordable;
        const description = `${desc} (${free > 0 ? t.hintFree : fill(t.hintPoints, { n: cost })})`;
        return (
          <button
            key={id}
            type="button"
            className={`lg-btn lg-btn--secondary hm-hint${free > 0 ? " hm-hint--free" : ""}`}
            disabled={!enabled}
            onClick={() => onHint(id)}
            aria-label={`${name}. ${description}`}
            title={affordable ? description : `${description}. ${t.hintNeedPoints}`}
          >
            <span className="hm-hint__top" aria-hidden="true">
              <Icon size={18} strokeWidth={2} />
              {free > 0 ? <Gift size={14} strokeWidth={2} /> : affordable ? <span>{cost}</span> : <Lock size={14} strokeWidth={2} />}
            </span>
            <span className="hm-hint__what" aria-hidden="true">{short}</span>
          </button>
        );
      })}
      {free > 0 && <p className="lg-caption hm-hints__free">{fill(t.hintFreeLeft, { n: free })}</p>}
    </div>
  );
}
