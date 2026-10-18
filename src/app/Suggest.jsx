import React, { useEffect, useState } from "react";
import { useSettings } from "./SettingsContext";
import { SendResult } from "./FeedbackContext";
import { Feedback, GameScreen } from "../components/lingo";
import { backendAvailable } from "../lib/backend";
import { SUGGESTION_KINDS, flushFeedback, queueFeedback } from "../lib/feedback";

// /suggest: suggest a word, phrase or sentence for the word base, in Finnish,
// English or both (a learner may not know the English word). Needs the
// optional backend and an account; what is typed while signed out is kept
// and sent after sign-in (src/lib/feedback.js).
export default function Suggest() {
  const { t } = useSettings();
  const f = t.feedback;
  const [available, setAvailable] = useState(null);
  const [kind, setKind] = useState("word");
  const [text, setText] = useState("");
  const [meaning, setMeaning] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let live = true;
    backendAvailable().then((ok) => live && setAvailable(ok));
    return () => {
      live = false;
    };
  }, []);

  const canSend = Boolean(text.trim() || meaning.trim());

  const send = async (e) => {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    queueFeedback("suggestion", { kind, text: text.trim(), meaning: meaning.trim(), note: note.trim() });
    setResult(await flushFeedback());
    setBusy(false);
  };

  const again = () => {
    setResult(null);
    setText("");
    setMeaning("");
    setNote("");
  };

  return (
    <GameScreen title={f.suggestTitle}>
      <main className="lg-board lg-page">
        <p className="lg-body-lg">{f.suggestIntro}</p>
        {available === false && <Feedback variant="info" icon="i" title={t.account.unavailable} />}
        {available && result && (
          <section className="lg-section">
            <SendResult result={result} t={t} />
            <button type="button" className="lg-btn lg-btn--secondary" onClick={again}>{f.suggestAnother}</button>
          </section>
        )}
        {available && !result && (
          <form className="lg-section lg-stack fb-form" onSubmit={send}>
            <fieldset className="fb-reasons">
              <legend className="lg-menu__label">{f.kindLabel}</legend>
              <div className="lg-chips">
                {SUGGESTION_KINDS.map((k) => (
                  <button key={k} type="button" className={`lg-chip ${kind === k ? "lg-chip--on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                    {f.kinds[k]}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="lg-caption">{f.eitherHint}</p>
            <label className="lg-field">
              <span>{f.meaningLabel}</span>
              <input className="lg-input" lang="fi" maxLength={300} value={meaning} onChange={(e) => setMeaning(e.target.value)} />
            </label>
            <label className="lg-field">
              <span>{f.textLabel}</span>
              <input className="lg-input" lang="en" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <label className="lg-field">
              <span>{f.noteLabel}</span>
              <textarea className="lg-input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div>
              <button type="submit" className="lg-btn lg-btn--primary" disabled={busy || !canSend}>{busy ? f.sending : f.send}</button>
            </div>
          </form>
        )}
      </main>
    </GameScreen>
  );
}
