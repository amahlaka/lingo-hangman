import React from "react";
import { useOptionalProgress } from "../../app/ProgressContext";
import { useSettings } from "../../app/SettingsContext";
import { fill } from "../../i18n";
import { EXTRA_TRY } from "../../lib/cosmetics";

// Whether a learner who just ran out of tries can keep going: they have an
// extra try from the shop, or the gems to get one.
export function useExtraTry() {
  const progress = useOptionalProgress();
  if (!progress) return { available: false, use: () => false };
  const { extraTries, gems, spendExtraTry } = progress;
  return { available: extraTries > 0 || gems >= EXTRA_TRY.price, use: spendExtraTry };
}

// Shown instead of the answer when the learner is out of tries and can keep
// going: "Use an extra try" (or get one for gems) or "Show the answer".
export default function ExtraTryOffer({ onUse, onDecline }) {
  const { t } = useSettings();
  const progress = useOptionalProgress();
  const x = t.extraTry;
  if (!progress) return null;
  const { extraTries, gems, spendExtraTry } = progress;
  const have = extraTries > 0;
  return (
    <div className="lg-note lg-note--retry xt-offer" role="status">
      <span className="lg-note__icon" aria-hidden="true">↻</span>
      <div className="xt-offer__body">
        <p className="lg-note__title">{x.title}</p>
        <p className="lg-note__body">
          {have ? fill(x.haveBody, { n: extraTries }) : fill(x.buyBody, { price: EXTRA_TRY.price, gems })}
        </p>
        <div className="xt-offer__actions">
          <button
            type="button"
            className="lg-btn lg-btn--primary"
            autoFocus
            onClick={() => {
              if (spendExtraTry()) onUse();
            }}
          >
            {have ? x.use : fill(x.buy, { n: EXTRA_TRY.price })}
          </button>
          <button type="button" className="lg-btn lg-btn--quiet" onClick={onDecline}>
            {x.decline}
          </button>
        </div>
      </div>
    </div>
  );
}
