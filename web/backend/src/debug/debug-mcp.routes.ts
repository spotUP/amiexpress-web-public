/**
 * Debug-MCP HTTP router.
 *
 * Read-only introspection endpoints used by the sidecar MCP server
 * (mcp-server-debug/). Mounted only when NODE_ENV !== 'production'.
 * Everything here is best-effort: if we can't resolve state we return a
 * typed error body instead of throwing, so MCP tools get clean messages.
 *
 * Routes (all JSON; all GET unless noted):
 *   GET  /sessions                         — active BBS sessions + active doors
 *   GET  /emulator/:node                   — PC + registers + current door
 *   GET  /emulator/:node/memory            — ?addr=0x... &len=N hex+ascii
 *   GET  /emulator/:node/resolve-pc        — ?pc=0x... (defaults to current PC)
 *   GET  /emulator/:node/symbols           — ?q=substring filter
 *   GET  /emulator/:node/xim-tail          — ?n=50 most-recent XIM messages
 *   GET  /logs                             — list recent log files
 *   GET  /logs/:name                       — ?q=... &lines=200 tail+grep
 *   GET  /paths/resolve                    — ?path=BBS:foo/bar  run through PathManager
 *   POST /hunk/parse                       — body: { path }  parse any hunk binary
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { debugRegistry } from "./DebugRegistry.js";
import { outputTap } from "./OutputTap.js";
import { sessions as bbsSessions } from "../server/session-manager.js";
import { HunkLoader } from "../amiga-emulation/loader/HunkLoader.js";
import { SymbolResolver } from "../amiga-emulation/loader/SymbolResolver.js";
import { PathManager } from "../amiga-emulation/api/PathManager.js";

/**
 * Strip ANSI CSI escape sequences so an MCP caller can see the pure text
 * the user saw (keeping cursor moves, colours, etc. is rarely what you want
 * for "what was on screen" debugging — readable text is). We keep `\n`/`\r`
 * since they carry useful structure in the BBS output stream.
 */
function stripAnsi(s: string): string {
  // CSI (ESC [ ... cmd), OSC (ESC ] ... BEL|ST), single-char ESC cmds
  return s
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    // Strip remaining C0/C1 control chars except \t (0x09), \n (0x0A), \r (0x0D)
    // so JSON.stringify output is a valid JSON string (no raw \u0001 etc.)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
}

/** Parse "0x..." | "1234" to number; returns NaN on failure. */
function parseNum(raw: unknown): number {
  if (raw == null) return NaN;
  const s = String(raw).trim();
  if (s === "") return NaN;
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(2), 16);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return NaN;
}

function hex(n: number, width = 0): string {
  return "0x" + (n >>> 0).toString(16).padStart(width, "0");
}

const CPU_REG_NAMES = [
  "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7",
  "a0", "a1", "a2", "a3", "a4", "a5", "a6", "sp",
  "pc", "sr"
];

/** Build the debug router. Caller is responsible for gating on NODE_ENV. */
export function createDebugMcpRouter(bbsRoot: string): Router {
  const router = Router();
  const pathManager = new PathManager(bbsRoot);
  const logsDir = path.join(bbsRoot, "logs");

  // ---------- /sessions ----------
  router.get("/sessions", (_req: Request, res: Response) => {
    const bbs = Array.from(bbsSessions.values()).map((s: any) => ({
      nodeId: s.nodeId,
      username: s.user?.username ?? null,
      userId: s.user?.userId ?? null,
      state: s.state,
      subState: s.subState,
      inDoor: !!s.inDoorManager,
      currentConference: s.currentConference ?? s.conferenceId ?? null,
      doorCommand: s.doorCommand ?? null,
      lastActivity: s.lastActivity ?? null,
    }));
    const doors = debugRegistry.list().map((d) => ({
      nodeId: d.nodeId,
      doorId: d.doorId,
      executablePath: d.executablePath,
      startedAtMs: d.startedAtMs,
      ageMs: Date.now() - d.startedAtMs,
      hasSymbols: !!d.doorLoader.getSymbolResolver(),
      ximRingSize: d.ximRing.length,
    }));
    res.json({ bbsSessions: bbs, activeDoors: doors });
  });

  // ---------- /emulator/:node ----------
  router.get("/emulator/:node", (req, res) => {
    const nodeId = parseNum(req.params.node);
    const info = debugRegistry.get(nodeId);
    if (!info) {
      return res.status(404).json({ error: "no_active_door", nodeId });
    }
    const regs: Record<string, string> = {};
    for (let i = 0; i < CPU_REG_NAMES.length; i++) {
      regs[CPU_REG_NAMES[i]] = hex(info.emulator.getRegister(i), 8);
    }
    const pc = info.emulator.getRegister(16);
    const resolver = info.doorLoader.getSymbolResolver();
    const pcFormatted = resolver ? resolver.format(pc) : hex(pc);
    res.json({
      nodeId,
      doorId: info.doorId,
      executablePath: info.executablePath,
      startedAtMs: info.startedAtMs,
      pc: hex(pc),
      pcResolved: pcFormatted,
      registers: regs,
      symbols: resolver ? resolver.size : 0,
    });
  });

  // ---------- /emulator/:node/memory?addr=0x...&len=N ----------
  router.get("/emulator/:node/memory", (req, res) => {
    const nodeId = parseNum(req.params.node);
    const info = debugRegistry.get(nodeId);
    if (!info) return res.status(404).json({ error: "no_active_door", nodeId });
    const addr = parseNum(req.query.addr);
    const len = parseNum(req.query.len);
    if (!Number.isFinite(addr) || addr < 0) return res.status(400).json({ error: "bad_addr" });
    const length = Number.isFinite(len) ? Math.min(Math.max(len, 1), 4096) : 64;
    const bytes: number[] = [];
    for (let i = 0; i < length; i++) {
      try {
        bytes.push(info.emulator.readMemory(addr + i) & 0xff);
      } catch {
        bytes.push(-1);
      }
    }
    // Build hex + ascii rendering (xxd-style)
    const lines: string[] = [];
    for (let off = 0; off < bytes.length; off += 16) {
      const chunk = bytes.slice(off, off + 16);
      const hexPart = chunk.map(b => (b < 0 ? "??" : b.toString(16).padStart(2, "0"))).join(" ");
      const ascPart = chunk.map(b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
      lines.push(`${hex(addr + off, 8)}:  ${hexPart.padEnd(47)}  |${ascPart}|`);
    }
    res.json({ nodeId, addr: hex(addr), length, hexdump: lines.join("\n"), bytes });
  });

  // ---------- /emulator/:node/resolve-pc?pc=0x... ----------
  router.get("/emulator/:node/resolve-pc", (req, res) => {
    const nodeId = parseNum(req.params.node);
    const info = debugRegistry.get(nodeId);
    if (!info) return res.status(404).json({ error: "no_active_door", nodeId });
    const pcRaw = req.query.pc;
    const pc = pcRaw == null ? info.emulator.getRegister(16) : parseNum(pcRaw);
    if (!Number.isFinite(pc)) return res.status(400).json({ error: "bad_pc" });
    const resolver = info.doorLoader.getSymbolResolver();
    if (!resolver) return res.json({ nodeId, pc: hex(pc), resolved: null, hint: "no_symbols_in_binary" });
    const hit = resolver.resolve(pc);
    res.json({
      nodeId,
      pc: hex(pc),
      resolved: hit ? { name: hit.name, delta: hit.delta, formatted: resolver.format(pc) } : null,
    });
  });

  // ---------- /emulator/:node/symbols?q=... ----------
  router.get("/emulator/:node/symbols", (req, res) => {
    const nodeId = parseNum(req.params.node);
    const info = debugRegistry.get(nodeId);
    if (!info) return res.status(404).json({ error: "no_active_door", nodeId });
    const resolver = info.doorLoader.getSymbolResolver();
    if (!resolver) return res.json({ nodeId, symbols: [], hint: "no_symbols_in_binary" });
    const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : "";
    // SymbolResolver only exposes size + format; read back from the loaded hunk.
    // Practical workaround: binary-search via format across pc range is overkill,
    // instead we re-parse the file (cheap). For Phase 1 that's acceptable.
    let allSyms: { name: string; address: string }[] = [];
    try {
      const buf = fs.readFileSync(info.executablePath);
      const hf = new HunkLoader().parse(buf);
      for (const segSyms of hf.symbols) {
        for (const s of segSyms) allSyms.push({ name: s.name, address: hex(s.address, 8) });
      }
    } catch (err) {
      return res.status(500).json({ error: "reparse_failed", detail: String(err) });
    }
    const filtered = q ? allSyms.filter(s => s.name.toLowerCase().includes(q)) : allSyms;
    res.json({ nodeId, total: allSyms.length, matched: filtered.length, symbols: filtered.slice(0, 500) });
  });

  // ---------- /emulator/:node/xim-tail?n=50 ----------
  router.get("/emulator/:node/xim-tail", (req, res) => {
    const nodeId = parseNum(req.params.node);
    const info = debugRegistry.get(nodeId);
    if (!info) return res.status(404).json({ error: "no_active_door", nodeId });
    const n = parseNum(req.query.n);
    const count = Number.isFinite(n) ? Math.min(Math.max(n, 1), 500) : 50;
    const ring = info.ximRing.slice(-count);
    res.json({ nodeId, count: ring.length, capacity: info.ximRingCapacity, messages: ring });
  });

  // ---------- /output/:node?n=50&raw=1 ----------
  router.get("/output/:node", (req, res) => {
    const nodeId = parseNum(req.params.node);
    if (!Number.isFinite(nodeId) || nodeId <= 0) {
      return res.status(400).json({ error: "bad_node" });
    }
    const n = parseNum(req.query.n);
    const count = Number.isFinite(n) ? Math.min(Math.max(n, 1), 500) : 50;
    const raw = req.query.raw === "1" || req.query.raw === "true";
    const entries = outputTap.get(nodeId, count);
    const joined = entries.map(e => e.text).join("");
    const screen = raw ? joined : stripAnsi(joined);
    res.json({
      nodeId,
      returned: entries.length,
      buffered: outputTap.bufferedCount(nodeId),
      capacity: outputTap.getCapacity(),
      totalBytes: outputTap.totalBytes(nodeId),
      entries: raw ? entries : entries.map(e => ({ timestampMs: e.timestampMs, text: stripAnsi(e.text) })),
      /** Concatenated "what the user saw" string for quick eyeballing */
      screen,
    });
  });

  // =========================================================================
  // CONTROL endpoints (mutations) — dev-only, for scripted debugging
  // =========================================================================

  /**
   * POST /sessions/:node/input
   * Body: { text: string }
   *
   * Inject text into a live BBS session as if the user had typed it.
   * If a door is active on that node, routes to the door's input handler;
   * otherwise invokes the socket's 'command' listener (menu-level input).
   */
  router.post("/sessions/:node/input", async (req, res) => {
    const nodeId = parseNum(req.params.node);
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!Number.isFinite(nodeId) || nodeId <= 0) return res.status(400).json({ error: "bad_node" });
    if (text === "") return res.status(400).json({ error: "empty_text" });

    // Optional: wait for post-input output to settle and return it in one response.
    // Caller passes waitMs (total budget) and optional quietMs (idle before "settled").
    const waitMs = Math.min(Math.max(parseNum(req.body?.waitMs) || 0, 0), 30000);
    const quietMs = Math.min(Math.max(parseNum(req.body?.quietMs) || 400, 50), 5000);
    const screenLines = Math.min(Math.max(parseNum(req.body?.lines) || 40, 1), 500);

    const session = bbsSessions.get(String(nodeId)) as any;
    if (!session) return res.status(404).json({ error: "no_session", nodeId });

    const beforeTs = Date.now();

    const dispatch = (): { routed: string } | { error: string; status?: number; hint?: string } => {
      try {
        if (session.inDoorManager && typeof session.doorInputHandler === "function") {
          session.doorInputHandler(text);
          return { routed: "door" };
        }
        if (session.socket && typeof session.socket.listeners === "function") {
          const handlers = session.socket.listeners("command") as Function[];
          if (handlers.length > 0) {
            handlers[0](text);
            return { routed: "command" };
          }
        }
        return { error: "no_input_path_available", status: 503, hint: "session has neither doorInputHandler nor command listener" };
      } catch (err) {
        return { error: "dispatch_failed", status: 500, hint: String(err) };
      }
    };

    const dispatched = dispatch();
    if ("error" in dispatched) {
      return res.status(dispatched.status ?? 500).json({ error: dispatched.error, hint: dispatched.hint });
    }

    // Legacy fast-path: no wait requested, preserve old response shape.
    if (waitMs <= 0) {
      return res.json({ nodeId, routed: dispatched.routed, bytes: text.length });
    }

    // Poll outputTap until we see `quietMs` of silence or `waitMs` elapses.
    const deadline = beforeTs + waitMs;
    let lastLen = outputTap.totalBytes(nodeId);
    let lastChangeAt = beforeTs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      const curLen = outputTap.totalBytes(nodeId);
      if (curLen !== lastLen) {
        lastLen = curLen;
        lastChangeAt = Date.now();
      } else if (Date.now() - lastChangeAt >= quietMs) {
        break;
      }
    }

    const allEntries = outputTap.get(nodeId, 500);
    const newEntries = allEntries.filter((e) => e.timestampMs >= beforeTs);
    const newText = stripAnsi(newEntries.map((e) => e.text).join(""));
    // Build a "rendered screen" — last N non-empty lines of all stripped output.
    const fullText = stripAnsi(allEntries.map((e) => e.text).join(""));
    const lines = fullText.split(/\r?\n/);
    const screen = lines.slice(-screenLines).join("\n");

    return res.json({
      nodeId,
      routed: dispatched.routed,
      bytes: text.length,
      elapsedMs: Date.now() - beforeTs,
      newOutput: newText,
      screen,
    });
  });

  /**
   * GET /sessions/:node/screen?lines=24
   *
   * Return the last `lines` visible lines of the terminal, ANSI-stripped.
   * This is "what the user is seeing right now" — equivalent to reading the
   * bottom of a scrolling terminal. Use this to see prompts before sending
   * input, so you never navigate blind.
   */
  router.get("/sessions/:node/screen", (req, res) => {
    const nodeId = parseNum(req.params.node);
    if (!Number.isFinite(nodeId) || nodeId <= 0) return res.status(400).json({ error: "bad_node" });
    const lines = Math.min(Math.max(parseNum(req.query.lines) || 24, 1), 500);
    const entries = outputTap.get(nodeId, 500);
    const full = stripAnsi(entries.map((e) => e.text).join(""));
    const split = full.split(/\r?\n/);
    const screen = split.slice(-lines).join("\n");
    const session = bbsSessions.get(String(nodeId)) as any;
    res.json({
      nodeId,
      lines: split.length,
      returned: Math.min(lines, split.length),
      state: session?.state ?? null,
      subState: session?.subState ?? null,
      inDoor: !!session?.inDoor,
      doorCommand: session?.doorCommand ?? null,
      screen,
    });
  });

  /**
   * GET /sessions/:node/wait-for-output?pattern=...&timeoutMs=5000&since=<ms>
   *
   * Poll the OutputTap until a regex (or substring) match appears, or until
   * the timeout elapses. Use `since` to ignore text captured before a given
   * timestampMs (useful after send_input to avoid matching old text).
   */
  router.get("/sessions/:node/wait-for-output", async (req, res) => {
    const nodeId = parseNum(req.params.node);
    if (!Number.isFinite(nodeId) || nodeId <= 0) return res.status(400).json({ error: "bad_node" });
    const pattern = typeof req.query.pattern === "string" ? req.query.pattern : "";
    if (!pattern) return res.status(400).json({ error: "missing_pattern" });

    const timeoutMs = parseNum(req.query.timeoutMs);
    const timeout = Number.isFinite(timeoutMs) ? Math.min(Math.max(timeoutMs, 100), 60000) : 5000;
    const sinceRaw = parseNum(req.query.since);
    const sinceMs = Number.isFinite(sinceRaw) ? sinceRaw : 0;
    const isRegex = req.query.regex === "1" || req.query.regex === "true";

    let rx: RegExp | null = null;
    if (isRegex) {
      try { rx = new RegExp(pattern); } catch (err) {
        return res.status(400).json({ error: "bad_regex", detail: String(err) });
      }
    }

    const deadline = Date.now() + timeout;
    const started = Date.now();
    while (Date.now() < deadline) {
      const entries = outputTap.get(nodeId, 500);
      const filtered = sinceMs > 0 ? entries.filter(e => e.timestampMs >= sinceMs) : entries;
      const joined = filtered.map(e => stripAnsi(e.text)).join("");
      if (rx) {
        const m = joined.match(rx);
        if (m) {
          return res.json({ nodeId, matched: true, elapsedMs: Date.now() - started, match: m[0], index: m.index ?? -1, screen: joined });
        }
      } else if (joined.includes(pattern)) {
        return res.json({ nodeId, matched: true, elapsedMs: Date.now() - started, match: pattern, index: joined.indexOf(pattern), screen: joined });
      }
      await new Promise(r => setTimeout(r, 100));
    }
    const finalEntries = outputTap.get(nodeId, 500);
    const finalText = (sinceMs > 0 ? finalEntries.filter(e => e.timestampMs >= sinceMs) : finalEntries)
      .map(e => stripAnsi(e.text)).join("");
    res.status(408).json({ nodeId, matched: false, elapsedMs: timeout, hint: "timeout", screenAtTimeout: finalText });
  });

  /**
   * POST /sessions/:node/emit
   * Body: { event: string, payload?: any }
   *
   * Generic server-side socket listener invoker. Finds the given socket.io
   * listener on the node's socket and calls it with the payload, exactly as
   * if the client had emitted the event. Use for any authenticated / structured
   * event the BBS expects (login, check-username, new-user-response,
   * password-reset-input, door:terminate, etc.). Dev-only.
   *
   * Examples:
   *   emit(1, 'login', {username: 'sysop', password: 'sysop'})
   *   emit(1, 'check-username', {username: 'sysop'})
   *   emit(1, 'new-user-response', {response: 'C', username: 'sysop'})
   */
  router.post("/sessions/:node/emit", (req, res) => {
    const nodeId = parseNum(req.params.node);
    const event = typeof req.body?.event === "string" ? req.body.event : "";
    const payload = req.body?.payload;
    if (!Number.isFinite(nodeId) || nodeId <= 0) return res.status(400).json({ error: "bad_node" });
    if (!event) return res.status(400).json({ error: "missing_event" });

    const session = bbsSessions.get(String(nodeId)) as any;
    if (!session?.socket) return res.status(404).json({ error: "no_session_socket", nodeId });
    const listeners = (session.socket as any).listeners?.(event);
    if (!Array.isArray(listeners) || listeners.length === 0) {
      return res.status(404).json({ error: "no_listener_for_event", event, availableListeners: ["(none)"] });
    }
    try {
      // Call all listeners the same way socket.io dispatch would (first wins semantically)
      listeners[0](payload);
      return res.json({ nodeId, event, invoked: true, listenerCount: listeners.length });
    } catch (err) {
      return res.status(500).json({ error: "listener_threw", detail: String(err) });
    }
  });

  /**
   * POST /sessions/:node/kill-door
   *
   * Force-terminate the 68K door currently running on this node. Useful when
   * a door is stuck waiting for input or looping. Returns immediately; the
   * actual cleanup is async via LifecycleManager.terminate().
   */
  router.post("/sessions/:node/kill-door", (req, res) => {
    const nodeId = parseNum(req.params.node);
    if (!Number.isFinite(nodeId) || nodeId <= 0) return res.status(400).json({ error: "bad_node" });
    const info = debugRegistry.get(nodeId);
    if (!info) return res.status(404).json({ error: "no_active_door", nodeId });
    try {
      // Preferred path: fire the 'door:terminate' event so AmigaDoorSession's
      // full teardown runs (marks carrier dropped, removes socket handlers,
      // unregisters from the debug registry). Falls back to the lifecycle
      // manager's terminate() if no listener is attached.
      let path = "socket_event";
      const listeners = (info.socket as any).listeners?.("door:terminate");
      if (Array.isArray(listeners) && listeners.length > 0) {
        listeners[0]();
      } else {
        info.lifecycleManager.terminate();
        path = "lifecycle_manager";
      }
      // Defensive: ensure the registry doesn't hold a stale entry either way.
      debugRegistry.unregister(nodeId);
      return res.json({ nodeId, terminated: true, doorId: info.doorId, via: path });
    } catch (err) {
      return res.status(500).json({ error: "terminate_failed", detail: String(err) });
    }
  });

  /**
   * POST /sandbox/run-door
   * Body: { binary, command?, doorType?, timeoutMs?, args? (string[]), node? }
   *
   * Spawn run-amiga-door.ts as a subprocess and return everything it wrote to
   * stdout/stderr, plus exit code / signal. Doesn't touch the live BBS — good
   * for quickly sanity-checking that a door LAUNCHES cleanly without needing
   * a logged-in user.
   *
   * Doors that prompt for input will hit a prompt and wait out the timeout —
   * you still get the trace up to that point, which is usually enough to see
   * how far initialisation got.
   */
  router.post("/sandbox/run-door", (req, res) => {
    const binary = typeof req.body?.binary === "string" ? req.body.binary : "";
    if (!binary) return res.status(400).json({ error: "missing_binary" });
    const absBin = path.resolve(binary.startsWith("/") ? binary : path.join(bbsRoot, binary));
    if (!absBin.startsWith(bbsRoot)) return res.status(400).json({ error: "outside_bbs_root" });
    if (!fs.existsSync(absBin)) return res.status(404).json({ error: "not_found", path: absBin });

    const node = parseNum(req.body?.node);
    const nodeId = Number.isFinite(node) && node > 0 ? node : 99; // sandbox uses a high nodeId
    const timeoutMs = parseNum(req.body?.timeoutMs);
    const timeout = Number.isFinite(timeoutMs) ? Math.min(Math.max(timeoutMs, 500), 60000) : 10000;
    const command = typeof req.body?.command === "string" ? req.body.command : "";
    const doorType = typeof req.body?.doorType === "string" ? req.body.doorType : "XIM";
    const extraArgs = Array.isArray(req.body?.args) ? req.body.args.map(String) : [];

    const harness = path.join(bbsRoot, "web/backend/src/scripts/run-amiga-door.ts");
    const spawnArgs = ["tsx", harness, absBin, String(nodeId)];
    if (command) spawnArgs.push("--command", command);
    if (doorType) spawnArgs.push("--doortype", doorType);
    spawnArgs.push(...extraArgs);

    const start = Date.now();
    const child = spawn("npx", spawnArgs, {
      cwd: bbsRoot,
      env: { ...process.env, BBS_DATA_DIR: bbsRoot },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const maxBytes = 256 * 1024;

    child.stdout.on("data", (b: Buffer) => {
      if (stdoutBytes < maxBytes) {
        stdoutChunks.push(b);
        stdoutBytes += b.length;
      }
    });
    child.stderr.on("data", (b: Buffer) => {
      if (stderrBytes < maxBytes) {
        stderrChunks.push(b);
        stderrBytes += b.length;
      }
    });

    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }, timeout);

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const cleaned = stripAnsi(stdout);
      res.json({
        binary: absBin,
        exitCode: code,
        signal,
        elapsedMs: Date.now() - start,
        timedOut: signal === "SIGKILL",
        stdoutBytes,
        stderrBytes,
        truncated: stdoutBytes >= maxBytes || stderrBytes >= maxBytes,
        stdout: cleaned,
        stderrTail: stderr.split(/\r?\n/).slice(-40).join("\n"),
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      res.status(500).json({ error: "spawn_failed", detail: String(err) });
    });
  });

  // =========================================================================
  // END control endpoints
  // =========================================================================

  // ---------- /logs ----------
  router.get("/logs", (_req, res) => {
    try {
      const files = fs
        .readdirSync(logsDir, { withFileTypes: true })
        .filter(d => d.isFile() && d.name.endsWith(".log"))
        .map(d => {
          const st = fs.statSync(path.join(logsDir, d.name));
          return { name: d.name, size: st.size, mtimeMs: st.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, 50);
      res.json({ logsDir, files });
    } catch (err) {
      res.status(500).json({ error: "logs_dir_read_failed", detail: String(err) });
    }
  });

  // ---------- /logs/:name?q=...&lines=200 ----------
  router.get("/logs/:name", (req, res) => {
    const safe = path.basename(String(req.params.name));
    const full = path.join(logsDir, safe);
    if (!full.startsWith(logsDir)) return res.status(400).json({ error: "bad_path" });
    if (!fs.existsSync(full)) return res.status(404).json({ error: "not_found", name: safe });
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const lines = parseNum(req.query.lines);
    const limit = Number.isFinite(lines) ? Math.min(Math.max(lines, 1), 5000) : 200;

    let content: string;
    try {
      content = fs.readFileSync(full, "utf8");
    } catch (err) {
      return res.status(500).json({ error: "read_failed", detail: String(err) });
    }
    const all = content.split(/\r?\n/);
    const filtered = q ? all.filter(l => l.includes(q)) : all;
    const tail = filtered.slice(-limit);
    res.json({ name: safe, totalLines: all.length, matched: filtered.length, returned: tail.length, lines: tail });
  });

  // ---------- /paths/resolve?path=BBS:foo ----------
  router.get("/paths/resolve", (req, res) => {
    const raw = typeof req.query.path === "string" ? req.query.path : "";
    if (!raw) return res.status(400).json({ error: "missing_path" });
    const resolved = pathManager.amiToSysPath(raw);
    res.json({ amiPath: raw, sysPath: resolved });
  });

  // ---------- POST /hunk/parse ----------
  router.post("/hunk/parse", (req, res) => {
    const binPath = typeof req.body?.path === "string" ? req.body.path : "";
    if (!binPath) return res.status(400).json({ error: "missing_path" });
    // Security: restrict to files inside bbsRoot
    const abs = path.resolve(binPath.startsWith("/") ? binPath : path.join(bbsRoot, binPath));
    if (!abs.startsWith(bbsRoot)) return res.status(400).json({ error: "outside_bbs_root" });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: "not_found", path: abs });
    try {
      const buf = fs.readFileSync(abs);
      const hf = new HunkLoader().parse(buf);
      const resolver = new SymbolResolver(hf);
      res.json({
        path: abs,
        segments: hf.segments.map((s, i) => ({
          index: i,
          type: s.type,
          address: hex(s.address),
          size: s.size,
          memFlags: s.memFlags,
        })),
        entryPoint: hex(hf.entryPoint),
        symbols: hf.symbols.map((arr, i) => ({ segment: i, count: arr.length })),
        totalSymbols: resolver.size,
        debugLines: hf.debugLines.map((arr, i) => ({
          segment: i,
          tables: arr.length,
          totalEntries: arr.reduce((n, t) => n + t.entries.length, 0),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: "parse_failed", detail: String(err) });
    }
  });

  return router;
}
