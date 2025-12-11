import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { findCaseInsensitive } from '../utils/amigafs';

const BATCH_FILES = ['batch0', 'batch1', 'batch2', 'batch3', 'batch4', 'batch5', 'batch6'];

function batchRoots(): string[] {
  const roots = [
    config.getConfig().dataDir,
    process.env.BBS_ROOT || path.resolve(process.cwd(), '..'),
    // Project root (two levels up from web/backend) to find default batch files in repo/default-data
    path.resolve(process.cwd(), '..', '..'),
  ].filter(Boolean);
  return Array.from(new Set(roots));
}

function findBatchPath(name: string): string | null {
  for (const root of batchRoots()) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function listBatches(): string[] {
  ensureBatchFiles();
  return BATCH_FILES.filter((name) => !!findBatchPath(name));
}

function readBatch(name: string): string {
  const file = findBatchPath(name);
  return file ? fs.readFileSync(file, 'utf-8') : '';
}

function writeBatch(name: string, content: string) {
  const file = findBatchPath(name) || path.join(batchRoots()[0], name);
  fs.writeFileSync(file, content, 'utf-8');
}

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

function ensureBatchFiles() {
  const roots = batchRoots();
  if (!roots.length) {
    return;
  }

  const primary = roots[0];
  fs.mkdirSync(primary, { recursive: true });

  for (const name of BATCH_FILES) {
    const target = path.join(primary, name);
    const existing = findBatchPath(name);

    if (existing) {
      if (existing !== target && !fs.existsSync(target)) {
        try {
          fs.copyFileSync(existing, target);
        } catch (err) {
          console.error(`[BatchEditor] Failed to copy ${existing} to ${target}:`, err);
        }
      }
      continue;
    }

    if (!fs.existsSync(target)) {
      try {
        fs.writeFileSync(target, '', 'utf-8');
      } catch (err) {
        console.error(`[BatchEditor] Failed to create ${target}:`, err);
      }
    }
  }
}

export function createBatchRouter(): ReturnType<typeof express.Router> {
  const router = express.Router();
  ensureBatchFiles();

  router.get('/', (_req: Request, res: Response) => {
    res.json({ batches: listBatches() });
  });

  router.get('/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    if (!BATCH_FILES.includes(name)) {
      return res.status(400).json({ error: 'Invalid batch name' });
    }
    res.json({ name, content: readBatch(name) });
  });

  router.put('/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    if (!BATCH_FILES.includes(name)) {
      return res.status(400).json({ error: 'Invalid batch name' });
    }
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    writeBatch(name, content);
    res.json({ name, saved: true });
  });

  router.post('/validate', (req: Request, res: Response) => {
    const { name, content } = req.body || {};
    if (name && !BATCH_FILES.includes(name)) {
      return res.status(400).json({ error: 'Invalid batch name' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing batch content' });
    }

    const lines = content.split(/\r?\n/);
    const issues: Array<{ line: number; status: 'ok' | 'warning' | 'error'; message: string; text: string }> = [];

    lines.forEach((rawLine, idx) => {
      const lineNumber = idx + 1;
      const trimmed = rawLine.trim();
      if (!trimmed) {
        return;
      }
      if (trimmed.startsWith(';') || trimmed.startsWith('.')) {
        issues.push({ line: lineNumber, status: 'ok', message: 'Comment/ignored directive', text: rawLine });
        return;
      }

      let cmdPart = trimmed;
      if (trimmed.includes('>')) {
        const [left] = trimmed.split('>');
        cmdPart = left.trim();
      }

      const parts = cmdPart.split(/\s+/);
      if (!parts.length) {
        return;
      }
      const program = parts[0].toLowerCase();
      if (program === '.key' || program === 'key') {
        issues.push({ line: lineNumber, status: 'warning', message: 'KEY directive ignored by runner', text: rawLine });
        return;
      }

      const isSpecial = program.includes('quicknew') || program.includes('lastcallers') || program.includes('multitop') || program.includes('slicktop');
      if (isSpecial) {
        issues.push({ line: lineNumber, status: 'ok', message: 'Handled by built-in runner', text: rawLine });
        return;
      }

      const resolvedProg = resolveExecutable(resolveAssign(parts[0]));
      if (!resolvedProg) {
        issues.push({ line: lineNumber, status: 'error', message: `Program not found: ${parts[0]}`, text: rawLine });
        return;
      }

      issues.push({ line: lineNumber, status: 'ok', message: `Executable resolved: ${resolvedProg}`, text: rawLine });
    });

    const summary = {
      total: lines.length,
      errors: issues.filter((i) => i.status === 'error').length,
      warnings: issues.filter((i) => i.status === 'warning').length,
      ok: issues.filter((i) => i.status === 'ok').length
    };

    res.json({ name, summary, issues });
  });

  return router;
}
