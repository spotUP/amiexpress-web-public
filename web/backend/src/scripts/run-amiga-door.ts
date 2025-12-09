import 'reflect-metadata'; // Must be first import for tsyringe decorators
import path from 'path';
import fs from 'fs';
import { AmigaDoorSession } from '../amiga-emulation/AmigaDoorSession';
import { config } from '../config';
import { doorDropFileManager } from '../services/DoorDropFileManager';

interface RunnerOptions {
  execPath: string;
  args: string[];
  nodeId: number;
  doorId?: string;
  doorType?: string;
  cwd?: string;
  user?: any;
  timeRemaining?: number;
  assigns?: Record<string, string>;
  toolTypes?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
}

async function runDoor(opts: RunnerOptions) {
  const cfg = config.getConfig();
  const resolvedDataDir = path.resolve(cfg.dataDir);
  const bbsRoot = path.resolve(
    process.env.BBS_DATA_DIR || process.env.BBS_ROOT || resolvedDataDir
  );
  const dataDir = bbsRoot;
  process.env.BBS_ROOT = bbsRoot;
  process.env.BBS_DATA_DIR = bbsRoot;
  doorDropFileManager.setBbsRoot(bbsRoot);
  const user = opts.user || {
    id: 1,
    name: 'Sysop',
    realname: 'Sysop',
    username: 'sysop',
    secLevel: 255,
    expert: 'Y',
    ansi: 'Y',
    calls: 1,
    uploads: 0,
    downloads: 0,
    byteLimit: 1024 * 1024 * 10,
    location: 'Unknown',
    phone: '000-000-0000',
    linesPerScreen: 24,
    protocol: 'Z',
    lastLogin: new Date(),
  };
  const timeRemaining = opts.timeRemaining ?? 60 * 60; // default 60 minutes

  // Ensure drop files exist for doors expecting DOOR.SYS/DORINFO
  try {
    doorDropFileManager.createDoorSys(opts.nodeId, user, timeRemaining);
    doorDropFileManager.createDorInfo(opts.nodeId, user);
  } catch (err: any) {
    console.warn('[run-amiga-door] Failed to create drop files:', err?.message || err);
  }

  const debugEnabled = process.env.DEBUG_XIM_OUTPUT === '1';
  const debugLogPath =
    process.env.DEBUG_XIM_OUTPUT_PATH ??
    path.join(process.cwd(), 'logs', 'xim-output.log');

  const instrumentedSocket = (() => {
    let stream: fs.WriteStream | null = null;
    const ensureStream = () => {
      if (!stream) {
        stream = fs.createWriteStream(debugLogPath, {
          flags: 'a',
          encoding: 'utf8',
        });
      }
      return stream;
    };

    return debugEnabled
      ? {
          emit(event: string, payload?: any): void {
            if (event === 'ansi-output' && typeof payload === 'string') {
              ensureStream().write(payload);
            }
          },
          on: () => {},
          close(): void {
            stream?.end();
          },
        }
      : {
          emit: () => {},
          on: () => {},
          close: () => {},
        };
  })();

  const session = {
    nodeId: opts.nodeId,
    nodeNumber: opts.nodeId,
    bbsName: 'AmiExpress Web BBS',
    sysopName: 'Sysop',
    timeRemaining,
    doorCommand: opts.doorId || path.basename(opts.execPath),
    doorName: opts.doorId || path.basename(opts.execPath),
    dataDir,
    bbsRoot,
    user,
  };

  // Prefer explicit doorType; default to provided value without door-name heuristics
  const inferredDoorType = opts.doorType;

  const amigaSession = new AmigaDoorSession(
    instrumentedSocket as any,
    {
      executablePath: opts.execPath,
      args: opts.args,
      timeout: 300,
      bbsSession: session,
      doorId: opts.doorId,
      cwd: opts.cwd || path.dirname(opts.execPath),
      assigns: opts.assigns || {},
      env: opts.env,
      toolTypes: opts.toolTypes || {},
      doorType: inferredDoorType,
    } as any
  );

  try {
    await amigaSession.start();
  } finally {
    instrumentedSocket.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  let assignsArg: Record<string, string> = {};
  let toolTypesArg: Record<string, string> = {};
  let doorTypeArg: string | undefined = undefined;
  let doorIdArg: string | undefined = undefined;

  // Parse --doorId argument (command name used to launch door, e.g., "FR")
  const doorIdIndex = args.indexOf('--doorId');
  if (doorIdIndex >= 0 && doorIdIndex + 1 < args.length) {
    doorIdArg = args[doorIdIndex + 1];
    args.splice(doorIdIndex, 2);
  }

  const assignsIndex = args.indexOf('--assigns');
  if (assignsIndex >= 0 && assignsIndex + 1 < args.length) {
    try {
      assignsArg = JSON.parse(args[assignsIndex + 1]);
    } catch {
      assignsArg = {};
    }
    args.splice(assignsIndex, 2);
  }
  const toolTypesIndex = args.indexOf('--tooltypes');
  if (toolTypesIndex >= 0 && toolTypesIndex + 1 < args.length) {
    try {
      toolTypesArg = JSON.parse(args[toolTypesIndex + 1]);
    } catch {
      toolTypesArg = {};
    }
    args.splice(toolTypesIndex, 2);
  }
  const doorTypeIndex = args.indexOf('--doortype');
  if (doorTypeIndex >= 0 && doorTypeIndex + 1 < args.length) {
    doorTypeArg = args[doorTypeIndex + 1];
    args.splice(doorTypeIndex, 2);
  }

  // Parse --node argument
  let nodeArg: string | undefined = undefined;
  const nodeIndex = args.indexOf('--node');
  if (nodeIndex >= 0 && nodeIndex + 1 < args.length) {
    nodeArg = args[nodeIndex + 1];
    args.splice(nodeIndex, 2);
  }

  const [execPathArg, positionalNodeArg, ...doorArgsRaw] = args;
  // Allow callers to prefix door args with --args (drop the flag, keep the payload)
  const doorArgs =
    doorArgsRaw.length > 0 && doorArgsRaw[0] === '--args'
      ? doorArgsRaw.slice(1)
      : doorArgsRaw;
  if (!execPathArg) {
    console.error('Usage: ts-node run-amiga-door.ts <doorPath> <nodeId> [--doorId CMD] [--doortype TYPE] [--assigns JSON] [--tooltypes JSON] [args...]');
    process.exit(1);
  }
  const execPath = path.isAbsolute(execPathArg)
    ? execPathArg
    : path.join(process.cwd(), execPathArg);
  // Use --node flag if provided, otherwise fall back to positional arg
  const nodeId = parseInt(nodeArg || positionalNodeArg || '0', 10) || 0;
  const cwd = path.dirname(execPath);
  try {
    await runDoor({
      execPath,
      args: doorArgs,
      nodeId,
      cwd,
      doorId: doorIdArg,
      doorType: doorTypeArg,
      assigns: assignsArg,
      toolTypes: Object.keys(toolTypesArg).length ? toolTypesArg : { LOOP_LIMIT: '10000000' }, // batch doors: higher limit but keep guard enabled
      env: process.env,
    });
    process.exit(0);
  } catch (err: any) {
    console.error('[run-amiga-door] Failed:', err?.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
