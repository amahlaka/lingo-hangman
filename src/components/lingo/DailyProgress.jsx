import React from "react";
import { useProgress } from "../../app/ProgressContext";
import { useSettings } from "../../app/SettingsContext";
import { Gem } from "lucide-react";
import { Flame, GoalRing, Shield } from "./Icons";
import { fill } from "../../i18n";

// Compact progress for game headers: streak and today's goal ring.
export function HeaderProgress() {
  const { streak, today, dailyGoal } = useProgress();
  const { t } = useSettings();
  return (
    <div className="lg-header-progress">
      <div className="lg-stat" aria-label={fill(t.streakAria, { n: streak.current })}>
        <Flame />
        <span>{streak.current}</span>
      </div>
      <div className="lg-stat" aria-label={fill(t.goalAria, { done: today.words, goal: dailyGoal })}>
        <GoalRing done={today.words} goal={dailyGoal} />
      </div>
    </div>
  );
}

// Full progress bar for the home screen and end-of-round screens.
export default function DailyProgress() {
  const { streak, today, dailyGoal, level, xp, gems } = useProgress();
  const { t } = useSettings();
  const levelPct = Math.round((level.into / level.perLevel) * 100);
  return (
    <div className="lg-progress">
      <div className="lg-stat" aria-label={fill(t.streakAria, { n: streak.current })}>
        <Flame />
        <span>
          {streak.current}
          <small>{t.dayStreak}</small>
        </span>
      </div>
      <div className="lg-stat" aria-label={fill(t.goalAria, { done: today.words, goal: dailyGoal })}>
        <GoalRing done={today.words} goal={dailyGoal} />
        <span>
          {Math.min(today.words, dailyGoal)}/{dailyGoal}
          <small>{t.wordsToday}</small>
        </span>
      </div>
      <div className="lg-stat">
        <Shield />
        <span>
          {streak.restDaysLeft}
          <small>{streak.restDaysLeft === 1 ? t.restDayLeft : t.restDaysLeft}</small>
        </span>
      </div>
      <div className="lg-stat">
        <Gem size={24} strokeWidth={2} aria-hidden="true" className="lg-gem" />
        <span>
          {gems}
          <small>{t.gems.label.toLowerCase()}</small>
        </span>
      </div>
      <div className="lg-level">
        <div className="lg-stat">
          <span>
            {fill(t.levelXp, { level: level.level, xp })}
            <small>{fill(t.xpToLevel, { xp: level.toNext, level: level.level + 1 })}</small>
          </span>
        </div>
        <div
          className="lg-bar"
          role="progressbar"
          aria-valuenow={level.into}
          aria-valuemin={0}
          aria-valuemax={level.perLevel}
          aria-label={t.levelProgress}
        >
          <div className="lg-bar__fill" style={{ width: `${levelPct}%` }} />
        </div>
      </div>
    </div>
  );
}
