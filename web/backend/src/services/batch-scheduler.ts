import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { findCaseInsensitive } from '../utils/fs-amiga.util';
import { writeQuickNewScreen } from '../utils/quicknew-generator';
import { writeLastCallersBulletin } from '../utils/lastcallers-generator';

function resolveAssign(p: string): string {
  const lower = p.toLowerCase();
  const base = config.getConfig().dataDir;
  if (lower.startsWith('bbs:')) {
    const rel = p.substring(4);
    return path.join(base, rel);
  }
  if (lower.startsWith('doors:')) {
    const rel = p.substring(6);
    return path.join(process.env.BBS_ROOT || path.resolve(process.cwd(), '..'), 'Doors', rel);
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

async function runProgram(progPath: string, args: string[], redirectPath?: string): Promise<void> {
  const ext = path.extname(progPath).toLowerCase();
  const isTs = ext === '.ts';
  const isJs = ext === '.js';

  // For native binaries, ensure execute permission; otherwise skip with warning
  if (!isTs && !isJs) {
    try {
      const mode = fs.statSync(progPath).mode;
      if ((mode & 0o111) === 0) {
        console.warn(`[BatchScheduler] Skipping ${progPath} (not executable)`);
        return;
      }
    } catch {
      console.warn(`[BatchScheduler] Skipping ${progPath} (stat failed)`);
      return;
    }
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

      child.on('error', (err: any) => {
        console.warn(`[BatchScheduler] Failed to start ${progPath}: ${err.message}`);
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
      resolve();
    }
  });
}

async function executeLine(rawLine: string): Promise<void> {
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

  const program = parts[0].toLowerCase();
  if (program === '.key' || program === 'key') {
    // Reserved directive in AmiExpress batch files; ignore in this implementation
    return;
  }

  // Special-case QuickNew (TS/host)
  if (program.includes('quicknew')) {
    try {
      await writeQuickNewScreen(1);
      console.log('[BatchScheduler] QuickNew screen regenerated (conf 1)');
    } catch (err: any) {
      console.warn('[BatchScheduler] QuickNew generation failed:', err?.message || err);
    }
    return;
  }

  // Special-case NTR-LASTCALLERS (68K) to generate lastc.txt
  if (program.includes('ntr-lastcallers') || program.includes('lastcallers')) {
    const nodeNum = parseInt(parts[1] || '0', 10) || 0;
    const doorPath = resolveAssign('doors:ntr-lastcallers/ntr-lastcallers');
    if (doorPath) {
      await runAmigaDoorViaRunner(doorPath, nodeNum, []);
      console.log(`[BatchScheduler] Ran NTR-LASTCALLERS for node ${nodeNum}`);
    }
    return;
  }

  // Special-case MultiTop (68K) to generate bull1..bull5
  if (program.includes('multitop/mtop')) {
    const doorPath = resolveAssign('doors:multitop/mtop');
    // Expect args: <design> <output> [ignoresysop] [userdata] [userDataPath]
    const args = parts.slice(1);
    const nodeNum = 0; // not used by multitop designs but runner requires a node
    if (doorPath) {
      await runAmigaDoorViaRunner(doorPath, nodeNum, args);
      console.log('[BatchScheduler] Ran MultiTop with args:', args.join(' '));
    }
    return;
  }

  // Special-case SlickTop (68K) to generate bull11
  if (program.includes('slicktop/slicktop')) {
    const doorPath = resolveAssign('doors:slicktop/slicktop');
    const args = parts.slice(1); // e.g., bbs:bulletins/bull11.txt bbs:conf14/conf.db 20 3 "title"
    const nodeNum = 0;
    if (doorPath) {
      await runAmigaDoorViaRunner(doorPath, nodeNum, args);
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

  await runProgram(resolvedProg, parts.slice(1), redirect);
}

async function runBatchFile(batchPath: string): Promise<void> {
  if (!fs.existsSync(batchPath)) {
    return;
  }

  const contents = fs.readFileSync(batchPath, 'utf-8');
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    try {
      await executeLine(rawLine);
    } catch (err) {
      console.error(`[BatchScheduler] Error executing line "${rawLine}":`, err);
    }
  }
}

export async function runLoginBatches(nodeId: number): Promise<void> {
  const bbsRoot = process.env.BBS_ROOT || path.resolve(process.cwd(), '..');
  const baseDir = config.getConfig().dataDir;
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
    await runBatchFile(candidate);
  }
}
function runAmigaDoorViaRunner(doorPath: string, nodeId: number, args: string[] = []): Promise<void> {
  const appRootPath = path.resolve(__dirname, '../../../..');
  return new Promise<void>((resolve) => {
    const runnerPath = path.join(appRootPath, 'web', 'backend', 'dist', 'scripts', 'run-amiga-door.js');
    const resolvedRunner = fs.existsSync(runnerPath) ? runnerPath : path.join(appRootPath, 'web', 'backend', 'src', 'scripts', 'run-amiga-door.ts');

    const execArgs = [resolvedRunner, doorPath, String(nodeId), ...args];

    const child: any = require('child_process').spawn('node', execArgs, {
      cwd: appRootPath,
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    });

    child.on('error', (err: any) => {
      console.warn(`[BatchScheduler] Amiga door runner failed to start: ${err.message}`);
      resolve();
    });
    child.on('close', (code: number) => {
      if (code !== 0) {
        console.warn(`[BatchScheduler] Amiga door runner exited with code ${code}`);
      }
      resolve();
    });
  });
}
