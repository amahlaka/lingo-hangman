import React from "react";
import { Link } from "react-router-dom";
import { Shuffle } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { useProgress } from "./ProgressContext";
import { fill } from "../i18n";
import { GAMES, PLAYABLE_GAME_IDS } from "../games/registry";
import { achievementList, answerSummary } from "../lib/progress";
import { wordStanding } from "../lib/adaptive";
import { Achievements, DailyProgress, Feedback, GameCard, RoundCard, SettingsMenu } from "../components/lingo";
import { ShopCard } from "./Shop";
import { RemindersOffer } from "./Reminders";
import AccountOffer from "./AccountOffer";
import MyPathCard from "./MyPath";

// Show answer statistics once there are enough answers to say something.
const MIN_ANSWERS_FOR_STATS = 10;

const seconds = (ms) => (ms / 1000).toFixed(1);

const QUICK_PLAY = GAMES.find((g) => g.id === "quick-play");

// Quick play, above the game cards. Like them, it has a round menu.
function QuickPlayCard({ t, lang }) {
  const q = t.quick;
  return (
    <RoundCard game={QUICK_PLAY} className="lg-card qp-card">
      <span className="qp-card__icon" aria-hidden="true"><Shuffle size={28} strokeWidth={2} /></span>
      <span className="qp-card__text">
        <span className="lg-card__name">{q.name}</span>
        <span className="lg-card__fi" lang={lang === "fi" ? "en" : "fi"}>{q.nameFi}</span>
        <span className="lg-card__desc">{q.cardDesc}</span>
      </span>
    </RoundCard>
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

// The game cards, grouped by what they practise. Every registry skill is in
// one group; a game with a skill not listed here isn't shown.
const GAME_GROUPS = [
  { id: "words", skills: ["Vocabulary", "Spelling"] },
  { id: "sentences", skills: ["Sentences", "Grammar"] },
  { id: "sound", skills: ["Listening", "Speaking", "Pronunciation"] },
  { id: "reading", skills: ["Conversation", "Reading"] },
];

// The learner's words, counted the same way as on the profile: known well
// (the last answers were quick first tries), still in practice, and learned
// for good (solved on 3 different days).
function YourWords({ state, learnedWords, t }) {
  const counts = { known: 0, practising: 0 };
  for (const entry of Object.values(state.words)) {
    const standing = wordStanding(entry);
    if (standing === "known") counts.known += 1;
    else if (standing !== "new") counts.practising += 1;
  }
  const seen = counts.known + counts.practising;
  return (
    <section className="lg-section">
      <h2 className="lg-heading">{t.yourWords}</h2>
      {seen === 0 ? (
        <p className="lg-caption">{t.yourWordsEmpty}</p>
      ) : (
        <>
          <p className="lg-learned">
            <span className="lg-learned__n">{counts.known}</span> {t.knownWell}
          </p>
          <div className="lg-bar" role="img" aria-label={`${counts.known} / ${seen}`}>
            <div className="lg-bar__fill lg-bar__fill--pine" style={{ width: `${Math.round((counts.known / seen) * 100)}%` }} />
          </div>
          <p className="lg-caption">{fill(t.yourWordsMore, { seen, practising: counts.practising, learned: learnedWords })}</p>
        </>
      )}
      <p className="lg-caption">{t.yourWordsHint}</p>
    </section>
  );
}

// Home screen: progress, Quick play, one card per game and achievements.
export default function Home() {
  const { t, lang } = useSettings();
  const { state, streak, today, dailyGoal, learnedWords, sync } = useProgress();
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
        <RemindersOffer />
        <AccountOffer />

        <MyPathCard />

        <QuickPlayCard t={t} lang={lang} />

        <section className="lg-section">
          <h2 className="lg-heading">{t.chooseGame}</h2>
          {GAME_GROUPS.map((group) => {
            const games = GAMES.filter((game) => !game.featured && group.skills.includes(game.skill));
            if (!games.length) return null;
            return (
              <div key={group.id} className="lg-game-group">
                <h3 className="lg-game-group__title">{t.gameGroups[group.id]}</h3>
                <div className="lg-cards">
                  {games.map((game) => (
                    <GameCard key={game.id} game={game} lang={lang} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <YourWords state={state} learnedWords={learnedWords} t={t} />

        <ShopCard />

        {sync.user && (
          <Link to="/leaderboard" className="lg-btn lg-btn--secondary">{t.board.homeLink}</Link>
        )}

        <AnswerStats state={state} t={t} lang={lang} />

        <section className="lg-section">
          <h2 className="lg-heading">{t.achievementsTitle}</h2>
          <Achievements items={achievementList(state, { gameIds: PLAYABLE_GAME_IDS })} soFarLabel={t.soFar} lang={lang} />
        </section>
      </main>
    </div>
  );
}
