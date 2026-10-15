import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Flag } from "lucide-react";
import { useSettings } from "./SettingsContext";
import Feedback from "../components/lingo/Feedback";
import { backendAvailable } from "../lib/backend";
import { APP_VERSION, REPORT_REASONS, flushFeedback, queueFeedback } from "../lib/feedback";

// "Report a problem" for whatever question is on screen. A game names its
// current question with useReportSubject({ game, itemRef, context }); the
// settings menu and ReportButton then open the report sheet for it. Reports
// need the optional backend and an account; with the backend unreachable
// nothing here is shown.

const FeedbackContext = createContext({ subject: null, setSubject() {}, openReport() {}, available: false });

export function useFeedback() {
  return useContext(FeedbackContext);
}

// Names the question a report would be about while this component is shown.
// `subject` should be memoised (or change only when the question does).
export function useReportSubject(subject) {
  const { setSubject } = useFeedback();
  useEffect(() => {
    setSubject(subject);
    return () => setSubject(null);
  }, [subject, setSubject]);
}

export function FeedbackProvider({ children }) {
  const [subject, setSubject] = useState(null);
  const [open, setOpen] = useState(null);
  const [available, setAvailable] = useState(false);

  // Send anything left from an earlier visit, once the backend answers.
  useEffect(() => {
    let live = true;
    backendAvailable().then((ok) => {
      if (!live) return;
      setAvailable(ok);
      if (ok) flushFeedback();
    });
    return () => {
      live = false;
    };
  }, []);

  const openReport = useCallback((about) => setOpen(about || subject), [subject]);
  const value = useMemo(() => ({ subject, setSubject, openReport, available }), [subject, openReport, available]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {open && <ReportSheet subject={open} onClose={() => setOpen(null)} />}
    </FeedbackContext.Provider>
  );
}

// A quiet "Report a problem" button for the question on screen.
export function ReportButton({ className = "" }) {
  const { t } = useSettings();
  const { subject, openReport, available } = useFeedback();
  if (!available || !subject) return null;
  return (
    <button type="button" className={`lg-btn lg-btn--quiet fb-report-btn ${className}`} onClick={() => openReport()}>
      <Flag size={16} aria-hidden="true" /> {t.feedback.reportButton}
    </button>
  );
}

// After sending: sent, waiting for sign-in, or waiting for the connection.
export function SendResult({ result, t, onDone }) {
  const f = t.feedback;
  if (result.sent > 0 && !result.waiting) return <Feedback variant="correct" title={f.thanks}>{f.thanksBody}</Feedback>;
  if (result.signedOut) {
    return (
      <Feedback variant="info" title={f.signInTitle}>
        {f.signInBody}{" "}
        <Link to="/account" onClick={onDone}>{f.signInLink}</Link>
      </Feedback>
    );
  }
  return <Feedback variant="info" title={f.laterTitle}>{f.laterBody}</Feedback>;
}

function ReportSheet({ subject, onClose }) {
  const { t } = useSettings();
  const f = t.feedback;
  const [reason, setReason] = useState(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async (e) => {
    e.preventDefault();
    if (!reason) return;
    setBusy(true);
    queueFeedback("report", {
      game: subject.game,
      itemRef: subject.itemRef,
      reason,
      comment: comment.trim(),
      context: { ...subject.context, version: APP_VERSION },
    });
    setResult(await flushFeedback());
    setBusy(false);
  };

  return (
    <div className="fb-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fb-sheet" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <h2 id="fb-title" className="lg-heading">{f.reportTitle}</h2>
        {result ? (
          <>
            <SendResult result={result} t={t} onDone={onClose} />
            <button type="button" className="lg-btn lg-btn--primary" onClick={onClose} ref={firstRef}>{f.close}</button>
          </>
        ) : (
          <form className="lg-stack fb-form" onSubmit={send}>
            <p className="lg-caption">{f.reportIntro}</p>
            <fieldset className="fb-reasons">
              <legend className="lg-menu__label">{f.reasonLabel}</legend>
              <div className="lg-chips">
                {REPORT_REASONS.map((r, i) => (
                  <button
                    key={r}
                    type="button"
                    ref={i === 0 ? firstRef : undefined}
                    className={`lg-chip ${reason === r ? "lg-chip--on" : ""}`}
                    aria-pressed={reason === r}
                    onClick={() => setReason(r)}
                  >
                    {f.reasons[r]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="lg-field">
              <span>{f.commentLabel}</span>
              <textarea className="lg-input" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <div className="lg-row">
              <button type="submit" className="lg-btn lg-btn--primary" disabled={!reason || busy}>{busy ? f.sending : f.send}</button>
              <button type="button" className="lg-btn lg-btn--quiet" onClick={onClose}>{f.cancel}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
