import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Gem, RotateCcw } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { useProgress } from "./ProgressContext";
import { fill } from "../i18n";
import { Feedback, GameScreen, ScorePill, useConfetti } from "../components/lingo";
import { FigurePreview } from "../games/hangman/HangmanDrawing";
import { CONFETTI, EXTRA_TRY, SHOP_ITEMS, SHOP_KINDS, accentVars, ownsItem } from "../lib/cosmetics";
import { GEMS, STREAK_MILESTONE_GEMS } from "../lib/progress";

// A small still scatter of a confetti set.
const SCATTER = [
  [12, 30, -20], [28, 62, 35], [40, 20, 70], [52, 54, -45], [64, 28, 15],
  [76, 66, 60], [86, 36, -30], [20, 80, 10], [70, 84, -60],
];

function ItemPreview({ item, dark }) {
  if (item.kind === "accent") {
    return (
      <span className="sh-preview sh-preview--accent" style={accentVars(item.value, dark)} aria-hidden="true">
        <span className="sh-swatch">Aa</span>
        <span className="sh-swatch sh-swatch--soft" />
      </span>
    );
  }
  if (item.kind === "confetti") {
    const set = CONFETTI[item.value];
    return (
      <span className="sh-preview sh-preview--confetti" aria-hidden="true">
        {SCATTER.map(([x, y, r], k) => (
          <i
            key={k}
            className={set.shape === "mix" ? (k % 3 === 0 ? "lg-dot" : undefined) : `lg-piece--${set.shape}`}
            style={{ "--c": set.colors[k % set.colors.length], left: `${x}%`, top: `${y}%`, transform: `rotate(${r}deg)` }}
          />
        ))}
      </span>
    );
  }
  return (
    <span className="sh-preview sh-preview--figure">
      <FigurePreview accessory={item.value} />
    </span>
  );
}

// Extra tries: a stock to keep going on a word after running out of tries.
function ExtraTries({ s, gems, have, onBuy }) {
  const short = EXTRA_TRY.price - gems;
  const full = have >= EXTRA_TRY.max;
  return (
    <section className="lg-section" aria-labelledby="sh-extra-try">
      <h2 id="sh-extra-try" className="lg-heading">{s.extraTriesTitle}</h2>
      <p className="lg-caption">{fill(s.extraTriesHint, { max: EXTRA_TRY.max })}</p>
      <ul className="sh-items">
        <li className="sh-item">
          <span className="sh-preview sh-preview--extra" aria-hidden="true"><RotateCcw size={28} strokeWidth={2} /></span>
          <span className="sh-item__name">{s.extraTryName}</span>
          <span className="lg-caption">{fill(s.extraTriesHave, { n: have })} · {fill(s.price, { n: EXTRA_TRY.price })}</span>
          <div className="sh-item__actions">
            {full ? (
              <span className="lg-caption">{s.extraTriesFull}</span>
            ) : (
              <button type="button" className="lg-btn lg-btn--primary" disabled={short > 0} onClick={onBuy}
                aria-label={fill(s.buyAria, { name: s.extraTryName, n: EXTRA_TRY.price })}>
                {short > 0 ? fill(s.more, { n: short }) : fill(s.buy, { n: EXTRA_TRY.price })}
              </button>
            )}
          </div>
        </li>
      </ul>
    </section>
  );
}

// How gems are earned, from the rules in progress.js.
function EarnList({ g }) {
  const milestones = Object.entries(STREAK_MILESTONE_GEMS);
  const rows = [
    [g.earn.goal, `+${GEMS.goal}`],
    [fill(g.earn.streak, { max: GEMS.streakDayMax }), `+1–${GEMS.streakDayMax}`],
    [fill(g.earn.milestone, { days: milestones.map(([d]) => d).join(", ") }), `+${milestones[0][1]}–${milestones[milestones.length - 1][1]}`],
    [g.earn.achievement, `+${GEMS.achievement}`],
    [g.earn.level, `+${GEMS.levelUp}`],
    [g.earn.learned, `+${GEMS.wordLearned}`],
  ];
  return (
    <section className="lg-section sh-earn" aria-labelledby="sh-earn">
      <h2 id="sh-earn" className="lg-heading">{g.earnTitle}</h2>
      <ul className="sh-earn__list">
        {rows.map(([what, n]) => (
          <li key={what}><span>{what}</span><span className="sh-earn__n"><Gem size={14} strokeWidth={2.5} aria-hidden="true" className="lg-gem" /> {n}</span></li>
        ))}
      </ul>
    </section>
  );
}

// /shop: spend gems on accent colours, confetti and things for the hangman
// figure. See src/lib/cosmetics.js for how the balance works.
export default function Shop() {
  const { t, dark } = useSettings();
  const { state, gems, cosmetics, buyItem, equipItem, extraTries } = useProgress();
  const { celebrate, confetti } = useConfetti();
  const [news, setNews] = useState(null);
  const [spent, setSpent] = useState(null);
  const s = t.shop;
  const nameOf = (item) => s.items[item.id] || item.id;

  const buy = (item) => {
    const { ok } = buyItem(item.id);
    if (!ok) return;
    setSpent({ n: -item.price, key: Date.now() });
    setNews({ id: item.id, title: fill(s.bought, { name: nameOf(item) }) });
    celebrate("large", item.kind === "confetti" ? item.value : undefined);
  };

  const buyExtraTry = () => {
    const { ok } = buyItem(EXTRA_TRY.id);
    if (!ok) return;
    setSpent({ n: -EXTRA_TRY.price, key: Date.now() });
    setNews({ id: EXTRA_TRY.id, title: fill(s.extraTryBought, { n: extraTries + 1 }) });
  };

  const use = (item) => {
    equipItem(item.id);
    setNews({ id: item.id, title: fill(s.nowUsing, { name: nameOf(item) }) });
  };

  return (
    <GameScreen title={s.title} score={<ScorePill label={t.gems.label} value={gems} plus={spent?.n} plusKey={spent?.key} Icon={Gem} />}>
      <main className="lg-board lg-page sh-page">
        {confetti}
        <div className="lg-stack">
          <p className="lg-body-lg">{s.intro}</p>
          <p className="sh-balance">
            <Gem size={32} strokeWidth={2} aria-hidden="true" className="lg-gem" />
            <span className="sh-balance__n">{gems}</span> {s.balance}
          </p>
          <p className="lg-caption">{s.howToEarn}</p>
        </div>

        {news && <Feedback key={news.id + news.title} variant="correct" title={news.title} />}

        {SHOP_KINDS.map((kind) => (
          <section key={kind} className="lg-section" aria-labelledby={`sh-${kind}`}>
            <h2 id={`sh-${kind}`} className="lg-heading">{s.kinds[kind]}</h2>
            <p className="lg-caption">{s.kindHints[kind]}</p>
            <ul className="sh-items">
              {SHOP_ITEMS.filter((item) => item.kind === kind).map((item) => {
                const owned = ownsItem(state, item.id);
                const inUse = cosmetics[kind] === item.value;
                const short = item.price - gems;
                return (
                  <li key={item.id} className={`sh-item${inUse ? " sh-item--on" : ""}`}>
                    <ItemPreview item={item} dark={dark} />
                    <span className="sh-item__name">{nameOf(item)}</span>
                    <span className="lg-caption">
                      {item.price === 0 ? s.free : owned ? s.owned : fill(s.price, { n: item.price })}
                    </span>
                    <div className="sh-item__actions">
                      {inUse ? (
                        <span className="sh-inuse">{s.inUse}</span>
                      ) : owned ? (
                        <button type="button" className="lg-btn lg-btn--secondary" onClick={() => use(item)}
                          aria-label={fill(s.useAria, { name: nameOf(item) })}>
                          {s.use}
                        </button>
                      ) : (
                        <button type="button" className="lg-btn lg-btn--primary" disabled={short > 0} onClick={() => buy(item)}
                          aria-label={fill(s.buyAria, { name: nameOf(item), n: item.price })}>
                          {short > 0 ? fill(s.more, { n: short }) : fill(s.buy, { n: item.price })}
                        </button>
                      )}
                      {kind === "confetti" && (
                        <button type="button" className="lg-btn lg-btn--quiet" onClick={() => celebrate("medium", item.value)}
                          aria-label={fill(s.tryAria, { name: nameOf(item) })}>
                          {s.try}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <ExtraTries s={s} gems={gems} have={extraTries} onBuy={buyExtraTry} />

        <EarnList g={t.gems} />

        <Link to="/quick" className="lg-btn lg-btn--primary lg-btn--hero">{s.earnMore}</Link>
      </main>
    </GameScreen>
  );
}

// Home screen entry with the current balance.
export function ShopCard() {
  const { t } = useSettings();
  const { gems } = useProgress();
  return (
    <Link to="/shop" className="lg-card sh-card">
      <span className="sh-card__icon" aria-hidden="true"><Gem size={26} strokeWidth={2} /></span>
      <span className="qp-card__text">
        <span className="lg-card__name">{t.shop.title}</span>
        <span className="lg-card__desc">{fill(t.shop.cardDesc, { n: gems })}</span>
      </span>
    </Link>
  );
}
