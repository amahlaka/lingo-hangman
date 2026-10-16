import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GameScreen } from "../components/lingo";
import { api, backendAvailable } from "../lib/backend";
import { GAMES } from "../games/registry";
import { GATES } from "./AdminReports";

// /admin/users/:id: one learner's own progress and account details, from
// their synced progress (server/src/routes/admin.js). Read only. English
// only, like the other admin pages.

const pct = (share) => `${Math.round(share * 100)}%`;
const secs = (ms) => (ms ? `${(ms / 1000).toFixed(1)} s` : "–");
const gameName = (id) => GAMES.find((g) => g.id === id)?.name || id;
const date = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");
const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function Tile({ label, value }) {
  return (
    <div className="st-tile">
      <span className="st-tile__value">{value}</span>
      <span className="lg-caption">{label}</span>
    </div>
  );
}

function Table({ head, rows }) {
  return (
    <div className="st-scroll">
      <table className="st-table">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminLearner() {
  const { id } = useParams();
  const [gate, setGate] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      if (!(await backendAvailable())) return setGate("unavailable");
      const res = await api(`/admin/users/${encodeURIComponent(id)}`);
      if (res.status === 404) return setGate("not_found");
      if (!res.ok) return setGate(res.data?.error in GATES ? res.data.error : res.status === 0 ? "unavailable" : "signed_out");
      setData(res.data);
    })();
  }, [id]);

  const p = data?.progress;
  return (
    <GameScreen title={data ? data.user.email : "Learner"}>
      <main className="lg-board lg-page">
        <p className="lg-caption"><Link to="/admin/users">All users</Link> · <Link to="/admin/stats">Statistics</Link></p>
        {gate ? (
          <section className="lg-section">
            <p>{gate === "not_found" ? "No such account." : GATES[gate]}</p>
            {GATES[gate] && gate !== "unavailable" && gate !== "not_admin" && <Link className="lg-btn lg-btn--primary" to="/account">Sign in</Link>}
          </section>
        ) : !data ? (
          <p className="lg-caption">Loading…</p>
        ) : (
          <>
            <section className="lg-section">
              <p className="lg-body-lg">{data.user.email}</p>
              <p className="lg-caption">
                {data.user.role === "learner" ? "Learner" : data.user.role === "verified" ? "Verified" : "Admin"} · app in {data.user.language === "fi" ? "Finnish" : "English"} · joined {date(data.user.createdAt)} · last played {date(data.user.lastAnswerAt)}
              </p>
              <p className="lg-caption">
                Reminders: {data.reminders?.enabled ? `on at ${data.reminders.time} (${data.reminders.timeZone})` : "off"} · {data.speechToday} spoken today · {data.reports} reports, {data.suggestions} suggestions
              </p>
            </section>

            {!p ? (
              <section className="lg-section"><p className="lg-caption">No synced progress yet.</p></section>
            ) : (
              <>
                <section className="lg-section">
                  <div className="st-tiles">
                    <Tile label={`level, ${p.toNext} XP to next`} value={p.level} />
                    <Tile label="words practiced" value={p.words} />
                    <Tile label="words learned" value={p.learned} />
                    <Tile label={`day streak (best ${p.streakBest})`} value={p.streak.current} />
                    <Tile label={`first try of ${p.totals.words}`} value={p.totals.words ? pct(p.totals.perfect / p.totals.words) : "–"} />
                    <Tile label={`daily goal · ${p.gems} gems`} value={p.dailyGoal} />
                  </div>
                </section>

                <section className="lg-section">
                  <h2 className="lg-heading">Recent days</h2>
                  {p.days.length === 0 ? (
                    <p className="lg-caption">Nothing played yet.</p>
                  ) : (
                    <Table
                      head={["Day", "Words", "Right", "First try", "Goal"]}
                      rows={p.days.map((d) => [shortDay(d.day), d.words, d.solved, d.words ? pct(d.firstTry / d.words) : "–", d.goalMet ? "✓" : ""])}
                    />
                  )}
                </section>

                <section className="lg-section">
                  <h2 className="lg-heading">Games</h2>
                  {p.games.length === 0 ? (
                    <p className="lg-caption">No timed answers yet.</p>
                  ) : (
                    <Table head={["Game", "Answers", "First try", "Average time"]} rows={p.games.map((g) => [gameName(g.id), g.n, pct(g.firstTryRate), secs(g.meanMs)])} />
                  )}
                </section>

                <section className="lg-section">
                  <h2 className="lg-heading">Most missed words</h2>
                  <p className="lg-caption">Of {p.wordCount} words practiced. Recent: newest last; 2 quick first try, 1 slow or second try, 0 missed.</p>
                  {p.missed.length === 0 ? (
                    <p className="lg-caption">Nothing missed yet.</p>
                  ) : (
                    <Table head={["Word", "Missed", "Right", "Recent", "Average time", "Last"]} rows={p.missed.map((w) => [w.word, w.lost, w.solved, w.recent || "–", secs(w.ms), w.last ? shortDay(w.last) : "–"])} />
                  )}
                </section>
              </>
            )}

            <section className="lg-section">
              <h2 className="lg-heading">Devices</h2>
              <Table head={["Device", "Last used"]} rows={data.devices.map((d) => [d.device, date(d.lastSeenAt)])} />
            </section>
          </>
        )}
      </main>
    </GameScreen>
  );
}
