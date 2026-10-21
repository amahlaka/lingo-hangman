import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { GameScreen } from "../components/lingo";
import { api, backendAvailable } from "../lib/backend";
import { spokenTextOf } from "../lib/reportSpeech";

// /admin/reports: the queue of problem reports and content suggestions from
// learners (server/src/routes/admin.js). Needs an admin account (ADMIN_EMAILS
// on the server) signed in within the last day. Reports are grouped by
// question; "Open in editor" jumps to the item in the word bank editor. Like
// /admin, it is in English only and not linked from the games.

const REASONS = { misheard: "Heard wrong (Say it)", wrong_answer: "Wrong answer", typo: "Typo", bad_audio: "Bad audio", confusing: "Confusing", other: "Something else" };
export const GATES = {
  unavailable: "The backend can't be reached.",
  signed_out: "Sign in with an admin account first.",
  not_admin: "This account isn't an admin. Add its email to ADMIN_EMAILS on the server.",
  sign_in_again: "Sign in again: admin pages need a sign-in from the last day.",
};

// The gate's button: the Account page signs in (again, when the sign-in is
// over a day old) and comes back to this page.
export function GateSignIn({ gate }) {
  const { pathname } = useLocation();
  if (!GATES[gate] || gate === "unavailable" || gate === "not_admin") return null;
  const again = gate === "sign_in_again";
  return (
    <Link className="lg-btn lg-btn--primary" to={`/account?next=${encodeURIComponent(pathname)}${again ? "&again=1" : ""}`}>
      {again ? "Sign in again" : "Sign in"}
    </Link>
  );
}

const when = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Where "Open in editor" goes for a report's item.
export function editorLink(itemRef) {
  if (itemRef.startsWith("answer:")) return `/admin?q=${encodeURIComponent(itemRef.slice(7))}`;
  // Sound questions are "<lesson id>:<word>".
  return `/admin?item=${encodeURIComponent(itemRef.split(":")[0])}`;
}

export function suggestionLink(s) {
  const q = new URLSearchParams({ new: "word" });
  if (s.text) q.set("en", s.text);
  if (s.meaning) q.set("fi", s.meaning);
  return `/admin?${q}`;
}

// Kept here too for the pages and tests that import it from this file.
export { spokenTextOf };

const REMAKE_ERRORS = {
  not_word_base: "That text isn't in the word base, so it has no recorded clip.",
  clips_unavailable: "Recorded clips can't be changed on this server (CLIP_DIR and CONTENT_DIR).",
};

// "Remake the clip": for bad audio, the recorded clip of the text leaves the
// live site and the next Content publish makes it again.
function RemakeClip({ initial }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState(null);
  const remake = async () => {
    setState({ busy: true });
    const res = await api("/admin/clips/remake", { method: "POST", body: { text } });
    setState(res.ok ? { done: res.data.keys.length } : { error: REMAKE_ERRORS[res.data?.error] || "Couldn't remake it." });
  };
  return (
    <div className="fb-remake">
      <label className="lg-caption">
        Spoken text <input className="lg-input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      <button type="button" className="lg-btn lg-btn--secondary" disabled={!text.trim() || state?.busy || state?.done} onClick={remake}>
        Remake the clip
      </button>
      {state?.done && <p className="lg-caption">Taken off the live site. The next Content publish (or a run with force) makes it again; until then the app reads it another way.</p>}
      {state?.error && <p className="lg-caption">{state.error}</p>}
    </div>
  );
}

function ReportGroup({ group, status, onStatus, busy }) {
  const badAudio = group.reports.find((r) => r.reason === "bad_audio");
  const ids = group.reports.map((r) => r.id);
  const reasons = Object.entries(
    group.reports.reduce((acc, r) => ({ ...acc, [r.reason]: (acc[r.reason] || 0) + 1 }), {})
  ).map(([r, n]) => `${REASONS[r] || r}${n > 1 ? ` ×${n}` : ""}`);
  return (
    <li className="fb-group">
      <div className="fb-group__head">
        <span className="fb-group__title">{group.itemRef.replace(/^answer:/, "")}</span>
        <span className="lg-caption">{group.game} · {group.count} {group.count === 1 ? "report" : "reports"} · {reasons.join(", ")}</span>
      </div>
      {group.reports.map((r) => (
        <div key={r.id} className="fb-report">
          <strong>{REASONS[r.reason] || r.reason}</strong> · <span className="lg-caption">{when(r.createdAt)}</span>
          {r.comment && <p className="fb-report__comment">{r.comment}</p>}
          <details>
            <summary className="lg-caption">What was on screen</summary>
            <pre className="fb-context">{JSON.stringify(r.context, null, 2)}</pre>
          </details>
        </div>
      ))}
      {badAudio && status === "open" && <RemakeClip initial={spokenTextOf(badAudio.context)} />}
      {badAudio && status === "open" && <Link className="lg-btn lg-btn--quiet" to={`/admin/clips?q=${encodeURIComponent(spokenTextOf(badAudio.context))}`}>Edit the clip in Recordings</Link>}
      <div className="lg-row">
        <Link className="lg-btn lg-btn--secondary" to={editorLink(group.itemRef)}>Open in editor</Link>
        {status === "open" ? (
          <>
            <button type="button" className="lg-btn lg-btn--secondary" disabled={busy} onClick={() => onStatus(ids, "fixed")}>Mark fixed</button>
            <button type="button" className="lg-btn lg-btn--quiet" disabled={busy} onClick={() => onStatus(ids, "dismissed")}>Dismiss</button>
          </>
        ) : (
          <button type="button" className="lg-btn lg-btn--quiet" disabled={busy} onClick={() => onStatus(ids, "open")}>Reopen</button>
        )}
      </div>
    </li>
  );
}

// The learner may only have known the Finnish: then the Finnish is the
// title and a badge says the English is still to be found.
function SuggestionItem({ s, status, onStatus, busy }) {
  const finnishOnly = !s.text;
  return (
    <li className="fb-group">
      <div className="fb-group__head">
        <span className="fb-group__title" lang={finnishOnly ? "fi" : "en"}>{finnishOnly ? s.meaning : s.text}</span>
        <span className="lg-caption">{s.kind} · {when(s.createdAt)}</span>
      </div>
      <p className="fb-langs">
        {finnishOnly ? (
          <span className="fb-lang fb-lang--fi">Finnish only · find the English</span>
        ) : (
          <span className="fb-lang">{s.meaning ? "English + Finnish" : "English only"}</span>
        )}
      </p>
      {!finnishOnly && s.meaning && <p className="fb-report" lang="fi">{s.meaning}</p>}
      {s.note && <p className="fb-report">{s.note}</p>}
      <div className="lg-row">
        <Link className="lg-btn lg-btn--secondary" to={suggestionLink(s)}>Add in editor</Link>
        {status === "open" ? (
          <>
            <button type="button" className="lg-btn lg-btn--secondary" disabled={busy} onClick={() => onStatus([s.id], "accepted")}>Mark added</button>
            <button type="button" className="lg-btn lg-btn--quiet" disabled={busy} onClick={() => onStatus([s.id], "dismissed")}>Dismiss</button>
          </>
        ) : (
          <button type="button" className="lg-btn lg-btn--quiet" disabled={busy} onClick={() => onStatus([s.id], "open")}>Reopen</button>
        )}
      </div>
    </li>
  );
}

export default function AdminReports() {
  const [tab, setTab] = useState("reports");
  const [status, setStatus] = useState("open");
  const [gate, setGate] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!(await backendAvailable())) return setGate("unavailable");
    const res = await api(tab === "reports" ? `/admin/reports?status=${status}` : `/admin/suggestions?status=${status}`);
    if (!res.ok) return setGate(res.data?.error in GATES ? res.data.error : res.status === 0 ? "unavailable" : "signed_out");
    setGate(null);
    setData({ ...res.data, tab, status });
  }, [tab, status]);

  useEffect(() => {
    load();
  }, [load]);
  // What was loaded for the chips now on, or null while loading.
  const shown = data && data.tab === tab && data.status === status ? data : null;

  const changeStatus = async (ids, next) => {
    setBusy(true);
    await api(`/admin/${tab}/status`, { method: "POST", body: { ids, status: next } });
    setBusy(false);
    load();
  };

  const statuses = tab === "reports" ? ["open", "fixed", "dismissed"] : ["open", "accepted", "dismissed"];
  const chip = (value, current, set, label) => (
    <button key={value} type="button" className={`lg-chip ${current === value ? "lg-chip--on" : ""}`} aria-pressed={current === value} onClick={() => set(value)}>
      {label}
    </button>
  );

  return (
    <GameScreen title="Reports">
      <main className="lg-board lg-page">
        <p className="lg-body-lg">
          Problems and suggestions learners sent. Fix content in the <Link to="/admin">word bank editor</Link>, then mark it fixed here; the learner sees it under Account. Speech limits are under <Link to="/admin/users">users</Link>, numbers under <Link to="/admin/stats">statistics</Link>, recorded clips under <Link to="/admin/clips">recordings</Link>.
        </p>
        {gate ? (
          <section className="lg-section">
            <p>{GATES[gate]}</p>
            <GateSignIn gate={gate} />
          </section>
        ) : (
          <>
            <div className="lg-chips">
              {chip("reports", tab, (v) => { setTab(v); setStatus("open"); }, "Reports")}
              {chip("suggestions", tab, (v) => { setTab(v); setStatus("open"); }, "Suggestions")}
            </div>
            <div className="lg-chips">
              {statuses.map((s) => chip(s, status, setStatus, s[0].toUpperCase() + s.slice(1)))}
            </div>
            {!shown && <p className="lg-caption">Loading…</p>}
            {shown && tab === "reports" && (
              shown.groups.length === 0 ? <p className="lg-caption">Nothing here.</p> : (
                <ul className="ac-list">
                  {shown.groups.map((g) => <ReportGroup key={`${g.game}:${g.itemRef}`} group={g} status={status} onStatus={changeStatus} busy={busy} />)}
                </ul>
              )
            )}
            {shown && tab === "suggestions" && (
              shown.suggestions.length === 0 ? <p className="lg-caption">Nothing here.</p> : (
                <ul className="ac-list">
                  {shown.suggestions.map((s) => <SuggestionItem key={s.id} s={s} status={status} onStatus={changeStatus} busy={busy} />)}
                </ul>
              )
            )}
          </>
        )}
      </main>
    </GameScreen>
  );
}
