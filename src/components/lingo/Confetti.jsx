import React, { useCallback, useEffect, useState } from "react";

const COLORS = ["--lake", "--lingon", "--cloudberry", "--pine"];

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function makePieces(size) {
  const large = size === "large";
  const count = large ? 120 : 40;
  return Array.from({ length: count }, (_, k) => {
    const style = { "--c": `var(${COLORS[k % 4]})` };
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
    return { id: k, dot: k % 3 === 0, style };
  });
}

// Celebration confetti. Call `celebrate("medium")` for a solved word (a burst
// of 40 pieces from the middle of the container) or `celebrate("large")` for a
// streak, goal or finished set (120 pieces over the whole screen). Render
// `confetti` inside a positioned element. Never blocks input; skipped with
// prefers-reduced-motion.
export function useConfetti() {
  const [burst, setBurst] = useState(null);

  const celebrate = useCallback((size = "medium") => {
    if (prefersReducedMotion()) return;
    setBurst({ key: Date.now() + Math.random(), size, pieces: makePieces(size) });
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
        <i key={p.id} className={p.dot ? "lg-dot" : undefined} style={p.style} />
      ))}
    </div>
  ) : null;

  return { celebrate, confetti };
}
