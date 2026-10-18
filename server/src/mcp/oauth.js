// OAuth 2.1 for the MCP endpoint, so connectors such as claude.ai's can sign
// in without a hand-copied token (docs/backend.md, "AI tools (MCP)"): dynamic
// client registration, the authorization code flow with PKCE (S256 only) and
// rotating refresh tokens. The approval page itself is in routes/oauth.js.

import { randomToken, sha256 } from "../lib/crypto.js";
import { TOKEN_PREFIX } from "./tokens.js";

// "admin" for /api/mcp (admins only), "learner" for /api/mcp/me (anyone with
// an account, their own progress only).
export const SCOPES = ["admin", "learner"];
export const RESOURCE_PATHS = { admin: "/api/mcp", learner: "/api/mcp/me" };
// Where each endpoint's 401 points (routes/oauth.js serves both).
export const METADATA_PATHS = { admin: "/api/oauth/protected-resource", learner: "/api/oauth/protected-resource/me" };
export const ACCESS_TOKEN_SECONDS = 3600;
export const REFRESH_TOKEN_DAYS = 90;
export const CODE_MS = 10 * 60_000;
export const REQUEST_MS = 10 * 60_000;
const UNUSED_CLIENT_MS = 86400_000;
const REFRESH_PREFIX = "lingo_refresh_";

// claude.ai's callbacks; other clients need OAUTH_REDIRECT_URIS on the server.
export const KNOWN_REDIRECTS = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"];

// The protected resources (RFC 9728): what each MCP endpoint's 401 points to.
export function resourceMetadata(base, scope = "admin") {
  return {
    resource: `${base}${RESOURCE_PATHS[scope]}`,
    authorization_servers: [base],
    scopes_supported: [scope],
    bearer_methods_supported: ["header"],
    resource_name: scope === "admin" ? "Lingo admin" : "Lingo: my progress",
  };
}

// The scope an authorization request asks for, from its scope and resource
// (RFC 8707) parameters, or null when they don't name one scope. Neither
// means admin, as before the learner scope existed.
export function requestedScope(q, base) {
  const asked = typeof q.scope === "string" && q.scope.trim() ? [...new Set(q.scope.trim().split(/\s+/))] : [];
  if (asked.length > 1 || (asked[0] && !SCOPES.includes(asked[0]))) return null;
  let byResource = null;
  if (typeof q.resource === "string" && q.resource) {
    const path = q.resource.startsWith(base) ? q.resource.slice(base.length).replace(/\/$/, "") : null;
    byResource = SCOPES.find((s) => RESOURCE_PATHS[s] === path) || null;
    if (!byResource) return null;
  }
  if (asked[0] && byResource && asked[0] !== byResource) return null;
  return asked[0] || byResource || "admin";
}

// The authorization server (RFC 8414). Clients look for it at
// <base>/.well-known/oauth-authorization-server, which the static nginx
// serves (deploy/preview/nginx.conf has a copy; a test keeps them equal).
export function serverMetadata(base) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: SCOPES,
    authorization_response_iss_parameter_supported: true,
  };
}

// claude.ai's callbacks, any loopback address (local tools such as Claude
// Code listen there), and whatever OAUTH_REDIRECT_URIS adds.
export function redirectAllowed(uri, config) {
  if (typeof uri !== "string" || uri.length > 500) return false;
  if (KNOWN_REDIRECTS.includes(uri) || config.oauthRedirectUris.includes(uri)) return true;
  try {
    const u = new URL(uri);
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

export function registerClient(db, { name, redirectUris, withSecret }) {
  const id = `lingo_client_${randomToken(12)}`;
  const secret = withSecret ? randomToken() : null;
  db.prepare("INSERT INTO oauth_clients (id, secret_hash, name, redirect_uris) VALUES (?, ?, ?, ?)").run(
    id,
    secret && sha256(secret),
    name,
    JSON.stringify(redirectUris)
  );
  return { id, secret };
}

export function findClient(db, id) {
  if (typeof id !== "string" || id.length > 100) return null;
  const row = db.prepare("SELECT * FROM oauth_clients WHERE id = ?").get(id);
  return row ? { ...row, redirect_uris: JSON.parse(row.redirect_uris) } : null;
}

export function createCode(db, { clientId, userId, redirectUri, codeChallenge, scope }, now = Date.now()) {
  const code = randomToken();
  db.prepare(
    "INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(sha256(code), clientId, userId, redirectUri, codeChallenge, scope, now + CODE_MS);
  return code;
}

// The code's grant, used up whether or not the rest checks out.
export function takeCode(db, code, now = Date.now()) {
  if (typeof code !== "string" || code.length > 100) return null;
  const hash = sha256(code);
  const row = db.prepare("SELECT * FROM oauth_codes WHERE code_hash = ?").get(hash);
  if (!row) return null;
  db.prepare("DELETE FROM oauth_codes WHERE code_hash = ?").run(hash);
  return row.expires_at > now ? row : null;
}

// PKCE S256: base64url(sha256(verifier)) must equal the challenge.
export const pkceMatches = (verifier, challenge) =>
  typeof verifier === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) && sha256(verifier) === challenge;

function newTokens(now) {
  const access = TOKEN_PREFIX + randomToken();
  const refresh = REFRESH_PREFIX + randomToken();
  return {
    access,
    refresh,
    accessExpires: new Date(now + ACCESS_TOKEN_SECONDS * 1000).toISOString(),
    refreshExpires: new Date(now + REFRESH_TOKEN_DAYS * 86400_000).toISOString(),
  };
}

const tokenResponse = (t, scope) => ({
  access_token: t.access,
  token_type: "Bearer",
  expires_in: ACCESS_TOKEN_SECONDS,
  refresh_token: t.refresh,
  scope,
});

// A new approval: one api_tokens row, listed under the client's name on
// /admin/ai (admin) or the Account page (learner).
export function issueTokens(db, { client, userId, scope }, now = Date.now()) {
  const t = newTokens(now);
  db.prepare(
    `INSERT INTO api_tokens (user_id, token_hash, name, scope, expires_at, client_id, refresh_hash, refresh_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, sha256(t.access), client.name, scope, t.accessExpires, client.id, sha256(t.refresh), t.refreshExpires);
  return tokenResponse(t, scope);
}

// Renews an approval's tokens in place; the old refresh token stops working.
// Returns null for an unknown, expired or other client's refresh token.
export function refreshTokens(db, { client, refreshToken }, now = Date.now()) {
  if (typeof refreshToken !== "string" || !refreshToken.startsWith(REFRESH_PREFIX) || refreshToken.length > 120) return null;
  const row = db.prepare("SELECT id, user_id, client_id, scope, refresh_expires_at FROM api_tokens WHERE refresh_hash = ?").get(sha256(refreshToken));
  if (!row || row.client_id !== client.id || Date.parse(row.refresh_expires_at) <= now) return null;
  const t = newTokens(now);
  db.prepare("UPDATE api_tokens SET token_hash = ?, expires_at = ?, refresh_hash = ?, refresh_expires_at = ? WHERE id = ?").run(
    sha256(t.access),
    t.accessExpires,
    sha256(t.refresh),
    t.refreshExpires,
    row.id
  );
  return { userId: row.user_id, scope: row.scope, response: tokenResponse(t, row.scope) };
}

export function deleteExpiredOauth(db, now = Date.now()) {
  db.prepare("DELETE FROM oauth_requests WHERE expires_at <= ?").run(now);
  db.prepare("DELETE FROM oauth_codes WHERE expires_at <= ?").run(now);
  db.prepare("DELETE FROM oauth_resume WHERE expires_at <= ?").run(now);
  // Registrations nobody approved within a day.
  db.prepare(
    `DELETE FROM oauth_clients WHERE created_at <= ?
       AND id NOT IN (SELECT client_id FROM api_tokens WHERE client_id IS NOT NULL)
       AND id NOT IN (SELECT client_id FROM oauth_codes)`
  ).run(new Date(now - UNUSED_CLIENT_MS).toISOString());
}
