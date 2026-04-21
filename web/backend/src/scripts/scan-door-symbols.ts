#!/usr/bin/env tsx
/**
 * Scan every 68K door binary under Doors/ for HUNK_SYMBOL / HUNK_DEBUG content.
 *
 * Run from repo root:
 *   npx tsx web/backend/src/scripts/scan-door-symbols.ts
 *
 * Reports per-binary: symbol count, debug-line-table count, total line entries.
 * Writes a Markdown summary to /tmp/door-symbol-scan.md.
 */
import * as fs from "fs";
import * as path from "path";
import { HunkLoader, HunkLoaderError } from "../amiga-emulation/loader/HunkLoader";

interface Row {
  file: string;
  segments: number;
  symbols: number;
  debugTables: number;
  debugEntries: number;
  note?: string;
}

function isLikelyAmigaHunk(buf: Buffer): boolean {
  // HUNK_HEADER = 0x3f3; first longword big-endian
  if (buf.length < 4) return false;
  return buf.readUInt32BE(0) === 0x000003f3;
}

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip build outputs
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      walk(full, out);
    } else if (e.isFile()) {
      // Skip obvious non-binary files
      if (/\.(info|txt|guide|md|json|js|ts|bin|cfg|data|log|DS_Store|backup)$/i.test(e.name)) continue;
      if (e.name.startsWith(".")) continue;
      out.push(full);
    }
  }
}

function main(): void {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const doorsDir = path.join(repoRoot, "Doors");
  if (!fs.existsSync(doorsDir)) {
    console.error(`[ERROR] Doors directory not found: ${doorsDir}`);
    process.exit(1);
  }

  const candidates: string[] = [];
  walk(doorsDir, candidates);

  const rows: Row[] = [];
  let hunkFiles = 0;
  let withSymbols = 0;
  let withDebug = 0;
  let totalSymbols = 0;
  let totalDebugEntries = 0;

  for (const file of candidates) {
    let buf: Buffer;
    try {
      buf = fs.readFileSync(file);
    } catch {
      continue;
    }
    if (!isLikelyAmigaHunk(buf)) continue;
    hunkFiles++;

    const rel = path.relative(repoRoot, file);
    const loader = new HunkLoader();
    try {
      const hf = loader.parse(buf);
      const symCount = hf.symbols.reduce((n, arr) => n + arr.length, 0);
      const dbgTables = hf.debugLines.reduce((n, arr) => n + arr.length, 0);
      const dbgEntries = hf.debugLines.reduce(
        (n, arr) => n + arr.reduce((m, t) => m + t.entries.length, 0),
        0
      );
      if (symCount > 0) withSymbols++;
      if (dbgTables > 0) withDebug++;
      totalSymbols += symCount;
      totalDebugEntries += dbgEntries;
      rows.push({
        file: rel,
        segments: hf.segments.length,
        symbols: symCount,
        debugTables: dbgTables,
        debugEntries: dbgEntries,
      });
    } catch (err) {
      const msg = err instanceof HunkLoaderError ? err.message : String(err);
      rows.push({
        file: rel,
        segments: 0,
        symbols: 0,
        debugTables: 0,
        debugEntries: 0,
        note: `parse-error: ${msg.slice(0, 80)}`,
      });
    }
  }

  // Sort by value (symbols + debug) descending
  rows.sort((a, b) => {
    const av = a.symbols * 1000 + a.debugEntries;
    const bv = b.symbols * 1000 + b.debugEntries;
    return bv - av;
  });

  // Print a summary to stdout
  console.log("");
  console.log(`Scanned: ${candidates.length} files, ${hunkFiles} Amiga hunk binaries`);
  console.log(
    `With HUNK_SYMBOL: ${withSymbols}, with HUNK_DEBUG (LINE): ${withDebug}`
  );
  console.log(
    `Totals: ${totalSymbols} symbols, ${totalDebugEntries} debug line entries`
  );
  console.log("");

  const shown = rows.filter((r) => r.symbols > 0 || r.debugEntries > 0 || r.note);
  if (shown.length > 0) {
    console.log("Top interesting binaries:");
    for (const r of shown.slice(0, 30)) {
      if (r.note) {
        console.log(`  [SKIP] ${r.file} — ${r.note}`);
      } else {
        console.log(
          `  ${r.file.padEnd(64)}  segs=${r.segments} sym=${r.symbols} dbg=${r.debugTables}(${r.debugEntries} lines)`
        );
      }
    }
  }

  // Markdown report
  const outPath = "/tmp/door-symbol-scan.md";
  const md: string[] = [];
  md.push(`# Door Binary Symbol/Debug Scan`);
  md.push("");
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push("");
  md.push(`- Candidates examined: ${candidates.length}`);
  md.push(`- Amiga hunk files: ${hunkFiles}`);
  md.push(`- Binaries with HUNK_SYMBOL: ${withSymbols}`);
  md.push(`- Binaries with HUNK_DEBUG (LINE/HCLN): ${withDebug}`);
  md.push(`- Total symbols across all binaries: ${totalSymbols}`);
  md.push(`- Total debug line entries: ${totalDebugEntries}`);
  md.push("");
  md.push(`## Per-binary breakdown (non-zero only)`);
  md.push("");
  md.push(`| File | Segments | Symbols | Debug tables | Debug lines | Note |`);
  md.push(`|------|---------:|--------:|-------------:|------------:|------|`);
  for (const r of rows) {
    if (r.symbols === 0 && r.debugEntries === 0 && !r.note) continue;
    md.push(
      `| ${r.file} | ${r.segments} | ${r.symbols} | ${r.debugTables} | ${r.debugEntries} | ${r.note ?? ""} |`
    );
  }
  fs.writeFileSync(outPath, md.join("\n") + "\n");
  console.log(`\nFull Markdown report: ${outPath}`);
}

main();
