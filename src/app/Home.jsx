import React from "react";
import { useSettings } from "./SettingsContext";
import { useProgress } from "./ProgressContext";
import { fill } from "../i18n";
import { GAMES, PLAYABLE_GAME_IDS } from "../games/registry";
import { achievementList } from "../lib/progress";
import { Achievements, DailyProgress, Feedback, GameCard, SettingsMenu } from "../components/lingo";

// Home screen: progress, one card per game and achievements.
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

        <section className="lg-section">
          <h2 className="lg-heading">{t.chooseGame}</h2>
          <div className="lg-cards">
            {GAMES.map((game) => (
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

        <section className="lg-section">
          <h2 className="lg-heading">{t.achievementsTitle}</h2>
          <Achievements items={achievementList(state, { gameIds: PLAYABLE_GAME_IDS })} soFarLabel={t.soFar} />
        </section>
      </main>
    </div>
  );
}
