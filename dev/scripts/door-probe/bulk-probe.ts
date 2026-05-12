#!/usr/bin/env node
/**
 * Bulk door probe — walk a directory of LHA/LZH archives, extract
 * each, run `probe.ts` on every Hunk binary found, aggregate the
 * results into a frequency ranking that drives both corpus selection
 * and stub-elimination prioritisation.
 *
 * Output:
 *   - Per-door JSON probe results under `<out>/results/<archive>.json`
 *   - Aggregate markdown report at `<out>/summary.md`:
 *       - Total probed / clean-exit / timeout / blocked / not-hunk
 *       - LVO frequency table (calls + door-hit-count + status mix)
 *       - XIM-op frequency table
 *       - "Cleanest doors" list (candidates for corpus)
 *       - "Most-stubs-hit" list (highest-leverage stubs to implement)
 *
 * Usage:
 *   npx tsx dev/scripts/door-probe/bulk-probe.ts <archive-dir> [options]
 *
 * Options:
 *   --out <dir>           output dir (default /tmp/door-probe-bulk-<timestamp>)
 *   --limit N             max archives to probe (default: all)
 *   --filter <pattern>    glob-substring on archive name
 *   --timeout <ms>        per-door probe timeout (default 12000)
 *   --doortype <type>     fallback doortype if .info not found (default XIM)
 *   --skip-existing       reuse cached JSON results from a previous run
 *   --concurrency N       parallel probes (default 1; bump cautiously — each
 *                         spawns its own emulator)
 *
 * Requires `lha` on PATH (brew install lha). LZX archives are skipped
 * for now (`unlzx` not bundled).
 */

import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PROBE = path.join(__dirname, "probe.ts");
const HUNK_MAGIC = Buffer.from([0x00, 0x00, 0x03, 0xf3]);

interface BulkOpts {
  archiveDir: string;
  outDir: string;
  limit: number | null;
  filter: string | null;
  shard: { index: number; total: number } | null;
  timeoutMs: number;
  doorType: string;
  skipExisting: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): BulkOpts {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(
      "Usage: bulk-probe.ts <archive-dir> [--out <dir>] [--limit N] [--filter <pat>] [--timeout <ms>] [--doortype <type>] [--skip-existing] [--concurrency N]\n",
    );
    process.exit(argv.length === 0 ? 2 : 0);
  }
  const opts: BulkOpts = {
    archiveDir: argv[0],
    outDir: path.join(
      os.tmpdir(),
      `door-probe-bulk-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    ),
    limit: null,
    filter: null,
    shard: null,
    timeoutMs: 12000,
    doorType: "XIM",
    skipExisting: false,
    concurrency: 1,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--out") { opts.outDir = next; i += 1; }
    else if (a === "--limit") { opts.limit = Number(next); i += 1; }
    else if (a === "--filter") { opts.filter = next; i += 1; }
    else if (a === "--shard") {
      // Format: "I/N" — take every Nth archive starting at index I (0..N-1).
      // Race-free way to parallelise across multiple bulk-probe instances.
      const m = (next || "").match(/^(\d+)\/(\d+)$/);
      if (!m) { process.stderr.write(`[bulk] --shard requires I/N, got ${next}\n`); process.exit(2); }
      opts.shard = { index: parseInt(m[1], 10), total: parseInt(m[2], 10) };
      if (opts.shard.index >= opts.shard.total) {
        process.stderr.write(`[bulk] --shard index ${opts.shard.index} >= total ${opts.shard.total}\n`); process.exit(2);
      }
      i += 1;
    }
    else if (a === "--timeout") { opts.timeoutMs = Number(next); i += 1; }
    else if (a === "--doortype") { opts.doorType = next; i += 1; }
    else if (a === "--skip-existing") { opts.skipExisting = true; }
    else if (a === "--concurrency") { opts.concurrency = Math.max(1, Number(next)); i += 1; }
    else if (a.startsWith("--")) {
      process.stderr.write(`[bulk] unknown flag: ${a}\n`); process.exit(2);
    }
  }
  return opts;
}

function listArchives(dir: string, filter: string | null): string[] {
  const all = fs.readdirSync(dir);
  return all.filter((f) => {
    if (filter && !f.toLowerCase().includes(filter.toLowerCase())) return false;
    return /\.(lha|lzh)$/i.test(f); // skip LZX — unlzx not bundled
  }).sort();
}

function extractArchive(archive: string, into: string): boolean {
  fs.mkdirSync(into, { recursive: true });
  const res = spawnSync("lha", ["xfqw=" + into, archive], {
    timeout: 30000,
    encoding: "utf8",
  });
  return res.status === 0;
}

function findHunkBinaries(dir: string, accum: string[] = [], depth = 0): string[] {
  if (depth > 6) return accum; // sanity cap
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return accum; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { findHunkBinaries(p, accum, depth + 1); continue; }
    if (!e.isFile()) continue;
    // Skip obvious non-binaries by extension
    const ext = path.extname(e.name).toLowerCase();
    if ([".txt", ".doc", ".info", ".guide", ".diz", ".readme", ".nfo",
         ".lha", ".lzh", ".lzx", ".gif", ".iff", ".jpg", ".png",
         ".rexx", ".rx", ".script"].includes(ext)) continue;
    // Skip very small / very large outliers — Amiga doors are ~1-200 KB.
    try {
      const st = fs.statSync(p);
      if (st.size < 256 || st.size > 1024 * 1024) continue;
    } catch { continue; }
    // Check magic.
    try {
      const fd = fs.openSync(p, "r");
      const buf = Buffer.alloc(4);
      fs.readSync(fd, buf, 0, 4, 0);
      fs.closeSync(fd);
      if (buf.equals(HUNK_MAGIC)) accum.push(p);
    } catch { /* ignore */ }
  }
  return accum;
}

interface ProbeJson {
  binary: string;
  binaryAbs: string;
  doorType: string;
  size: number;
  hunkMagic: string;
  isHunk: boolean;
  versionString: string | null;
  exitCode: number;
  timedOut: boolean;
  wallMs: number;
  stdoutBytes: number;
  ximOps: Array<{ name: string; count: number }>;
  lvosByLibrary: Record<
    string,
    Array<{ name: string; status: "real" | "stub" | "missing"; count: number }>
  >;
  errors: string[];
  unimplemented: string[];
  recommendations: string[];
}

function runProbe(
  binary: string,
  timeoutMs: number,
  doorType: string,
): Promise<ProbeJson | null> {
  return new Promise((resolve) => {
    const args = [
      "tsx", PROBE, binary,
      "--doortype", doorType,
      "--timeout", String(timeoutMs),
      "--json",
    ];
    const proc = spawn("npx", args, {
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let stdout = ""; let stderr = "";
    const wallStart = Date.now();
    const hardCap = setTimeout(() => {
      try {
        if (proc.pid !== undefined) process.kill(-proc.pid, "SIGKILL");
      } catch { /* ignore */ }
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
    }, timeoutMs + 10000);
    proc.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
    proc.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
    proc.on("close", () => {
      clearTimeout(hardCap);
      try {
        const parsed = JSON.parse(stdout) as ProbeJson;
        resolve(parsed);
      } catch {
        process.stderr.write(
          `[bulk] could not parse probe JSON for ${binary} ` +
          `(wall=${Date.now() - wallStart}ms, stderr-tail: ${stderr.slice(-200)})\n`,
        );
        resolve(null);
      }
    });
    proc.on("error", () => { clearTimeout(hardCap); resolve(null); });
  });
}

interface AggregateRow {
  key: string;
  totalCalls: number;
  doorCount: number;
  statusMix?: { real: number; stub: number; missing: number };
}

function renderSummary(args: {
  results: ProbeJson[];
  archivesScanned: number;
  archivesExtracted: number;
  binariesFound: number;
  outDir: string;
}): string {
  const { results, archivesScanned, archivesExtracted, binariesFound, outDir } = args;
  const total = results.length;
  const cleanExit = results.filter((r) =>
    r.exitCode === 0 && !r.timedOut && r.unimplemented.length === 0 &&
    r.errors.filter((e) => /UNIMPLEMENTED|panic/i.test(e)).length === 0);
  const timedOut = results.filter((r) => r.timedOut);
  const blocked = results.filter((r) => r.unimplemented.length > 0);
  const stubsOnly = results.filter((r) =>
    r.unimplemented.length === 0 &&
    Object.values(r.lvosByLibrary).some((fns) => fns.some((f) => f.status === "stub")));

  // Aggregate LVO usage across doors.
  const lvoAgg = new Map<string, AggregateRow & { statusMix: { real: number; stub: number; missing: number } }>();
  for (const r of results) {
    for (const [lib, fns] of Object.entries(r.lvosByLibrary)) {
      for (const fn of fns) {
        const key = `${lib}::${fn.name}`;
        let row = lvoAgg.get(key);
        if (!row) {
          row = { key, totalCalls: 0, doorCount: 0, statusMix: { real: 0, stub: 0, missing: 0 } };
          lvoAgg.set(key, row);
        }
        row.totalCalls += fn.count;
        row.doorCount += 1;
        row.statusMix[fn.status] += 1;
      }
    }
  }
  const lvoRanked = [...lvoAgg.values()]
    .sort((a, b) => b.doorCount - a.doorCount || b.totalCalls - a.totalCalls);

  // XIM op aggregation
  const ximAgg = new Map<string, AggregateRow>();
  for (const r of results) {
    for (const op of r.ximOps) {
      let row = ximAgg.get(op.name);
      if (!row) { row = { key: op.name, totalCalls: 0, doorCount: 0 }; ximAgg.set(op.name, row); }
      row.totalCalls += op.count;
      row.doorCount += 1;
    }
  }
  const ximRanked = [...ximAgg.values()]
    .sort((a, b) => b.doorCount - a.doorCount);

  // Cleanest doors (corpus candidates)
  const cleanRanked = cleanExit
    .map((r) => ({
      bin: path.basename(r.binaryAbs),
      ver: r.versionString,
      xim: r.ximOps.length,
      lvos: Object.values(r.lvosByLibrary).reduce((s, a) => s + a.length, 0),
    }))
    .sort((a, b) => b.xim - a.xim || b.lvos - a.lvos);

  // Most-impact stubs (call frequency × door count)
  const stubsImpact = lvoRanked
    .filter((r) => r.statusMix.stub > 0)
    .map((r) => ({ key: r.key, doors: r.statusMix.stub, calls: r.totalCalls }))
    .sort((a, b) => b.doors - a.doors || b.calls - a.calls)
    .slice(0, 30);

  // Missing LVOs (hard blockers)
  const missingByName = new Map<string, number>();
  for (const r of results) {
    for (const u of r.unimplemented) {
      missingByName.set(u, (missingByName.get(u) ?? 0) + 1);
    }
  }
  const missingRanked = [...missingByName.entries()]
    .sort(([, a], [, b]) => b - a);

  const lines: string[] = [];
  lines.push(`# Bulk door probe — summary`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Output dir: \`${outDir}\``);
  lines.push("");
  lines.push("## Coverage");
  lines.push(`- Archives scanned: ${archivesScanned}`);
  lines.push(`- Archives extracted: ${archivesExtracted}`);
  lines.push(`- Hunk binaries found: ${binariesFound}`);
  lines.push(`- Successful probes: ${total}`);
  lines.push("");
  lines.push("## Outcomes");
  lines.push(`- Clean exit (no missing/unimpl, no panic): ${cleanExit.length}`);
  lines.push(`- Stubs hit but no hard blocker: ${stubsOnly.length}`);
  lines.push(`- Blocked by unimplemented LVO: ${blocked.length}`);
  lines.push(`- Timeouts (need scripted input or stuck loop): ${timedOut.length}`);
  lines.push("");
  if (missingRanked.length > 0) {
    lines.push("## Unimplemented LVOs (hard blockers — fix first)");
    lines.push("| LVO | Doors blocked |");
    lines.push("|------|----|");
    for (const [name, n] of missingRanked.slice(0, 30)) {
      lines.push(`| \`${name}\` | ${n} |`);
    }
    lines.push("");
  }
  lines.push("## Top stubs hit (impact = how many doors actually call this stub)");
  lines.push("| LVO | Doors hit | Total calls |");
  lines.push("|------|------|------|");
  for (const s of stubsImpact) {
    lines.push(`| \`${s.key}\` | ${s.doors} | ${s.calls} |`);
  }
  lines.push("");
  lines.push("## XIM op frequency");
  lines.push("| Op | Doors hit | Total calls |");
  lines.push("|------|------|------|");
  for (const op of ximRanked.slice(0, 30)) {
    lines.push(`| \`${op.key}\` | ${op.doorCount} | ${op.totalCalls} |`);
  }
  lines.push("");
  lines.push("## LVO frequency (top 40 by door-hit-count)");
  lines.push("| LVO | Doors | Calls | real/stub/missing |");
  lines.push("|------|-----|-----|------|");
  for (const r of lvoRanked.slice(0, 40)) {
    lines.push(
      `| \`${r.key}\` | ${r.doorCount} | ${r.totalCalls} | ` +
      `${r.statusMix.real}/${r.statusMix.stub}/${r.statusMix.missing} |`,
    );
  }
  lines.push("");
  lines.push("## Corpus candidates (top 25 cleanest by XIM-op breadth)");
  lines.push("| Binary | $VER | XIM ops | LVOs |");
  lines.push("|------|------|----|----|");
  for (const c of cleanRanked.slice(0, 25)) {
    lines.push(`| \`${c.bin}\` | ${c.ver ? '`' + c.ver + '`' : '_(none)_'} | ${c.xim} | ${c.lvos} |`);
  }
  lines.push("");
  return lines.join("\n");
}

async function processArchive(
  archivePath: string,
  workRoot: string,
  resultsDir: string,
  opts: BulkOpts,
): Promise<ProbeJson[]> {
  const archiveName = path.basename(archivePath);
  const cachedPath = path.join(resultsDir, `${archiveName}.json`);
  if (opts.skipExisting && fs.existsSync(cachedPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachedPath, "utf8"));
      if (Array.isArray(cached)) return cached as ProbeJson[];
    } catch { /* re-probe */ }
  }
  const extractDir = path.join(workRoot, archiveName.replace(/\.\w+$/, ""));
  if (!extractArchive(archivePath, extractDir)) return [];
  const binaries = findHunkBinaries(extractDir);
  const out: ProbeJson[] = [];
  for (const bin of binaries) {
    const probe = await runProbe(bin, opts.timeoutMs, opts.doorType);
    if (probe) out.push(probe);
  }
  try {
    fs.writeFileSync(cachedPath, JSON.stringify(out, null, 2));
  } catch { /* best-effort */ }
  return out;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.archiveDir)) {
    process.stderr.write(`[bulk] archive dir not found: ${opts.archiveDir}\n`);
    process.exit(2);
  }
  const archives = listArchives(opts.archiveDir, opts.filter);
  // Apply --shard before --limit so the limit is per-shard.
  const sharded = opts.shard
    ? archives.filter((_, i) => i % opts.shard!.total === opts.shard!.index)
    : archives;
  const slice = opts.limit ? sharded.slice(0, opts.limit) : sharded;
  if (slice.length === 0) {
    process.stderr.write(`[bulk] no matching archives (filter=${opts.filter})\n`);
    process.exit(1);
  }

  fs.mkdirSync(opts.outDir, { recursive: true });
  const resultsDir = path.join(opts.outDir, "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const workRoot = path.join(opts.outDir, "extracted");
  fs.mkdirSync(workRoot, { recursive: true });

  process.stderr.write(
    `[bulk] probing ${slice.length} archives from ${opts.archiveDir} → ${opts.outDir}\n`,
  );

  const allResults: ProbeJson[] = [];
  let archivesExtracted = 0;
  let binariesFound = 0;

  // Simple serial loop; concurrency > 1 fires N parallel via Promise.all.
  let idx = 0;
  while (idx < slice.length) {
    const batch = slice.slice(idx, idx + opts.concurrency);
    const probes = await Promise.all(
      batch.map((a) =>
        processArchive(path.join(opts.archiveDir, a), workRoot, resultsDir, opts),
      ),
    );
    for (let b = 0; b < batch.length; b += 1) {
      const arr = probes[b];
      if (arr.length > 0) archivesExtracted += 1;
      binariesFound += arr.length;
      allResults.push(...arr);
      process.stderr.write(
        `[bulk] ${idx + b + 1}/${slice.length}: ${batch[b]} → ${arr.length} binar${arr.length === 1 ? "y" : "ies"}\n`,
      );
    }
    idx += batch.length;
  }

  const summary = renderSummary({
    results: allResults,
    archivesScanned: slice.length,
    archivesExtracted,
    binariesFound,
    outDir: opts.outDir,
  });
  const summaryPath = path.join(opts.outDir, "summary.md");
  fs.writeFileSync(summaryPath, summary);
  process.stderr.write(`[bulk] summary written to ${summaryPath}\n`);
  process.stdout.write(summary);
}

main().catch((err) => {
  process.stderr.write(`[bulk] fatal: ${err?.stack || err}\n`);
  process.exit(2);
});
