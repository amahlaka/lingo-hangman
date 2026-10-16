import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GameScreen } from "../components/lingo";
import { api, backendAvailable } from "../lib/backend";
import { GATES } from "./AdminReports";

// /admin/users: learner accounts, for granting the extended on-demand speech
// limit (server/src/routes/admin.js). Learners who asked for more come first.
// Admins come from ADMIN_EMAILS and are not changed here. English only, like
// the other admin pages.

const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function AdminUsers() {
  const [gate, setGate] = useState(null);
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query = "") => {
    if (!(await backendAvailable())) return setGate("unavailable");
    const res = await api(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (!res.ok) return setGate(res.data?.error in GATES ? res.data.error : res.status === 0 ? "unavailable" : "signed_out");
    setGate(null);
    setData(res.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setRole = async (id, role) => {
    setBusy(true);
    await api("/admin/users/role", { method: "POST", body: { id, role } });
    setBusy(false);
    load(q.trim());
  };

  return (
    <GameScreen title="Users">
      <main className="lg-board lg-page">
        <p className="lg-body-lg">
          Verified learners get {data ? data.limits.extended : "more"} new spoken sentences a day instead of {data ? data.limits.basic : "the basic limit"}. Learners who asked for more are at the top. See also <Link to="/admin/reports">reports</Link>.
        </p>
        {gate ? (
          <section className="lg-section">
            <p>{GATES[gate]}</p>
            {gate !== "unavailable" && gate !== "not_admin" && <Link className="lg-btn lg-btn--primary" to="/account">Sign in</Link>}
          </section>
        ) : (
          <>
            <form
              className="lg-row"
              onSubmit={(e) => {
                e.preventDefault();
                load(q.trim());
              }}
            >
              <input className="lg-input" type="search" aria-label="Find by email" placeholder="Find by email" value={q} onChange={(e) => setQ(e.target.value)} />
              <button type="submit" className="lg-btn lg-btn--secondary">Find</button>
            </form>
            {!data && <p className="lg-caption">Loading…</p>}
            {data && data.users.length === 0 && <p className="lg-caption">Nobody here.</p>}
            {data && data.users.length > 0 && (
              <ul className="ac-list">
                {data.users.map((u) => (
                  <li key={u.id} className="fb-group">
                    <div className="fb-group__head">
                      <span className="fb-group__title">{u.email}</span>
                      <span className="lg-caption">
                        {u.role === "learner" ? "Learner" : u.role === "verified" ? "Verified" : "Admin"} · joined {day(u.createdAt)} · {u.ttsToday} spoken today
                        {u.ttsRequestedAt ? ` · asked for more ${day(u.ttsRequestedAt)}` : ""}
                      </span>
                    </div>
                    {u.role !== "admin" && (
                      <div className="lg-row">
                        {u.role === "learner" ? (
                          <button type="button" className="lg-btn lg-btn--secondary" disabled={busy} onClick={() => setRole(u.id, "verified")}>Verify</button>
                        ) : (
                          <button type="button" className="lg-btn lg-btn--quiet" disabled={busy} onClick={() => setRole(u.id, "learner")}>Remove verification</button>
                        )}
                        {u.role === "learner" && u.ttsRequestedAt && (
                          <button type="button" className="lg-btn lg-btn--quiet" disabled={busy} onClick={() => setRole(u.id, "learner")}>Decline</button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </GameScreen>
  );
}
