import path from 'path';
import { AmigaDoorSession } from '../amiga-emulation/AmigaDoorSession';
import { config } from '../config';

interface RunnerOptions {
  execPath: string;
  args: string[];
  nodeId: number;
  doorId?: string;
}

async function runDoor(opts: RunnerOptions) {
  const dataDir = config.getConfig().dataDir;
  const bbsRoot = process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');

  const session = {
    nodeId: opts.nodeId,
    nodeNumber: opts.nodeId,
    bbsName: 'AmiExpress Web BBS',
    sysopName: 'Sysop',
    timeRemaining: 60,
    doorCommand: opts.doorId || path.basename(opts.execPath),
    doorName: opts.doorId || path.basename(opts.execPath),
    dataDir,
    bbsRoot,
    user: {
      id: 'sysop-runner',
      name: 'Sysop',
      username: 'sysop',
      secLevel: 255,
      expert: 'Y',
      ansi: 'Y',
    },
  };

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
    } as any
  );

  await amigaSession.start();
}

async function main() {
  const [, , execPathArg, nodeArg, ...doorArgs] = process.argv;
  if (!execPathArg) {
    console.error('Usage: ts-node run-amiga-door.ts <doorPath> <nodeId> [args...]');
    process.exit(1);
  }
  const execPath = path.isAbsolute(execPathArg)
    ? execPathArg
    : path.join(process.cwd(), execPathArg);
  const nodeId = parseInt(nodeArg || '0', 10) || 0;
  try {
    await runDoor({
      execPath,
      args: doorArgs,
      nodeId,
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
