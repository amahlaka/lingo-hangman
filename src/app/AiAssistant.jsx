import React, { useCallback, useEffect, useState } from "react";
import { useSettings } from "./SettingsContext";
import { Feedback } from "../components/lingo";
import { fill } from "../i18n";
import { api } from "../lib/backend";

// Under Settings > Account: connect an AI assistant to the learner's own
// progress (the API's /api/mcp/me, server/src/mcp/learnerTools.js). claude.ai
// connects through OAuth; other tools use a token made here, shown once.
// Both are listed and can be revoked.

const errorText = (t, code) => t.ai.errors[code] || t.account.errors[code] || t.account.errors.other;

export function AiAssistantSection() {
  const { t, lang } = useSettings();
  const x = t.ai;
  const [tokens, setTokens] = useState(null);
  const [name, setName] = useState("");
  const [days, setDays] = useState(90);
  const [made, setMade] = useState(null);
  const [copied, setCopied] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const url = `${window.location.origin}/api/mcp/me`;
  const day = (iso) => new Date(iso).toLocaleDateString(lang === "fi" ? "fi-FI" : "en-US", { day: "numeric", month: "short", year: "numeric" });

  const load = useCallback(async () => {
    const res = await api("/me/tokens");
    setTokens(res.ok ? res.data.tokens : null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api("/me/tokens", { method: "POST", body: { name: name.trim(), days } });
    setBusy(false);
    if (res.ok) {
      setMade(res.data);
      setCopied(null);
      setName("");
    } else setError(errorText(t, res.data?.error || "offline"));
    load();
  };

  const revoke = async (id) => {
    setBusy(true);
    await api("/me/tokens/revoke", { method: "POST", body: { id } });
    setBusy(false);
    if (made?.id === id) setMade(null);
    load();
  };

  const command = made ? `claude mcp add --transport http lingo ${url} --header "Authorization: Bearer ${made.token}"` : "";
  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      // The text stays on screen to copy by hand.
    }
  };

  if (!tokens) return null;
  return (
    <section className="lg-section" id="ai-assistant">
      <h2 className="lg-heading">{x.title}</h2>
      <p className="lg-caption">{x.intro}</p>

      <h3 className="lg-subheading">{x.connectTitle}</h3>
      <p>{x.connectText}</p>
      <pre className="fb-context" aria-label={x.urlLabel}>{url}</pre>
      <div className="lg-row">
        <button type="button" className="lg-btn lg-btn--secondary" onClick={() => copy("url", url)}>{copied === "url" ? x.copied : x.copyUrl}</button>
      </div>
      <p className="lg-caption">{x.tryAsking}</p>

      <details className="lg-details" open={Boolean(made) || undefined}>
        <summary>{x.tokenTitle}</summary>
        <div className="lg-stack">
          <p className="lg-caption">{x.tokenText}</p>
          <form className="lg-row" onSubmit={create}>
            <input className="lg-input" aria-label={x.nameLabel} placeholder={x.namePlaceholder} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <select className="lg-input" aria-label={x.validFor} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={30}>{fill(x.days, { n: 30 })}</option>
              <option value={90}>{fill(x.days, { n: 90 })}</option>
              <option value={365}>{x.year}</option>
            </select>
            <button type="submit" className="lg-btn lg-btn--primary" disabled={busy || !name.trim()}>{x.make}</button>
          </form>
          {made && (
            <div className="fb-group">
              <p><strong>{x.madeTitle}</strong> {x.madeText}</p>
              <p className="lg-caption">{x.commandLabel}</p>
              <pre className="fb-context" aria-label={x.commandAria}>{command}</pre>
              <div className="lg-row">
                <button type="button" className="lg-btn lg-btn--secondary" onClick={() => copy("command", command)}>{copied === "command" ? x.copied : x.copyCommand}</button>
                <button type="button" className="lg-btn lg-btn--quiet" onClick={() => setMade(null)}>{x.done}</button>
              </div>
              <p className="lg-caption">{fill(x.otherApps, { url })}</p>
            </div>
          )}
        </div>
      </details>
      {error && <Feedback variant="error" icon="!" title={error} />}

      <h3 className="lg-subheading">{x.listTitle}</h3>
      {tokens.length === 0 ? (
        <p className="lg-caption">{x.none}</p>
      ) : (
        <ul className="ac-list">
          {tokens.map((tk) => (
            <li key={tk.id} className="ac-item">
              <span className="ac-item__text">
                <span className="ac-item__name">{tk.connector ? fill(x.connector, { name: tk.name }) : tk.name}</span>
                <span className="lg-caption">
                  {fill(x.meta, {
                    made: day(tk.createdAt),
                    until: day(tk.expiresAt),
                    used: tk.lastUsedAt ? fill(x.lastUsed, { date: day(tk.lastUsedAt) }) : x.notUsed,
                  })}
                </span>
              </span>
              <button type="button" className="lg-btn lg-btn--quiet" disabled={busy} onClick={() => revoke(tk.id)} aria-label={`${tk.connector ? x.disconnect : x.revoke}: ${tk.name}`}>
                {tk.connector ? x.disconnect : x.revoke}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
