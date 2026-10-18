import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Route as RouteIcon } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { useProgress } from "./ProgressContext";
import { fill } from "../i18n";
import { GAMES } from "../games/registry";
import { buildInsights } from "../lib/insights";
import { currentPath, nextStep, pathFinished, planPath, stepDone } from "../lib/path";
import { getPreferences, onPreferencesChange, setPreferences } from "../lib/preferences";
import { loadAccountPath, loadLocalPath, newerPath, saveAccountPath, saveLocalPath } from "../lib/pathStore";

// "My path" on Home: this week's few steps, planned from the learner's own
// answers (src/lib/path.js). Works without an account; signed in, the same
// path shows on every device. Collapsed (remembered on this device), only
// the current step and its Play button show.

function usePath() {
  const { state, sync } = useProgress();
  const insights = useMemo(() => buildInsights(state, { games: GAMES }), [state]);
  const [stored, setStored] = useState(() => loadLocalPath());
  // Signed in, the account's path is read before this device's is sent, so
  // a new device doesn't replace it.
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(false);
    if (!sync.user) return;
    let live = true;
    loadAccountPath().then((account) => {
      if (!live) return;
      setStored((local) => {
        const next = newerPath(local, account);
        if (next !== local) saveLocalPath(next);
        else if (next) saveAccountPath(next);
        return next;
      });
      setChecked(true);
    });
    return () => {
      live = false;
    };
  }, [sync.user]);

  const { path, replanned } = useMemo(() => currentPath(stored, state, { games: GAMES, insights }), [stored, state, insights]);

  const keep = (next) => {
    saveLocalPath(next);
    setStored(next);
    if (sync.user && checked) saveAccountPath(next);
  };
  useEffect(() => {
    // Planned here before the account's path has been read: keep it on this
    // device only; the read above decides which one stays.
    if (replanned && (!sync.user || checked)) keep(path);
    else if (replanned) saveLocalPath(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replanned, path, checked]);

  return {
    path,
    state,
    planMore: () => keep(planPath(state, { games: GAMES, insights })),
  };
}

export default function MyPathCard() {
  const { t, lang } = useSettings();
  const m = t.path;
  const { path, state, planMore } = usePath();
  const next = nextStep(path, state);
  const done = pathFinished(path, state);
  const gameOf = (id) => GAMES.find((g) => g.id === id);
  const gameName = (id) => {
    const g = gameOf(id);
    return g ? (lang === "fi" ? g.nameFi : g.name) : id;
  };
  const skillName = (s) => t.profile.skills[s] || s;
  const [collapsed, setCollapsed] = useState(() => getPreferences().pathCollapsed);
  useEffect(() => onPreferencesChange((p) => setCollapsed(p.pathCollapsed)), []);
  const toggle = () => setPreferences({ pathCollapsed: !collapsed });

  return (
    <section className="lg-section mp-card" aria-labelledby="my-path-title">
      <div className="mp-card__head">
        <RouteIcon size={24} strokeWidth={2} aria-hidden="true" />
        <h2 className="lg-heading" id="my-path-title">{m.title}</h2>
        <button
          type="button"
          className={`lg-btn lg-btn--quiet lg-icon-btn mp-card__toggle${collapsed ? " mp-card__toggle--closed" : ""}`}
          aria-expanded={!collapsed}
          aria-controls="my-path-steps"
          aria-label={collapsed ? m.expand : m.collapse}
          title={collapsed ? m.expand : m.collapse}
          onClick={toggle}
        >
          <ChevronDown size={24} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {!collapsed && <p className="lg-caption">{path.placement ? m.placementIntro : m.intro}</p>}
      <ol className="mp-steps" id="my-path-steps" hidden={collapsed && !next}>
        {path.steps.map((s, i) => {
          if (collapsed && s !== next) return null;
          const n = stepDone(s, state);
          const complete = n >= s.goal;
          const current = s === next;
          const game = gameOf(s.game);
          return (
            <li key={`${s.game}-${i}`} className={`mp-step${complete ? " mp-step--done" : ""}${current ? " mp-step--now" : ""}`}>
              <span className="mp-step__mark" aria-hidden="true">{complete ? "✓" : i + 1}</span>
              <span className="mp-step__text">
                <span className="mp-step__name">{gameName(s.game)}</span>
                <span className="lg-caption">{fill(m.reasons[s.reason] || m.reasons.practise, { skill: skillName(s.skill) })}</span>
                <span className="mp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={s.goal} aria-valuenow={n} aria-label={fill(m.progress, { n, goal: s.goal })}>
                  <span className="mp-bar__fill" style={{ width: `${(n / s.goal) * 100}%` }} />
                </span>
              </span>
              {current && game?.path && (
                <Link to={game.path} className="lg-btn lg-btn--primary mp-step__go">{m.play}</Link>
              )}
            </li>
          );
        })}
      </ol>
      {done && (
        <div className="lg-stack">
          <p className="lg-body-lg">{m.done}</p>
          <button type="button" className="lg-btn lg-btn--secondary" onClick={planMore}>{m.planMore}</button>
        </div>
      )}
    </section>
  );
}
