import React, { useEffect, useRef, useState } from "react";
import { DEBUG_LANGS, DETECTIONS, onMicEvent, setMicDebug } from "../../lib/micDebug";
import { canMeasureLevel, startLevelMeter } from "../../lib/micLevel";
import { recognitionCtor } from "../../lib/speechRecognition";

// The mic debug panel under "Say it" (turned on in Practice settings, see
// src/lib/micDebug.js). A tool for testing on real phones, so it is in
// English only.

const DETECTION_LABELS = { auto: "Auto", local: "On device", online: "Online", self: "Self check" };
const LOG_SIZE = 40;
// Recogniser events that switch the activity lights on and off.
const LIGHTS = [
  ["audio", "audiostart", "audioend"],
  ["sound", "soundstart", "soundend"],
  ["speech", "speechstart", "speechend"],
];

function apiName() {
  if (typeof window === "undefined") return "none";
  if (window.SpeechRecognition) return "SpeechRecognition";
  if (window.webkitSpeechRecognition) return "webkitSpeechRecognition";
  return "none";
}

function fmtDetail(detail) {
  if (!detail) return "";
  if (detail.alternatives && Array.isArray(detail.alternatives)) {
    return detail.alternatives
      .map((a) => (typeof a === "string" ? `"${a}"` : `"${a.transcript}"${a.confidence ? ` ${a.confidence.toFixed(2)}` : ""}`))
      .join(", ") + (detail.error ? ` error=${detail.error}` : "");
  }
  return Object.entries(detail)
    .filter(([, v]) => v !== "" && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

function LevelMeter({ listening }) {
  const [level, setLevel] = useState(null);
  const [track, setTrack] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [pauseWhileListening, setPauseWhileListening] = useState(true);
  const meter = useRef(null);

  const stop = () => {
    if (meter.current) meter.current.stop();
    meter.current = null;
    setLevel(null);
  };

  // Run the meter while it is switched on, except while the recogniser
  // listens if pausing is on (some phones give the mic to only one of them).
  const active = running && !(pauseWhileListening && listening);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    setError(null);
    startLevelMeter((l) => live && setLevel(l))
      .then((m) => {
        if (!live) {
          m.stop();
          return;
        }
        meter.current = m;
        setTrack(m.track);
      })
      .catch((e) => {
        if (!live) return;
        setError(`${e?.name || "Error"}: ${e?.message || e}`);
        setRunning(false);
      });
    return () => {
      live = false;
      stop();
    };
  }, [active]);

  const pct = level ? Math.max(0, Math.min(100, ((level.db + 60) / 60) * 100)) : 0;
  const peakPct = level ? Math.max(0, Math.min(100, ((20 * Math.log10(level.peak || 1e-6) + 60) / 60) * 100)) : 0;

  return (
    <div className="md-block">
      <div className="md-row">
        <strong>Input level</strong>
        {canMeasureLevel() ? (
          <button type="button" className="lg-btn lg-btn--secondary md-btn" onClick={() => setRunning((r) => !r)}>
            {running ? "Stop meter" : "Start meter"}
          </button>
        ) : (
          <span className="lg-caption">Not available in this browser</span>
        )}
      </div>
      <div className="md-meter" role="meter" aria-label="Input level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={level ? Math.round(level.db) : -60}>
        <span className="md-meter__cover" style={{ width: `${100 - pct}%` }} />
        {level && <span className="md-meter__peak" style={{ left: `${peakPct}%` }} />}
      </div>
      <p className="lg-caption md-mono">
        {level ? `${level.db > -100 ? level.db.toFixed(1) : "< -100"} dBFS · peak ${level.peak.toFixed(2)}` : running && pauseWhileListening && listening ? "Paused while listening" : "—"}
      </p>
      <label className="md-check">
        <input type="checkbox" checked={pauseWhileListening} onChange={(e) => setPauseWhileListening(e.target.checked)} />
        Pause the meter while the recogniser listens
      </label>
      {track && (
        <p className="lg-caption md-mono">
          {track.label || "(unnamed input)"} · {track.sampleRate} Hz · echo {String(track.echoCancellation)} · noise {String(track.noiseSuppression)} · gain {String(track.autoGainControl)}
        </p>
      )}
      {error && <p className="lg-caption md-error">{error}</p>}
    </div>
  );
}

export default function MicDebugPanel({ settings, learningLang, listenLang, status, inUse, selfReason, onRetryMic, onInstall }) {
  const [log, setLog] = useState([]);
  const [lights, setLights] = useState({});
  const [listening, setListening] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [permission, setPermission] = useState("unknown");
  const [installing, setInstalling] = useState(false);
  const startAt = useRef(null);
  const nextId = useRef(0);

  useEffect(
    () =>
      onMicEvent((event) => {
        if (event.type === "start") {
          startAt.current = event.at;
          setListening(true);
          setLights({});
        }
        if (event.type === "end") {
          setListening(false);
          setLights({});
        }
        if (event.type === "result") setLastResult(event.detail.alternatives);
        LIGHTS.forEach(([name, on, off]) => {
          if (event.type === on) setLights((l) => ({ ...l, [name]: true }));
          if (event.type === off) setLights((l) => ({ ...l, [name]: false }));
        });
        const since = startAt.current ? event.at - startAt.current : 0;
        nextId.current += 1;
        const id = nextId.current;
        setLog((l) => [{ ...event, since, id }, ...l].slice(0, LOG_SIZE));
      }),
    []
  );

  useEffect(() => {
    let live = true;
    let status = null;
    const update = () => live && status && setPermission(status.state);
    navigator.permissions
      ?.query({ name: "microphone" })
      .then((s) => {
        status = s;
        update();
        s.onchange = update;
      })
      .catch(() => live && setPermission("can't tell"));
    return () => {
      live = false;
      if (status) status.onchange = null;
    };
  }, []);

  const Ctor = recognitionCtor();
  const chip = (on, label, onClick) => (
    <button key={label} type="button" className={`lg-chip md-chip ${on ? "lg-chip--on" : ""}`} aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );
  const browserLang = typeof navigator !== "undefined" ? navigator.language : "";
  const langLabel = (l) => (l === "auto" ? `Auto (${learningLang})` : l === "browser" ? `Browser (${browserLang})` : l);

  const install = async () => {
    setInstalling(true);
    await onInstall();
    setInstalling(false);
  };

  return (
    <section className="md-panel" aria-label="Microphone debug">
      <div className="md-row">
        <h2 className="lg-heading md-title">Mic debug</h2>
        <button type="button" className="lg-btn lg-btn--quiet md-btn" onClick={() => setMicDebug({ on: false })}>
          Turn off
        </button>
      </div>

      <LevelMeter listening={listening} />

      <div className="md-block">
        <strong>Recogniser activity</strong>
        <div className="md-lights">
          <span className={`md-light${listening ? " md-light--on" : ""}`}>listening</span>
          {LIGHTS.map(([name]) => (
            <span key={name} className={`md-light${lights[name] ? " md-light--on" : ""}`}>{name}</span>
          ))}
        </div>
      </div>

      <div className="md-block">
        <strong>Detection</strong>
        <div className="lg-chips">
          {DETECTIONS.map((d) => chip(settings.detection === d, DETECTION_LABELS[d], () => setMicDebug({ detection: d })))}
        </div>
        <p className="lg-caption">
          In use: <strong>{inUse}</strong>
          {settings.detection === "local" && " (no fallback to online)"}
          {selfReason && ` (${selfReason})`}
        </p>
        {selfReason && Ctor && (
          <button type="button" className="lg-btn lg-btn--secondary md-btn" onClick={onRetryMic}>
            Try the microphone again
          </button>
        )}
      </div>

      <div className="md-block">
        <strong>Listening language</strong>
        <div className="lg-chips">
          {DEBUG_LANGS.map((l) => chip(settings.lang === l, langLabel(l), () => setMicDebug({ lang: l })))}
        </div>
        <p className="lg-caption">
          Listening in <strong>{listenLang}</strong>. The answer is still checked against the English word.
        </p>
      </div>

      <div className="md-block">
        <strong>Browser</strong>
        <dl className="md-facts md-mono">
          <dt>Recognition API</dt><dd>{apiName()}</dd>
          <dt>On-device check</dt><dd>{Ctor && typeof Ctor.available === "function" ? "supported" : "not supported"}</dd>
          <dt>On-device for {listenLang}</dt>
          <dd>
            {status}
            {(status === "downloadable" || status === "downloading") && (
              <button type="button" className="lg-btn lg-btn--quiet md-btn" onClick={install} disabled={installing}>
                {installing ? "Installing…" : "Install language pack"}
              </button>
            )}
          </dd>
          <dt>Microphone permission</dt><dd>{permission}</dd>
          <dt>Browser languages</dt><dd>{(navigator.languages || [browserLang]).join(", ")}</dd>
          <dt>Secure context</dt><dd>{String(typeof window !== "undefined" && window.isSecureContext)}</dd>
          <dt>User agent</dt><dd className="md-wrap">{navigator.userAgent}</dd>
        </dl>
      </div>

      {lastResult && (
        <div className="md-block">
          <strong>Last result</strong>
          <ol className="md-mono md-list">
            {lastResult.map((a, i) => (
              <li key={i}>
                "{a.transcript}"{typeof a.confidence === "number" && a.confidence > 0 ? ` · ${a.confidence.toFixed(2)}` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="md-block">
        <div className="md-row">
          <strong>Event log</strong>
          <button type="button" className="lg-btn lg-btn--quiet md-btn" onClick={() => setLog([])}>Clear</button>
        </div>
        {log.length === 0 ? (
          <p className="lg-caption">Tap the microphone to see events.</p>
        ) : (
          <ol className="md-log md-mono" data-testid="mic-debug-log">
            {log.map((e) => (
              <li key={e.id}>
                <span className="md-log__t">+{e.since}ms</span> {e.type} {fmtDetail(e.detail)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
