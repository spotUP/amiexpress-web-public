import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { findCaseInsensitive } from '../utils/amigafs';
import { writeQuickNewScreen } from '../utils/quicknew-generator';
import { writeLastCallersBulletin } from '../utils/lastcallers-generator';
import { doorDropFileManager } from '../services/DoorDropFileManager';

function resolveAssign(p: string): string {
  const lower = p.toLowerCase();
  const base = config.getConfig().dataDir;
  const bbsRoot = process.env.BBS_ROOT || base || path.resolve(process.cwd(), '..');
  if (lower.startsWith('bbs:')) {
    const rel = p.substring(4);
    return path.join(base, rel);
  }
  if (lower.startsWith('doors:')) {
    const rel = p.substring(6);
    return path.join(bbsRoot, 'Doors', rel);
  }
  return p;
}

function findInsensitiveFull(fullPath: string): string | null {
  const dir = path.dirname(fullPath);
  const base = path.basename(fullPath);
  return findCaseInsensitive(dir, base);
}

function resolveExecutable(base: string): string | null {
  const direct = findInsensitiveFull(base) || base;
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }

  const candidates = [
    `${direct}.ts`,
    `${direct}.js`,
    path.join(direct, 'index.ts'),
    path.join(direct, 'index.js'),
  ];

  for (const cand of candidates) {
    const resolved = findInsensitiveFull(cand) || cand;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }

  return null;
}

async function runProgram(progPath: string, args: string[], redirectPath?: string, nodeId: number = 1): Promise<void> {
  const ext = path.extname(progPath).toLowerCase();
  const isTs = ext === '.ts';
  const isJs = ext === '.js';
  const isDoorish =
    /[/\\]doors[/\\]/i.test(progPath) ||
    progPath.toLowerCase().includes('doors:');

  // Route Amiga binaries through the door runner (everything non-TS/JS in batches)
  if (!isTs && !isJs) {
    await runAmigaDoorViaRunner(progPath, nodeId || 1, args, path.dirname(progPath), redirectPath);
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const child: any = isTs
        ? require('child_process').spawn('node', ['-r', 'ts-node/register/transpile-only', progPath, ...args], {
            cwd: path.dirname(progPath),
            env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
          })
        : isJs
        ? require('child_process').spawn('node', [progPath, ...args], {
            cwd: path.dirname(progPath),
            env: process.env,
          })
        : require('child_process').spawn(progPath, args, {
            cwd: path.dirname(progPath),
            env: process.env,
          });

      let output = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });

      child.on('error', async (err: any) => {
        console.warn(`[BatchScheduler] Failed to start ${progPath}: ${err.message}`);
        // Fallback: if this looks like an Amiga binary, try running via the door runner
        if (!isTs && !isJs && (isDoorish || err.code === 'ENOEXEC')) {
          console.warn(`[BatchScheduler] Retrying ${progPath} via Amiga door runner fallback`);
          await runAmigaDoorViaRunner(progPath, 0, args);
        }
        resolve();
      });

      child.on('close', (code: number) => {
        if (code !== 0) {
          console.warn(`[BatchScheduler] Program ${progPath} exited with code ${code}`);
        }
        if (redirectPath && output.length > 0) {
          try {
            const resolved = resolveAssign(redirectPath);
            const dir = path.dirname(resolved);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(resolved, output, 'utf-8');
          } catch (err) {
            console.error('[BatchScheduler] Failed to write output:', err);
          }
        }
        resolve();
      });
    } catch (err: any) {
      console.warn(`[BatchScheduler] Error spawning ${progPath}: ${err.message || err}`);
      if (!isTs && !isJs) {
        console.warn(`[BatchScheduler] Retrying ${progPath} via Amiga door runner fallback (spawn error)`);
        runAmigaDoorViaRunner(progPath, nodeId || 1, args).catch((e: any) => {
          console.warn(`[BatchScheduler] Fallback runner failed for ${progPath}: ${e?.message || e}`);
        });
      }
      resolve();
    }
  });
}

async function executeLine(rawLine: string, nodeId: number): Promise<void> {
  const line = rawLine.trim();
  if (!line || line.startsWith(';') || line.startsWith('.')) {
    return;
  }

  // handle redirection
  let cmdPart = line;
  let redirect: string | undefined;
  if (line.includes('>')) {
    const [left, right] = line.split('>');
    cmdPart = left.trim();
    redirect = right.trim();
  }

  const parts = cmdPart.split(/\s+/);
  if (parts.length === 0) {
    return;
  }
  const amigaArgs = parts.slice(1);
  const resolvedArgs = amigaArgs.map((arg) => resolveAssign(arg));

  const program = parts[0].toLowerCase();
  if (program === '.key' || program === 'key') {
    // Reserved directive in AmiExpress batch files; ignore in this implementation
    return;
  }

  // Special-case NTR-LASTCALLERS (68K) to generate lastc.txt
  if (program.includes('ntr-lastcallers') || program.includes('lastcallers')) {
    const nodeNum = nodeId || parseInt(parts[1] || '0', 10) || 1;
    const doorPath = resolveAssign('doors:ntr-lastcallers/ntr-lastcallers');
    if (doorPath) {
      await runAmigaDoorViaRunner(doorPath, nodeNum, resolvedArgs, path.dirname(doorPath));
      console.log(`[BatchScheduler] Ran NTR-LASTCALLERS for node ${nodeNum}`);
    }
    return;
  }

  // Special-case MultiTop (68K) to generate bull1..bull5
  if (program.includes('multitop/mtop')) {
    const doorPath = resolveAssign('doors:multitop/mtop');
    // Expect args: <design> <output> [ignoresysop] [userdata] [userDataPath]
    const args = resolvedArgs;
    const nodeNum = nodeId || 1;
    if (doorPath) {
      await runAmigaDoorViaRunner(doorPath, nodeNum, args, path.dirname(doorPath));
      console.log('[BatchScheduler] Ran MultiTop with args:', args.join(' '));
    }
    return;
  }

  // Special-case QuickNew (68K) to generate screens:quicknew.txt
  if (program.includes('quicknew/quicknew')) {
    const doorPath = resolveAssign('doors:quicknew/quicknew');
    const args = resolvedArgs; // Use resolved paths to avoid path doubling
    const nodeNum = nodeId || 1;
    if (doorPath) {
      const envOverrides = {
        AEDOOR_STDOUT: 'screens:quicknew.txt',
      };
      await runAmigaDoorViaRunner(doorPath, nodeNum, args, path.dirname(doorPath), undefined, envOverrides);
      console.log('[BatchScheduler] Ran QuickNew with stdout redirected to screens:quicknew.txt');
    }
    return;
  }

  // Special-case SlickTop (68K) to generate bull11
  if (program.includes('slicktop/slicktop')) {
    const doorPath = resolveAssign('doors:slicktop/slicktop');
    const args = resolvedArgs; // Use resolved paths to avoid path doubling
    const nodeNum = nodeId || 1;
    if (doorPath) {
      await runAmigaDoorViaRunner(doorPath, nodeNum, args, path.dirname(doorPath));
      console.log('[BatchScheduler] Ran SlickTop with args:', args.join(' '));
    }
    return;
  }

  // Generic external execution attempt
  const resolvedProg = resolveExecutable(resolveAssign(parts[0]));
  if (!resolvedProg) {
    console.warn('[BatchScheduler] Skipping missing program:', parts[0]);
    return;
  }

  await runProgram(resolvedProg, amigaArgs, redirect, nodeId);
}

export async function runBatchFile(batchPath: string, nodeId: number): Promise<void> {
  if (!fs.existsSync(batchPath)) {
    return;
  }

  const contents = fs.readFileSync(batchPath, 'utf-8');
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    try {
      await executeLine(rawLine, nodeId);
    } catch (err) {
      console.error(`[BatchScheduler] Error executing line "${rawLine}":`, err);
    }
  }
}

export async function runLoginBatches(nodeId: number): Promise<void> {
  const baseDir = config.getConfig().dataDir;
  const bbsRoot = process.env.BBS_ROOT || baseDir || path.resolve(process.cwd(), '..');
  const day = new Date().getDay(); // 0-6, Sunday = 0
  const batchName = `batch${day}`;
  const batch000 = 'batch000';

  const candidates = [
    path.join(baseDir, batchName),
    path.join(bbsRoot, `Node${nodeId}`, batchName),
    path.join(baseDir, batch000),
    path.join(bbsRoot, `Node${nodeId}`, batch000),
  ];

  for (const candidate of candidates) {
    await runBatchFile(candidate, nodeId || 1);
  }
}

/**
 * Run logoff batches (same batch0–batch6/000 set as logon).
 * AmiExpress runs these at logoff via system commands; mirror that behavior here.
 */
export async function runLogoffBatches(nodeId: number): Promise<void> {
  const baseDir = config.getConfig().dataDir;
  const bbsRoot = process.env.BBS_ROOT || baseDir || path.resolve(process.cwd(), '..');
  const day = new Date().getDay(); // 0-6, Sunday = 0
  const batchName = `batch${day}`;
  const batch000 = 'batch000';

  const candidates = [
    path.join(baseDir, batchName),
    path.join(bbsRoot, `Node${nodeId}`, batchName),
    path.join(baseDir, batch000),
    path.join(bbsRoot, `Node${nodeId}`, batch000),
  ];

  for (const candidate of candidates) {
    await runBatchFile(candidate, nodeId || 1);
  }
}
function runAmigaDoorViaRunner(
  doorPath: string,
  nodeId: number,
  args: string[] = [],
  cwd?: string,
  redirectPath?: string,
  envOverrides?: Record<string, string>
): Promise<void> {
  const appRootPath = path.resolve(__dirname, '../../../..');
  const dataDir = config.getConfig().dataDir;
  const bbsRoot = process.env.BBS_ROOT || dataDir || path.resolve(process.cwd(), '..');
  const assigns: Record<string, string> = {
    'BBS:': dataDir,
    'BBS': dataDir,
    'Doors:': path.join(bbsRoot, 'Doors'),
    'Doors': path.join(bbsRoot, 'Doors'),
    [`Node${nodeId}:`]: path.join(bbsRoot, `Node${nodeId}`),
    [`Node${nodeId}`]: path.join(bbsRoot, `Node${nodeId}`),
  };

  // Create drop files so doors see expected environment
  try {
    doorDropFileManager.createDoorSys(nodeId, {
      id: nodeId,
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
    } as any, 60 * 60);
    doorDropFileManager.createDorInfo(nodeId, {
      id: nodeId,
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
    } as any);
  } catch (err: any) {
    console.warn('[BatchScheduler] Failed to create drop files:', err?.message || err);
  }

  return new Promise<void>((resolve) => {
    const runnerPath = path.join(appRootPath, 'web', 'backend', 'dist', 'scripts', 'run-amiga-door.js');
    const resolvedRunner = fs.existsSync(runnerPath) ? runnerPath : path.join(appRootPath, 'web', 'backend', 'src', 'scripts', 'run-amiga-door.ts');

    const useTsRunner = resolvedRunner.endsWith('.ts');
    const command = useTsRunner ? 'npx' : 'node';
    // For batch doors, use default loop limit (500K) with guard enabled by default
    // Batch doors should complete quickly - if they exceed 500K iterations they're stuck
    // The 60s timeout provides an additional safety net
    const toolTypes = {}; // Empty toolTypes = use DoorLifecycleManager defaults (500K loop limit, guard enabled)
    const execArgs = useTsRunner
      ? ['tsx', resolvedRunner, doorPath, String(nodeId), ...args, '--assigns', JSON.stringify(assigns), '--tooltypes', JSON.stringify(toolTypes)]
      : [resolvedRunner, doorPath, String(nodeId), ...args, '--assigns', JSON.stringify(assigns), '--tooltypes', JSON.stringify(toolTypes)];

    const child: any = require('child_process').spawn(command, execArgs, {
      cwd: cwd || path.dirname(doorPath),
      env: { ...process.env, ...envOverrides, TS_NODE_TRANSPILE_ONLY: 'true' },
      detached: true, // Create new process group so we can kill the entire tree
    });

    // Timeout to prevent stuck doors from running forever (60 seconds max for batch doors)
    const BATCH_DOOR_TIMEOUT = 60000;
    let killed = false;
    const timeoutHandle = setTimeout(() => {
      if (!child.killed && child.pid) {
        console.warn(`[BatchScheduler] Door ${path.basename(doorPath)} timed out after ${BATCH_DOOR_TIMEOUT / 1000}s, killing process tree (pid ${child.pid})`);
        killed = true;
        try {
          // AGGRESSIVE KILL: Use pkill to kill ALL processes matching the door name
          // This is necessary because npm/npx don't create proper process groups
          const doorName = path.basename(doorPath);
          const { execSync } = require('child_process');

          // First try process group kill
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (e1: any) {
            console.warn(`[BatchScheduler] Process group kill failed: ${e1.message}`);
          }

          // Then kill by name (catches npm/npx children)
          try {
            execSync(`pkill -9 -f "${doorName}"`, { stdio: 'ignore' });
            console.warn(`[BatchScheduler] Killed all processes matching: ${doorName}`);
          } catch (e2: any) {
            // pkill returns non-zero if no processes found, ignore
          }

          // Finally, direct kill of child
          child.kill('SIGKILL');
        } catch (e: any) {
          console.error(`[BatchScheduler] Failed to kill door: ${e.message}`);
        }
      }
    }, BATCH_DOOR_TIMEOUT);

    const MAX_OUTPUT_LENGTH = 256 * 1024; // keep last 256 KB
    let output = '';
    const appendOutput = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(output.length - MAX_OUTPUT_LENGTH);
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      appendOutput(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      appendOutput(chunk);
    });

    child.on('error', (err: any) => {
      clearTimeout(timeoutHandle);
      console.warn(`[BatchScheduler] Amiga door runner failed to start: ${err.message}`);
      resolve();
    });
    child.on('close', (code: number) => {
      clearTimeout(timeoutHandle);
      const trimmed = output.trim();
      if (killed) {
        console.warn(`[BatchScheduler] Door ${path.basename(doorPath)} was killed due to timeout`);
      } else if (code !== 0) {
        console.warn(`[BatchScheduler] Amiga door runner exited with code ${code}`);
        if (trimmed) {
          console.warn(`[BatchScheduler] Runner output:\n${trimmed}`);
        }
      }
      if (trimmed) {
        try {
          const logFile = path.join(appRootPath, 'logs', 'door-68k.log');
          fs.appendFileSync(logFile, `[BatchRunner] door=${doorPath} node=${nodeId} code=${code}\n${trimmed}\n`, { encoding: 'utf8' });
        } catch {
          /* ignore */
        }
      }
      if (redirectPath) {
        const resolved = resolveAssign(redirectPath);
        try {
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          fs.writeFileSync(resolved, output, 'utf8');
          console.log(`[BatchScheduler] Redirected output to ${resolved}`);
        } catch (err) {
          console.error('[BatchScheduler] Failed to write redirect file:', err);
        }
      }
      resolve();
    });
  });
}
