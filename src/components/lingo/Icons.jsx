import React from "react";

// The streak flame (lingon) and rest-day shield (lake) from the design system.
export function Flame({ className = "" }) {
  return (
    <svg className={`lg-flame ${className}`} viewBox="0 0 24 28" aria-hidden="true">
      <path d="M12 1c1 5 7 8 7 15a7 7 0 0 1-14 0c0-4 2-6 4-8 0 3 1 5 3 5 0-4-2-7 0-12z" />
    </svg>
  );
}

export function Shield() {
  return (
    <svg className="lg-flame lg-flame--shield" viewBox="0 0 24 28" aria-hidden="true">
      <path d="M12 3l8 3v7c0 6-4 10-8 12-4-2-8-6-8-12V6z" />
    </svg>
  );
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 19;

export function GoalRing({ done, goal }) {
  const ratio = goal > 0 ? Math.min(1, done / goal) : 0;
  return (
    <svg className="lg-ring" viewBox="0 0 44 44" aria-hidden="true">
      <circle className="lg-ring__track" cx="22" cy="22" r="19" />
      <circle
        className="lg-ring__fill"
        cx="22"
        cy="22"
        r="19"
        strokeDasharray={RING_CIRCUMFERENCE.toFixed(1)}
        strokeDashoffset={(RING_CIRCUMFERENCE * (1 - ratio)).toFixed(1)}
      />
    </svg>
  );
}
