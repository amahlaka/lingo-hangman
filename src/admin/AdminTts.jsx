import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GameScreen } from "../components/lingo";
import { api, backendAvailable } from "../lib/backend";
import { GATES, GateSignIn } from "./AdminReports";

// /admin/tts: the Kokoro TTS service (server/src/lib/ttsService.js). Whether
// it answers, what is waiting for it now, the last requests, and counts per
// day. Reloads every few seconds while open. A learner's own on-demand texts
// are never shown, only word-base ones. English only, like the other admin
// pages.

const KINDS = { speech: "On-demand speech", clip: "Word-base clip", remake: "Make it again" };
const VOICES = { af_nova: "Nova", am_liam: "Liam" };
const POLL_MS = 3000;

const time = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
export const seconds = (ms) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
export const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

// What a request said: the word-base text, or that it was a learner's own.
export function jobLabel(job) {
  const what = job.label ? `“${job.label}”` : "A learner's sentence (not shown)";
  return `${what}${job.words ? " · word by word" : ""}`;
}

// Per day (newest first): all kinds summed, for the bars.
export function dayTotals(daily) {
  const days = new Map();
  for (const r of daily) {
    const d = days.get(r.day) || { day: r.day, ok: 0, failed: 0, ms: 0, kinds: {} };
    d.ok += r.ok;
    d.failed += r.failed;
    d.ms += r.avgMs * (r.ok + r.failed);
    d.kinds[r.kind] = r.ok + r.failed;
    days.set(r.day, d);
  }
  return [...days.values()].map((d) => ({ ...d, avgMs: d.ok + d.failed ? Math.round(d.ms / (d.ok + d.failed)) : 0 }));
}

function Status({ status, settings }) {
  if (!status.configured) return <p className="tt-status tt-status--off">Not set up: TTS_URL is empty, so the app uses recorded clips and the browser voice only.</p>;
  return (
    <div className={`tt-status ${status.reachable ? "tt-status--ok" : "tt-status--down"}`} role="status">
      <strong>{status.reachable ? "● Answering" : "● Not answering"}</strong>
      <span>
        {status.reachable ? `Health check ${seconds(status.ms)}${status.voices != null ? ` · ${status.voices} voices` : ""}` : status.error}
        {" · checked "}
        {time(status.checkedAt)}
      </span>
      <span className="lg-caption">
        Queue limit {settings.queueMax} · timeout {seconds(settings.timeoutMs)} · "Make it again" {settings.remakesOnServer ? "runs here" : "waits for Content publish"}
      </span>
    </div>
  );
}

function Queue({ jobs, remakes: all = [] }) {
  // The one being made now is already in the queue above.
  const remakes = all.filter((r) => !jobs.some((j) => j.kind === "remake" && j.label === r.text));
  if (!jobs.length && !remakes.length) return <p className="lg-caption">Nothing waiting.</p>;
  return (
    <>
    <ol className="tt-list">
      {jobs.map((j) => (
        <li key={j.id} className={`tt-job${j.state === "running" ? " tt-job--running" : ""}`}>
          <span className="tt-job__state">{j.state === "running" ? "Making" : "Waiting"}</span>
          <span className="tt-job__what">{jobLabel(j)}</span>
          <span className="lg-caption">
            {KINDS[j.kind] || j.kind} · {VOICES[j.voice] || j.voice} · since {time(j.startedAt || j.queuedAt)}
          </span>
        </li>
      ))}
    </ol>
    {remakes.length > 0 && (
      <div className="tt-remakes">
        <strong>Clips to make again ({remakes.length})</strong>
        <span className="lg-caption">Each is one request per voice, made in turn; it goes back on the live site when both are done.</span>
        <ul className="tt-remakes__list">
          {remakes.map((r) => (
            <li key={r.key}>{jobLabel({ label: r.text, words: r.words })}</li>
          ))}
        </ul>
      </div>
    )}
    </>
  );
}

function Recent({ recent }) {
  if (!recent.length) return <p className="lg-caption">No requests since the API last started.</p>;
  return (
    <div className="tt-table-wrap">
      <table className="tt-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>What</th>
            <th>Kind</th>
            <th>Voice</th>
            <th className="tt-num">Took</th>
            <th className="tt-num">Waited</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((r) => (
            <tr key={r.id}>
              <td>{time(r.at)}</td>
              <td className="tt-what">{jobLabel(r)}</td>
              <td>{KINDS[r.kind] || r.kind}</td>
              <td>{VOICES[r.voice] || r.voice}</td>
              <td className="tt-num">{seconds(r.ms)}</td>
              <td className="tt-num">{seconds(r.waitMs)}</td>
              <td>
                {r.ok ? "✓ Made" : `✕ ${r.error || "Failed"}`}
                {r.ok && r.framed === false ? " (edges not cut)" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Days({ daily, usage }) {
  const days = dayTotals(daily);
  const used = new Map(usage.map((u) => [u.day, u]));
  if (!days.length && !usage.length) return <p className="lg-caption">No requests in the last two weeks.</p>;
  const all = [...new Set([...days.map((d) => d.day), ...usage.map((u) => u.day)])].sort().reverse();
  const byDay = new Map(days.map((d) => [d.day, d]));
  const max = Math.max(1, ...days.map((d) => d.ok + d.failed));
  return (
    <div className="tt-table-wrap">
      <table className="tt-table tt-days">
        <thead>
          <tr>
            <th>Day</th>
            <th>Requests</th>
            <th className="tt-num">Failed</th>
            <th className="tt-num">Average</th>
            <th className="tt-num">Learners</th>
          </tr>
        </thead>
        <tbody>
          {all.map((d) => {
            const row = byDay.get(d) || { ok: 0, failed: 0, avgMs: 0, kinds: {} };
            const n = row.ok + row.failed;
            const kinds = Object.entries(row.kinds).map(([k, c]) => `${KINDS[k] || k}: ${c}`).join(", ");
            return (
              <tr key={d}>
                <td>{day(d)}</td>
                <td title={kinds || "No requests"}>
                  <span className="tt-bar">
                    <span className="tt-bar__fill" style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                  <span className="tt-bar__value">{n}</span>
                </td>
                <td className="tt-num">{row.failed || "–"}</td>
                <td className="tt-num">{n ? seconds(row.avgMs) : "–"}</td>
                <td className="tt-num" title="Learners who had new on-demand sentences made, and how many">
                  {used.get(d) ? `${used.get(d).learners} (${used.get(d).clips})` : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminTts() {
  const [gate, setGate] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!(await backendAvailable())) return setGate("unavailable");
    const res = await api("/admin/tts");
    if (!res.ok) return setGate(res.data?.error in GATES ? res.data.error : res.status === 0 ? "unavailable" : "signed_out");
    setGate(null);
    setData(res.data);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const today = data ? dayTotals(data.daily)[0] : null;
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <GameScreen title="Speech server">
      <main className="lg-board lg-page">
        <p className="lg-body-lg">
          The Kokoro voice server that makes on-demand speech, word-base clips and the clips you ask to be made again in <Link to="/admin/clips">recordings</Link>. Updates every few seconds. Learners&apos; own sentences are never shown. Limits are under <Link to="/admin/users">users</Link>.
        </p>
        {gate ? (
          <section className="lg-section">
            <p>{GATES[gate]}</p>
            <GateSignIn gate={gate} />
          </section>
        ) : !data ? (
          <p className="lg-caption">Loading…</p>
        ) : (
          <>
            <Status status={data.status} settings={data.settings} />
            <div className="tt-tiles">
              <div className="tt-tile">
                <span className="tt-tile__value">{data.queue.jobs.length}</span>
                <span className="lg-caption">in the queue</span>
              </div>
              <div className="tt-tile">
                <span className="tt-tile__value">{today?.day === todayKey ? today.ok + today.failed : 0}</span>
                <span className="lg-caption">requests today</span>
              </div>
              <div className="tt-tile">
                <span className="tt-tile__value">{today?.day === todayKey && today.ok + today.failed ? seconds(today.avgMs) : "–"}</span>
                <span className="lg-caption">average today</span>
              </div>
              <div className="tt-tile">
                <span className="tt-tile__value">{data.cacheBytes == null ? "?" : megabytes(data.cacheBytes)}</span>
                <span className="lg-caption">cache of {megabytes(data.settings.cacheMaxBytes)}</span>
              </div>
            </div>
            <section className="lg-section" aria-label="Queue">
              <h2 className="lg-heading">Queue now</h2>
              <Queue jobs={data.queue.jobs} remakes={data.remakes} />
            </section>
            <section className="lg-section" aria-label="Last requests">
              <h2 className="lg-heading">Last requests</h2>
              <Recent recent={data.queue.recent} />
            </section>
            <section className="lg-section" aria-label="Per day">
              <h2 className="lg-heading">Last two weeks</h2>
              <p className="lg-caption">
                Learners: who had new on-demand sentences made that day (and how many). Daily limits {data.settings.dailyLimit}, verified {data.settings.verifiedLimit}
                {data.requested ? `; ${data.requested} asked for more` : ""}.
              </p>
              <Days daily={data.daily} usage={data.usage} />
            </section>
          </>
        )}
      </main>
    </GameScreen>
  );
}
