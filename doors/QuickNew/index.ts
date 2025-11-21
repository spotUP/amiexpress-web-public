import * as fs from 'fs';
import * as path from 'path';

import { db } from '../../web/backend/src/database';
import { config } from '../../web/backend/src/config';

interface ConfigBlock {
  lines: string[];
  dirPath: string;
}

interface ParsedConfig {
  prefixNormal: string;
  prefixDeleted: string;
  displayMode: number;
  blocks: ConfigBlock[];
}

interface FileEntryInfo {
  name: string;
  status: string;
  size: number;
  date: string; // MM-DD-YY
}

interface Stats {
  files: number;
  fakes: number;
  megs: number;
  prevFiles: number;
  prevFakes: number;
  prevMegs: number;
}

const MAX_READ_BYTES = 0x13880; // match 68k limit (80k)

function parseConfig(configPath: string): ParsedConfig {
  const raw = fs.readFileSync(configPath, 'utf-8').split(/\r?\n/);
  if (raw.length < 3) {
    throw new Error('Config missing required header lines');
  }
  const prefixNormal = raw[0] ?? '';
  const prefixDeleted = raw[1] ?? '';
  const displayMode = parseInt(raw[2] ?? '2', 10) || 2;

  let idx = 3;
  if (raw[idx] === '\f' || raw[idx] === '') {
    idx++;
  }

  const blocks: ConfigBlock[] = [];
  while (idx < raw.length) {
    const lines: string[] = [];
    while (idx < raw.length && raw[idx].trim() !== '#') {
      lines.push(raw[idx] ?? '');
      idx++;
    }
    while (idx < raw.length && raw[idx].trim() === '#') idx++; // skip hash line(s)
    if (idx >= raw.length) break;
    const dirPath = raw[idx] ?? '';
    idx++;
    if (lines.length > 0 && dirPath.trim().length > 0) {
      blocks.push({ lines, dirPath: dirPath.trim() });
    }
  }

  return { prefixNormal, prefixDeleted, displayMode, blocks };
}

function resolvePath(assignPath: string, baseDir: string): string {
  const parts = assignPath.split(':');
  if (parts.length === 1) {
    return path.isAbsolute(assignPath) ? assignPath : path.join(baseDir, assignPath);
  }
  const [assign, rest] = parts;
  if (assign.toLowerCase() === 'bbs') {
    return path.join(baseDir, rest.replace(/\//g, path.sep));
  }
  return path.join(baseDir, assignPath.replace(/:/g, path.sep));
}

function readDirFile(dirPath: string): string {
  const stat = fs.statSync(dirPath);
  const start = stat.size > MAX_READ_BYTES ? stat.size - MAX_READ_BYTES : 0;
  const fd = fs.openSync(dirPath, 'r');
  const buf = Buffer.alloc(stat.size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  return buf.toString('utf-8');
}

function parseDirFile(content: string): FileEntryInfo[] {
  const entries: FileEntryInfo[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    // AmiExpress dir lines: 12-char name padded, status, size, date
    // Example: "PDY_SFA1.DMS P 618870  12-14-17"
    const match = line.match(/^(.{12})\s+([A-Z])\s+(\d+)\s+(\d{2}-\d{2}-\d{2})/);
    if (!match) continue;
    const name = match[1].trim();
    const status = match[2];
    const size = parseInt(match[3], 10) || 0;
    const date = match[4];
    entries.push({ name, status, size, date });
  }
  return entries;
}

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  return `${month}-${day}-${year}`;
}

function collectStats(entries: FileEntryInfo[], numDays: number): Stats {
  let files = 0;
  let fakes = 0;
  let megs = 0;
  let prevFiles = 0;
  let prevFakes = 0;
  let prevMegs = 0;

  for (let offset = 0; offset < numDays; offset++) {
    const target = new Date();
    target.setDate(target.getDate() - offset);
    const dateStr = formatDate(target);
    const prevTarget = new Date();
    prevTarget.setDate(prevTarget.getDate() - numDays - offset);
    const prevDateStr = formatDate(prevTarget);

    for (const entry of entries) {
      if (entry.date === dateStr) {
        const isFake = entry.status === 'D';
        if (isFake) fakes++;
        else files++;
        megs += entry.size / (1024 * 1024);
      } else if (entry.date === prevDateStr) {
        const isFake = entry.status === 'D';
        if (isFake) prevFakes++;
        else prevFiles++;
        prevMegs += entry.size / (1024 * 1024);
      }
    }
  }

  return {
    files,
    fakes,
    megs: Math.round(megs * 10) / 10,
    prevFiles,
    prevFakes,
    prevMegs: Math.round(prevMegs * 10) / 10,
  };
}

function applyPlaceholders(lines: string[], stats: Stats, numDays: number): string[] {
  return lines.map(line =>
    line
      .replace(/@N/g, stats.files.toString().padStart(2, '0'))
      .replace(/@F/g, stats.fakes.toString().padStart(2, '0'))
      .replace(/@Y/g, stats.prevFiles.toString().padStart(2, '0'))
      .replace(/@Z/g, stats.prevFakes.toString().padStart(2, '0'))
      .replace(/@M\.0/g, stats.megs.toFixed(1))
      .replace(/@B\.0/g, stats.prevMegs.toFixed(1))
      .replace(/@D/g, numDays.toString().padStart(2, '0'))
  );
}

function renderFiles(entries: FileEntryInfo[], numDays: number, displayMode: number, prefixNormal: string, prefixDeleted: string): string[] {
  const lines: string[] = [];
  let line: string[] = [];

  const columns = displayMode === 1 ? 6 : 5;

  const cutoffDates = new Set<string>();
  for (let offset = 0; offset < numDays; offset++) {
    const dt = new Date();
    dt.setDate(dt.getDate() - offset);
    cutoffDates.add(formatDate(dt));
  }

  for (const entry of entries) {
    if (!cutoffDates.has(entry.date)) continue;
    const isFake = entry.status === 'D';
    const prefix = isFake ? prefixDeleted : prefixNormal;
    const formatted = `${prefix}${entry.name.padEnd(12, ' ')} `;

    if (displayMode === 1 && line.length === 0) {
      line.push('    ' + formatted); // indent like asm
    } else {
      line.push(formatted);
    }

    if (line.length >= columns) {
      let output = line.join('');
      if (displayMode === 2) {
        const clean = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
        const padding = Math.max(0, Math.floor((81 - clean.length) / 2));
        output = ' '.repeat(padding) + output;
      }
      lines.push(output.trimEnd());
      line = [];
    }
  }

  if (line.length > 0) {
    let output = line.join('');
    if (displayMode === 2) {
      const clean = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      const padding = Math.max(0, Math.floor((81 - clean.length) / 2));
      output = ' '.repeat(padding) + output;
    }
    lines.push(output.trimEnd());
  }

  return lines;
}

function footer(): string {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  return `[44;33m  QuickNew V2.2 by Calypso/GOD & REbEL/QTX[36m Date : ${month}-${day}-${year}  [35m Time : ${timeStr}  \r\n[0m`;
}

export async function runDoor(doorSession: any): Promise<void> {
  const { socket } = doorSession;
  const baseDir = process.env.BBS_ROOT || config.getConfig().dataDir || path.resolve(__dirname, '../../..');

  const args = doorSession?.args || [];
  const cfgArg = args[0];
  const daysArg = args[1];

  if (!cfgArg) {
    socket.emit('ansi-output', '\r\nERROR : No Config-File Given !\r\n\r\n');
    return;
  }

  const numDays = Math.max(1, parseInt(daysArg || '1', 10));
  const configPath = resolvePath(cfgArg, baseDir);

  let parsed: ParsedConfig;
  try {
    parsed = parseConfig(configPath);
  } catch (error) {
    console.error('[QuickNew Door] Config parse failed:', error);
    socket.emit('ansi-output', '\r\nERROR : Couldn\'t Open Config-File !\r\n\r\n');
    return;
  }

  const output: string[] = [];

  for (const block of parsed.blocks) {
    const resolvedPath = resolvePath(block.dirPath, baseDir);
    let dirContent: string;
    try {
      dirContent = readDirFile(resolvedPath);
    } catch (error) {
      console.error('[QuickNew Door] Couldn\'t open DirFile:', error);
      socket.emit('ansi-output', '\r\nERROR : Couldn\'t Open DirFile !\r\n\r\n');
      return;
    }

    const entries = parseDirFile(dirContent);
    const stats = collectStats(entries, numDays);
    const linesWithStats = applyPlaceholders(block.lines, stats, numDays);

    for (const line of linesWithStats) {
      output.push(line);
    }
    output.push('');

    const renderedFiles = renderFiles(entries, numDays, parsed.displayMode, parsed.prefixNormal, parsed.prefixDeleted);
    output.push(...renderedFiles);
    if (renderedFiles.length > 0) {
      output.push(''); // spacer
    }
  }

  output.push(footer());
  output.push('~SP.');

  socket.emit('ansi-output', output.join('\r\n'));
}
