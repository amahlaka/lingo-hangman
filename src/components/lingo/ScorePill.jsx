import React from "react";
import { Star } from "lucide-react";

// Points with a rising "+N" after a word, or "−N" after spending some. Change
// `plusKey` to replay it. `Icon` stays when a narrow screen hides the label,
// so the number never stands alone (a star for points by default).
export default function ScorePill({ label, value, plus, plusKey, Icon = Star }) {
  return (
    <span className="lg-score" aria-label={`${label} ${value}`}>
      <span aria-hidden="true" className="lg-score__value">
        {Icon && <Icon size={16} strokeWidth={2.2} className="lg-score__icon" />}
        <span className="lg-score__label">{label} </span>
        {value}
      </span>
      {plus ? (
        <span key={plusKey} className={`lg-score__plus${plus < 0 ? " lg-score__plus--spent" : ""}`} aria-hidden="true">
          {plus < 0 ? `−${-plus}` : `+${plus}`}
        </span>
      ) : null}
    </span>
  );
}
