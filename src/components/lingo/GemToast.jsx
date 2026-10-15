import React, { useEffect } from "react";
import { Gem } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";

const SHOW_MS = 3200;

// "+N gems" with what earned them, at the top of the screen for a moment after
// a word unlocks gems (daily goal, streak day, milestone). Rendered once by
// ProgressProvider, so every game gets it.
export default function GemToast({ toast, onDone }) {
  const { t } = useSettings();
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast, onDone]);
  if (!toast) return <div className="lg-gem-toast-live" aria-live="polite" />;
  const g = t.gems;
  const why = toast.reasons.map((r) => g.reasons[r.id]).filter(Boolean).join(" · ");
  return (
    <div className="lg-gem-toast-live" aria-live="polite">
      <div key={toast.key} className="lg-gem-toast">
        <Gem size={20} strokeWidth={2} aria-hidden="true" className="lg-gem" />
        <span className="lg-gem-toast__n">{fill(toast.n === 1 ? g.plusOne : g.plus, { n: toast.n })}</span>
        {why && <span className="lg-gem-toast__why">{why}</span>}
      </div>
    </div>
  );
}
