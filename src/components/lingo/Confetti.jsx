import React, { useCallback, useEffect, useRef, useState } from "react";
import { useOptionalProgress } from "../../app/ProgressContext";
import { CONFETTI } from "../../lib/cosmetics";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// One piece's class: the original set mixes strips with every third piece a
// dot; bought sets give every piece their own shape (see cosmetics.js).
function pieceClass(shape, k) {
  if (shape === "mix") return k % 3 === 0 ? "lg-dot" : undefined;
  return `lg-piece--${shape}`;
}

export function makePieces(size, set = CONFETTI.classic) {
  const large = size === "large";
  const count = large ? 120 : 40;
  return Array.from({ length: count }, (_, k) => {
    const style = { "--c": set.colors[k % set.colors.length] };
    if (large) {
      // A shower from the top of the screen.
      style.left = `${Math.random() * 100}%`;
      style.top = "-12px";
      style["--dx"] = `${Math.random() * 120 - 60}px`;
      style["--dy"] = `${60 + Math.random() * 60}vh`;
      style["--d"] = `${Math.random() * 0.6}s`;
    } else {
      // A burst out of the middle (the word).
      const a = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 170;
      style["--dx"] = `${Math.cos(a) * r}px`;
      style["--dy"] = `${Math.sin(a) * r * 0.6 + 60}px`;
      style["--d"] = `${Math.random() * 0.15}s`;
    }
    style["--r"] = `${Math.random() * 720 - 360}deg`;
    return { id: k, className: pieceClass(set.shape, k), style };
  });
}

// Celebration confetti. Call `celebrate("medium")` for a solved word (a burst
// of 40 pieces from the middle of the container) or `celebrate("large")` for a
// streak, goal or finished set (120 pieces over the whole screen). Render
// `confetti` inside a positioned element. Never blocks input; skipped with
// prefers-reduced-motion. The pieces follow the confetti set the learner
// uses from the shop; `celebrate(size, setId)` throws a given set instead.
export function useConfetti() {
  const [burst, setBurst] = useState(null);
  const chosen = useOptionalProgress()?.cosmetics.confetti || "classic";
  const chosenRef = useRef(chosen);
  chosenRef.current = chosen;

  const celebrate = useCallback((size = "medium", setId) => {
    if (prefersReducedMotion()) return;
    const set = CONFETTI[setId || chosenRef.current] || CONFETTI.classic;
    setBurst({ key: Date.now() + Math.random(), size, pieces: makePieces(size, set) });
  }, []);

  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => setBurst(null), burst.size === "large" ? 2200 : 1500);
    return () => clearTimeout(timer);
  }, [burst]);

  const confetti = burst ? (
    <div
      key={burst.key}
      className={`lg-confetti ${burst.size === "large" ? "lg-confetti--screen" : ""}`}
      aria-hidden="true"
    >
      {burst.pieces.map((p) => (
        <i key={p.id} className={p.className} style={p.style} />
      ))}
    </div>
  ) : null;

  return { celebrate, confetti };
}
