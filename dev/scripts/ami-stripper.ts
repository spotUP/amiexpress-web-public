#!/usr/bin/env node
/**
 * ami-stripper.ts — CLI wrapper around the ami-stripper library.
 *
 * Usage:
 *   npx tsx dev/scripts/ami-stripper.ts <archive.lha> [--out clean.lha] [--dry-run] [--verbose]
 *
 * Requires scene-strip-patterns.json and junk-fingerprints.json to exist
 * (run build-door-catalog.ts first to generate them).
 */

import * as fs from 'fs';
import * as path from 'path';
import { analyzeArchive, stripArchive } from '../src/doors/ami-stripper.lib';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const outIdx = args.indexOf('--out');
const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
const archivePath = args.find(a => !a.startsWith('--') && a !== outPath);

if (!archivePath) {
  console.error('Usage: ami-stripper <archive.lha> [--out clean.lha] [--dry-run] [--verbose]');
  process.exit(1);
}

if (!fs.existsSync(archivePath)) {
  console.error(`File not found: ${archivePath}`);
  process.exit(1);
}

async function main() {
  const result = await analyzeArchive(archivePath!);

  console.log(`\nArchive: ${path.basename(archivePath!)}`);
  console.log(`Total files: ${result.kept.length + result.stripped.length}`);
  console.log(`To strip: ${result.stripped.length}`);
  console.log(`To keep:  ${result.kept.length}`);

  if (result.stripped.length > 0) {
    console.log('\nFILES TO STRIP:');
    for (const entry of result.stripped) {
      const reason = result.reason[entry.path] ?? '';
      const size = entry.size < 1024 ? `${entry.size}b` : `${(entry.size / 1024).toFixed(1)}k`;
      console.log(`  ${entry.path.padEnd(40)} ${size.padStart(7)}  [${reason}]`);
    }
  }

  if (VERBOSE) {
    console.log('\nFILES KEPT:');
    for (const entry of result.kept) {
      const size = entry.size < 1024 ? `${entry.size}b` : `${(entry.size / 1024).toFixed(1)}k`;
      console.log(`  ${entry.path.padEnd(40)} ${size.padStart(7)}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] No files written.');
    return;
  }

  if (result.stripped.length === 0) {
    console.log('\nNo junk files found — archive is clean.');
    return;
  }

  // stripArchive always writes a portable ZIP (there is no cross-platform
  // LHA/LZX writer — see ami-stripper.lib.ts's doc comment) so the actual
  // output filename may differ from `dest` (extension forced to .zip).
  const requestedDest = outPath ?? archivePath!.replace(/\.(lha|lzx|lzh)$/i, '-clean');
  const { outputPath } = await stripArchive(archivePath!, requestedDest);
  console.log(`\nWritten clean archive: ${outputPath}`);
  const origSize = fs.statSync(archivePath!).size;
  const newSize = fs.statSync(outputPath).size;
  const saved = origSize - newSize;
  console.log(`Size: ${(origSize / 1024).toFixed(1)}k -> ${(newSize / 1024).toFixed(1)}k (saved ${(saved / 1024).toFixed(1)}k)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
