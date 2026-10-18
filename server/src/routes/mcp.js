// The Model Context Protocol endpoints for AI tools (docs/backend.md, "AI
// tools (MCP)"). Not used by the app. /api/mcp has the admin tools, for a
// token made at /admin/ai; /api/mcp/me has a learner's own progress, for a
// token made on the Account page. A token is sent as "Authorization: Bearer
// <token>", or a connector gets one through OAuth (routes/oauth.js). Each
// endpoint takes only tokens of its own scope.

import { handleMessage, failure, PARSE_ERROR, PROTOCOL_VERSIONS } from "../mcp/protocol.js";
import * as admin from "../mcp/adminTools.js";
import * as learner from "../mcp/learnerTools.js";
import { findToken } from "../mcp/tokens.js";
import { METADATA_PATHS, RESOURCE_PATHS } from "../mcp/oauth.js";
import { isAdmin } from "./admin.js";

export const MCP_PATHS = Object.values(RESOURCE_PATHS);

// The app's own icons, so connectors don't fall back to a cached favicon of
// the site.
const icons = (config) => [
  { src: `${config.publicUrl}/favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
  { src: `${config.publicUrl}/pwa-192x192.png`, mimeType: "image/png", sizes: ["192x192"] },
];

const SCOPES = {
  admin: {
    allowed: (db, config, token) => isAdmin(db, config, { id: token.user_id, email: token.email, role: token.role }),
    makeToken: "/admin/ai",
    server: (config) => ({
      info: { name: "lingo-admin", title: "Lingo admin", version: config.version, websiteUrl: config.publicUrl, icons: icons(config) },
      instructions: admin.instructions,
      tools: admin.tools,
      prompts: admin.prompts,
    }),
  },
  learner: {
    // Any account; the tools read only the token's own.
    allowed: () => true,
    makeToken: "the Account page",
    server: (config) => ({
      info: { name: "lingo-me", title: "Lingo: my progress", version: config.version, websiteUrl: config.publicUrl, icons: icons(config) },
      instructions: learner.instructions,
      tools: learner.tools,
      prompts: learner.prompts,
    }),
  },
};

const bearer = (header) => (typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : null);

export default async function mcpRoutes(app, { db, config, wordClips = null }) {
  // Streamable HTTP without the optional event stream or sessions.
  const notAllowed = async (req, reply) => reply.code(405).header("Allow", "POST").send(failure(null, -32000, "Method not allowed"));

  for (const [name, scope] of Object.entries(SCOPES)) {
    const path = RESOURCE_PATHS[name];
    app.get(path, notAllowed);
    app.delete(path, notAllowed);

    app.post(path, async (req, reply) => {
      // Against DNS rebinding: a browser's Origin must be one of the app's.
      const origin = req.headers.origin;
      if (origin && !config.origins.includes(origin)) return reply.code(403).send(failure(null, -32000, "Forbidden origin"));

      const token = findToken(db, bearer(req.headers.authorization));
      if (!token) {
        // Connectors that speak OAuth find the way to sign in from here.
        return reply
          .code(401)
          .header("WWW-Authenticate", `Bearer realm="lingo", resource_metadata="${config.publicUrl}${METADATA_PATHS[name]}", scope="${name}"`)
          .send(failure(null, -32001, `Sign in through OAuth, or make a token on ${scope.makeToken}`));
      }
      if (token.scope !== name) {
        const other = RESOURCE_PATHS[token.scope];
        return reply.code(403).send(failure(null, -32001, other ? `This token is for ${config.publicUrl}${other}` : "This token can't use these tools"));
      }
      if (!scope.allowed(db, config, token)) return reply.code(403).send(failure(null, -32001, "This token's account can't use these tools"));

      const version = req.headers["mcp-protocol-version"];
      if (version && !PROTOCOL_VERSIONS.includes(version)) return reply.code(400).send(failure(null, -32600, `Unsupported protocol version ${version}`));

      const msg = req.body;
      if (msg === undefined || msg === null || typeof msg !== "object") return reply.code(400).send(failure(null, PARSE_ERROR, "Send one JSON-RPC message as JSON"));
      if (Array.isArray(msg)) return reply.code(400).send(failure(null, -32600, "Batches are not supported"));

      const out = await handleMessage(scope.server(config), msg, { db, config, token, log: req.log, wordClips });
      if (!out) return reply.code(202).send();
      if (msg.method === "tools/call") req.log.info({ tokenId: token.id, tool: msg.params?.name }, "mcp tool");
      return out;
    });
  }
}
