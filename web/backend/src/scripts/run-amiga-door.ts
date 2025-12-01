import path from 'path';
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

  // Prefer explicit doorType; otherwise infer XIM for Bulls binaries
  const inferredDoorType =
    opts.doorType ||
    (path.basename(opts.execPath).toLowerCase().includes('bull') ? 'XIM' : undefined);

  const amigaSession = new AmigaDoorSession(
    // Null socket interface; AmigaDoorSession only emits events—mock with no-ops
    {
      emit: () => {},
    on: () => {},
    } as any,
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

  await amigaSession.start();
}

async function main() {
  const args = process.argv.slice(2);
  let assignsArg: Record<string, string> = {};
  let toolTypesArg: Record<string, string> = {};
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

  const [execPathArg, nodeArg, ...doorArgs] = args;
  if (!execPathArg) {
    console.error('Usage: ts-node run-amiga-door.ts <doorPath> <nodeId> [args...]');
    process.exit(1);
  }
  const execPath = path.isAbsolute(execPathArg)
    ? execPathArg
    : path.join(process.cwd(), execPathArg);
  const nodeId = parseInt(nodeArg || '0', 10) || 0;
  const cwd = path.dirname(execPath);
  try {
    await runDoor({
      execPath,
      args: doorArgs,
      nodeId,
      cwd,
      assigns: assignsArg,
      toolTypes: Object.keys(toolTypesArg).length ? toolTypesArg : { DISABLE_GUARD: 'true' }, // allow batch doors to run longer if needed
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
