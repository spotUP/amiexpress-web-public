import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { findCaseInsensitive } from '../utils/amigafs';
import { writeQuickNewScreen, generateQuickNewFromConfig } from '../utils/quicknew-generator';
import { writeLastCallersBulletin, generateLastCallersBulletin } from '../utils/lastcallers-generator';
import { doorDropFileManager } from '../services/DoorDropFileManager';

/**
 * Parse AmigaDOS-style command line arguments with quote handling.
 * CRITICAL: Keep quotes IN the arguments - AmigaDOS programs expect to parse them.
 *
 * Examples:
 *   -UC"0" -> ['-UC"0"']  (program parses the quotes)
 *   -O"BBS:path"15 -> ['-O"BBS:path"15']  (program parses quotes and number)
 *   doors:path/file arg1 arg2 -> ['doors:path/file', 'arg1', 'arg2']
 *
 * Only splits on spaces OUTSIDE of quotes. Quotes remain in the arguments.
 */
function parseAmigaDOSArgs(cmdLine: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < cmdLine.length; i++) {
    const char = cmdLine[i];

    if (char === '"') {
      // Keep the quote in the argument
      current += char;
      inQuotes = !inQuotes;
    } else if (char === ' ' && !inQuotes) {
      // Whitespace outside quotes - end current argument
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      // Regular character - accumulate
      current += char;
    }
  }

  // Push final argument if any
  if (current) {
    parts.push(current);
  }

  return parts;
}

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

async function runProgram(progPath: string, args: string[], redirectPath?: string, nodeId: number = 1, envOverrides?: Record<string, string>): Promise<void> {
  const ext = path.extname(progPath).toLowerCase();
  const isTs = ext === '.ts';
  const isJs = ext === '.js';
  const isDoorish =
    /[/\\]doors[/\\]/i.test(progPath) ||
    progPath.toLowerCase().includes('doors:');

  // Route Amiga binaries through the door runner (everything non-TS/JS in batches)
  if (!isTs && !isJs) {
    await runAmigaDoorViaRunner(progPath, nodeId || 1, args, path.dirname(progPath), redirectPath, envOverrides);
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

  // Parse AmigaDOS-style arguments (handles quotes like -UC"0" -O"path"15)
  const parts = parseAmigaDOSArgs(cmdPart);
  if (parts.length === 0) {
    return;
  }
  const amigaArgs = parts.slice(1);
  // CRITICAL FIX: Do NOT resolve Amiga assigns to full paths!
  // 68K doors expect Amiga-style paths (doors:, bbs:, etc.)
  // Long Unix paths cause infinite loops in door string copy routines
  // The emulator's DOS library will resolve assigns during file operations
  const resolvedArgs = amigaArgs; // Keep original Amiga paths

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

  // Special-case QuickNew (TypeScript) to generate screens:quicknew.txt
  // Command format: doors:quicknew/quicknew <config_file> <days_back> >bbs:screens/quicknew.txt
  // Example: doors:quicknew/quicknew doors:quicknew/quicknew.config1 7 >bbs:screens/quicknew.txt
  if (program.includes('quicknew/quicknew')) {
    const args = resolvedArgs;
    if (args.length >= 2) {
      const configPath = args[0]; // Already resolved by resolvedArgs
      const daysBack = parseInt(args[1], 10) || 7;

      // Output path comes from stdout redirect in batch file (e.g., >bbs:screens/quicknew.txt)
      // We extract it from the original command line using the redirect variable
      let outputPath = 'Screens/quicknew.txt'; // Default
      if (redirect) {
        // Resolve the output path (e.g., bbs:screens/quicknew.txt -> /path/to/Screens/quicknew.txt)
        const resolved = resolveAssign(redirect);
        if (resolved) {
          outputPath = resolved;
        }
      }

      console.log(`[BatchScheduler] Generating QuickNew from config: ${configPath}, days: ${daysBack}, output: ${outputPath}`);
      await generateQuickNewFromConfig(configPath, daysBack, outputPath);
      console.log('[BatchScheduler] QuickNew generated successfully');
    } else {
      console.error('[BatchScheduler] QuickNew requires config file and days back arguments');
    }
    return;
  }

  // Generate last callers bulletin using TypeScript SAmiLog implementation
  // Replaces 68K SAmiLog binary with TypeScript port (100% format compatible)
  // Command format: samilog -UC"N" -O"output/path"count
  if (program.includes('samilog/samilog') || program.includes('typescript:samilog')) {
    console.log('[BatchScheduler] Running TypeScript SAmiLog');

    // Parse SAmiLog arguments: -UC"node" -O"output"count
    let nodeNum = nodeId || 1;
    let outputPath = 'Bulletins/bull6.txt';
    let count = 15;

    for (const arg of amigaArgs) {
      // Parse -UC"N" for node number
      const ucMatch = arg.match(/^-UC"(\d+)"$/i);
      if (ucMatch) {
        nodeNum = parseInt(ucMatch[1], 10);
        console.log(`[BatchScheduler] SAmiLog node: ${nodeNum}`);
      }

      // Parse -O"path"count for output and count
      const oMatch = arg.match(/^-O"([^"]+)"(\d+)$/i);
      if (oMatch) {
        const rawPath = oMatch[1];
        count = parseInt(oMatch[2], 10);

        // Resolve BBS: assign and convert to Unix path
        if (rawPath.toLowerCase() === '*') {
          outputPath = 'Bulletins/bull6.txt'; // Default
        } else {
          outputPath = resolveAssign(rawPath).replace(config.get('dataDir') + path.sep, '');
        }
        console.log(`[BatchScheduler] SAmiLog output: ${outputPath}, count: ${count}`);
      }
    }

    const baseDir = config.get('dataDir');
    const content = generateLastCallersBulletin(count);
    const fullPath = path.join(baseDir, outputPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`[BatchScheduler] SAmiLog bulletin written to ${outputPath}`);
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

  // Generic Amiga binary execution (works for any utility: SuperAmiLog, custom tools, etc.)
  const rawProg = resolveAssign(parts[0]);
  const resolvedProg = resolveExecutable(rawProg) || (require('../utils/amigafs').resolvePath(rawProg));
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

  console.log(`[BatchScheduler] Running logoff batches for node ${nodeId}, day=${day} (${batchName})`);

  const candidates = [
    path.join(baseDir, batchName),
    path.join(bbsRoot, `Node${nodeId}`, batchName),
    path.join(baseDir, batch000),
    path.join(bbsRoot, `Node${nodeId}`, batch000),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[BatchScheduler] Found batch file: ${candidate}`);
    }
    await runBatchFile(candidate, nodeId || 1);
  }

  console.log(`[BatchScheduler] Logoff batches completed for node ${nodeId}`);
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
    // For batch doors: use default loop limit with guard enabled
    // The 60s timeout provides the primary safety net for stuck doors
    // IMPORTANT: Batch doors are SIM-type (plain AmigaDOS executables), NOT XIM doors
    // Setting doortype=SIM disables XIM protocol polling which batch doors don't use
    const toolTypes = {}; // Use DoorLifecycleManager defaults
    const execArgs = useTsRunner
      ? ['tsx', resolvedRunner, doorPath, String(nodeId), ...args, '--assigns', JSON.stringify(assigns), '--tooltypes', JSON.stringify(toolTypes), '--doortype', 'SIM']
      : [resolvedRunner, doorPath, String(nodeId), ...args, '--assigns', JSON.stringify(assigns), '--tooltypes', JSON.stringify(toolTypes), '--doortype', 'SIM'];

    const child: any = require('child_process').spawn(command, execArgs, {
      cwd: cwd || path.dirname(doorPath),
      env: { ...process.env, ...envOverrides, TS_NODE_TRANSPILE_ONLY: 'true' },
      detached: true, // Create new process group so we can kill the entire tree
    });

    // Timeout to prevent stuck doors from running forever (300 seconds max for batch doors)
    // Increased from 60s to 300s to allow mtop to process large user databases (~1000 users)
    const BATCH_DOOR_TIMEOUT = 300000;
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
