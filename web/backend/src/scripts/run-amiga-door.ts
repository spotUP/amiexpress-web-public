// MUST be first: redirects console.* to stderr before any module initializes.
// AmigaDoorSession (and transitively config.ts) fires console.log during import;
// without this first the logs land in the door's stdout redirect file (quicknew.txt etc.).
import "./console-to-stderr";
import "reflect-metadata";
import path from "path";
import { EventEmitter } from "events";
import { AmigaDoorSession } from "../amiga-emulation/AmigaDoorSession";

class MockSocket extends EventEmitter {
  emit(event: string, data?: any): boolean {
    if (event === "ansi-output") {
      process.stdout.write(data || "");
    } else {
      process.stderr.write(`[SOCKET:${event}] ${JSON.stringify(data)}\n`);
    }
    return super.emit(event, data);
  }
}

type ParsedOptions = {
  assigns: Record<string, string>;
  toolTypes: Record<string, string>;
  doorType: string;
  timeout?: number;
  args: string[];
  command?: string;
};

function parseArgs(argv: string[]): ParsedOptions {
  const options: ParsedOptions = {
    assigns: {},
    toolTypes: {},
    doorType: "XIM",
    args: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--assigns") {
      const raw = argv[i + 1];
      if (raw) {
        options.assigns = JSON.parse(raw);
      }
      i += 1;
    } else if (arg === "--tooltypes") {
      const raw = argv[i + 1];
      if (raw) {
        options.toolTypes = JSON.parse(raw);
      }
      i += 1;
    } else if (arg === "--doortype") {
      const raw = argv[i + 1];
      if (raw) {
        options.doorType = raw;
      }
      i += 1;
    } else if (arg === "--timeout") {
      const raw = argv[i + 1];
      if (raw) {
        options.timeout = Number(raw);
      }
      i += 1;
    } else if (arg === "--command") {
      const raw = argv[i + 1];
      if (raw) {
        options.command = raw;
      }
      i += 1;
    } else {
      options.args.push(arg);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const [doorPathArg, nodeArg, ...rest] = process.argv.slice(2);
  if (!doorPathArg) {
    console.error(
      "Usage: npx tsx web/backend/src/scripts/run-amiga-door.ts <door-path> <node> [args...] --assigns <json> --tooltypes <json> --doortype <XIM|SIM|TIM>"
    );
    process.exit(1);
  }

  const nodeId = Number(nodeArg) || 1;
  const resolvedDoorPath = path.isAbsolute(doorPathArg)
    ? doorPathArg
    : path.join(process.cwd(), doorPathArg);

  const parsed = parseArgs(rest);
  // XIM doors expect node number as first arg (express.e runDoor pattern)
  // SIM/TIM/IIM/SUP doors are plain CLI utilities - pass args as-is from batch file
  const isXimDoor = parsed.doorType.toUpperCase() === "XIM";
  const doorArgs = isXimDoor ? [String(nodeId), ...parsed.args] : parsed.args;
  const socket = new MockSocket();

  const amigaSession = new AmigaDoorSession(socket as any, {
    executablePath: resolvedDoorPath,
    doorType: parsed.doorType,
    timeout: parsed.timeout ?? 300,
    args: doorArgs,
    assigns: parsed.assigns,
    toolTypes: parsed.toolTypes,
    bbsSession: {
      user: {
        id: String(nodeId),
        username: "Sysop",
        location: "Local Console",
        secLevel: 255,
      },
      nodeId,
      nodeNumber: nodeId,
      bbsName: "AmiExpress-Web",
      sysopName: "Sysop",
      timeRemaining: 60,
      doorCommand: parsed.command || undefined,  // Command that invoked the door (N, NSU, FR, etc.)
      doorId: parsed.command || undefined,
    },
  });

  // Scripted-input support for the door corpus runner. When stdin is
  // piped (not a TTY), read lines of the form `<delayMs> <bytes>` and
  // emit each as a `door:input` socket event after the given delay
  // from session start. AmigaDoorSession listens for `door:input` and
  // routes the data through the XIM / TIM / DOS-stdin protocol stack
  // exactly the way real socket input does (AmigaDoorSession.ts:230).
  //
  // Escape sequences supported: `\r` → CR, `\n` → LF, `\t` → TAB,
  // `\xNN` → hex byte, `\\` → literal backslash. Lines starting with
  // `#` are comments. Empty lines are ignored. Reading stdin starts
  // immediately so the first delay is measured from process start
  // (small skew vs `amigaSession.start()` doesn't matter — XIM doors
  // don't begin reading input until JH_LI / SIG_LI fires anyway).
  let inputScript: Array<{ delayMs: number; bytes: string }> | null = null;
  if (!process.stdin.isTTY) {
    // Wait for stdin 'end' (the corpus runner / shell pipe closes it
    // after writing the script). No timeout fallback — a 50 ms cap
    // raced with jest's higher-latency spawn and resolved before the
    // pipe delivered data, leaving doors blocked at their first
    // input prompt. If nothing is piped, 'end' fires effectively
    // immediately and we proceed with no script.
    const raw = await new Promise<string>((resolve) => {
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { buf += chunk; });
      process.stdin.on("end", () => resolve(buf));
      process.stdin.on("error", () => resolve(buf));
    });
    if (raw.trim().length > 0) {
      inputScript = parseInputScript(raw);
    }
  }

  if (inputScript && inputScript.length > 0) {
    const t0 = Date.now();
    for (const entry of inputScript) {
      const fireAt = t0 + entry.delayMs;
      const wait = Math.max(0, fireAt - Date.now());
      setTimeout(() => {
        socket.emit("door:input", entry.bytes);
      }, wait);
    }
  }

  await amigaSession.start();
}

function parseInputScript(
  text: string,
): Array<{ delayMs: number; bytes: string }> {
  const out: Array<{ delayMs: number; bytes: string }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const m = line.match(/^(\d+)\s+(.*)$/);
    if (!m) continue;
    const delayMs = Number(m[1]);
    const bytes = decodeEscapes(m[2]);
    out.push({ delayMs, bytes });
  }
  return out;
}

function decodeEscapes(s: string): string {
  return s.replace(/\\(x[0-9a-fA-F]{2}|.)/g, (_, esc: string) => {
    if (esc === "r") return "\r";
    if (esc === "n") return "\n";
    if (esc === "t") return "\t";
    if (esc === "\\") return "\\";
    if (esc.startsWith("x")) return String.fromCharCode(parseInt(esc.slice(1), 16));
    return esc;
  });
}

main().then(() => {
  // Force-exit after the door session resolves. Some XIM handlers
  // (notably JH_MCI's dynamic import of screen.handler) transitively
  // pull in the full BBS via index.ts, whose top-level IIFE spins up
  // database/Telnet/HTTP servers that keep Node alive forever. The
  // headless harness has no use for those listeners, so once the door
  // has terminated we drop the process explicitly.
  //
  // process.exit() does NOT flush async stdout when piped (Node docs);
  // the corpus runner pipes our stdout to a buffer, so an immediate
  // exit can drop the door's final lines on the floor (regressed the
  // `who` golden 2026-05-14). Flush via an empty write+callback so
  // the pipe drains before we drop.
  process.stdout.write("", () => process.exit(0));
}).catch((error) => {
  console.error("[run-amiga-door] Door execution failed:", error);
  process.exit(1);
});
