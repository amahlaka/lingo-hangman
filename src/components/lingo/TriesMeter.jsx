import React from "react";

// Tries left as cloudberry dots, used tries as outlined dots, plus the count in words.
export default function TriesMeter({ left, total, label }) {
  return (
    <div className="lg-meter" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`lg-meter__dot ${i >= left ? "lg-meter__dot--used" : ""}`} />
      ))}
      <span className="lg-meter__label" aria-hidden="true">{label}</span>
    </div>
  );
}
