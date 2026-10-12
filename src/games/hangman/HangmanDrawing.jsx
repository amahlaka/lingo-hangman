import React from "react";

// The classic gallows. Strokes use `ink` with round caps on surface-raised;
// each miss draws in the next body part with a short stroke animation.
const PARTS = [
  <circle key="head" cx="90" cy="55" r="15" pathLength="1" />,
  <line key="body" x1="90" y1="70" x2="90" y2="110" pathLength="1" />,
  <line key="arm-l" x1="90" y1="80" x2="70" y2="100" pathLength="1" />,
  <line key="arm-r" x1="90" y1="80" x2="110" y2="100" pathLength="1" />,
  <line key="leg-l" x1="90" y1="110" x2="75" y2="135" pathLength="1" />,
  <line key="leg-r" x1="90" y1="110" x2="105" y2="135" pathLength="1" />,
];

export default function HangmanDrawing({ misses, label }) {
  return (
    <div className="hm-drawing">
      <svg viewBox="0 0 120 160" role="img" aria-label={label}>
        <g className="hm-gallows">
          <line x1="10" y1="150" x2="110" y2="150" />
          <line x1="40" y1="150" x2="40" y2="20" />
          <line x1="40" y1="20" x2="90" y2="20" />
          <line x1="90" y1="20" x2="90" y2="40" />
        </g>
        <g className="hm-figure">{PARTS.slice(0, misses)}</g>
      </svg>
    </div>
  );
}
