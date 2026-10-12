import React from "react";

const ICONS = { correct: "✓", retry: "↻", info: "i", streak: "5" };

// Result banner. variant: correct | retry | info | streak.
// `fi` is the optional Finnish helper line.
export default function Feedback({ variant = "info", icon, title, children, fi, className = "", ...rest }) {
  return (
    <div className={`lg-note lg-note--${variant} ${className}`} role="status" {...rest}>
      <span className="lg-note__icon" aria-hidden="true">{icon ?? ICONS[variant]}</span>
      <div>
        <p className="lg-note__title">{title}</p>
        {children && <p className="lg-note__body">{children}</p>}
        {fi && <p className="lg-note__fi" lang="fi">{fi}</p>}
      </div>
    </div>
  );
}
