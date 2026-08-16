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

  // Load from require cache (BBS server has already imported it via BBSApi)
  // Fall back to path probing for local dev.
  function getLib(): any {
    for (const k of Object.keys(require.cache))
      if (k.includes('ami-stripper.lib')) return require.cache[k]?.exports ?? null;
    // Path probe: __dirname = Doors/ami-stripper/dist/ → up 3 levels = project root
    for (const rel of ['../../../web/backend/src/doors/ami-stripper.lib',
                        '../../../../web/backend/src/doors/ami-stripper.lib']) {
      try { return require(path.resolve(__dirname, rel)); } catch { /* next */ }
    }
    return null;
  }

  const stripperLib = getLib();
  if (!stripperLib) {
    await output.write('\r\n\x1b[31mStripper library not available.\x1b[0m\r\n');
    return;
  }

  function formatSize(bytes: number): string {
    return bytes < 1024 ? `${bytes}b` : `${(bytes / 1024).toFixed(1)}k`;
  }

  function patternCount(): string {
    try {
      // Pattern files live in web/backend/seeds/ (same logic as ami-stripper.lib)
      const candidates = [
        path.resolve(__dirname, '../../../web/backend/seeds/scene-strip-patterns.json'),
        path.resolve(__dirname, '../../../../web/backend/seeds/scene-strip-patterns.json'),
      ];
      for (const pf of candidates) {
        if (fs.existsSync(pf)) {
          const db = JSON.parse(fs.readFileSync(pf, 'utf-8'));
          return String((db.filenamePatterns?.length ?? 0) + (db.dizPatterns?.length ?? 0));
        }
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
    if (result.stripped.length > 20)
      await output.write(`  \x1b[90m... and ${result.stripped.length - 20} more\x1b[0m\r\n`);

    await output.write(`\r\n\x1b[32mFILES KEPT (${result.kept.length}):\x1b[0m\r\n`);
    for (const entry of result.kept.slice(0, 10))
      await output.write(`  ${entry.path.substring(0, 40).padEnd(40)} ${formatSize(entry.size).padStart(7)}\r\n`);
    if (result.kept.length > 10)
      await output.write(`  \x1b[90m... and ${result.kept.length - 10} more\x1b[0m\r\n`);

    await output.write('\r\n\x1b[0;37m' + '─'.repeat(80) + '\x1b[0m\r\n');
    await output.write('\x1b[33mS\x1b[0m Strip in-place  \x1b[33mA\x1b[0m Abort\r\n');

    const choice = await input.getChar();
    if (choice.toLowerCase() !== 's') {
      await output.write('\r\n\x1b[33mAborted.\x1b[0m\r\n\r\n');
      continue;
    }

    // stripArchive always writes a portable ZIP — there is no cross-platform
    // LHA/LZX writer available (pure-JS lha.js only reads; the Linux `lha`
    // CLI/lhasa can't create archives either). Rewriting a .lha/.lzx file
    // with ZIP bytes under its original name would silently mislead the
    // sysop about what's on disk, so the clean archive is written as a
    // sibling <name>.zip instead and the original is left untouched.
    const tmpOut = archivePath + '.strip_tmp';
    await output.write(`\r\n\x1b[36mStripping and repacking...\x1b[0m\r\n`);

    try {
      const res = await stripperLib.stripArchive(archivePath, tmpOut);
      const producedPath: string = res?.outputPath ?? tmpOut;
      if (fs.existsSync(producedPath) && !fs.statSync(producedPath).isDirectory()) {
        const origSize = fs.statSync(archivePath).size;
        const finalPath = archivePath.replace(/\.(lha|lzx|lzh)$/i, '') + '.zip';
        if (producedPath !== finalPath) {
          if (fs.existsSync(finalPath)) fs.rmSync(finalPath, { force: true });
          fs.renameSync(producedPath, finalPath);
        }
        const newSize = fs.statSync(finalPath).size;
        const saved = origSize - newSize;
        await output.write(`\x1b[32mDone.\x1b[0m ${formatSize(origSize)} -> ${formatSize(newSize)} (saved ${formatSize(saved)})\r\n`);
        await output.write(`\x1b[32mStripped archive written to ${path.basename(finalPath)}\x1b[0m (portable ZIP format).\r\n`);
        await output.write(`\x1b[90mOriginal ${path.basename(archivePath)} left untouched.\x1b[0m\r\n\r\n`);
      } else {
        if (fs.existsSync(producedPath)) fs.rmSync(producedPath, { recursive: true, force: true });
        await output.write(`\x1b[31mRepack produced unexpected output.\x1b[0m\r\n\r\n`);
      }
    } catch (err) {
      if (fs.existsSync(tmpOut)) try { fs.unlinkSync(tmpOut); } catch {}
      await output.write(`\x1b[31mRepack failed: ${(err as Error).message}\x1b[0m\r\n\r\n`);
    }

    await output.write('\x1b[90mPress ENTER to continue...\x1b[0m');
    await input.waitForKey();
  }

  await output.write('\r\n\x1b[36mGoodbye.\x1b[0m\r\n');
});

export default door;
