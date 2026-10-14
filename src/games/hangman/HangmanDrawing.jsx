import React from "react";
import { useOptionalProgress } from "../../app/ProgressContext";

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

// What the figure wears, bought in the shop (see src/lib/cosmetics.js). Drawn
// once the head is, in the same 120 x 160 space.
const ACCESSORIES = {
  glasses: (
    <g className="hm-acc hm-acc--glasses">
      <circle cx="84" cy="54" r="4.5" />
      <circle cx="96" cy="54" r="4.5" />
      <line x1="88.5" y1="54" x2="91.5" y2="54" />
    </g>
  ),
  scarf: (
    <g className="hm-acc hm-acc--scarf">
      <rect x="82" y="68" width="16" height="7" rx="3.5" />
      <path d="M92 72 L99 72 L101 90 L95 90 Z" />
    </g>
  ),
  beanie: (
    <g className="hm-acc hm-acc--beanie">
      <path d="M76 47 A14 14 0 0 1 104 47 Z" />
      <rect className="hm-acc__trim" x="74" y="44" width="32" height="7" rx="3.5" />
      <circle className="hm-acc__trim" cx="90" cy="31" r="4.5" />
    </g>
  ),
  bowtie: (
    <g className="hm-acc hm-acc--bowtie">
      <path d="M90 74 L80 68 L80 80 Z M90 74 L100 68 L100 80 Z" />
      <circle cx="90" cy="74" r="2.5" />
    </g>
  ),
  crown: (
    <g className="hm-acc hm-acc--crown">
      <path d="M78 42 L78 29 L84 35 L90 25 L96 35 L102 29 L102 42 Z" />
    </g>
  ),
};

export function FigureAccessory({ id }) {
  return ACCESSORIES[id] || null;
}

// The figure with an accessory and no gallows, for the shop.
export function FigurePreview({ accessory }) {
  return (
    <svg viewBox="62 20 56 100" className="hm-preview" aria-hidden="true">
      <g className="hm-figure hm-figure--still">{PARTS.slice(0, 4)}</g>
      <FigureAccessory id={accessory} />
    </svg>
  );
}

export default function HangmanDrawing({ misses, label }) {
  const accessory = useOptionalProgress()?.cosmetics.figure;
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
        {misses > 0 && <FigureAccessory id={accessory} />}
      </svg>
    </div>
  );
}
