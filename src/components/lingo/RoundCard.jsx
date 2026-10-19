import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Ellipsis } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { roundChoices, roundsPath } from "../../lib/rounds";

// How long a press opens the round menu instead of the game.
export const LONG_PRESS_MS = 500;
// A finger that moves further than this is scrolling, not pressing.
const MOVE_PX = 10;

// A game card that opens the game on a tap, and a menu of round lengths on a
// long press, a right-click or its ⋯ button. `game` is a registry entry
// (src/games/registry.js); a game with `rounds: false` gets a plain link.
export default function RoundCard({ game, className, children }) {
  const { t, lang } = useSettings();
  const m = t.roundMenu;
  const choices = roundChoices(game);
  // null, or how the menu was opened: "press" or "button" (which shows the
  // long-press tip, so players learn the quicker way).
  const [open, setOpen] = useState(null);
  const wrap = useRef(null);
  const button = useRef(null);
  const press = useRef(null);
  // The click that ends a long press must not open the game.
  const pressed = useRef(false);

  const close = (focusButton) => {
    setOpen(null);
    if (focusButton) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    wrap.current?.querySelector(".lg-roundmenu__opt")?.focus();
    const onDown = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(press.current?.timer), []);

  if (!choices) {
    return (
      <Link className={className} to={game.path}>
        {children}
      </Link>
    );
  }

  const name = lang === "fi" ? game.nameFi : game.name;
  const [one, many] = m[choices.unit] || m.round;
  const label = (n) => fill(n === 1 ? one : many, { n });

  const cancelPress = () => {
    clearTimeout(press.current?.timer);
    press.current = null;
  };
  const pressHandlers = {
    onPointerDown: (e) => {
      if (e.button > 0) return;
      pressed.current = false;
      const { clientX: x, clientY: y } = e;
      press.current = {
        x,
        y,
        timer: setTimeout(() => {
          pressed.current = true;
          press.current = null;
          navigator.vibrate?.(10);
          setOpen("press");
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove: (e) => {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_PX) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onPointerLeave: cancelPress,
    onClick: (e) => {
      if (!pressed.current) return;
      e.preventDefault();
      pressed.current = false;
    },
    onContextMenu: (e) => {
      e.preventDefault();
      cancelPress();
      setOpen("press");
    },
  };

  return (
    <div className="lg-card-wrap" ref={wrap}>
      <Link className={`${className} lg-card--rounds`} to={game.path} {...pressHandlers}>
        {children}
      </Link>
      <button
        ref={button}
        type="button"
        className="lg-card__more"
        aria-label={fill(m.open, { game: name })}
        title={fill(m.open, { game: name })}
        aria-haspopup="menu"
        aria-expanded={Boolean(open)}
        onClick={() => (open ? close(false) : setOpen("button"))}
      >
        <Ellipsis size={20} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {open && (
        <div className="lg-roundmenu" role="menu" aria-label={`${name}: ${m.title}`}>
          <p className="lg-roundmenu__title" aria-hidden="true">{m.title}</p>
          <div className="lg-roundmenu__opts">
            {choices.options.map((n) => (
              <Link key={n} role="menuitem" className="lg-roundmenu__opt" to={roundsPath(game, n)}>
                {label(n)}
              </Link>
            ))}
          </div>
          {open === "button" && <p className="lg-roundmenu__hint">{m.hint}</p>}
        </div>
      )}
    </div>
  );
}
