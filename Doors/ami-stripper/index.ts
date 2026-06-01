/**
 * AmiStripper — Interactive Amiga archive ad-stripper BBS door.
 *
 * Sysop-only (ACCESS=100). Prompts for an archive path, shows what would be
 * stripped, then strips and repacks on confirmation.
 */

import * as path from 'path';
import * as fs from 'fs';
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: 'AmiStripper',
  version: '1.0.0',
  author: 'AmiExpress-Web',
});

door.onStart(async (ctx: DoorContext) => {
  const { output, input } = ctx;

  // Resolve stripper lib relative to this file at runtime
  let stripperLib: any;
  try {
    stripperLib = require('../../web/backend/src/doors/ami-stripper.lib');
  } catch {
    await output.write('\r\n\x1b[31mStripper library not found. Run catalog:build first.\x1b[0m\r\n');
    return;
  }

  function formatSize(bytes: number): string {
    return bytes < 1024 ? `${bytes}b` : `${(bytes / 1024).toFixed(1)}k`;
  }

  function patternCount(): string {
    try {
      const pf = path.join(__dirname, '..', '..', 'dev', 'scripts', 'door-corpus', 'scene-strip-patterns.json');
      if (fs.existsSync(pf)) {
        const db = JSON.parse(fs.readFileSync(pf, 'utf-8'));
        return String((db.filenamePatterns?.length ?? 0) + (db.dizPatterns?.length ?? 0));
      }
    } catch { /* ignore */ }
    return '?';
  }

  function showHeader() {
    const right = `[scene db: ${patternCount()} patterns]`;
    const left = ' AMIGA ARCHIVE STRIPPER';
    const pad = 80 - left.length - right.length;
    output.write('\x1b[2J\x1b[H');
    output.write('\x1b[0;37;44m' + left + ' '.repeat(Math.max(0, pad)) + right + '\x1b[0m\r\n\r\n');
  }

  while (true) {
    await showHeader();

    const archivePath = await input.getLine('Archive path (or Q to quit): ', 200);
    if (!archivePath || archivePath.toLowerCase() === 'q') break;

    if (!fs.existsSync(archivePath)) {
      await output.write(`\r\n\x1b[31mFile not found: ${archivePath}\x1b[0m\r\n\r\n`);
      continue;
    }

    await output.write('\r\n\x1b[36mAnalyzing...\x1b[0m ');

    let result: any;
    try {
      result = await stripperLib.analyzeArchive(archivePath);
    } catch (err) {
      await output.write(`\r\n\x1b[31mError: ${(err as Error).message}\x1b[0m\r\n\r\n`);
      continue;
    }

    const total = result.kept.length + result.stripped.length;
    await output.write(`done. ${total} files in archive.\r\n\r\n`);

    if (result.stripped.length === 0) {
      await output.write('\x1b[32mNo junk files found — archive is clean.\x1b[0m\r\n\r\n');
      await output.write('\x1b[90mPress ENTER to continue...\x1b[0m');
      await input.waitForKey();
      continue;
    }

    await output.write(`\x1b[31mFILES TO STRIP (${result.stripped.length}):\x1b[0m\r\n`);
    for (const entry of result.stripped.slice(0, 20)) {
      const reason = result.reason[entry.path] ?? '';
      await output.write(`  \x1b[31m${entry.path.substring(0, 38).padEnd(38)}\x1b[0m ${formatSize(entry.size).padStart(7)}  \x1b[90m[${reason}]\x1b[0m\r\n`);
    }
    if (result.stripped.length > 20) {
      await output.write(`  \x1b[90m... and ${result.stripped.length - 20} more\x1b[0m\r\n`);
    }

    await output.write(`\r\n\x1b[32mFILES KEPT (${result.kept.length}):\x1b[0m\r\n`);
    for (const entry of result.kept.slice(0, 10)) {
      await output.write(`  ${entry.path.substring(0, 40).padEnd(40)} ${formatSize(entry.size).padStart(7)}\r\n`);
    }
    if (result.kept.length > 10) {
      await output.write(`  \x1b[90m... and ${result.kept.length - 10} more\x1b[0m\r\n`);
    }

    await output.write('\r\n\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');
    await output.write('\x1b[33mS\x1b[0m Strip and repack  \x1b[33mA\x1b[0m Abort\r\n');

    const choice = await input.getChar();
    if (choice.toLowerCase() !== 's') {
      await output.write('\r\n\x1b[33mAborted.\x1b[0m\r\n\r\n');
      continue;
    }

    const outPath = archivePath.replace(/(\.(lha|lzx|lzh))$/i, '-clean$1');
    await output.write(`\r\n\x1b[36mStripping and repacking -> ${path.basename(outPath)}...\x1b[0m\r\n`);

    try {
      await stripperLib.stripArchive(archivePath, outPath);
      const origSize = fs.statSync(archivePath).size;
      const newSize = fs.statSync(outPath).size;
      const saved = origSize - newSize;
      await output.write(`\x1b[32mDone.\x1b[0m ${formatSize(origSize)} -> ${formatSize(newSize)} (saved ${formatSize(saved)})\r\n`);
      await output.write(`\x1b[32mWritten: ${outPath}\x1b[0m\r\n\r\n`);
    } catch (err) {
      await output.write(`\x1b[31mRepack failed: ${(err as Error).message}\x1b[0m\r\n\r\n`);
    }

    await output.write('\x1b[90mPress ENTER to continue...\x1b[0m');
    await input.waitForKey();
  }

  await output.write('\r\n\x1b[36mGoodbye.\x1b[0m\r\n');
});

export default door;
