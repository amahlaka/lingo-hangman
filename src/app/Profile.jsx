import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "./SettingsContext";
import { useProgress } from "./ProgressContext";
import { fill } from "../i18n";
import { GameScreen } from "../components/lingo";
import { GAMES } from "../games/registry";
import { wordKey } from "../lib/progress";
import { LEVELS, MIN_ANSWERS, buildInsights } from "../lib/insights";
import { getPreferences, onPreferencesChange, setPreferences } from "../lib/preferences";
import {
  DEFAULT_LEARNING_LANG,
  DEFAULT_NATIVE_LANG,
  categoryLabel,
  filterCommonWords,
  getGapItems,
  getItem,
  getSentences,
} from "../lib/words";

const pct = (r) => Math.round(r * 100);
const secs = (ms) => (ms === null || ms === undefined ? "–" : `${(ms / 1000).toFixed(1)} s`);

// Word key -> word bank categories, for the topic numbers.
function categoryMap() {
  const map = new Map();
  const add = (text, cats) => {
    if (!text || !cats?.length) return;
    const key = wordKey(text, DEFAULT_LEARNING_LANG);
    map.set(key, [...new Set([...(map.get(key) || []), ...cats])]);
  };
  filterCommonWords({ learningLang: DEFAULT_LEARNING_LANG, nativeLang: DEFAULT_NATIVE_LANG }).forEach((w) => add(w.learning, w.categories));
  getSentences().forEach((s) => add(s.learning, s.categories));
  getGapItems().forEach((g) => {
    const filled = g.sentence.replace("___", g.answers[0]).replace(/\s{2,}/g, " ").trim();
    add(filled.charAt(0).toUpperCase() + filled.slice(1), g.categories);
  });
  return map;
}

function useNames(t, lang) {
  const gameName = (id) => {
    const g = GAMES.find((x) => x.id === id);
    return g ? (lang === "fi" ? g.nameFi : g.name) : id;
  };
  const lessonName = (key) => {
    const [game, id] = key.split(":");
    const item = getItem(id);
    const title = item?.title ? (lang === "fi" ? item.title.fi || item.title.en : item.title.en) : id;
    return `${title} · ${gameName(game)}`;
  };
  const name = (c) =>
    c.kind === "skill" ? t.profile.skills[c.id] || c.id : c.kind === "lesson" ? lessonName(c.id) : categoryLabel(c.id, lang);
  return { gameName, lessonName, name };
}

function LevelMeter({ level, label }) {
  return (
    <span className="pf-meter" role="img" aria-label={label}>
      {LEVELS.map((_, i) => (
        <span key={i} className={`pf-meter__step${i < level ? " pf-meter__step--on" : ""}`} />
      ))}
    </span>
  );
}

// Questions per day, one bar each, with the number above and a table for screen readers.
function WeekChart({ days, p, lang }) {
  const max = Math.max(1, ...days.map((d) => d.words));
  const dayName = (day) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(lang === "fi" ? "fi-FI" : "en-GB", { weekday: "short" });
  };
  return (
    <figure className="pf-week">
      <div className="pf-week__bars" aria-hidden="true">
        {days.map((d) => (
          <div key={d.day} className="pf-week__col" title={`${dayName(d.day)}: ${d.words}`}>
            <span className="pf-week__n">{d.words || ""}</span>
            <span className="pf-week__bar" style={{ height: `${(d.words / max) * 100}%` }} />
            <span className="pf-week__day">{dayName(d.day)}</span>
          </div>
        ))}
      </div>
      <figcaption className="lg-caption">{p.weekCaption}</figcaption>
      <table className="pf-sr">
        <caption>{p.weekTable}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}><th scope="row">{dayName(d.day)}</th><td>{d.words}</td><td>{d.firstTry}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function StatTable({ rows, nameOf, p }) {
  if (!rows.length) return null;
  return (
    <div className="pf-table-wrap">
      <table className="pf-table">
        <thead>
          <tr><th scope="col">{p.colName}</th><th scope="col">{p.colAnswers}</th><th scope="col">{p.colFirstTry}</th><th scope="col">{p.colTime}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{nameOf(r.id)}</th>
              <td>{r.n}</td>
              <td>{pct(r.firstTryRate)}%</td>
              <td>{secs(r.meanMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// /profile: the level, strengths, things worth practising and suggested focus
// Lingo has worked out from the learner's answers, and the numbers behind them.
export default function Profile() {
  const { t, lang } = useSettings();
  const { state } = useProgress();
  const p = t.profile;
  const categories = useMemo(categoryMap, []);
  const insights = useMemo(() => buildInsights(state, { games: GAMES, categoryOf: categories }), [state, categories]);
  const { gameName, lessonName, name } = useNames(t, lang);
  const [prefs, setPrefs] = useState(getPreferences);
  const [saved, setSaved] = useState(false);
  useEffect(() => onPreferencesChange(setPrefs), []);

  const { overall, skills, goingWell, toPractise, suggestedFocus, suggestedDifficulty, words, topics } = insights;
  const levelLabel = (level) => p.levels[LEVELS[level - 1]];
  const apply = (next) => {
    setPreferences(next);
    setSaved(true);
  };
  const focusNow = prefs.focus.length ? prefs.focus.map((c) => categoryLabel(c, lang)).join(", ") : p.allTopics;

  const itemRow = (c) => (
    <li key={`${c.kind}:${c.id}`} className="pf-item">
      <span className="pf-item__name">{name(c)}</span>
      <span className="lg-caption">
        {p.kinds[c.kind]} · {c.reason ? (c.reason === "time" ? p.reasonTime : p.reasonTries) : fill(p.firstTryShare, { rate: pct(c.score) })}
      </span>
    </li>
  );

  return (
    <GameScreen title={p.title}>
      <main className="lg-board lg-page pf-page">
        <p className="lg-body-lg">{p.intro}</p>

        <section className="pf-hero" aria-label={p.levelTitle}>
          <span className="lg-caption">{p.levelTitle}</span>
          {overall ? (
            <>
              <p className="pf-hero__level">{levelLabel(overall.level)}</p>
              <LevelMeter level={overall.level} label={levelLabel(overall.level)} />
              <p className="lg-caption">{fill(p.basedOn, { n: overall.n, rate: pct(overall.firstTryRate) })}</p>
            </>
          ) : (
            <p className="pf-hero__wait">{fill(p.notYet, { n: Math.max(1, MIN_ANSWERS - insights.answered) })}</p>
          )}
        </section>

        {skills.length > 0 && (
          <section className="lg-section">
            <h2 className="lg-heading">{p.skillsTitle}</h2>
            <ul className="pf-skills">
              {skills.map((s) => (
                <li key={s.id} className="pf-skill">
                  <span className="pf-skill__name">{p.skills[s.id] || s.id}</span>
                  {s.level ? (
                    <>
                      <LevelMeter level={s.level} label={levelLabel(s.level)} />
                      <span className="lg-caption pf-skill__level">{levelLabel(s.level)}</span>
                    </>
                  ) : (
                    <span className="lg-caption pf-skill__level">{p.skillMore}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {overall && (
          <div className="pf-columns">
            <section className="lg-section">
              <h2 className="lg-heading">{p.goingWellTitle}</h2>
              {goingWell.length ? <ul className="pf-list">{goingWell.map(itemRow)}</ul> : <p className="lg-caption">{p.goingWellEmpty}</p>}
            </section>
            <section className="lg-section">
              <h2 className="lg-heading">{p.practiseTitle}</h2>
              {toPractise.length ? <ul className="pf-list">{toPractise.map(itemRow)}</ul> : <p className="lg-caption">{p.practiseEmpty}</p>}
            </section>
          </div>
        )}

        {overall && (
          <section className="lg-section pf-focus">
            <h2 className="lg-heading">{p.focusTitle}</h2>
            {suggestedFocus.length ? (
              <>
                <p>{p.suggestedFocus}</p>
                <div className="lg-chips">
                  {suggestedFocus.map((c) => <span key={c} className="lg-chip lg-chip--on pf-chip">{categoryLabel(c, lang)}</span>)}
                </div>
                <button type="button" className="lg-btn lg-btn--secondary" onClick={() => apply({ focus: suggestedFocus })}>{p.useFocus}</button>
              </>
            ) : (
              <p className="lg-caption">{p.noSuggestedFocus}</p>
            )}
            {suggestedDifficulty && (
              <>
                <p>{fill(p.suggestedDifficulty, { level: t.difficulty[suggestedDifficulty] })}</p>
                <button type="button" className="lg-btn lg-btn--secondary" onClick={() => apply({ difficulty: suggestedDifficulty })}>{p.useDifficulty}</button>
              </>
            )}
            <p className="lg-caption" role="status">
              {saved ? `${p.saved} ` : ""}
              {fill(p.yourChoice, { focus: focusNow, difficulty: t.difficulty[prefs.difficulty] })}
            </p>
            <Link to="/preferences" className="lg-btn lg-btn--quiet">{t.preferencesTitle}</Link>
          </section>
        )}

        <section className="lg-section">
          <h2 className="lg-heading">{p.weekTitle}</h2>
          <WeekChart days={insights.days} p={p} lang={lang} />
        </section>

        <section className="lg-section">
          <h2 className="lg-heading">{p.wordsTitle}</h2>
          <dl className="pg-stats">
            <div><dt>{p.wordsKnown}</dt><dd>{words.known}</dd></div>
            <div><dt>{p.wordsPractising}</dt><dd>{words.practising}</dd></div>
            <div><dt>{p.wordsTricky}</dt><dd>{words.tricky}</dd></div>
          </dl>
        </section>

        {topics.length > 0 && (
          <section className="lg-section">
            <h2 className="lg-heading">{p.topicsTitle}</h2>
            <ul className="pf-topics">
              {topics.map((tp) => (
                <li key={tp.id} className="pf-topic">
                  <span className="pf-topic__name">{categoryLabel(tp.id, lang)}</span>
                  <span className="pf-topic__track" aria-hidden="true"><span className="pf-topic__fill" style={{ width: `${pct(tp.score)}%` }} /></span>
                  <span className="lg-caption">{fill(p.topicWords, { n: tp.n })} · {pct(tp.score)}%</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {insights.games.length > 0 && (
          <section className="lg-section">
            <h2 className="lg-heading">{p.gamesTitle}</h2>
            <StatTable rows={insights.games} nameOf={gameName} p={p} />
          </section>
        )}

        {insights.lessons.length > 0 && (
          <section className="lg-section">
            <h2 className="lg-heading">{p.lessonsTitle}</h2>
            <StatTable rows={insights.lessons} nameOf={lessonName} p={p} />
          </section>
        )}

        <Link to="/quick" className="lg-btn lg-btn--primary lg-btn--hero">{t.quick.name}</Link>
      </main>
    </GameScreen>
  );
}
