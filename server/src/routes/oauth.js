// /api/oauth/*: how an AI connector (claude.ai's, or any MCP client that
// speaks OAuth) gets a token for /api/mcp. The connector registers itself,
// sends the person to /api/oauth/authorize, where Lingo shows who is asking and
// they allow or deny it, then swaps the code for tokens. An admin connects the
// admin tools (/api/mcp); anyone with an account can connect their own
// progress (/api/mcp/me, scope "learner"). The logic is
// in mcp/oauth.js; docs/backend.md, "AI tools (MCP)".

import { COOKIE, findSession } from "../sessions.js";
import { randomToken, safeEqual, sha256 } from "../lib/crypto.js";
import { isAdmin } from "./admin.js";
import {
  REQUEST_MS,
  createCode,
  findClient,
  issueTokens,
  pkceMatches,
  redirectAllowed,
  refreshTokens,
  registerClient,
  requestedScope,
  resourceMetadata,
  serverMetadata,
  takeCode,
} from "../mcp/oauth.js";

const RECENT_SIGN_IN_MS = 24 * 3600_000;
const DAY = 24 * 3600_000;
const REGISTRATIONS_PER_DAY = 30;
const AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"];
const RESUME_COOKIE = "lingo_oauth_resume";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STYLE = `body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1d2433;background:#f7f5f0}
h1{font-size:1.4rem}ul{padding-left:1.2rem}.row{display:flex;gap:.75rem;margin-top:1.5rem}
button,a.btn{font:inherit;padding:.6rem 1.2rem;border-radius:.6rem;border:1px solid #1d2433;background:#fff;color:#1d2433;text-decoration:none;cursor:pointer}
button.primary{background:#1d2433;color:#fff}.small{color:#5b6475;font-size:.9rem}
@media (prefers-color-scheme:dark){body{background:#151922;color:#e8eaf0}button,a.btn{background:#222836;color:#e8eaf0;border-color:#e8eaf0}button.primary{background:#e8eaf0;color:#151922}.small{color:#a5adbd}}`;

// A small page of the API's own (the approval is a step of the connector's
// sign-in, not part of the app). The form may post here and then redirect to
// the connector, so form-action allows that one origin.
function page(reply, { title, body, status = 200, formTo = null, lang = "en" }) {
  reply
    .code(status)
    .type("text/html; charset=utf-8")
    // With "no-referrer" browsers send "Origin: null" on the form's POST,
    // which the origin check below refuses.
    .header("Referrer-Policy", "same-origin")
    .header(
      "Content-Security-Policy",
      `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${formTo ? ` ${formTo}` : ""}; frame-ancestors 'none'; base-uri 'none'`
    );
  return reply.send(
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Lingo</title><style>${STYLE}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`
  );
}

function redirectWith(reply, redirectUri, params, base) {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries({ ...params, iss: base })) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  return reply.code(303).header("Location", url.toString()).send();
}

const oauthError = (reply, status, error, description) => reply.code(status).send({ error, error_description: description });

// The client's own credentials at the token endpoint: HTTP Basic or form fields.
function clientCredentials(req) {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Basic ")) {
    try {
      const [id, secret] = Buffer.from(auth.slice(6), "base64").toString().split(":").map((s) => decodeURIComponent(s || ""));
      return { id, secret };
    } catch {
      return {};
    }
  }
  return { id: req.body?.client_id, secret: req.body?.client_secret };
}

export default async function oauthRoutes(app, { db, config, limiter }) {
  const base = config.publicUrl;

  // Token requests are form-encoded (RFC 6749); so is the approval form.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 16 * 1024 }, (req, body, done) =>
    done(null, Object.fromEntries(new URLSearchParams(body)))
  );

  const metadata = (fn) => async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*").header("Cache-Control", "public, max-age=3600");
    return fn(base);
  };
  app.get("/api/oauth/protected-resource", metadata((b) => resourceMetadata(b, "admin")));
  app.get("/api/oauth/protected-resource/me", metadata((b) => resourceMetadata(b, "learner")));
  app.get("/api/oauth/metadata", metadata(serverMetadata));

  // Dynamic client registration (RFC 7591). Anyone may register, but only to
  // claude.ai's or a loopback address, and nothing works until someone signed
  // in allows it.
  app.post("/api/oauth/register", async (req, reply) => {
    if (!limiter.allow(`oauth-register:${req.ip}`, REGISTRATIONS_PER_DAY, DAY)) return oauthError(reply, 429, "too_many_requests", "Try again tomorrow");
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const uris = b.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5 || !uris.every((u) => redirectAllowed(u, config))) {
      return oauthError(reply, 400, "invalid_redirect_uri", "Redirect addresses must be claude.ai's or loopback");
    }
    const method = b.token_endpoint_auth_method ?? "client_secret_basic";
    if (!AUTH_METHODS.includes(method)) return oauthError(reply, 400, "invalid_client_metadata", "Unsupported token_endpoint_auth_method");
    if (b.grant_types && !(Array.isArray(b.grant_types) && b.grant_types.every((g) => ["authorization_code", "refresh_token"].includes(g)))) {
      return oauthError(reply, 400, "invalid_client_metadata", "Unsupported grant_types");
    }
    const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 80) : "AI assistant";
    const client = registerClient(db, { name, redirectUris: uris, withSecret: method !== "none" });
    req.log.info({ clientId: client.id, name }, "oauth client registered");
    return reply.code(201).send({
      client_id: client.id,
      ...(client.secret ? { client_secret: client.secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
    });
  });

  // The approval page.
  app.get("/api/oauth/authorize", async (req, reply) => {
    const q = req.query;
    const client = findClient(db, q.client_id);
    if (!client || !client.redirect_uris.includes(q.redirect_uri)) {
      return page(reply, { status: 400, title: "Can't connect", body: "<p>This sign-in link is not valid. Start again from your AI app.</p>" });
    }
    const fail = (error, description) => redirectWith(reply, q.redirect_uri, { error, error_description: description, state: q.state }, base);
    if (q.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code");
    if (q.code_challenge_method !== "S256" || typeof q.code_challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge)) {
      return fail("invalid_request", "PKCE with S256 is required");
    }
    const scope = requestedScope(q, base);
    if (!scope) return fail("invalid_scope", 'One scope: "admin" (for /api/mcp) or "learner" (for /api/mcp/me)');
    const forAdmin = scope === "admin";

    // Signing in happens in the app; /account?next=oauth then opens
    // /api/oauth/continue, which comes back to this page.
    const signIn = "/account?next=oauth";
    const remember = () => {
      const id = randomToken();
      db.prepare("INSERT INTO oauth_resume (id, url, expires_at) VALUES (?, ?, ?)").run(id, req.url, Date.now() + REQUEST_MS);
      reply.setCookie(RESUME_COOKIE, id, { path: "/api/oauth", httpOnly: true, secure: config.cookieSecure, sameSite: "lax", maxAge: REQUEST_MS / 1000 });
    };
    const s = findSession(db, req.cookies[COOKIE]);
    if (!s) {
      remember();
      return page(reply, {
        title: "Sign in to Lingo",
        body: `<p>${esc(client.name)} wants to connect to Lingo. Sign in with your ${forAdmin ? "admin " : "Lingo "}account first; you'll come back here.</p><div class="row"><a class="btn" href="${esc(signIn)}">Sign in</a></div>`,
      });
    }
    if (forAdmin && !isAdmin(db, config, { id: s.user_id, email: s.email, role: s.role })) {
      return page(reply, { status: 403, title: "Not an admin", body: "<p>Only Lingo's admins can connect AI tools.</p>" });
    }
    if (Date.now() - s.auth_at > RECENT_SIGN_IN_MS) {
      remember();
      return page(reply, {
        title: "Sign in again",
        body: `<p>Connecting an AI tool needs a sign-in from the last day. On the Account page, sign out and sign in again; you'll come back here.</p><div class="row"><a class="btn" href="${esc(signIn)}">Account</a></div>`,
      });
    }

    const id = randomToken();
    db.prepare("INSERT INTO oauth_requests (id, user_id, client_id, params, expires_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      s.user_id,
      client.id,
      JSON.stringify({ redirect_uri: q.redirect_uri, code_challenge: q.code_challenge, state: q.state ?? null, scope }),
      Date.now() + REQUEST_MS
    );
    const to = new URL(q.redirect_uri);
    const form = `<form method="post" action="/api/oauth/authorize"><input type="hidden" name="request" value="${esc(id)}"><div class="row"><button class="primary" name="decision" value="allow">${s.lang === "fi" && !forAdmin ? "Salli" : "Allow"}</button><button name="decision" value="deny">${s.lang === "fi" && !forAdmin ? "Estä" : "Deny"}</button></div></form>`;
    if (!forAdmin) {
      const fi = s.lang === "fi";
      return page(reply, {
        title: fi ? `Yhdistetäänkö ${client.name}?` : `Connect ${client.name}?`,
        lang: fi ? "fi" : "en",
        formTo: to.origin,
        body: fi
          ? `<p><strong>${esc(client.name)}</strong> (palaa osoitteeseen ${esc(to.host)}) pyytää lupaa lukea Lingon edistymistäsi tililtä ${esc(s.email)}. Se voi:</p>
<ul><li>lukea tasosi, putkesi, pelisi, sanasi ja virheesi</li><li>lukea Oman polkusi ja sen, mitä Lingo päättelee oppimisestasi</li></ul>
<p>Se ei voi muuttaa mitään eikä nähdä muiden oppijoiden tietoja.</p>
<p class="small">Salli vain, jos aloitit yhdistämisen juuri itse. Voit katkaista yhteyden milloin tahansa: Tili → Tekoälyavustaja.</p>${form}`
          : `<p><strong>${esc(client.name)}</strong> (returns to ${esc(to.host)}) asks to read your Lingo progress as ${esc(s.email)}. It will be able to:</p>
<ul><li>read your level, streak, games, words and mistakes</li><li>read your My path and what Lingo makes of your learning</li></ul>
<p>It can't change anything or see other learners.</p>
<p class="small">Only allow this if you just started connecting it yourself. You can disconnect it any time under Account → AI assistant.</p>${form}`,
      });
    }
    return page(reply, {
      title: `Connect ${client.name}?`,
      formTo: to.origin,
      body: `<p><strong>${esc(client.name)}</strong> (returns to ${esc(to.host)}) asks to use Lingo's admin tools as ${esc(s.email)}. It will be able to:</p>
<ul><li>read the statistics, problem reports and suggestions</li><li>read each learner's progress, by account number (never email addresses)</li><li>mark reports fixed or dismissed, and suggestions accepted or dismissed</li></ul>
<p class="small">Only allow this if you just started connecting it yourself. You can disconnect it any time under Account → AI tools.</p>${form}`,
    });
  });

  // Back to the approval page after signing in (see `remember` above).
  app.get("/api/oauth/continue", async (req, reply) => {
    const id = req.cookies[RESUME_COOKIE];
    const row = typeof id === "string" && db.prepare("SELECT url, expires_at FROM oauth_resume WHERE id = ?").get(id);
    if (row) db.prepare("DELETE FROM oauth_resume WHERE id = ?").run(id);
    reply.clearCookie(RESUME_COOKIE, { path: "/api/oauth" });
    const ok = row && row.expires_at > Date.now() && row.url.startsWith("/api/oauth/authorize?");
    return reply.code(303).header("Location", ok ? row.url : "/account").send();
  });

  app.post("/api/oauth/authorize", async (req, reply) => {
    // The form is Lingo's own; the X-Lingo header check doesn't apply to
    // plain forms, so the origin is checked here, and the request id only
    // works for the admin who opened the page.
    const origin = req.headers.origin;
    if (origin && !config.origins.includes(origin)) return reply.code(403).send({ error: "forbidden" });
    const s = findSession(db, req.cookies[COOKIE]);
    const id = typeof req.body?.request === "string" ? req.body.request : "";
    const row = s && db.prepare("SELECT * FROM oauth_requests WHERE id = ? AND user_id = ?").get(id, s.user_id);
    if (row) db.prepare("DELETE FROM oauth_requests WHERE id = ?").run(id);
    const params = row ? JSON.parse(row.params) : {};
    // Requests from before the learner scope have none: admin.
    const scope = params.scope || "admin";
    if (!row || row.expires_at <= Date.now() || (scope === "admin" && !isAdmin(db, config, { id: s.user_id, email: s.email, role: s.role }))) {
      return page(reply, { status: 400, title: "Can't connect", body: "<p>This approval page has expired. Start again from your AI app.</p>" });
    }
    if (req.body?.decision !== "allow") {
      return redirectWith(reply, params.redirect_uri, { error: "access_denied", state: params.state }, base);
    }
    const code = createCode(db, { clientId: row.client_id, userId: s.user_id, redirectUri: params.redirect_uri, codeChallenge: params.code_challenge, scope });
    req.log.info({ clientId: row.client_id, scope }, "oauth client allowed");
    return redirectWith(reply, params.redirect_uri, { code, state: params.state }, base);
  });

  app.post("/api/oauth/token", async (req, reply) => {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const creds = clientCredentials(req);
    const client = findClient(db, creds.id);
    if (!client) return oauthError(reply, 401, "invalid_client", "Unknown client");
    if (client.secret_hash && !(typeof creds.secret === "string" && safeEqual(sha256(creds.secret), client.secret_hash))) {
      return oauthError(reply, 401, "invalid_client", "Wrong client secret");
    }
    // An admin grant needs the account to still be an admin; a learner's,
    // only the account.
    const stillAllowed = (userId, scope) => {
      const u = db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(userId);
      return Boolean(u) && (scope === "learner" || isAdmin(db, config, u));
    };

    if (b.grant_type === "authorization_code") {
      const grant = takeCode(db, b.code);
      if (!grant || grant.client_id !== client.id || grant.redirect_uri !== b.redirect_uri) return oauthError(reply, 400, "invalid_grant", "Unknown, used or expired code");
      if (!pkceMatches(b.code_verifier, grant.code_challenge)) return oauthError(reply, 400, "invalid_grant", "code_verifier doesn't match");
      if (!stillAllowed(grant.user_id, grant.scope)) return oauthError(reply, 400, "invalid_grant", "The account is no longer an admin");
      return issueTokens(db, { client, userId: grant.user_id, scope: grant.scope });
    }
    if (b.grant_type === "refresh_token") {
      const out = refreshTokens(db, { client, refreshToken: b.refresh_token });
      if (!out) return oauthError(reply, 400, "invalid_grant", "Unknown or expired refresh token");
      if (!stillAllowed(out.userId, out.scope)) return oauthError(reply, 400, "invalid_grant", "The account is no longer an admin");
      return out.response;
    }
    return oauthError(reply, 400, "unsupported_grant_type", "authorization_code or refresh_token");
  });
}
