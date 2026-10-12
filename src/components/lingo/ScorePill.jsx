import React from "react";

// Points with a rising "+N" after a word. Change `plusKey` to replay the "+N".
export default function ScorePill({ label, value, plus, plusKey }) {
  return (
    <span className="lg-score" aria-label={`${label} ${value}`}>
      <span aria-hidden="true"><span className="lg-score__label">{label} </span>{value}</span>
      {plus ? (
        <span key={plusKey} className="lg-score__plus" aria-hidden="true">+{plus}</span>
      ) : null}
    </span>
  );
}
