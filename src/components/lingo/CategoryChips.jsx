import React from "react";

// Word categories the learner can include or leave out. Each tap cycles
// neutral -> included -> left out -> neutral.
// labels: optional { [category]: display name }.
export default function CategoryChips({ all, included, excluded, onChange, labels = {} }) {
  const cycle = (cat) => {
    if (included.includes(cat)) {
      onChange({ included: included.filter((c) => c !== cat), excluded: [...excluded, cat] });
    } else if (excluded.includes(cat)) {
      onChange({ included, excluded: excluded.filter((c) => c !== cat) });
    } else {
      onChange({ included: [...included, cat], excluded });
    }
  };
  return (
    <div className="lg-chips">
      {all.map((cat) => {
        const on = included.includes(cat);
        const off = excluded.includes(cat);
        return (
          <button
            key={cat}
            type="button"
            className={`lg-chip ${on ? "lg-chip--on" : ""} ${off ? "lg-chip--off" : ""}`}
            aria-pressed={on}
            onClick={() => cycle(cat)}
          >
            <span className="lg-chip__mark" aria-hidden="true">{on ? "✓" : off ? "–" : "+"}</span>
            {labels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
