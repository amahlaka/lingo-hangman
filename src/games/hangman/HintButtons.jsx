import React from "react";
import { Dices, Eraser, Wand2 } from "lucide-react";
import { fill } from "../../i18n";

export const HINT_COSTS = { fifty: 5, remove: 8, clear: 25 };

// Hints bought with this session's points. Each is an icon with its cost and
// a full description as its accessible name.
export default function HintButtons({ points, available, onHint, t }) {
  const hints = [
    { id: "fifty", Icon: Dices, name: t.hintFifty, desc: t.hintFiftyDesc },
    { id: "remove", Icon: Eraser, name: t.hintRemove, desc: t.hintRemoveDesc },
    { id: "clear", Icon: Wand2, name: t.hintClear, desc: t.hintClearDesc },
  ];
  return (
    <div className="hm-hints" role="group" aria-label={t.hints}>
      {hints.map(({ id, Icon, name, desc }) => {
        const cost = HINT_COSTS[id];
        const enabled = available[id] && points >= cost;
        const description = fill(desc, { cost });
        return (
          <button
            key={id}
            type="button"
            className="lg-btn lg-btn--secondary hm-hint"
            disabled={!enabled}
            onClick={() => onHint(id)}
            aria-label={`${name}. ${description}`}
            title={points < cost ? `${description}. ${t.hintNeedPoints}` : description}
          >
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
            <span aria-hidden="true">{cost}</span>
          </button>
        );
      })}
    </div>
  );
}
