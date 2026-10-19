import React, { useState } from "react";
import { GAMES } from "../games/registry";
import { api } from "../lib/backend";

// The play part of /admin/stats (server/src/stats/play.js): visits and games
// started by everyone, and play sessions and unfinished rounds of learners
// with an account. English only, like the other admin pages.

const pct = (share) => `${Math.round(share * 100)}%`;
const gameName = (id) => GAMES.find((g) => g.id === id)?.name || id;
const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function duration(ms) {
  if (ms == null) return "–";
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

export const GIVE_UP_LABELS = {
  before_first: ["Left before answering", "Opened the game and left without an answer (after 5 s or more)."],
  stuck: ["Stuck on a question", "A minute or more without answering, then left."],
  many_wrong: ["Several wrong answers", "2 of the last 3 answers were wrong."],
  after_wrong: ["Right after a wrong answer", "The last answer was wrong."],
  after_skip: ["Right after skipping", "The last question was skipped."],
  mid_round: ["Midway, doing fine", "The last answer was right; left before the end screen."],
};

function Tile({ label, value }) {
  return (
    <div className="st-tile">
      <span className="st-tile__value">{value}</span>
      <span className="lg-caption">{label}</span>
    </div>
  );
}

// One series of bars from the baseline; each bar's value on hover.
function Bars({ label, items, first, last }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <figure className="st-chart" aria-label={label}>
      <div className="st-bars">
        {items.map((i) => (
          <div key={i.key} className="st-bar" title={i.title}>
            <span className="st-bar__fill" style={{ height: `${(i.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <figcaption className="st-axis lg-caption">
        <span>{first}</span>
        <span>most: {max}</span>
        <span>{last}</span>
      </figcaption>
    </figure>
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
          {rows.map(([key, ...cells]) => (
            <tr key={key}>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Hours whose visits and games are left out of the numbers (a security scan,
// test traffic). The counts are kept; removing a range brings them back.
function LeftOut({ play, onChange }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const when = (iso) =>
    new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: play.zone });
  const ranges = play.leftOut || [];

  const add = async (e) => {
    e.preventDefault();
    const start = new Date(from).getTime();
    // "15:00 to 17:00" leaves out the 15 and 16 o'clock hours.
    const end = Math.max(start, new Date(to).getTime() - 60_000);
    setBusy(true);
    const res = await api("/admin/play/left-out", {
      method: "POST",
      body: { from: new Date(start).toISOString(), to: new Date(end).toISOString(), note: note.trim() },
    });
    setBusy(false);
    setError(!res.ok);
    if (res.ok) {
      setFrom("");
      setTo("");
      setNote("");
    }
    onChange?.();
  };

  const remove = async (id) => {
    setBusy(true);
    await api("/admin/play/left-out/remove", { method: "POST", body: { id } });
    setBusy(false);
    onChange?.();
  };

  return (
    <details className="lg-details" open={ranges.length > 0 || undefined}>
      <summary>Left out of these numbers{ranges.length > 0 ? ` (${ranges.length})` : ""}</summary>
      <p className="lg-caption">
        Hours of visits and games that would mislead, like a security scan or your own testing. Browsers run by a program and known scanners
        are not counted at all.
      </p>
      {ranges.length > 0 && (
        <Table
          head={["From", "To", "Why", ""]}
          rows={ranges.map((r) => [
            r.id,
            when(r.from),
            when(r.to),
            r.note || "–",
            <button key="remove" type="button" className="lg-btn lg-btn--quiet" disabled={busy} onClick={() => remove(r.id)}>
              Count again
            </button>,
          ])}
        />
      )}
      <form className="lg-row" onSubmit={add}>
        <input className="lg-input" type="datetime-local" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="lg-input" type="datetime-local" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        <input className="lg-input" aria-label="Why" placeholder="Why, like Security scan" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="submit" className="lg-btn lg-btn--secondary" disabled={busy || !from || !to}>Leave out</button>
      </form>
      {error && <p className="lg-caption">That didn't work: check the times (To after From, at most 90 days).</p>}
    </details>
  );
}

function Visits({ play, onChange }) {
  const time = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: play.zone });
  const when = (iso) => `${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: play.zone })} ${time(iso)}`;
  const hours = play.recentHours;
  const total = hours.reduce((a, h) => a + h.visits, 0);
  const daily = play.daily;
  return (
    <section className="lg-section">
      <h2 className="lg-heading">Visits</h2>
      <p className="lg-caption">
        Everyone, with or without an account: the app opened in a browser tab, once per tab. Finnish time. Only counts are kept, nothing about who.
      </p>
      <LeftOut play={play} onChange={onChange} />
      <h3 className="lg-heading">Per hour, last 48 hours</h3>
      <Bars
        label="Visits per hour"
        items={hours.map((h) => ({ key: h.hour, value: h.visits, title: `${when(h.hour)}: ${h.leftOut ? "left out" : `${h.visits} visits`}` }))}
        first={when(hours[0].hour)}
        last={`${time(hours.at(-1).hour)} (${total} in all)`}
      />
      <h3 className="lg-heading">Busiest hours of the day</h3>
      <p className="lg-caption">Visits in each hour of the day over the last {play.days} days.</p>
      <Bars
        label="Visits by hour of the day"
        items={play.hourOfDay.map((n, h) => ({ key: h, value: n, title: `${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59: ${n} visits` }))}
        first="00:00"
        last="23:00"
      />
      {daily.length > 0 && (
        <>
          <h3 className="lg-heading">Games played per day without an account</h3>
          <p className="lg-caption">A game counts when its first question is answered; playing again counts again.</p>
          <Bars
            label="Games played per day without an account"
            items={daily.map((d) => ({ key: d.day, value: d.gamesAnon, title: `${shortDay(d.day)}: ${d.gamesAnon} games without an account, ${d.gamesAccount} with` }))}
            first={shortDay(daily[0].day)}
            last={shortDay(daily.at(-1).day)}
          />
          <details className="lg-details">
            <summary>As a table</summary>
            <Table
              head={["Day", "Visits", "Games, no account", "Games, account"]}
              rows={[...daily].reverse().map((d) => [d.day, shortDay(d.day), d.visits, d.gamesAnon, d.gamesAccount])}
            />
          </details>
        </>
      )}
    </section>
  );
}

function Popular({ play }) {
  return (
    <section className="lg-section">
      <h2 className="lg-heading">Most popular games</h2>
      <p className="lg-caption">Games played by everyone in the last {play.days} days. Quick play counts as its own game here.</p>
      {play.popular.length === 0 ? (
        <p className="lg-caption">No games counted yet.</p>
      ) : (
        <Table
          head={["Game", "Played", "Without account", "With account"]}
          rows={play.popular.map((g) => [g.id, gameName(g.id), g.total, g.anon, g.account])}
        />
      )}
    </section>
  );
}

function Sessions({ play }) {
  const s = play.sessions;
  const days = play.daily.filter((d) => d.sessions > 0);
  return (
    <section className="lg-section">
      <h2 className="lg-heading">Play sessions</h2>
      <p className="lg-caption">
        Learners with an account, last {play.days} days. A session runs from the first game opened, through any games after it, until 30 minutes pass
        without play or the app is closed.
      </p>
      {s.count === 0 ? (
        <p className="lg-caption">No sessions yet.</p>
      ) : (
        <>
          <div className="st-tiles">
            <Tile label="sessions" value={s.count} />
            <Tile label="average length" value={duration(s.avgMs)} />
            <Tile label="median length" value={duration(s.medianMs)} />
            <Tile label="different games per session" value={s.avgGames} />
            <Tile label="sessions per learner on a day they play" value={s.perLearnerDay} />
          </div>
          <p className="lg-caption">{pct(s.oneGame)} of sessions stayed with one game. {s.learners} {s.learners === 1 ? "learner" : "learners"}.</p>
          <h3 className="lg-heading">Games in sessions</h3>
          <Table
            head={["Game", "In sessions", "Rounds", "Finished"]}
            rows={s.games.map((g) => [g.id, gameName(g.id), pct(g.share), g.rounds, g.finished])}
          />
          {days.length > 0 && (
            <details className="lg-details">
              <summary>Sessions per day</summary>
              <Table
                head={["Day", "Sessions", "Learners", "Per learner", "Average length"]}
                rows={[...days].reverse().map((d) => [d.day, shortDay(d.day), d.sessions, d.learners, (d.sessions / d.learners).toFixed(1), duration(d.avgMs)])}
              />
            </details>
          )}
        </>
      )}
    </section>
  );
}

function GiveUps({ play }) {
  const g = play.giveUps;
  const label = (reason) => GIVE_UP_LABELS[reason]?.[0] || reason;
  const top = (reasons) => {
    const best = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    return best ? label(best[0]) : "–";
  };
  return (
    <section className="lg-section">
      <h2 className="lg-heading">When learners give up</h2>
      <p className="lg-caption">
        Learners with an account, last {play.days} days: rounds left before the end screen, with a reason guessed from how the round was going.
      </p>
      {g.total === 0 ? (
        <p className="lg-caption">No unfinished rounds yet.</p>
      ) : (
        <>
          <Table
            head={["Reason", "Rounds", "Share", "What it means"]}
            rows={Object.entries(g.reasons)
              .filter(([, n]) => n > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, n]) => [reason, label(reason), n, pct(n / g.total), GIVE_UP_LABELS[reason]?.[1] || ""])}
          />
          <p className="lg-caption">
            {g.how.left} went to another page in the app; {g.how.closed} closed or left the app.
          </p>
          <h3 className="lg-heading">By game</h3>
          <Table
            head={["Game", "Rounds", "Finished", "Given up", "Most common reason"]}
            rows={g.games.map((x) => [x.id, gameName(x.id), x.rounds, x.finished, x.giveUps, top(x.reasons)])}
          />
        </>
      )}
    </section>
  );
}

export default function AdminPlayStats({ play, onChange }) {
  if (!play) return null;
  return (
    <>
      <Visits play={play} onChange={onChange} />
      <Popular play={play} />
      <Sessions play={play} />
      <GiveUps play={play} />
    </>
  );
}
