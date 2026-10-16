import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { useProgress } from "./ProgressContext";
import { Feedback, GameScreen } from "../components/lingo";
import { fill } from "../i18n";
import { api, backendAvailable } from "../lib/backend";

// Weekly leaderboards (docs/backend.md, "Leaderboards"): opt-in, under a
// random nickname, ranked by XP earned this week among learners of a similar
// level. The section under Account, and the board's own page.

const errorText = (t, code) => t.board.errors[code] || t.account.errors[code] || t.account.errors.other;

const weekText = (week, lang, b) => {
  const fmt = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === "fi" ? "fi-FI" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return fill(b.week, { start: fmt(week.start), end: fmt(week.end) });
};

// The board from the API, with join, rename and leave.
function useBoard() {
  const { t } = useSettings();
  const { sync } = useProgress();
  const [board, setBoard] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | signed_out | unavailable
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!(await backendAvailable())) return live && setState("unavailable");
      // Send this device's latest answers first, so this week's XP is current.
      await sync.flush?.();
      const res = await api("/leaderboard");
      if (!live) return;
      if (res.status === 401) return setState("signed_out");
      if (!res.ok) return setState("unavailable");
      setBoard(res.data);
      setState("ready");
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(
    async (path, method) => {
      setBusy(true);
      setError(null);
      const res = await api(path, { method });
      setBusy(false);
      if (res.ok) setBoard(res.data);
      else setError(errorText(t, res.data?.error || "offline"));
    },
    [t]
  );

  return {
    board,
    state,
    busy,
    error,
    join: () => run("/leaderboard/join", "POST"),
    rename: () => run("/leaderboard/nickname", "POST"),
    leave: () => run("/leaderboard/join", "DELETE"),
  };
}

function Row({ entry, b }) {
  return (
    <li className={`lb-row${entry.me ? " lb-row--me" : ""}`} aria-current={entry.me ? "true" : undefined}>
      <span className="lb-row__rank">{entry.rank}</span>
      <span className="lb-row__name">{entry.me ? fill(b.you, { name: entry.nickname }) : entry.nickname}</span>
      <span className="lb-row__xp">{fill(b.xp, { n: entry.xp })}</span>
    </li>
  );
}

// Under Settings > Account, for signed-in learners.
export function LeaderboardSection() {
  const { t } = useSettings();
  const b = t.board;
  const { board, state, busy, error, join, rename, leave } = useBoard();
  if (state !== "ready") return null;
  return (
    <section className="lg-section" id="leaderboard">
      <h2 className="lg-heading">{b.title}</h2>
      <p className="lg-caption">{b.intro}</p>
      {board.joined ? (
        <>
          <p>{fill(b.nicknameIs, { name: board.nickname })}</p>
          <div className="lg-row">
            <Link to="/leaderboard" className="lg-btn lg-btn--primary">{b.see}</Link>
            <button type="button" className="lg-btn lg-btn--secondary" onClick={rename} disabled={busy}>{b.rename}</button>
            <button type="button" className="lg-btn lg-btn--quiet" onClick={leave} disabled={busy}>{b.leave}</button>
          </div>
          <p className="lg-caption">{b.leaveNote}</p>
        </>
      ) : (
        <button type="button" className="lg-btn lg-btn--secondary" onClick={join} disabled={busy}>{b.join}</button>
      )}
      {error && <Feedback variant="error" icon="!" title={error} />}
    </section>
  );
}

// /leaderboard
export default function Leaderboard() {
  const { t, lang } = useSettings();
  const b = t.board;
  const { board, state, busy, error, join, rename, leave } = useBoard();

  let body;
  if (state === "loading") body = <p className="lg-caption">{b.loading}</p>;
  else if (state === "unavailable") body = <p>{b.unavailable}</p>;
  else if (state === "signed_out") {
    body = (
      <>
        <p>{b.signedOut}</p>
        <Link to="/account" className="lg-btn lg-btn--primary">{b.signIn}</Link>
      </>
    );
  } else if (!board.joined) {
    body = (
      <>
        <p>{b.intro}</p>
        <p className="lg-caption">{b.joinNote}</p>
        <button type="button" className="lg-btn lg-btn--primary lg-btn--hero" onClick={join} disabled={busy}>{b.join}</button>
      </>
    );
  } else {
    const gap = board.around.length > 0;
    body = (
      <>
        <p className="lg-caption">{weekText(board.week, lang, b)}</p>
        <div className="lb-me">
          <Trophy size={28} strokeWidth={2} aria-hidden="true" />
          <p className="lg-body-lg">
            {board.rank ? fill(b.place, { rank: board.rank, xp: board.xp }) : b.notYet}
          </p>
        </div>
        {board.top.length === 0 ? (
          <p className="lg-caption">{b.empty}</p>
        ) : (
          <ol className="lb-list" aria-label={b.title}>
            {board.top.map((e) => <Row key={e.nickname} entry={e} b={b} />)}
            {gap && <li className="lb-gap" aria-hidden="true">⋯</li>}
            {board.around.map((e) => <Row key={e.nickname} entry={e} b={b} />)}
          </ol>
        )}
        <p className="lg-caption">{b.similar}</p>
        <div className="lg-row">
          <button type="button" className="lg-btn lg-btn--secondary" onClick={rename} disabled={busy}>{b.rename}</button>
          <button type="button" className="lg-btn lg-btn--quiet" onClick={leave} disabled={busy}>{b.leave}</button>
        </div>
      </>
    );
  }

  return (
    <GameScreen title={b.title}>
      <main className="lg-board lg-page">
        <section className="lg-section lg-stack">
          {body}
          {error && <Feedback variant="error" icon="!" title={error} />}
        </section>
      </main>
    </GameScreen>
  );
}
