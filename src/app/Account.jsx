import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Mail } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { GameScreen, Feedback } from "../components/lingo";
import { fill } from "../i18n";
import { api, backendAvailable } from "../lib/backend";
import { addPasskey, passkeysSupported, signInWithPasskey } from "../lib/passkeys";
import { flushFeedback } from "../lib/feedback";

// /account: optional sign-in with a passkey or an emailed code, and the
// signed-in learner's passkeys, devices and data. Reached from Settings only
// when the backend answers (docs/backend.md).

const errorText = (t, code) => (code === "cancelled" ? null : t.account.errors[code] || t.account.errors.other);

function formatDate(iso, lang) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(lang === "fi" ? "fi-FI" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}

function ErrorLine({ text }) {
  return text ? <Feedback variant="retry" icon="!" title={text} /> : null;
}

// Signed out: passkey first, then the emailed code (also how accounts are made).
function SignIn({ t, lang, onSignedIn, onAction }) {
  const a = t.account;
  const supported = passkeysSupported();
  const [step, setStep] = useState(supported ? "start" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    onAction?.();
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const passkey = () =>
    run(async () => {
      const res = await signInWithPasskey();
      if (res.ok) onSignedIn({ viaCode: false });
      else setError(errorText(t, res.error));
    });

  const sendCode = (e) => {
    e?.preventDefault();
    return run(async () => {
      const res = await api("/auth/code", { method: "POST", body: { email, lang } });
      if (res.ok) {
        setStep("code");
        setCode("");
      } else setError(errorText(t, res.data?.error || "offline"));
    });
  };

  const verify = (e) => {
    e.preventDefault();
    return run(async () => {
      const res = await api("/auth/verify", { method: "POST", body: { email, code: code.replace(/\s/g, ""), lang } });
      if (res.ok) onSignedIn({ viaCode: true, passkeys: res.data.passkeys });
      else setError(errorText(t, res.data?.error || "offline"));
    });
  };

  return (
    <section className="lg-section ac-signin">
      {step === "start" && (
        <>
          <button type="button" className="lg-btn lg-btn--primary" onClick={passkey} disabled={busy}>
            <KeyRound size={20} aria-hidden="true" /> {a.passkeySignIn}
          </button>
          <p className="lg-caption">{a.passkeyHint}</p>
          <ErrorLine text={error} />
          <button type="button" className="lg-btn lg-btn--quiet" onClick={() => { setError(null); setStep("email"); }}>
            <Mail size={20} aria-hidden="true" /> {a.emailInstead}
          </button>
          <p className="lg-caption">{a.newHereShort}</p>
        </>
      )}

      {step === "email" && (
        <form className="lg-stack" onSubmit={sendCode}>
          <p>{a.newHere}</p>
          <label className="lg-field">
            {a.emailLabel}
            <input
              className="lg-input"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <ErrorLine text={error} />
          <div className="lg-row">
            <button type="submit" className="lg-btn lg-btn--primary" disabled={busy || !email.trim()}>{a.sendCode}</button>
            {supported && (
              <button type="button" className="lg-btn lg-btn--quiet" onClick={() => { setError(null); setStep("start"); }}>
                {a.passkeySignIn}
              </button>
            )}
          </div>
        </form>
      )}

      {step === "code" && (
        <form className="lg-stack" onSubmit={verify}>
          <p>{fill(a.codeSent, { email: email.trim() })}</p>
          <label className="lg-field">
            {a.codeLabel}
            <input
              className="lg-input ac-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <ErrorLine text={error} />
          <div className="lg-row">
            <button type="submit" className="lg-btn lg-btn--primary" disabled={busy || code.replace(/\s/g, "").length !== 6}>
              {a.signIn}
            </button>
            <button type="button" className="lg-btn lg-btn--quiet" onClick={sendCode} disabled={busy}>{a.resend}</button>
            <button type="button" className="lg-btn lg-btn--quiet" onClick={() => { setError(null); setStep("email"); }}>
              {a.otherEmail}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// After a code sign-in on a device that can make passkeys.
function OfferPasskey({ t, onDone }) {
  const a = t.account;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const add = async () => {
    setBusy(true);
    setError(null);
    const res = await addPasskey();
    setBusy(false);
    if (res.ok) onDone();
    else setError(errorText(t, res.error));
  };
  return (
    <section className="lg-section">
      <h2 className="lg-heading">{a.addPasskeyTitle}</h2>
      <p>{a.addPasskeyText}</p>
      <ErrorLine text={error} />
      <div className="lg-row">
        <button type="button" className="lg-btn lg-btn--primary" onClick={add} disabled={busy}>
          <KeyRound size={20} aria-hidden="true" /> {a.addPasskey}
        </button>
        <button type="button" className="lg-btn lg-btn--quiet" onClick={onDone}>{a.notNow}</button>
      </div>
    </section>
  );
}

// Reports and suggestions sent from this account, with whether they're fixed.
function MyFeedback({ t, me }) {
  const f = t.feedback;
  const list = me.feedback
    ? [
        ...me.feedback.reports.map((r) => ({
          key: `r${r.id}`,
          title: `${f.reasons[r.reason] || r.reason}: ${r.context?.answer || r.itemRef.replace(/^answer:/, "")}`,
          status: r.status,
          at: r.createdAt,
        })),
        ...me.feedback.suggestions.map((s) => ({ key: `s${s.id}`, title: `${f.kinds[s.kind] || s.kind}: ${s.text}`, status: s.status, at: s.createdAt })),
      ].sort((a, b) => b.at.localeCompare(a.at))
    : [];
  return (
    <section className="lg-section">
      <h2 className="lg-heading">{f.mineTitle}</h2>
      {me.waiting > 0 && <p className="lg-caption">{fill(f.waiting, { n: me.waiting })}</p>}
      {list.length === 0 ? (
        <p className="lg-caption">{f.mineEmpty}</p>
      ) : (
        <ul className="ac-list">
          {list.map((item) => (
            <li key={item.key} className="ac-item">
              <span className="ac-item__name">{item.title}</span>
              <span className="fb-status">{f.status[item.status] || item.status}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/suggest" className="lg-btn lg-btn--quiet">{f.suggestLink}</Link>
    </section>
  );
}

function SignedIn({ t, lang, me, reload, onSignedOut }) {
  const a = t.account;
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (fn) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.status === 401) return onSignedOut(t.account.errors.signed_out);
    if (!res.ok) return setError(errorText(t, res.error || res.data?.error || "offline"));
    return res;
  };

  const add = async () => {
    if (await act(async () => {
      const r = await addPasskey();
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    })) reload();
  };
  const removePasskey = async (id) => (await act(() => api(`/me/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" }))) && reload();
  const signOutDevice = async (id) => (await act(() => api(`/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }))) && reload();
  const signOut = async () => {
    await api("/auth/logout", { method: "POST" });
    onSignedOut(null);
  };
  const download = async () => {
    const res = await act(() => api("/me/export"));
    if (!res) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "lingo-account.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const deleteAccount = async (e) => {
    e.preventDefault();
    if (await act(() => api("/me", { method: "DELETE", body: { confirm } }))) onSignedOut(a.deleted);
  };

  return (
    <>
      <section className="lg-section">
        <p className="lg-body-lg">{fill(a.signedInAs, { email: me.user.email })}</p>
        <p className="lg-caption">{a.comingSoon}</p>
        <ErrorLine text={error} />
      </section>

      <section className="lg-section">
        <h2 className="lg-heading">{a.passkeysTitle}</h2>
        {me.passkeys.length === 0 && <p className="lg-caption">{a.noPasskeys}</p>}
        <ul className="ac-list">
          {me.passkeys.map((p) => (
            <li key={p.id} className="ac-item">
              <span className="ac-item__text">
                <span className="ac-item__name">{p.name}{p.synced ? ` · ${a.synced}` : ""}</span>
                <span className="lg-caption">
                  {fill(a.added, { date: formatDate(p.createdAt, lang) })}
                  {p.lastUsedAt ? `, ${fill(a.lastUsed, { date: formatDate(p.lastUsedAt, lang) })}` : ""}
                </span>
              </span>
              <button type="button" className="lg-btn lg-btn--quiet" onClick={() => removePasskey(p.id)} disabled={busy} aria-label={fill(a.removeAria, { name: p.name })}>
                {a.remove}
              </button>
            </li>
          ))}
        </ul>
        {passkeysSupported() && (
          <button type="button" className="lg-btn lg-btn--secondary" onClick={add} disabled={busy}>
            <KeyRound size={20} aria-hidden="true" /> {a.addPasskeyHere}
          </button>
        )}
      </section>

      <section className="lg-section">
        <h2 className="lg-heading">{a.devicesTitle}</h2>
        <ul className="ac-list">
          {me.sessions.map((s) => (
            <li key={s.id} className="ac-item">
              <span className="ac-item__text">
                <span className="ac-item__name">{s.device}</span>
                <span className="lg-caption">{s.current ? a.thisDevice : fill(a.lastSeen, { date: formatDate(s.lastSeenAt, lang) })}</span>
              </span>
              {!s.current && (
                <button type="button" className="lg-btn lg-btn--quiet" onClick={() => signOutDevice(s.id)} disabled={busy} aria-label={fill(a.signOutDeviceAria, { device: s.device })}>
                  {a.signOutDevice}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <MyFeedback t={t} me={me} />

      {me.user.role === "admin" && (
        <section className="lg-section">
          <Link to="/admin/reports" className="lg-btn lg-btn--secondary">{a.adminQueue}</Link>
        </section>
      )}

      <section className="lg-section">
        <h2 className="lg-heading">{a.dataTitle}</h2>
        <p className="lg-caption">{a.dataText}</p>
        <div className="lg-row">
          <button type="button" className="lg-btn lg-btn--secondary" onClick={download} disabled={busy}>{a.download}</button>
          <button type="button" className="lg-btn lg-btn--secondary" onClick={signOut} disabled={busy}>{a.signOut}</button>
        </div>
        <details className="lg-details">
          <summary>{a.deleteTitle}</summary>
          <form className="lg-stack" onSubmit={deleteAccount}>
            <p className="lg-caption">{a.deleteText}</p>
            <label className="lg-field">
              {a.emailLabel}
              <input className="lg-input" type="email" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <button type="submit" className="lg-btn ac-danger" disabled={busy || !confirm.trim()}>{a.deleteButton}</button>
          </form>
        </details>
      </section>
    </>
  );
}

export default function Account() {
  const { t, lang } = useSettings();
  const a = t.account;
  // loading | unavailable | signedOut | offerPasskey | signedIn
  const [view, setView] = useState("loading");
  const [me, setMe] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!(await backendAvailable())) return setView("unavailable");
    const res = await api("/me");
    if (res.ok) {
      // Reports written while signed out go now, then the list shows them.
      const flushed = await flushFeedback();
      const feedback = await api("/me/feedback");
      setMe({ ...res.data, feedback: feedback.ok ? feedback.data : null, waiting: flushed.waiting });
      setView((v) => (v === "offerPasskey" ? v : "signedIn"));
    } else setView(res.status === 401 ? "signedOut" : "unavailable");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const signedIn = async ({ viaCode, passkeys }) => {
    setNotice(null);
    setMe(null);
    if (viaCode && passkeys === 0 && passkeysSupported()) setView("offerPasskey");
    await load();
  };
  const signedOut = (message) => {
    setMe(null);
    setNotice(message);
    setView("signedOut");
  };

  return (
    <GameScreen title={a.title}>
      <main className="lg-board lg-page">
        {view !== "signedIn" && view !== "offerPasskey" && <p className="lg-body-lg">{a.intro}</p>}
        {notice && <Feedback variant="info" icon="i" title={notice} />}
        {view === "unavailable" && <Feedback variant="info" icon="i" title={a.unavailable} />}
        {view === "signedOut" && <SignIn t={t} lang={lang} onSignedIn={signedIn} onAction={() => setNotice(null)} />}
        {view === "offerPasskey" && (
          <OfferPasskey
            t={t}
            onDone={() => {
              setView("signedIn");
              load();
            }}
          />
        )}
        {view === "signedIn" && me && <SignedIn t={t} lang={lang} me={me} reload={load} onSignedOut={signedOut} />}
        <p className="lg-caption"><Link to="/privacy">{a.privacy}</Link></p>
      </main>
    </GameScreen>
  );
}
