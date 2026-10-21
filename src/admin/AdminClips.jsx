import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { GameScreen } from "../components/lingo";
import { api, backendAvailable } from "../lib/backend";
import { AUDIO_BASE } from "../lib/speechClips";
import { GATES, GateSignIn } from "./AdminReports";
import { applyEdit, decodeClip, encodeMp3, gainToDb, normalizeGain, peakOf, peaks, soundBounds, toBase64 } from "./clipAudio";

// /admin/clips: every recorded clip (server/src/lib/wordClips.js list()), in
// both voices. Clips that open problem reports point at come first and are
// marked. Opening one shows its waveform: play it, trim it, fade its ends,
// add silence before or after it, make it louder or quieter, and save that as a new version, which the app
// plays from then on. Older versions stay and can be put back. English only,
// like the other admin pages.

const VOICE_NAMES = { female: "Nova (woman)", male: "Liam (man)" };
const REASONS = { misheard: "Heard wrong", wrong_answer: "Wrong answer", typo: "Typo", bad_audio: "Bad audio", confusing: "Confusing", other: "Something else" };
const FILTERS = [
  ["reported", "Reported"],
  ["all", "All"],
  ["edited", "Edited"],
  ["missing", "Not made"],
];
const PAGE = 60;
const STATE_LABELS = { making: "Being made on the TTS server", remaking: "Waiting for Content publish", missing: "Not made yet" };
// How often the list reloads while a clip is being made on the TTS server.
const MAKING_POLL_MS = 5000;
const SAVE_ERRORS = {
  not_live: "This clip isn't on the live list any more (it may be being made again). Reload the page.",
  bad_audio: "The edited file wasn't accepted.",
  clips_unavailable: "Recorded clips can't be changed on this server (CLIP_DIR and CONTENT_DIR).",
};

const when = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ms = (s) => Math.round(s * 1000);
export const clipUrl = (folder, key, revision) => `${AUDIO_BASE}${folder}/${revision ? `${key}-${revision}` : key}.mp3`;

// What a version is, from the clip's history.
export function versionLabel(revision, edits = []) {
  if (!revision) return "First version";
  const made = edits.find((e) => e.revision === revision && !e.restored);
  if (!made) return `Version ${revision}, made again by the voice`;
  const did = [];
  if (made.start || made.end) did.push("trimmed");
  if (made.fadeIn || made.fadeOut) did.push("faded");
  if (made.padStart || made.padEnd) did.push("silence added");
  if (made.gain) did.push(`${made.gain > 0 ? "+" : ""}${made.gain} dB`);
  return `Version ${revision}, edited ${when(made.at)}${did.length ? ` (${did.join(", ")})` : ""}`;
}

// Whether a clip shows under a filter, for one voice.
export function matches(clip, folder, filter) {
  const v = clip.voices[folder];
  if (filter === "reported") return Boolean(clip.reports?.length);
  if (filter === "edited") return Boolean(v?.edits?.length);
  if (filter === "missing") return v?.state !== "live";
  return true;
}

// One AudioContext for the page, made on the first press of Play.
let audioCtx = null;
function context() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function Waveform({ samples, rate, edit, onEdit, playhead }) {
  const canvas = useRef(null);
  const drag = useRef(null);
  const [width, setWidth] = useState(600);
  const duration = samples.length / rate;
  const HEIGHT = 140;

  useEffect(() => {
    const el = canvas.current?.parentElement;
    if (!el || typeof ResizeObserver !== "function") return undefined;
    const obs = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const bars = useMemo(() => peaks(samples, Math.floor(width / 2)), [samples, width]);

  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext?.("2d");
    if (!g) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = HEIGHT * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(c);
    const color = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const ink = color("--lake", "#2563eb");
    const muted = color("--ink-muted", "#999");
    const hot = color("--lingon", "#c0392b");
    g.clearRect(0, 0, width, HEIGHT);
    const mid = HEIGHT / 2;
    const gain = 10 ** ((edit.gain || 0) / 20);
    const x = (t) => (t / duration) * width;
    bars.forEach((p, i) => {
      const t = ((i + 0.5) / bars.length) * duration;
      const inside = t >= edit.start && t <= edit.end;
      const v = p * gain;
      g.fillStyle = !inside ? muted : v >= 1 ? hot : ink;
      const h = Math.max(1, Math.min(1, v) * (mid - 4));
      g.fillRect(i * 2, mid - h, 1.5, h * 2);
    });
    // The part that is cut off, shaded, and the two handles.
    g.fillStyle = "rgb(0 0 0 / 0.12)";
    g.fillRect(0, 0, x(edit.start), HEIGHT);
    g.fillRect(x(edit.end), 0, width - x(edit.end), HEIGHT);
    g.fillStyle = ink;
    for (const t of [edit.start, edit.end]) {
      g.fillRect(x(t) - 1, 0, 2, HEIGHT);
      g.fillRect(x(t) - 5, 0, 10, 10);
    }
    if (playhead != null) {
      g.fillStyle = hot;
      g.fillRect(x(playhead) - 1, 0, 2, HEIGHT);
    }
  }, [bars, width, edit, playhead, duration]);

  const timeAt = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration));
  };
  const down = (e) => {
    const t = timeAt(e);
    const px = (Math.abs(t - edit.start) / duration) * width;
    const px2 = (Math.abs(t - edit.end) / duration) * width;
    const handle = px <= 10 && px <= px2 ? "start" : px2 <= 10 ? "end" : null;
    drag.current = { handle, anchor: t, x: e.clientX, moved: false };
    canvas.current.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
    if (!d.moved) return;
    const t = timeAt(e);
    if (d.handle === "start") onEdit({ start: Math.min(t, edit.end - 0.01) });
    else if (d.handle === "end") onEdit({ end: Math.max(t, edit.start + 0.01) });
    else onEdit({ start: Math.min(d.anchor, t), end: Math.max(d.anchor, t) });
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && !d.handle) onEdit(null, timeAt(e));
  };

  return (
    <div className="rc-wave">
      <canvas
        ref={canvas}
        style={{ width: `${width}px`, height: `${HEIGHT}px` }}
        role="img"
        aria-label={`Waveform, ${duration.toFixed(2)} s. Drag the handles to trim, drag elsewhere to pick a part, click to play from there.`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => (drag.current = null)}
      />
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1, unit }) {
  return (
    <label className="rc-field">
      <span className="lg-caption">{label}</span>
      <span className="rc-field__input">
        <input
          className="lg-input"
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
          }}
        />
        <span className="lg-caption">{unit}</span>
      </span>
    </label>
  );
}

function Reports({ reports, onChanged }) {
  const [busy, setBusy] = useState(false);
  const fixed = async (status) => {
    setBusy(true);
    await api("/admin/reports/status", { method: "POST", body: { ids: reports.map((r) => r.id), status } });
    setBusy(false);
    onChanged();
  };
  return (
    <section className="rc-reports" aria-label="Reports">
      <strong>{reports.length === 1 ? "1 open report" : `${reports.length} open reports`}</strong>
      {reports.map((r) => (
        <div key={r.id} className="fb-report">
          <strong>{REASONS[r.reason] || r.reason}</strong> · <span className="lg-caption">{r.game} · {when(r.createdAt)}</span>
          {r.comment && <p className="fb-report__comment">{r.comment}</p>}
        </div>
      ))}
      <div className="lg-row">
        <button type="button" className="lg-btn lg-btn--secondary" disabled={busy} onClick={() => fixed("fixed")}>Mark fixed</button>
        <Link className="lg-btn lg-btn--quiet" to="/admin/reports">All reports</Link>
      </div>
    </section>
  );
}

function ClipEditor({ clip, voice, onChanged, onDirty }) {
  const v = clip.voices[voice.folder];
  const live = v.state === "live";
  const current = v.revision || 0;
  const [source, setSource] = useState(null); // { samples, rate, revision } | { error }
  const [edit, setEditState] = useState(null);
  const [playhead, setPlayhead] = useState(null);
  const [saving, setSaving] = useState(null);
  const playing = useRef(null);
  const [remake, setRemake] = useState(null);

  const load = useCallback(async (revision) => {
    setSource(null);
    try {
      const res = await fetch(clipUrl(voice.folder, clip.key, revision));
      if (!res.ok) throw new Error(String(res.status));
      const decoded = await decodeClip(await res.arrayBuffer());
      setSource({ ...decoded, revision });
      setEditState({ start: 0, end: decoded.samples.length / decoded.rate, fadeIn: 0, fadeOut: 0, gain: 0, padStart: 0, padEnd: 0 });
    } catch {
      setSource({ error: true, revision });
    }
  }, [voice.folder, clip.key]);

  // The live version, else the newest file on disk. Reloads only when that
  // changes, so marking a report fixed keeps an unsaved edit.
  const lastOnDisk = v.versions?.at(-1);
  useEffect(() => {
    if (live || lastOnDisk != null) load(live ? current : lastOnDisk);
  }, [load, live, current, lastOnDisk]);

  const stop = useCallback(() => {
    const p = playing.current;
    playing.current = null;
    if (p) {
      p.node.onended = null;
      try {
        p.node.stop();
      } catch {
        // already stopped
      }
    }
    setPlayhead(null);
  }, []);
  useEffect(() => stop, [stop]);

  const duration = source?.samples ? source.samples.length / source.rate : 0;
  const dirty = Boolean(
    edit && duration && (ms(edit.start) !== 0 || ms(edit.end) !== ms(duration) || edit.fadeIn || edit.fadeOut || edit.gain || edit.padStart || edit.padEnd)
  );
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  // Plays the edit (or the whole clip as it is, `original`) from `from`
  // seconds on the clip's own timeline; the playhead follows.
  const play = (original, from) => {
    stop();
    const ctx = context();
    const begin = original ? from ?? 0 : Math.max(edit.start, from ?? edit.start);
    const samples = original
      ? source.samples.subarray(Math.round(begin * source.rate))
      : applyEdit(source.samples, source.rate, { ...edit, start: begin, ...(begin > edit.start ? { fadeIn: 0, padStart: 0 } : {}) });
    // Added silence at the start plays before the clip's own timeline moves.
    const lead = original || begin > edit.start ? 0 : edit.padStart || 0;
    if (!samples.length) return;
    const buffer = ctx.createBuffer(1, samples.length, source.rate);
    buffer.copyToChannel(samples, 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const startedAt = ctx.currentTime;
    const p = { node };
    playing.current = p;
    node.onended = () => {
      if (playing.current === p) stop();
    };
    node.start();
    const tick = () => {
      if (playing.current !== p) return;
      setPlayhead(Math.min(original ? duration : edit.end, begin + Math.max(0, ctx.currentTime - startedAt - lead)));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const change = (patch, clickedAt) => {
    if (patch === null) return play(clickedAt < edit.start || clickedAt > edit.end, clickedAt);
    setEditState((e) => ({ ...e, ...patch }));
  };

  const save = async () => {
    setSaving({ busy: true });
    try {
      const mp3 = await encodeMp3(applyEdit(source.samples, source.rate, edit));
      const changes = {
        ...(ms(edit.start) ? { start: edit.start } : {}),
        ...(ms(edit.end) !== ms(duration) ? { end: edit.end } : {}),
        ...(edit.fadeIn ? { fadeIn: edit.fadeIn } : {}),
        ...(edit.fadeOut ? { fadeOut: edit.fadeOut } : {}),
        ...(edit.gain ? { gain: edit.gain } : {}),
        ...(edit.padStart ? { padStart: edit.padStart } : {}),
        ...(edit.padEnd ? { padEnd: edit.padEnd } : {}),
      };
      const res = await api("/admin/clips/edit", { method: "POST", body: { folder: voice.folder, key: clip.key, audio: toBase64(mp3), changes } });
      if (!res.ok) return setSaving({ error: SAVE_ERRORS[res.data?.error] || "Couldn't save it." });
      setSaving({ done: res.data.revision });
      onDirty(false);
      onChanged();
    } catch {
      setSaving({ error: "Couldn't make the MP3 in this browser." });
    }
  };

  const putBack = async (revision) => {
    setSaving({ busy: true });
    const res = await api("/admin/clips/use", { method: "POST", body: { folder: voice.folder, key: clip.key, revision } });
    setSaving(res.ok ? null : { error: SAVE_ERRORS[res.data?.error] || "Couldn't put it back." });
    if (res.ok) onChanged();
  };

  const askRemake = async () => {
    setRemake({ busy: true });
    const res = await api("/admin/clips/remake", { method: "POST", body: { text: clip.text, folder: voice.folder } });
    setRemake(res.ok ? { done: true, making: res.data.making } : { error: true });
    if (res.ok) onChanged();
  };

  const editedPeak = source?.samples && edit ? peakOf(applyEdit(source.samples, source.rate, edit)) : 0;
  const shown = source?.revision ?? current;

  return (
    <div className="rc-editor">
      {clip.reports?.length > 0 && <Reports reports={clip.reports} onChanged={onChanged} />}
      {!live && <p className="lg-caption">{STATE_LABELS[v.state]} in this voice: the app reads it another way for now.{v.versions?.length ? " Shown: the last file on disk." : ""}</p>}
      {source?.error && <p className="lg-caption">Couldn't load this clip's file.</p>}
      {(live || v.versions?.length) && !source && <p className="lg-caption">Loading…</p>}
      {source?.samples && edit && (
        <>
          <Waveform samples={source.samples} rate={source.rate} edit={edit} onEdit={change} playhead={playhead} />
          <p className="lg-caption">
            {shown === current && live ? "Live version" : versionLabel(shown, v.edits)} · {duration.toFixed(2)} s · edited {(edit.end - edit.start + (edit.padStart || 0) + (edit.padEnd || 0)).toFixed(2)} s · loudest {gainToDb(editedPeak).toFixed(1)} dBFS
          </p>
          <div className="lg-row">
            <button type="button" className="lg-btn lg-btn--primary" onClick={() => (playing.current ? stop() : play(false))}>{playhead != null ? "Stop" : "Play edit"}</button>
            <button type="button" className="lg-btn lg-btn--secondary" onClick={() => play(true, 0)}>Play as it is</button>
          </div>
          <div className="rc-fields">
            <NumberField label="Start" unit="ms" value={ms(edit.start)} min={0} max={ms(edit.end) - 10} onChange={(n) => change({ start: n / 1000 })} />
            <NumberField label="End" unit="ms" value={ms(edit.end)} min={ms(edit.start) + 10} max={ms(duration)} onChange={(n) => change({ end: n / 1000 })} />
            <NumberField label="Fade in" unit="ms" value={ms(edit.fadeIn)} min={0} max={500} step={5} onChange={(n) => change({ fadeIn: n / 1000 })} />
            <NumberField label="Fade out" unit="ms" value={ms(edit.fadeOut)} min={0} max={500} step={5} onChange={(n) => change({ fadeOut: n / 1000 })} />
            <NumberField label="Silence before" unit="ms" value={ms(edit.padStart)} min={0} max={2000} step={50} onChange={(n) => change({ padStart: n / 1000 })} />
            <NumberField label="Silence after" unit="ms" value={ms(edit.padEnd)} min={0} max={2000} step={50} onChange={(n) => change({ padEnd: n / 1000 })} />
            <NumberField label="Volume" unit="dB" value={edit.gain} min={-20} max={20} step={0.5} onChange={(n) => change({ gain: n })} />
          </div>
          <div className="lg-row">
            <button type="button" className="lg-btn lg-btn--quiet" onClick={() => change({ ...soundBounds(source.samples, source.rate), fadeIn: 0.01, fadeOut: 0.02 })}>Trim silence</button>
            <button
              type="button"
              className="lg-btn lg-btn--quiet"
              onClick={() => change({ gain: normalizeGain(applyEdit(source.samples, source.rate, { ...edit, gain: 0 })) })}
            >
              Make loud (−1 dB peak)
            </button>
            <button type="button" className="lg-btn lg-btn--quiet" disabled={!dirty} onClick={() => setEditState({ start: 0, end: duration, fadeIn: 0, fadeOut: 0, gain: 0, padStart: 0, padEnd: 0 })}>Undo changes</button>
          </div>
          {live && (
            <div className="lg-row">
              <button type="button" className="lg-btn lg-btn--primary" disabled={!dirty || saving?.busy} onClick={save}>
                {saving?.busy ? "Saving…" : `Save as the ${voice.id === "male" ? "Liam" : "Nova"} clip`}
              </button>
            </div>
          )}
          {saving?.done && <p className="lg-caption">Saved as version {saving.done}. The app plays it from the next visit.</p>}
          {saving?.error && <p className="lg-caption rc-error">{saving.error}</p>}
        </>
      )}
      {v.versions?.length > 0 && (
        <section className="rc-versions" aria-label="Versions">
          <strong>Versions in this voice</strong>
          <ul className="ac-list">
            {[...v.versions].reverse().map((rev) => (
              <li key={rev} className="rc-version">
                <span>
                  {versionLabel(rev, v.edits)}
                  {live && rev === current && <span className="rc-badge rc-badge--live">Live</span>}
                </span>
                <span className="lg-row">
                  {rev !== shown && <button type="button" className="lg-btn lg-btn--quiet" onClick={() => load(rev)}>Open</button>}
                  {live && rev !== current && <button type="button" className="lg-btn lg-btn--quiet" disabled={saving?.busy} onClick={() => putBack(rev)}>Use this</button>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <details className="rc-remake">
        <summary className="lg-caption">Have the voice make it again</summary>
        <p className="lg-caption">This voice&apos;s clip of “{clip.text}” (and its word-by-word clip) leaves the live site and the voice makes a new one: on the TTS server within a minute or two, or else at the next Content publish. Until then the app reads it another way. The other voice&apos;s clip stays as it is.</p>
        <button type="button" className="lg-btn lg-btn--secondary" disabled={remake?.busy || remake?.done} onClick={askRemake}>Make it again</button>
        {remake?.done && (
          <p className="lg-caption">
            {remake.making ? "Being made on the TTS server; this page updates when it's done." : "Taken off the live site; the next Content publish (or a run with force) makes it again."}
          </p>
        )}
        {remake?.error && <p className="lg-caption rc-error">Couldn&apos;t ask for it.</p>}
      </details>
    </div>
  );
}

function ClipRow({ clip, voice, open, onToggle, onChanged, onDirty }) {
  const v = clip.voices[voice.folder];
  const reported = clip.reports?.length || 0;
  const badAudio = clip.reports?.some((r) => r.reason === "bad_audio");
  return (
    <li className={`fb-group rc-clip${reported ? " rc-clip--reported" : ""}`}>
      <button type="button" className="rc-clip__head" aria-expanded={open} onClick={onToggle}>
        <span className="fb-group__title" lang="en">{clip.text}</span>
        <span className="rc-badges">
          {reported > 0 && <span className="rc-badge rc-badge--report">{badAudio ? "Bad audio" : "Reported"}{reported > 1 ? ` ×${reported}` : ""}</span>}
          {clip.words && <span className="rc-badge">Word by word</span>}
          {v.edits?.length > 0 && <span className="rc-badge">Edited</span>}
          {v.state !== "live" && <span className="rc-badge">{STATE_LABELS[v.state]}</span>}
        </span>
      </button>
      {open && <ClipEditor key={voice.folder} clip={clip} voice={voice} onChanged={onChanged} onDirty={onDirty} />}
    </li>
  );
}

export default function AdminClips() {
  // ?q=<text>, from a report: all clips, searched for that text.
  const [params] = useSearchParams();
  const asked = params.get("q") || "";
  const [gate, setGate] = useState(null);
  const [data, setData] = useState(null);
  const [voiceId, setVoiceId] = useState("female");
  const [filter, setFilter] = useState(asked ? "all" : null); // null: "reported" if there are any, else "all"
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState(asked);
  const [limit, setLimit] = useState(PAGE);
  const [openKey, setOpenKey] = useState(null);
  const dirty = useRef(false);
  const onDirty = useCallback((d) => {
    dirty.current = d;
  }, []);

  const load = useCallback(async () => {
    if (!(await backendAvailable())) return setGate("unavailable");
    const res = await api("/admin/clips");
    if (res.status === 503) return setGate("clips_unavailable");
    if (!res.ok) return setGate(res.data?.error in GATES ? res.data.error : res.status === 0 ? "unavailable" : "signed_out");
    setGate(null);
    setData(res.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A clip being made on the TTS server: reload until it's back.
  const makingAny = Boolean(data?.clips.some((c) => Object.values(c.voices).some((v) => v.state === "making")));
  useEffect(() => {
    if (!makingAny) return undefined;
    const timer = setInterval(load, MAKING_POLL_MS);
    return () => clearInterval(timer);
  }, [makingAny, load]);

  const voice = data?.voices.find((v) => v.id === voiceId) || data?.voices[0];
  const reportedCount = data ? data.clips.filter((c) => c.reports?.length).length : 0;
  const activeFilter = filter || (reportedCount ? "reported" : "all");

  const list = useMemo(() => {
    if (!data || !voice) return [];
    const needle = q.trim().toLowerCase();
    return data.clips
      .filter((c) => matches(c, voice.folder, activeFilter))
      .filter((c) => kind === "all" || (kind === "words") === c.words)
      .filter((c) => !needle || c.text.toLowerCase().includes(needle))
      .sort((a, b) => (b.reports?.length || 0) - (a.reports?.length || 0) || a.text.localeCompare(b.text) || Number(a.words) - Number(b.words));
  }, [data, voice, activeFilter, kind, q]);

  const leave = (next) => {
    if (dirty.current && !window.confirm("Leave this clip without saving the edit?")) return;
    dirty.current = false;
    next();
  };

  const chip = (value, current, set, label) => (
    <button key={value} type="button" className={`lg-chip ${current === value ? "lg-chip--on" : ""}`} aria-pressed={current === value} onClick={() => leave(() => set(value))}>
      {label}
    </button>
  );

  return (
    <GameScreen title="Recordings">
      <main className="lg-board lg-page">
        <p className="lg-body-lg">
          Every recorded clip the games play. Clips with open <Link to="/admin/reports">reports</Link> come first. Open one to hear it, trim it, fade its ends, add silence before or after it, or change its volume, and save that as the clip the app plays. Earlier versions stay and can be put back. Clips being made show under <Link to="/admin/tts">speech server</Link>.
        </p>
        {gate ? (
          <section className="lg-section">
            <p>{gate === "clips_unavailable" ? "Recorded clips can't be read on this server (CLIP_DIR and CONTENT_DIR)." : GATES[gate]}</p>
            <GateSignIn gate={gate} />
          </section>
        ) : !data ? (
          <p className="lg-caption">Loading…</p>
        ) : (
          <>
            <div className="lg-chips" aria-label="Voice">
              {data.voices.map((v) => chip(v.id, voice.id, setVoiceId, VOICE_NAMES[v.id] || v.speaker))}
            </div>
            <div className="lg-chips" aria-label="Show">
              {FILTERS.map(([value, label]) => chip(value, activeFilter, setFilter, value === "reported" ? `${label} (${reportedCount})` : label))}
            </div>
            <div className="lg-row">
              <input className="lg-input rc-search" type="search" aria-label="Find a text" placeholder="Find a text" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
              <select className="lg-input rc-kind" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">All clips</option>
                <option value="single">Normal speed</option>
                <option value="words">Word by word</option>
              </select>
            </div>
            <p className="lg-caption">{list.length} {list.length === 1 ? "clip" : "clips"}</p>
            {list.length === 0 ? (
              <p className="lg-caption">Nothing here.</p>
            ) : (
              <ul className="ac-list">
                {list.slice(0, limit).map((c) => (
                  <ClipRow
                    key={c.key}
                    clip={c}
                    voice={voice}
                    open={openKey === c.key}
                    onToggle={() => leave(() => setOpenKey(openKey === c.key ? null : c.key))}
                    onChanged={load}
                    onDirty={onDirty}
                  />
                ))}
              </ul>
            )}
            {list.length > limit && (
              <button type="button" className="lg-btn lg-btn--secondary" onClick={() => setLimit(limit + PAGE)}>Show more</button>
            )}
          </>
        )}
      </main>
    </GameScreen>
  );
}
