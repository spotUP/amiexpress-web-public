import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { findCaseInsensitive } from '../utils/amigafs';
import * as amigafs from '../utils/amigafs';

// Standard batch files to ensure they exist
const STANDARD_BATCH_FILES = ['batch0', 'batch000', 'batch1', 'batch2', 'batch3', 'batch4', 'batch5', 'batch6'];

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
    if (amigafs.existsSync(p)) return p;
  }
  return null;
}

function listBatches(): string[] {
  ensureBatchFiles();

  // Scan all batch roots for files starting with "batch" (case-insensitive)
  const found = new Set<string>();
  const roots = batchRoots();
  console.log('[BatchEditor] Scanning roots:', roots);

  for (const root of roots) {
    if (!amigafs.existsSync(root)) {
      console.log('[BatchEditor] Root does not exist:', root);
      continue;
    }

    try {
      const files = amigafs.readdirSync(root);
      console.log(`[BatchEditor] Files in ${root}:`, files.filter(f => f.toLowerCase().startsWith('batch')));
      files.forEach((file) => {
        // Match files starting with "batch" but not ending with .info (case-insensitive)
        if (file.toLowerCase().startsWith('batch') && !file.toLowerCase().endsWith('.info')) {
          const fullPath = path.join(root, file);
          // Only include regular files, not directories
          if (amigafs.statSync(fullPath).isFile()) {
            found.add(file);
            console.log('[BatchEditor] Added batch file:', file);
          }
        }
      });
    } catch (err) {
      console.error(`[BatchEditor] Error scanning ${root}:`, err);
    }
  }

  // Sort batch files: batch0, batch000, batch1-6, then any others alphabetically
  return Array.from(found).sort((a, b) => {
    const aNum = a.match(/\d+/)?.[0];
    const bNum = b.match(/\d+/)?.[0];
    if (aNum && bNum) {
      const aInt = parseInt(aNum, 10);
      const bInt = parseInt(bNum, 10);
      if (aInt !== bInt) return aInt - bInt;
      // Same number - shorter name first (batch0 before batch000)
      return a.length - b.length;
    }
    return a.localeCompare(b);
  });
}

function readBatch(name: string): string {
  const file = findBatchPath(name);
  return file ? amigafs.readFileSync(file, 'utf-8').toString() : '';
}

function writeBatch(name: string, content: string) {
  const file = findBatchPath(name) || path.join(batchRoots()[0], name);
  amigafs.writeFileSync(file, content, 'utf-8');
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
  if (amigafs.existsSync(direct) && amigafs.statSync(direct).isFile()) {
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
    if (amigafs.existsSync(resolved) && amigafs.statSync(resolved).isFile()) {
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
  amigafs.mkdirSync(primary, { recursive: true });

  // Ensure standard batch files exist
  for (const name of STANDARD_BATCH_FILES) {
    const target = path.join(primary, name);
    const existing = findBatchPath(name);

    if (existing) {
      if (existing !== target && !amigafs.existsSync(target)) {
        try {
          amigafs.copyFileSync(existing, target);
        } catch (err) {
          console.error(`[BatchEditor] Failed to copy ${existing} to ${target}:`, err);
        }
      }
      continue;
    }

    if (!amigafs.existsSync(target)) {
      try {
        amigafs.writeFileSync(target, '', 'utf-8');
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
    const batches = listBatches();
    console.log('[BatchRouter] GET / - returning batches:', batches);
    res.json({ batches });
  });

  router.get('/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    // Validate that name starts with "batch" and doesn't contain path separators
    if (!name.toLowerCase().startsWith('batch') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid batch name' });
    }
    res.json({ name, content: readBatch(name) });
  });

  router.put('/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    // Validate that name starts with "batch" and doesn't contain path separators
    if (!name.toLowerCase().startsWith('batch') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid batch name' });
    }
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    writeBatch(name, content);
    res.json({ name, saved: true });
  });

  router.post('/validate', (req: Request, res: Response) => {
    const { name, content } = req.body || {};
    // Validate that name starts with "batch" and doesn't contain path separators (if provided)
    if (name && (!name.toLowerCase().startsWith('batch') || name.includes('/') || name.includes('\\'))) {
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
