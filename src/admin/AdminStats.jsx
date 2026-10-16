import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GameScreen } from "../components/lingo";
import { api, backendAvailable } from "../lib/backend";
import { GAMES } from "../games/registry";
import { GATES } from "./AdminReports";

// /admin/stats: numbers over all learners (server/src/stats/aggregate.js),
// never about one learner. English only, like the other admin pages.

const pct = (share) => `${Math.round(share * 100)}%`;
const secs = (ms) => (ms ? `${(ms / 1000).toFixed(1)} s` : "–");
const gameName = (id) => GAMES.find((g) => g.id === id)?.name || id;
const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Tile({ label, value }) {
  return (
    <div className="st-tile">
      <span className="st-tile__value">{value}</span>
      <span className="lg-caption">{label}</span>
    </div>
  );
}

// Learners per day: one series, bars from the baseline, a value on hover and
// in the table below.
function DailyBars({ days }) {
  const max = Math.max(1, ...days.map((d) => d.learners));
  return (
    <figure className="st-chart" aria-label="Learners per day">
      <div className="st-bars">
        {days.map((d) => (
          <div key={d.day} className="st-bar" title={`${shortDay(d.day)}: ${d.learners} learners, ${d.answers} answers`}>
            <span className="st-bar__fill" style={{ height: `${(d.learners / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <figcaption className="st-axis lg-caption">
        <span>{shortDay(days[0].day)}</span>
        <span>most: {max}</span>
        <span>{shortDay(days[days.length - 1].day)}</span>
      </figcaption>
    </figure>
  );
}

function WordTable({ title, caption, rows }) {
  return (
    <section className="lg-section">
      <h2 className="lg-heading">{title}</h2>
      <p className="lg-caption">{caption}</p>
      {rows.length === 0 ? (
        <p className="lg-caption">Not enough answers yet.</p>
      ) : (
        <div className="st-scroll">
          <table className="st-table">
            <thead>
              <tr><th>Word</th><th>Answers</th><th>Learners</th><th>First try</th><th>Median time</th></tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.key}>
                  <td>{w.word}</td><td>{w.n}</td><td>{w.learners}</td><td>{pct(w.firstTry)}</td><td>{secs(w.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminStats() {
  const [gate, setGate] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      if (!(await backendAvailable())) return setGate("unavailable");
      const res = await api("/admin/stats");
      if (!res.ok) return setGate(res.data?.error in GATES ? res.data.error : res.status === 0 ? "unavailable" : "signed_out");
      setData(res.data);
    })();
  }, []);

  const days = data?.days || [];
  return (
    <GameScreen title="Statistics">
      <main className="lg-board lg-page">
        <p className="lg-body-lg">
          How learners with an account are doing, all together. Words show only after {data?.rules.minAnswers ?? 5} answers from {data?.rules.minLearners ?? 3} different
          learners. See also <Link to="/admin/reports">reports</Link> and <Link to="/admin/users">users</Link>.
        </p>
        {gate ? (
          <section className="lg-section">
            <p>{GATES[gate]}</p>
            {gate !== "unavailable" && gate !== "not_admin" && <Link className="lg-btn lg-btn--primary" to="/account">Sign in</Link>}
          </section>
        ) : !data ? (
          <p className="lg-caption">Loading…</p>
        ) : (
          <>
            <section className="lg-section">
              <div className="st-tiles">
                <Tile label="accounts" value={data.totals.accounts} />
                <Tile label="played this week" value={data.totals.activeWeek} />
                <Tile label="with reminders" value={data.totals.reminders} />
                <Tile label="open reports" value={data.totals.openReports} />
              </div>
              <p className="lg-caption">
                {data.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleString("en-GB")}; recounted every few hours.` : "Not counted yet; the first count runs shortly after the server starts."}
              </p>
            </section>

            {days.length > 0 && (
              <section className="lg-section">
                <h2 className="lg-heading">Learners per day</h2>
                <DailyBars days={days} />
                <details className="lg-details">
                  <summary>As a table</summary>
                  <div className="st-scroll">
                    <table className="st-table">
                      <thead>
                        <tr><th>Day</th><th>Learners</th><th>Answers</th><th>First try</th><th>New accounts</th></tr>
                      </thead>
                      <tbody>
                        {[...days].reverse().map((d) => (
                          <tr key={d.day}>
                            <td>{shortDay(d.day)}</td><td>{d.learners}</td><td>{d.answers}</td><td>{d.answers ? pct(d.firstTry / d.answers) : "–"}</td><td>{d.accounts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
            )}

            <section className="lg-section">
              <h2 className="lg-heading">Games</h2>
              <p className="lg-caption">The last 90 days.</p>
              {data.games.length === 0 ? (
                <p className="lg-caption">No answers yet.</p>
              ) : (
                <div className="st-scroll">
                  <table className="st-table">
                    <thead>
                      <tr><th>Game</th><th>Answers</th><th>First try</th><th>Median time</th></tr>
                    </thead>
                    <tbody>
                      {data.games.map((g) => (
                        <tr key={g.id}><td>{gameName(g.id)}</td><td>{g.answers}</td><td>{pct(g.firstTry)}</td><td>{secs(g.ms)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <WordTable title="Most often missed" caption="Lowest share right on the first try. Worth a look in the editor: a confusing question or a missing meaning?" rows={data.words.hardest} />
            <WordTable title="Slowest" caption="Longest median answer time." rows={data.words.slowest} />
          </>
        )}
      </main>
    </GameScreen>
  );
}
