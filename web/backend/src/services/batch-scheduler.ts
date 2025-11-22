import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

import { config } from '../config';
import { findCaseInsensitive } from '../utils/fs-amiga.util';

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
      const child = isTs
        ? spawn('node', ['-r', 'ts-node/register/transpile-only', progPath, ...args], {
            cwd: path.dirname(progPath),
            env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
          })
        : isJs
        ? spawn('node', [progPath, ...args], {
            cwd: path.dirname(progPath),
            env: process.env,
          })
        : spawn(progPath, args, {
            cwd: path.dirname(progPath),
            env: process.env,
          });

      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk.toString();
      });
      child.stderr.on('data', chunk => {
        output += chunk.toString();
      });

      child.on('error', err => {
        console.warn(`[BatchScheduler] Failed to start ${progPath}: ${err.message}`);
        resolve();
      });

      child.on('close', code => {
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
