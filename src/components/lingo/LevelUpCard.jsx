import React, { useEffect } from "react";
import { Gem } from "lucide-react";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { sounds } from "../../lib/sounds";
import { useConfetti } from "./Confetti";

const SHOW_MS = 4500;

// A short card in the middle of the screen when the learner reaches a new
// level: the level, the gems it earned and a confetti shower. Tap to close; it
// also goes by itself. Rendered once by ProgressProvider, so every game gets it.
export default function LevelUpCard({ levelUp, onDone }) {
  const { t } = useSettings();
  const { celebrate, confetti } = useConfetti();
  useEffect(() => {
    if (!levelUp) return undefined;
    celebrate("large");
    sounds.celebrate();
    const timer = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(timer);
  }, [levelUp, onDone, celebrate]);
  return (
    <div className="lg-levelup-live" aria-live="polite">
      {confetti}
      {levelUp && (
        <button key={levelUp.key} type="button" className="lg-levelup" onClick={onDone} aria-label={`${fill(t.levelUpTitle, { n: levelUp.level })} ${t.levelUpClose}`}>
          <span className="lg-levelup__medal" aria-hidden="true">{levelUp.level}</span>
          <span className="lg-levelup__title">{fill(t.levelUpTitle, { n: levelUp.level })}</span>
          {levelUp.gems > 0 && (
            <span className="lg-levelup__gems">
              <Gem size={18} strokeWidth={2} aria-hidden="true" className="lg-gem" />
              {fill(t.gems.plus, { n: levelUp.gems })}
            </span>
          )}
          <span className="lg-caption">{t.levelUpClose}</span>
        </button>
      )}
    </div>
  );
}
