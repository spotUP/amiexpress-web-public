#!/usr/bin/env node
/**
 * AmiExpress-Web Debug MCP — sidecar process that proxies HTTP introspection
 * endpoints on the running backend to Claude/other MCP clients via stdio.
 *
 * All tools are READ-ONLY in Phase 1. Mutations (kill-door, inject-input,
 * step-instruction) are deferred to Phase 2 once the read side is proven.
 *
 * Talks to http://127.0.0.1:3001/debug/api by default; override with
 *   AMIEXPRESS_DEBUG_URL=http://host:port/debug/api
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = (process.env.AMIEXPRESS_DEBUG_URL || "http://127.0.0.1:3001/debug/api").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = Number(process.env.AMIEXPRESS_DEBUG_TIMEOUT_MS || 5000);

/** Call a backend endpoint and return parsed JSON or a helpful error string. */
async function callBackend(method, pathSuffix, { query, body, timeoutOverrideMs } = {}) {
  const qs = query
    ? "?" + Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const url = `${BASE_URL}${pathSuffix}${qs}`;
  const ctrl = new AbortController();
  const effectiveTimeout = typeof timeoutOverrideMs === "number" && timeoutOverrideMs > 0
    ? timeoutOverrideMs
    : REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => ctrl.abort(), effectiveTimeout);
  try {
    const init = {
      method,
      signal: ctrl.signal,
      headers: body ? { "content-type": "application/json" } : undefined,
    };
    if (body) init.body = JSON.stringify(body);
    const resp = await fetch(url, init);
    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        error: parsed?.error || `HTTP ${resp.status}`,
        detail: parsed,
        url,
      };
    }
    return { ok: true, data: parsed, url };
  } catch (err) {
    return {
      ok: false,
      error: err.name === "AbortError" ? "timeout" : String(err),
      hint: "Is the backend running? (./dev/scripts/start-servers.sh)",
      url,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Wrap a backend call result as an MCP tool response. */
function asToolResponse(result) {
  const text = result.ok
    ? JSON.stringify(result.data, null, 2)
    : JSON.stringify({ error: result.error, status: result.status, hint: result.hint, detail: result.detail, url: result.url }, null, 2);
  return {
    content: [{ type: "text", text }],
    isError: !result.ok,
  };
}

// ---------------- Tool definitions ----------------
// Each tool has {name, description, inputSchema, handler(args)}

const TOOLS = [
  {
    name: "list_sessions",
    description:
      "List all active BBS sessions (users logged in) and all currently-running 68K door emulators. Use this first to find which nodeId has the door you want to debug.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => callBackend("GET", "/sessions"),
  },
  {
    name: "get_emulator_state",
    description:
      "Snapshot the 68K emulator for a given nodeId: current PC (with symbol annotation if the binary has HUNK_SYMBOL), all data/address registers, door id, and loaded-binary path. Returns error if no door is running on that node.",
    inputSchema: {
      type: "object",
      properties: { nodeId: { type: "integer", minimum: 1 } },
      required: ["nodeId"],
      additionalProperties: false,
    },
    handler: ({ nodeId }) => callBackend("GET", `/emulator/${nodeId}`),
  },
  {
    name: "read_memory",
    description:
      "Read N bytes from the 68K emulator's memory at an address (node-scoped). Returns an xxd-style hexdump plus raw byte array. Useful for inspecting DoorInfo structs, jhMessage contents, string buffers.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "integer", minimum: 1 },
        addr: { type: "string", description: "Hex (0x...) or decimal" },
        len: { type: "integer", minimum: 1, maximum: 4096, default: 64 },
      },
      required: ["nodeId", "addr"],
      additionalProperties: false,
    },
    handler: ({ nodeId, addr, len }) =>
      callBackend("GET", `/emulator/${nodeId}/memory`, { query: { addr, len } }),
  },
  {
    name: "resolve_pc",
    description:
      "Translate a 68K PC address to 'symbol+offset' for the door running on the given node. Omit `pc` to use the emulator's current PC. Returns null if the binary has no symbol table.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "integer", minimum: 1 },
        pc: { type: "string", description: "Hex (0x...) or decimal; defaults to current PC" },
      },
      required: ["nodeId"],
      additionalProperties: false,
    },
    handler: ({ nodeId, pc }) =>
      callBackend("GET", `/emulator/${nodeId}/resolve-pc`, { query: { pc } }),
  },
  {
    name: "list_symbols",
    description:
      "List HUNK_SYMBOL entries for the binary currently loaded on the given node. Optional substring filter via `q` (case-insensitive).",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "integer", minimum: 1 },
        q: { type: "string", description: "Substring filter" },
      },
      required: ["nodeId"],
      additionalProperties: false,
    },
    handler: ({ nodeId, q }) =>
      callBackend("GET", `/emulator/${nodeId}/symbols`, { query: { q } }),
  },
  {
    name: "get_xim_tail",
    description:
      "Return the last N XIM messages exchanged between the BBS and the door on this node (ring buffer, default 50, max 500). Each entry has cmd, cmdName, data, string, direction, timestamp. Use this instead of grepping log files during live debugging.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "integer", minimum: 1 },
        n: { type: "integer", minimum: 1, maximum: 500, default: 50 },
      },
      required: ["nodeId"],
      additionalProperties: false,
    },
    handler: ({ nodeId, n }) =>
      callBackend("GET", `/emulator/${nodeId}/xim-tail`, { query: { n } }),
  },
  {
    name: "get_output_tail",
    description:
      "Return the most recent ANSI output the BBS sent to a user's terminal on this node — a live view of what the user is actually seeing on screen. By default ANSI escapes are stripped so the text is readable; pass raw:true to get the exact bytes. Covers menu rendering, door output, system messages — everything the frontend terminal has received.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "integer", minimum: 1 },
        n: { type: "integer", minimum: 1, maximum: 500, default: 50, description: "Number of output chunks to return (one per emit)" },
        raw: { type: "boolean", default: false, description: "Keep ANSI escape sequences (default false = strip them for readability)" },
      },
      required: ["nodeId"],
      additionalProperties: false,
    },
    handler: ({ nodeId, n, raw }) =>
      callBackend("GET", `/output/${nodeId}`, { query: { n, raw: raw ? 1 : undefined } }),
  },
  {
    name: "send_input",
    description:
      "Inject text into a live BBS session as if the user typed it, then (optionally) wait for the resulting output to settle and return it. Routes to the door's input handler if a door is active, otherwise to the menu input handler. " +
      "When waitMs > 0, the call blocks until the terminal has been quiet for `quietMs` (default 400ms) or the waitMs budget elapses, then returns `newOutput` (text emitted since input was sent) and `screen` (last `lines` lines of stripped output). " +
      "This lets you 'type and see' in one shot instead of polling wait_for_output blindly. If waitMs is omitted, returns immediately with the legacy shape.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "integer", minimum: 1 },
        text: { type: "string", description: "Text to send. Use '\\r' for Enter." },
        waitMs: { type: "integer", minimum: 0, maximum: 30000, description: "If > 0, wait up to this many ms for the output to settle before returning. Typical: 2000-5000." },
        quietMs: { type: "integer", minimum: 50, maximum: 5000, default: 400, description: "How long the terminal must be quiet (no new output) to be considered 'settled'. Default 400ms." },
        lines: { type: "integer", minimum: 1, maximum: 500, default: 40, description: "Number of recent screen lines to return in the `screen` field. Default 40." },
      },
      required: ["nodeId", "text"],
      additionalProperties: false,
    },
    handler: ({ nodeId, text, waitMs, quietMs, lines }) =>
      callBackend("POST", `/sessions/${nodeId}/input`, {
        body: { text, waitMs, quietMs, lines },
        timeoutOverrideMs: (waitMs || 0) + 3000,
      }),
  },
  {
    name: "get_screen",
    description:
      "Return the last N lines of what the user currently sees on their terminal — ANSI-stripped, ready to read. Always use this BEFORE send_input to see the actual prompt, so you don't navigate blind. Also returns the session's state/subState/inDoor/doorCommand so you can confirm the BBS is where you expect it.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "integer", minimum: 1 },
        lines: { type: "integer", minimum: 1, maximum: 500, default: 24, description: "Number of recent lines to return. Default 24 (one terminal height)." },
      },
      required: ["nodeId"],
      additionalProperties: false,
    },
    handler: ({ nodeId, lines }) =>
      callBackend("GET", `/sessions/${nodeId}/screen`, { query: { lines } }),
  },
  {
    name: "wait_for_output",
    description:
      "Block until the BBS emits output matching a substring (default) or regex on a given node, up to timeoutMs. Returns the matched text and elapsed time, or a timeout error with the screen text at timeout. Use since=<timestampMs> from a previous call to only match new output.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "integer", minimum: 1 },
        pattern: { type: "string", description: "Substring, or regex if regex:true" },
        regex: { type: "boolean", default: false },
        timeoutMs: { type: "integer", minimum: 100, maximum: 60000, default: 5000 },
        since: { type: "integer", description: "Ignore output older than this epoch-ms timestamp" },
      },
      required: ["nodeId", "pattern"],
      additionalProperties: false,
    },
    handler: ({ nodeId, pattern, regex, timeoutMs, since }) =>
      callBackend("GET", `/sessions/${nodeId}/wait-for-output`, {
        query: { pattern, regex: regex ? 1 : undefined, timeoutMs, since },
        timeoutOverrideMs: (timeoutMs || 5000) + 2000,
      }),
  },
  {
    name: "emit_event",
    description:
      "Fire any server-side Socket.IO event listener on a node's socket as if the client had emitted it. Use for structured / authenticated events that don't go through the 'command' channel: login, check-username, new-user-response, password-reset-input, door:terminate, restore-session. Login example: emit_event(nodeId=1, event='login', payload={username:'sysop', password:'sysop'}).",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "integer", minimum: 1 },
        event: { type: "string", description: "Event name the server listens on (e.g. 'login', 'check-username')" },
        payload: { description: "Arbitrary JSON payload passed as the first argument to the listener" },
      },
      required: ["nodeId", "event"],
      additionalProperties: false,
    },
    handler: ({ nodeId, event, payload }) =>
      callBackend("POST", `/sessions/${nodeId}/emit`, { body: { event, payload } }),
  },
  {
    name: "kill_door",
    description:
      "Force-terminate the 68K door currently running on a node. Recovery for stuck doors waiting on input or looping. Returns once terminate() is invoked; actual cleanup is async.",
    inputSchema: {
      type: "object",
      properties: { nodeId: { type: "integer", minimum: 1 } },
      required: ["nodeId"],
      additionalProperties: false,
    },
    handler: ({ nodeId }) => callBackend("POST", `/sessions/${nodeId}/kill-door`),
  },
  {
    name: "run_door_sandbox",
    description:
      "Launch an Amiga 68K door headlessly in a subprocess via run-amiga-door.ts. Returns stdout/stderr (ANSI stripped), exit code, signal, elapsed time. Interactive doors will hit a prompt and wait out the timeout — the partial trace is usually enough to see how far init got. No live BBS session required; great for first-pass triage of partial doors. timeoutMs default 10000, max 60000.",
    inputSchema: {
      type: "object",
      properties: {
        binary: { type: "string", description: "Path to Amiga hunk binary (absolute or BBS-root-relative, e.g. 'Doors/AquaScan/AquaScan.020')" },
        command: { type: "string", description: "Optional door command name (N, FR, etc.) — some doors key behaviour off this" },
        doorType: { type: "string", enum: ["XIM", "SIM", "TIM", "IIM", "SUP", "AIM"], default: "XIM" },
        node: { type: "integer", minimum: 1, description: "NodeId for the sandbox session (default 99 to avoid live-node collision)" },
        timeoutMs: { type: "integer", minimum: 500, maximum: 60000, default: 10000 },
        args: { type: "array", items: { type: "string" }, description: "Extra harness args" },
      },
      required: ["binary"],
      additionalProperties: false,
    },
    handler: ({ binary, command, doorType, node, timeoutMs, args }) =>
      callBackend("POST", "/sandbox/run-door", {
        body: { binary, command, doorType, node, timeoutMs, args },
        timeoutOverrideMs: (timeoutMs || 10000) + 5000,
      }),
  },
  {
    name: "list_logs",
    description:
      "List recent log files in the BBS logs/ directory, newest first, with size and mtime. Use before tail_log to find the right file.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => callBackend("GET", "/logs"),
  },
  {
    name: "tail_log",
    description:
      "Tail a log file with optional substring filter. Returns the last `lines` matching lines (default 200). `name` must be a bare filename; path traversal is rejected.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        q: { type: "string", description: "Substring filter" },
        lines: { type: "integer", minimum: 1, maximum: 5000, default: 200 },
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: ({ name, q, lines }) =>
      callBackend("GET", `/logs/${encodeURIComponent(name)}`, { query: { q, lines } }),
  },
  {
    name: "resolve_amiga_path",
    description:
      "Run an AmigaDOS path (e.g. 'BBS:Conf1/Upload/') through PathManager and return the resolved Unix path, or null if the assign is unknown. Use this when debugging 'file not found' errors from doors.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    handler: ({ path: p }) => callBackend("GET", "/paths/resolve", { query: { path: p } }),
  },
  {
    name: "parse_hunk",
    description:
      "Parse any Amiga Hunk binary under the BBS root and return its segment layout, entry point, symbol counts, and debug-line counts. Reuses the project's HunkLoader so results match what the emulator sees at load time.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or BBS-root-relative path to a hunk binary" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: ({ path: p }) => callBackend("POST", "/hunk/parse", { body: { path: p } }),
  },
];

// ---------------- MCP plumbing ----------------

const server = new Server(
  { name: "amiexpress-debug", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find(t => t.name === req.params.name);
  if (!tool) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "unknown_tool", name: req.params.name }) }],
      isError: true,
    };
  }
  const result = await tool.handler(req.params.arguments || {});
  return asToolResponse(result);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is fine — stdout is the MCP channel
  console.error(`[amiexpress-debug-mcp] connected, backend=${BASE_URL}`);
}

main().catch((err) => {
  console.error("[amiexpress-debug-mcp] fatal:", err);
  process.exit(1);
});
