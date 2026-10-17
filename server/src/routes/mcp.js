// /api/mcp: the Model Context Protocol endpoint for AI tools (docs/backend.md,
// "AI tools (MCP)"). Not used by the app. A token made at /admin/ai is sent as
// "Authorization: Bearer <token>", or a connector gets one through OAuth
// (routes/oauth.js); its scope picks the tools. Only "admin"
// exists now; a learner scope for personalised content can be added to
// SCOPES later with its own tools.

import { handleMessage, failure, PARSE_ERROR, PROTOCOL_VERSIONS } from "../mcp/protocol.js";
import * as admin from "../mcp/adminTools.js";
import { findToken } from "../mcp/tokens.js";
import { isAdmin } from "./admin.js";

export const MCP_PATH = "/api/mcp";

const SCOPES = {
  admin: {
    allowed: (db, config, token) => isAdmin(db, config, { id: token.user_id, email: token.email, role: token.role }),
    server: (config) => ({
      info: { name: "lingo-admin", title: "Lingo admin", version: config.version },
      instructions: admin.instructions,
      tools: admin.tools,
      prompts: admin.prompts,
    }),
  },
};

const bearer = (header) => (typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : null);

export default async function mcpRoutes(app, { db, config }) {
  // Streamable HTTP without the optional event stream or sessions.
  const notAllowed = async (req, reply) => reply.code(405).header("Allow", "POST").send(failure(null, -32000, "Method not allowed"));
  app.get(MCP_PATH, notAllowed);
  app.delete(MCP_PATH, notAllowed);

  app.post(MCP_PATH, async (req, reply) => {
    // Against DNS rebinding: a browser's Origin must be one of the app's.
    const origin = req.headers.origin;
    if (origin && !config.origins.includes(origin)) return reply.code(403).send(failure(null, -32000, "Forbidden origin"));

    const token = findToken(db, bearer(req.headers.authorization));
    if (!token) {
      // Connectors that speak OAuth find the way to sign in from here.
      return reply
        .code(401)
        .header("WWW-Authenticate", `Bearer realm="lingo", resource_metadata="${config.publicUrl}/api/oauth/protected-resource", scope="admin"`)
        .send(failure(null, -32001, "Sign in through OAuth, or make a token at /admin/ai"));
    }
    const scope = SCOPES[token.scope];
    if (!scope || !scope.allowed(db, config, token)) return reply.code(403).send(failure(null, -32001, "This token's account can't use these tools"));

    const version = req.headers["mcp-protocol-version"];
    if (version && !PROTOCOL_VERSIONS.includes(version)) return reply.code(400).send(failure(null, -32600, `Unsupported protocol version ${version}`));

    const msg = req.body;
    if (msg === undefined || msg === null || typeof msg !== "object") return reply.code(400).send(failure(null, PARSE_ERROR, "Send one JSON-RPC message as JSON"));
    if (Array.isArray(msg)) return reply.code(400).send(failure(null, -32600, "Batches are not supported"));

    const out = await handleMessage(scope.server(config), msg, { db, config, token, log: req.log });
    if (!out) return reply.code(202).send();
    if (msg.method === "tools/call") req.log.info({ tokenId: token.id, tool: msg.params?.name }, "mcp tool");
    return out;
  });
}
