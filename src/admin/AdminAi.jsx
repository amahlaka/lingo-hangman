import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GameScreen } from "../components/lingo";
import { api, backendAvailable } from "../lib/backend";
import { GATES } from "./AdminReports";

// /admin/ai: AI tools that use the API's MCP endpoint (server/src/routes/mcp.js)
// to read statistics, reports, suggestions and learners' progress, and mark
// reports fixed. claude.ai connects through OAuth (server/src/routes/oauth.js);
// other tools use a token made here, shown once. Both are listed and can be
// revoked. English only, like the other admin pages.

const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function AdminAi() {
  const [gate, setGate] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [name, setName] = useState("");
  const [days, setDays] = useState(90);
  const [made, setMade] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = `${window.location.origin}/api/mcp`;

  const load = useCallback(async () => {
    if (!(await backendAvailable())) return setGate("unavailable");
    const res = await api("/admin/tokens");
    if (!res.ok) return setGate(res.data?.error in GATES ? res.data.error : res.status === 0 ? "unavailable" : "signed_out");
    setGate(null);
    setTokens(res.data.tokens);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await api("/admin/tokens", { method: "POST", body: { name: name.trim(), days } });
    setBusy(false);
    if (res.ok) {
      setMade(res.data);
      setCopied(false);
      setName("");
    }
    load();
  };

  const revoke = async (id) => {
    setBusy(true);
    await api("/admin/tokens/revoke", { method: "POST", body: { id } });
    setBusy(false);
    if (made?.id === id) setMade(null);
    load();
  };

  const command = made ? `claude mcp add --transport http lingo-admin ${url} --header "Authorization: Bearer ${made.token}"` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // The command stays on screen to copy by hand.
    }
  };

  return (
    <GameScreen title="AI tools">
      <main className="lg-board lg-page">
        <p className="lg-body-lg">
          Let an AI assistant such as Claude read the <Link to="/admin/stats">statistics</Link>, <Link to="/admin/reports">reports and suggestions</Link> and learners' progress, mark reports fixed, and plan new content. It connects to {url} (MCP) with a token made here. It sees learners by account id, never their email.
        </p>
        {gate ? (
          <section className="lg-section">
            <p>{GATES[gate]}</p>
            {gate !== "unavailable" && gate !== "not_admin" && <Link className="lg-btn lg-btn--primary" to="/account">Sign in</Link>}
          </section>
        ) : (
          <>
            <section className="lg-section">
              <h2 className="lg-heading">Connect claude.ai</h2>
              <p>
                In Claude, open Settings → Connectors → Add custom connector, give it a name (Lingo) and the URL {url}, and leave the advanced settings empty. Claude then sends you to Lingo to allow it, signed in as an admin. It shows up under your tokens below, where you can disconnect it.
              </p>
            </section>
            <section className="lg-section">
              <h2 className="lg-heading">New token</h2>
              <p className="lg-caption">For tools that take a token instead, such as Claude Code.</p>
              <form className="lg-row" onSubmit={create}>
                <input className="lg-input" aria-label="Token name" placeholder="Name, like Claude Code on my laptop" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
                <select className="lg-input" aria-label="Valid for" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                </select>
                <button type="submit" className="lg-btn lg-btn--primary" disabled={busy || !name.trim()}>Make token</button>
              </form>
              {made && (
                <div className="fb-group">
                  <p><strong>Copy it now: this is the only time the token is shown.</strong> Anyone with it can read learners' progress, so keep it out of chats, repositories and screenshots.</p>
                  <p className="lg-caption">For Claude Code, run:</p>
                  <pre className="fb-context" aria-label="Setup command">{command}</pre>
                  <div className="lg-row">
                    <button type="button" className="lg-btn lg-btn--secondary" onClick={copy}>{copied ? "Copied" : "Copy command"}</button>
                    <button type="button" className="lg-btn lg-btn--quiet" onClick={() => setMade(null)}>Done</button>
                  </div>
                  <p className="lg-caption">Other MCP clients: server URL {url}, header Authorization: Bearer and the token. Then ask, for example, "Go through the open reports" or use the plan_content prompt.</p>
                </div>
              )}
            </section>
            <section className="lg-section">
              <h2 className="lg-heading">Your tokens</h2>
              {!tokens && <p className="lg-caption">Loading…</p>}
              {tokens && tokens.length === 0 && <p className="lg-caption">None yet.</p>}
              {tokens && tokens.length > 0 && (
                <ul className="ac-list">
                  {tokens.map((tk) => (
                    <li key={tk.id} className="fb-group">
                      <div className="fb-group__head">
                        <span className="fb-group__title">{tk.name}{tk.connector ? " (connector)" : ""}</span>
                        <span className="lg-caption">
                          made {day(tk.createdAt)} · works until {day(tk.expiresAt)} · {tk.lastUsedAt ? `last used ${day(tk.lastUsedAt)}` : "not used yet"}
                        </span>
                      </div>
                      <div className="lg-row">
                        <button type="button" className="lg-btn lg-btn--quiet" disabled={busy} onClick={() => revoke(tk.id)}>{tk.connector ? "Disconnect" : "Revoke"}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </GameScreen>
  );
}
