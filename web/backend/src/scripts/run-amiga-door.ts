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

  await amigaSession.start();
}

main().catch((error) => {
  console.error("[run-amiga-door] Door execution failed:", error);
  process.exit(1);
});
