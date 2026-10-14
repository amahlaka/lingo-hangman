import React from "react";
import { Link } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { useProgress } from "./ProgressContext";
import { fill } from "../i18n";
import { GAMES, PLAYABLE_GAME_IDS } from "../games/registry";
import { achievementList, answerSummary } from "../lib/progress";
import { wordStanding } from "../lib/adaptive";
import { Achievements, DailyProgress, Feedback, GameCard, SettingsMenu } from "../components/lingo";
import { ShopCard } from "./Shop";

// Show answer statistics once there are enough answers to say something.
const MIN_ANSWERS_FOR_STATS = 10;

const seconds = (ms) => (ms / 1000).toFixed(1);

// Quick play, above the game cards.
function QuickPlayCard({ t, lang }) {
  const q = t.quick;
  return (
    <Link to="/quick" className="lg-card qp-card">
      <span className="qp-card__icon" aria-hidden="true"><Shuffle size={28} strokeWidth={2} /></span>
      <span className="qp-card__text">
        <span className="lg-card__name">{q.name}</span>
        <span className="lg-card__fi" lang={lang === "fi" ? "en" : "fi"}>{q.nameFi}</span>
        <span className="lg-card__desc">{q.cardDesc}</span>
      </span>
    </Link>
  );
}

// Average answer time, the quickest and slowest game, and how many words the
// learner knows well. Neutral numbers only: nothing here counts misses.
function AnswerStats({ state, t, lang }) {
  const summary = answerSummary(state);
  if (summary.timed < MIN_ANSWERS_FOR_STATS) return null;
  const q = t.quick;
  const nameOf = (id) => {
    const game = GAMES.find((g) => g.id === id);
    return game ? (lang === "fi" ? game.nameFi : game.name) : id;
  };
  const games = summary.games.filter((g) => g.n >= 3 && g.id !== "unknown");
  const known = Object.values(state.words).filter((w) => wordStanding(w) === "known").length;
  return (
    <section className="lg-section">
      <h2 className="lg-heading">{q.statsTitle}</h2>
      <dl className="pg-stats qp-stats">
        <div><dt>{q.avgTime}</dt><dd>{fill(q.seconds, { n: seconds(summary.meanMs) })}</dd></div>
        <div><dt>{q.knownWords}</dt><dd>{known}</dd></div>
        {games.length > 1 && (
          <>
            <div><dt>{q.quickest}</dt><dd className="qp-stats__name">{nameOf(games[games.length - 1].id)}</dd></div>
            <div><dt>{q.longest}</dt><dd className="qp-stats__name">{nameOf(games[0].id)}</dd></div>
          </>
        )}
      </dl>
      <p className="lg-caption">{q.statsHint}</p>
      <Link to="/profile" className="lg-btn lg-btn--secondary">{t.profile.link}</Link>
    </section>
  );
}

// Home screen: progress, Quick play, one card per game and achievements.
export default function Home() {
  const { t, lang } = useSettings();
  const { state, streak, today, dailyGoal, learnedWords } = useProgress();
  const left = Math.max(0, dailyGoal - today.words);
  const brokenStreak = !streak.alive && state.streak.best > 1 && state.streak.current > 0;

  let nudge;
  if (left === 0) nudge = { variant: "correct", icon: "✓", title: t.goalDone };
  else if (brokenStreak) nudge = { variant: "info", icon: String(left), title: fill(t.newStreak, { best: state.streak.best }) };
  else if (streak.current > 0) nudge = { variant: "info", icon: String(left), title: fill(t.goalNudge, { streak: streak.current, left }) };
  else nudge = { variant: "info", icon: String(left), title: fill(t.goalNudgeStart, { left }) };

  return (
    <div className="lg-screen">
      <header className="lg-header lg-header--home">
        <span className="lg-wordmark">Lingo</span>
        <div className="lg-header__end">
          <SettingsMenu />
        </div>
      </header>
      <main className="lg-board lg-page">
        <div>
          <h1 className="lg-display">{t.homeTitle}</h1>
          <p className="lg-caption">{t.appTagline}</p>
        </div>

        <DailyProgress />
        <Feedback variant={nudge.variant} icon={nudge.icon} title={nudge.title} />

        <QuickPlayCard t={t} lang={lang} />

        <section className="lg-section">
          <h2 className="lg-heading">{t.chooseGame}</h2>
          <div className="lg-cards">
            {GAMES.filter((game) => !game.featured).map((game) => (
              <GameCard key={game.id} game={game} lang={lang} />
            ))}
          </div>
        </section>

        <section className="lg-section">
          <p className="lg-learned">
            <span className="lg-learned__n">{learnedWords}</span> {t.learnedWords}
          </p>
          <p className="lg-caption">{t.learnedWordsHint}</p>
        </section>

        <ShopCard />

        <AnswerStats state={state} t={t} lang={lang} />

        <section className="lg-section">
          <h2 className="lg-heading">{t.achievementsTitle}</h2>
          <Achievements items={achievementList(state, { gameIds: PLAYABLE_GAME_IDS })} soFarLabel={t.soFar} />
        </section>
      </main>
    </div>
  );
}
