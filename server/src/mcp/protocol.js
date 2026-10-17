// A small Model Context Protocol server over Streamable HTTP, stateless: each
// POST carries one JSON-RPC message and gets a JSON answer, with no session
// and no event stream. Enough for tools and prompts, which is all Lingo
// offers (see routes/mcp.js and docs/backend.md, "AI tools (MCP)").

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Checks tool arguments against the small part of JSON Schema the tools use
// (object, string, integer, boolean, array; enum, bounds, required) and fills
// in defaults. Returns { args } or { error }.
export function checkArgs(schema, input = {}) {
  if (!isObject(input)) return { error: "arguments must be an object" };
  const args = {};
  for (const key of Object.keys(input)) {
    if (!schema.properties?.[key]) return { error: `unknown argument "${key}"` };
  }
  for (const [key, p] of Object.entries(schema.properties || {})) {
    let v = input[key];
    if (v === undefined) {
      if (schema.required?.includes(key)) return { error: `"${key}" is required` };
      if (p.default !== undefined) args[key] = p.default;
      continue;
    }
    const err = checkValue(p, v, key);
    if (err) return { error: err };
    args[key] = v;
  }
  return { args };
}

function checkValue(p, v, key) {
  if (p.type === "string") {
    if (typeof v !== "string") return `"${key}" must be text`;
    if (p.maxLength && v.length > p.maxLength) return `"${key}" is longer than ${p.maxLength} characters`;
  } else if (p.type === "integer") {
    if (!Number.isInteger(v)) return `"${key}" must be a whole number`;
    if (p.minimum !== undefined && v < p.minimum) return `"${key}" must be at least ${p.minimum}`;
    if (p.maximum !== undefined && v > p.maximum) return `"${key}" must be at most ${p.maximum}`;
  } else if (p.type === "boolean") {
    if (typeof v !== "boolean") return `"${key}" must be true or false`;
  } else if (p.type === "array") {
    if (!Array.isArray(v)) return `"${key}" must be a list`;
    if (p.minItems !== undefined && v.length < p.minItems) return `"${key}" needs at least ${p.minItems} items`;
    if (p.maxItems !== undefined && v.length > p.maxItems) return `"${key}" can have at most ${p.maxItems} items`;
    for (const item of v) {
      const err = checkValue(p.items, item, `${key}[]`);
      if (err) return err;
    }
  }
  if (p.enum && !p.enum.includes(v)) return `"${key}" must be one of ${p.enum.join(", ")}`;
  return null;
}

const result = (id, value) => ({ jsonrpc: "2.0", id, result: value });
const failure = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

// Answers one JSON-RPC message. Returns the response object, or null for a
// notification or a client's response (the route then answers 202).
// `server` is { info, instructions, tools, prompts }: tools are
// { name, title, description, inputSchema, annotations, run(args, ctx) } and
// prompts { name, title, description, arguments, messages(args) }.
export async function handleMessage(server, msg, ctx) {
  if (!isObject(msg) || msg.jsonrpc !== "2.0") return failure(null, INVALID_REQUEST, "Not a JSON-RPC 2.0 message");
  if (msg.method === undefined) return null; // a response to us; we never ask anything
  if (typeof msg.method !== "string") return failure(msg.id, INVALID_REQUEST, "Bad method");
  if (msg.id === undefined) return null; // notifications/initialized and the like
  const params = isObject(msg.params) ? msg.params : {};

  switch (msg.method) {
    case "initialize": {
      const asked = params.protocolVersion;
      return result(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: server.info,
        instructions: server.instructions,
      });
    }
    case "ping":
      return result(msg.id, {});
    case "tools/list":
      return result(msg.id, {
        tools: server.tools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
      });
    case "tools/call": {
      const tool = server.tools.find((t) => t.name === params.name);
      if (!tool) return failure(msg.id, INVALID_PARAMS, `Unknown tool: ${params.name}`);
      const { args, error } = checkArgs(tool.inputSchema, params.arguments ?? {});
      // Bad arguments are a tool error, so the model sees why and can retry.
      if (error) return result(msg.id, { content: [{ type: "text", text: error }], isError: true });
      try {
        const out = await tool.run(args, ctx);
        if (out?.error) return result(msg.id, { content: [{ type: "text", text: out.error }], isError: true });
        return result(msg.id, { content: [{ type: "text", text: JSON.stringify(out) }] });
      } catch (err) {
        ctx.log?.error(err, "mcp tool failed");
        return result(msg.id, { content: [{ type: "text", text: "The tool failed on the server." }], isError: true });
      }
    }
    case "prompts/list":
      return result(msg.id, {
        prompts: server.prompts.map(({ name, title, description, arguments: a }) => ({ name, title, description, arguments: a })),
      });
    case "prompts/get": {
      const prompt = server.prompts.find((p) => p.name === params.name);
      if (!prompt) return failure(msg.id, INVALID_PARAMS, `Unknown prompt: ${params.name}`);
      const args = isObject(params.arguments) ? params.arguments : {};
      return result(msg.id, { description: prompt.description, messages: prompt.messages(args) });
    }
    default:
      return failure(msg.id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
  }
}

export { PARSE_ERROR, failure };
