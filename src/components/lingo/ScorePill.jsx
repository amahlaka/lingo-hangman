import React from "react";

// Points with a rising "+N" after a word, or "−N" after spending some. Change
// `plusKey` to replay it.
export default function ScorePill({ label, value, plus, plusKey }) {
  return (
    <span className="lg-score" aria-label={`${label} ${value}`}>
      <span aria-hidden="true"><span className="lg-score__label">{label} </span>{value}</span>
      {plus ? (
        <span key={plusKey} className={`lg-score__plus${plus < 0 ? " lg-score__plus--spent" : ""}`} aria-hidden="true">
          {plus < 0 ? `−${-plus}` : `+${plus}`}
        </span>
      ) : null}
    </span>
  );
}
