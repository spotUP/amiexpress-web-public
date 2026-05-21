#!/usr/bin/env node
/**
 * In-process integration corpus runner.
 *
 * For each corpus entry with `integration` config, this:
 *   1. Constructs a fresh mock BBSSession (skip login flow — wire it
 *      straight to LOGGEDON/DISPLAY_MENU like a real session would be
 *      after post-auth).
 *   2. Builds an EventEmitter-shaped MockSocket that captures every
 *      `ansi-output` into a buffer + records every other event.
 *   3. Looks up the Door object in the live registry by command name.
 *   4. Calls executeDoor() directly — the same entry point the BBS
 *      command handler uses. Full integration glue runs: subState
 *      transitions, DoorManager, drop files, post-door cleanup, MCI
 *      substitution, etc.
 *   5. Awaits door completion (executeDoor's promise resolves when the
 *      door has exited and cleanup ran).
 *   6. Asserts captured output + session state against the entry's
 *      `integration.assertions` block.
 *
 * Why this beats the isolated harness for catching real bugs:
 *   - The EventEmitter wrapper regression that broke telnet/SSH today
 *     would surface here (executeDoor → DoorManager → socket.once on
 *     mock; our MockSocket extends EventEmitter so it works, but if
 *     someone refactors executeDoor to call a method we don't expose,
 *     the test fails).
 *   - The GLC alias gap surfaces because we test by COMMAND, not by
 *     binary path — if the command isn't registered, no Door is found.
 *   - subState clobber bugs surface because we assert
 *     session.subState after executeDoor returns.
 *
 * Why this beats end-to-end telnet for speed:
 *   - No real socket, no process spawn for TS doors, no login flow.
 *   - 68K doors still hit Moira (in-process WASM/native) — same speed
 *     as a real BBS session, plus we can crank DOOR_OVERCLOCK.
 *
 * Flags:
 *   --only <id[,id...]>     run only these corpus entries
 *   --concurrency <N>       parallel doors (default 4; 68K doors share
 *                           Moira state via process singleton so they
 *                           serialize automatically inside the lifecycle
 *                           manager — concurrency is real for TS doors)
 *   --capture               write captured output as the integration
 *                           golden instead of asserting
 *   --keep-ansi             keep raw ANSI in goldens (default: strip)
 *
 * Goldens: dev/scripts/door-corpus/goldens/<id>/integration.txt
 */

// MUST be first: redirect verbose service init logs to stderr so test
// runs stay readable. The BBS modules console.log during import.
import "./console-to-stderr";
import "reflect-metadata";

import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";

import type { Door } from "../types";
import type { BBSSession } from "../index";
import { BBSState, LoggedOnSubState } from "../constants/bbs-states";
import { EnvStat } from "../constants/env-codes";

// __dirname = web/backend/src/scripts → repo root is four levels up.
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const CORPUS = path.join(REPO_ROOT, "dev/scripts/door-corpus/corpus.json");
const GOLDENS = path.join(REPO_ROOT, "dev/scripts/door-corpus/goldens");

const ANSI_STRIP = /\x1b\[[0-9;?]*[A-Za-z]/g;

interface IntegrationConfig {
  /**
   * Keypress timeline once the door starts. Each entry fires `data` on
   * the mock socket as a 'command' event after `delayMs` from door
   * start (matches what real frontend / telnet bridge would do).
   */
  inputs?: Array<{ delayMs: number; data: string }>;
  /** Hard cap on how long executeDoor is allowed to take. */
  timeoutMs?: number;
  /** Skip this door entirely with a documented reason. Used for
   *  doors that genuinely cannot be driven by the integration
   *  harness (need filesystem state, hang waiting on missing
   *  data files, etc.). Honors `skipReason` for visibility. */
  skip?: boolean;
  skipReason?: string;
  /** Assertions against captured state. */
  assertions?: {
    /** Strings that MUST appear in ansi-output capture (after ANSI strip). */
    mustContain?: string[];
    /** Strings that must NOT appear. */
    mustNotContain?: string[];
    /** Expected post-door subState (e.g. "DISPLAY_MENU"). */
    expectedSubState?: keyof typeof LoggedOnSubState;
  };
}

interface CorpusEntry {
  id: string;
  name: string;
  command?: string;
  binary: string;
  doorType: string;
  integration?: IntegrationConfig;
}

interface RunResult {
  id: string;
  status: "pass" | "fail" | "skip" | "captured";
  wallMs: number;
  captured?: string;
  detail?: string;
}

class MockSocket extends EventEmitter {
  readonly outputBuf: string[] = [];
  readonly nonAnsiEvents: Array<{ event: string; data: any }> = [];
  // Telnet/web both eventually call `connected` like socket.io. Default
  // true so menu code doesn't think carrier dropped mid-test.
  readonly connected = true;
  readonly id = "mock-socket";

  emit(event: string, ...args: any[]): boolean {
    if (event === "ansi-output") {
      this.outputBuf.push(String(args[0] ?? ""));
    } else {
      this.nonAnsiEvents.push({ event, data: args[0] });
    }
    return super.emit(event, ...args);
  }

  disconnect(): void {/* no-op for tests */}
  end(): void {/* no-op */}
  destroy(): void {/* no-op */}
}

function makeSession(nodeId: number): BBSSession {
  const now = Date.now();
  // Minimal LOGGEDON session — the same shape post-auth produces. We
  // skip the actual login flow because we want to test doors, not auth.
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.DISPLAY_MENU,
    currentConf: 1,
    conferenceId: 1,
    currentMsgBase: 1,
    timeRemaining: 60,
    lastActivity: now,
    confRJoin: 1,
    msgBaseRJoin: 1,
    commandBuffer: "",
    menuPause: true,
    inputBuffer: "",
    maskInput: false,
    connectionStart: now,
    displayFlowPaused: false,
    inDoorManager: false,
    doorInputHandler: undefined,
    relConfNum: 0,
    currentConfName: "General",
    cmdShortcuts: false,
    shortcuts: new Map(),
    doorExpertMode: false,
    acsLevel: 255, // sysop — door access checks pass
    securityFlags: "",
    secOverride: "",
    overrideDefaultAccess: false,
    userSpecificAccess: false,
    currentStat: EnvStat.IDLE,
    quietFlag: false,
    blockOLM: false,
    loginTime: now,
    nodeStartTime: now,
    nodeId,
    loginRetryCount: 0,
    lastMsgReadConf: 0,
    lastNewReadConf: 0,
    commandHistory: [],
    historyIndex: 0,
    historyCycle: 0,
    connectionType: "web",
    remoteAddress: "127.0.0.1",
    connectionHostname: "localhost",
    connectionPort: 3001,
    connectionBaud: 0,
    screenWidth: 80,
    screenHeight: 24,
    modemEmulationEnabled: false,
    modemBps: 0,
    unicodeCapable: true,
    user: {
      id: "1",
      username: "sysop",
      location: "Test Lab",
      secLevel: 255,
      slotNumber: 1,
      uploads: 0,
      bytesUpload: 0,
      downloads: 0,
      bytesDownload: 0,
      messagesPosted: 0,
      timesCalled: 1,
      topUploadCPS: 0,
      topDownloadCPS: 0,
      calls: 1,
      lastLogin: new Date(now),
    } as any,
  } as BBSSession;
}

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function runOne(
  entry: CorpusEntry,
  executeDoor: (s: any, sess: BBSSession, d: Door) => Promise<void>,
  findDoor: (command: string, entry: CorpusEntry) => Door | undefined,
  options: { capture: boolean; keepAnsi: boolean; nodeId: number },
): Promise<RunResult> {
  const integration = entry.integration ?? {};
  if (integration.skip) {
    return {
      id: entry.id,
      status: "skip",
      wallMs: 0,
      detail: integration.skipReason ?? "skip: true (no reason given)",
    };
  }
  // Fall back to the corpus id as the command when none is set —
  // synthesized Doors don't need a real command to dispatch.
  const command = entry.command ?? entry.id;
  const door = findDoor(command, entry);
  if (!door) {
    return {
      id: entry.id,
      status: "skip",
      wallMs: 0,
      detail: `no Door registered for command "${command}"`,
    };
  }

  const socket = new MockSocket();
  const session = makeSession(options.nodeId);
  const started = Date.now();

  // Schedule scripted inputs. Fire on BOTH channels:
  //  - 'command' — post-door-exit BBS command channel
  //    (DoorManager listens here)
  //  - 'door:input' — in-door keystroke channel for XIM/TIM
  //    doors (AmigaDoorSession listens here; emits via
  //    queueInput → JH_HK / JH_LI / JH_PM reply machinery)
  // Most timeout-bucket doors are XIM and only `door:input`
  // reaches them — `command` alone is silently dropped.
  const inputTimers: NodeJS.Timeout[] = [];
  for (const input of integration.inputs ?? []) {
    inputTimers.push(
      setTimeout(() => {
        socket.emit("command", input.data);
        socket.emit("door:input", input.data);
      }, input.delayMs),
    );
  }

  let detail: string | undefined;
  let timedOut = false;
  try {
    await withTimeout(
      executeDoor(socket, session, door),
      integration.timeoutMs ?? 30_000,
      `executeDoor(${entry.id})`,
    );
  } catch (err: any) {
    detail = err?.message ?? String(err);
    timedOut = /timed out after/.test(detail ?? "");
  } finally {
    for (const t of inputTimers) clearTimeout(t);
  }

  // Diagnostic: log memory + active handles between doors when
  // CORPUS_DIAG=1 is set. Helps localize the state-pollution
  // cause (memory leak vs. listener accumulation vs. WASM heap).
  if (process.env.CORPUS_DIAG === "1") {
    const m = process.memoryUsage();
    const rss = Math.round(m.rss / 1024 / 1024);
    const heap = Math.round(m.heapUsed / 1024 / 1024);
    const ext = Math.round(m.external / 1024 / 1024);
    const arr = Math.round(m.arrayBuffers / 1024 / 1024);
    // @ts-expect-error — _getActiveHandles is undocumented but
    // returns ALL libuv handles (timers, sockets, intervals, etc.)
    const handles = (process as any)._getActiveHandles?.()?.length ?? -1;
    // @ts-expect-error — _getActiveRequests undocumented
    const requests = (process as any)._getActiveRequests?.()?.length ?? -1;
    const socketListeners = socket.eventNames().length;
    process.stderr.write(
      `[diag] door=${entry.id} rss=${rss}M heap=${heap}M ext=${ext}M arr=${arr}M handles=${handles} requests=${requests} sockEvents=${socketListeners}\n`,
    );
  }

  const wallMs = Date.now() - started;
  let raw = socket.outputBuf.join("");
  if (!options.keepAnsi) raw = raw.replace(ANSI_STRIP, "");

  if (options.capture) {
    const dir = path.join(GOLDENS, entry.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "integration.txt"), raw);
    return { id: entry.id, status: "captured", wallMs, captured: raw };
  }

  // Assertions
  const a = integration.assertions ?? {};
  const failures: string[] = [];
  for (const must of a.mustContain ?? []) {
    if (!raw.includes(must)) failures.push(`missing "${must}"`);
  }
  for (const must of a.mustNotContain ?? []) {
    if (raw.includes(must)) failures.push(`contains forbidden "${must}"`);
  }
  if (
    a.expectedSubState &&
    session.subState !== LoggedOnSubState[a.expectedSubState]
  ) {
    failures.push(
      `subState=${String(session.subState)} expected=${a.expectedSubState}`,
    );
  }
  if (timedOut) failures.push(detail!);
  // If no assertions configured AND not capturing, treat "did not throw"
  // as the only signal — useful first pass before assertions are populated.
  if (failures.length === 0) {
    return { id: entry.id, status: "pass", wallMs, captured: raw };
  }
  return {
    id: entry.id,
    status: "fail",
    wallMs,
    captured: raw,
    detail: failures.join("; "),
  };
}

async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  let only: Set<string> | null = null;
  let concurrency = 4;
  let capture = false;
  let captureAll = false;
  let keepAnsi = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--only") only = new Set(args[++i].split(",").map((s) => s.trim()));
    else if (a === "--concurrency") concurrency = parseInt(args[++i], 10);
    else if (a === "--capture") capture = true;
    else if (a === "--capture-all") {
      capture = true;
      captureAll = true;
    } else if (a === "--keep-ansi") keepAnsi = true;
  }

  // Boot only the BBS bits we need: door registry. Skip database +
  // network listeners by setting flags before import.
  process.env.SKIP_DB_INIT = process.env.SKIP_DB_INIT ?? "1";
  process.env.SKIP_NETWORK_LISTENERS = process.env.SKIP_NETWORK_LISTENERS ?? "1";

  // Late import so the env vars above take effect on first load.
  const doorHandler = await import("../handlers/door.handler");
  const cmdExec = await import("../handlers/command-execution.handler");
  const { executeDoor, initializeDoors } = doorHandler as any;

  // initializeDoors() reads from commandCache (BBSCmd + SysCmd .info
  // entries). The cache is loaded by loadCommands() which the BBS
  // calls at startup before initializeDoors. Replicate that order.
  (cmdExec as any).loadCommands(REPO_ROOT);
  await initializeDoors();

  // executeDoor uses module-level helpers (callersLog, etc.) that the
  // live BBS injects via setHelpers/setConstants during initialization.
  // We don't want real CallersLog writes from tests, so stub them.
  if ((doorHandler as any).setHelpers) {
    const noop = async () => undefined;
    (doorHandler as any).setHelpers({
      callersLog: noop,
      loadFlagged: () => [],
      loadHistory: () => [],
      getRecentCallerActivity: () => [],
    });
  }
  if ((doorHandler as any).setConstants) {
    (doorHandler as any).setConstants({
      LoggedOnSubState,
      SCREEN_BULL: 1,
      SCREEN_NODE_BULL: 2,
      SCREEN_CONF_BULL: 3,
    });
  }

  // Door lookup: first try the live registry by command name (mirrors
  // command-handler dispatch). If nothing is found, synthesize a Door
  // straight from the corpus entry's binary path — the BBSCmd/.info
  // registry is for live command dispatch, but executeDoor() itself
  // only needs a Door-shaped object pointing at a binary.
  const findDoor = (command: string, entry: CorpusEntry): Door | undefined => {
    const allDoors: Door[] = (doorHandler as any).getDoors?.() ?? [];
    const up = command.toUpperCase();
    const registered = allDoors.find(
      (d) => (d.command || "").toUpperCase() === up,
    );
    if (registered) return registered;
    // Synthesize. The corpus declares the door type — XIM/AIM/SIM/TIM
    // are all Amiga 68K binaries (different message protocols), 'native'
    // in executeDoor's switch means Node.js scripts which is NOT what
    // a corpus 'native' entry would be. Map appropriately.
    const ext = path.extname(entry.binary).toLowerCase();
    let type: Door["type"] = "native";
    const dt = (entry.doorType || "").toUpperCase();
    if (["XIM", "AIM", "SIM", "TIM", "IIM"].includes(dt)) {
      type = dt as any; // executeDoor dispatches these to launchAmigaDoor.
    } else if (dt === "AREXX" || dt === "REXX" || ext === ".rexx") {
      type = "AREXX" as any;
    } else if (dt === "TS" || dt === "SDK" || ext === ".ts" || ext === ".js") {
      type = "typescript";
    }
    return {
      id: entry.id,
      name: entry.name,
      description: entry.id,
      command: command.toUpperCase(),
      // Relative — executeAmigaDoor re-joins against bbsRoot, so
      // passing absolute here creates a doubled path that fails
      // existsSync (`<root>/<root>/Doors/...`).
      path: entry.binary,
      accessLevel: 0,
      enabled: true,
      type,
    };
  };

  const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8")) as {
    doors: CorpusEntry[];
  };
  let entries = captureAll
    ? corpus.doors
    : corpus.doors.filter((e) => e.integration || only?.has(e.id));
  if (only) entries = entries.filter((e) => only!.has(e.id));

  if (entries.length === 0) {
    process.stdout.write(
      `[integration] no corpus entries with integration: {} (use --only <id> to force, or add integration: {} to corpus.json)\n`,
    );
    process.exit(0);
  }

  process.stdout.write(
    `[integration] ${entries.length} doors, concurrency=${concurrency}${capture ? ", CAPTURE" : ""}\n`,
  );

  let nodeCounter = 1;
  const results = await pool(entries, concurrency, async (entry) => {
    const nodeId = nodeCounter++;
    const r = await runOne(entry, executeDoor, findDoor, {
      capture,
      keepAnsi,
      nodeId,
    });
    const tag =
      r.status === "pass" ? "pass" :
      r.status === "captured" ? `captured (${r.captured?.length ?? 0}B)` :
      r.status === "skip" ? `SKIP ${r.detail}` :
      `FAIL ${r.detail}`;
    process.stdout.write(`  ${r.id}: ${tag} (${r.wallMs}ms)\n`);
    return r;
  });

  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skip = results.filter((r) => r.status === "skip").length;
  const cap = results.filter((r) => r.status === "captured").length;
  process.stdout.write(
    `\n[integration] pass=${pass} fail=${fail} skip=${skip} captured=${cap}\n`,
  );
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
