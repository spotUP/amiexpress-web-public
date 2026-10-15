#!/usr/bin/env node
/**
 * Coverage report — reads the bulk-probe cache at `<dir>/results/`
 * (default `/tmp/bp-full/results/`) and emits a coverage summary:
 *   - Total archives scanned, binaries probed
 *   - Clean-exit count (no stubs, no missing, exit 0)
 *   - Per-LVO stub frequency (sorted by doors-hit)
 *   - Unimplemented LVOs (hard blockers)
 *   - Top-N XIM ops by usage
 *   - Corpus candidate suggestions: distinct-fingerprint clean-exit doors
 *
 * Usage:
 *   npx tsx dev/scripts/door-probe/coverage-report.ts [<results-dir>]
 *                                                      [--top N]
 *                                                      [--json]
 *
 * Default <results-dir> = `/tmp/bp-full/results`.
 *
 * Filters out LVOs that already have a real impl in the current
 * codebase (see FIXED_LVOS — keep this in sync with the entries in
 * `web/backend/src/amiga-emulation/api/library-vectors/*.ts`).
 */

import * as fs from "fs";
import * as path from "path";

// LVOs implemented in this codebase. Each entry maps to a real handler
// in library-vectors/{exec,dos}-vectors.ts and is no longer surfaced
// as a stub by the probe. Keep in sync.
const FIXED_LVOS = new Set<string>([
  // exec.library
  "exec.library::FreeSignal", "exec.library::RemPort",
  "exec.library::OpenDevice", "exec.library::CloseDevice",
  "exec.library::DoIO", "exec.library::CheckIO",
  "exec.library::WaitIO", "exec.library::AbortIO",
  "exec.library::CreateIORequest", "exec.library::DeleteIORequest",
  "exec.library::AllocEntry", "exec.library::FreeEntry",
  "exec.library::OpenResource", "exec.library::SetFunction",
  "exec.library::AddTask", "exec.library::AddSemaphore",
  "exec.library::AddIntServer", "exec.library::CacheControl",
  "exec.library::RemMemHandler", "exec.library::SetIntVector",
  // dos.library
  "dos.library::FindDosEntry", "dos.library::LockDosList",
  "dos.library::UnLockDosList", "dos.library::AttemptLockDosList",
  "dos.library::NextDosEntry", "dos.library::SetIoErr",
  "dos.library::StrToLong",
  "dos.library::MatchFirst", "dos.library::MatchNext",
  "dos.library::MatchEnd", "dos.library::IsFileSystem",
  "dos.library::SetProgramName", "dos.library::GetArgStr",
  "dos.library::ReadItem", "dos.library::GetDeviceProc",
  "dos.library::DoPkt", "dos.library::VFWritef",
  "dos.library::SetMode", "dos.library::ExAll",
]);

interface ProbeJson {
  binaryAbs: string;
  versionString: string | null;
  exitCode: number;
  timedOut: boolean;
  wallMs: number;
  ximOps: Array<{ name: string; count: number }>;
  lvosByLibrary: Record<
    string,
    Array<{ name: string; status: "real" | "stub" | "missing"; count: number }>
  >;
  unimplemented: string[];
}

interface Args {
  resultsDir: string;
  top: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { resultsDir: "/tmp/bp-full/results", top: 30, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--top") { out.top = Number(argv[i + 1]) || 30; i += 1; }
    else if (a === "--json") { out.json = true; }
    else if (a === "--help" || a === "-h") {
      process.stdout.write("Usage: coverage-report.ts [<results-dir>] [--top N] [--json]\n");
      process.exit(0);
    } else if (!a.startsWith("--")) {
      out.resultsDir = a;
    }
  }
  return out;
}

interface Aggregate {
  archives: number;
  doors: number;
  clean: number;
  blocked: number;
  timedOut: number;
  stubsByKey: Map<string, { doors: number; calls: number }>;
  missingByName: Map<string, number>;
  ximByName: Map<string, { doors: number; calls: number }>;
  cleanCandidates: Array<{
    archive: string;
    binary: string;
    version: string | null;
    fingerprint: string;
    ximCount: number;
    wallMs: number;
  }>;
}

function aggregate(dir: string): Aggregate {
  const agg: Aggregate = {
    archives: 0, doors: 0, clean: 0, blocked: 0, timedOut: 0,
    stubsByKey: new Map(), missingByName: new Map(), ximByName: new Map(),
    cleanCandidates: [],
  };
  for (const f of fs.readdirSync(dir)) {
    let arr: ProbeJson[] = [];
    try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); }
    catch { continue; }
    agg.archives += 1;
    const archive = f.replace(/\.json$/, "");
    for (const d of arr) {
      if (!d) continue;
      agg.doors += 1;
      if (d.timedOut) agg.timedOut += 1;
      let hasStub = false, hasBlocker = false;
      for (const [lib, fns] of Object.entries(d.lvosByLibrary || {})) {
        for (const fn of fns) {
          if (fn.status === "stub") {
            const key = `${lib}::${fn.name}`;
            if (!FIXED_LVOS.has(key)) {
              hasStub = true;
              const row = agg.stubsByKey.get(key) || { doors: 0, calls: 0 };
              row.doors += 1; row.calls += fn.count;
              agg.stubsByKey.set(key, row);
            }
          }
        }
      }
      for (const u of d.unimplemented || []) {
        agg.missingByName.set(u, (agg.missingByName.get(u) || 0) + 1);
      }
      if ((d.unimplemented || []).length > 0) { hasBlocker = true; agg.blocked += 1; }
      for (const op of d.ximOps || []) {
        const row = agg.ximByName.get(op.name) || { doors: 0, calls: 0 };
        row.doors += 1; row.calls += op.count;
        agg.ximByName.set(op.name, row);
      }
      if (!hasStub && !hasBlocker && d.exitCode === 0 && !d.timedOut) {
        agg.clean += 1;
        agg.cleanCandidates.push({
          archive,
          binary: d.binaryAbs.split("/").pop() || "?",
          version: d.versionString,
          fingerprint: (d.ximOps || []).map((o) => o.name).sort().join("|"),
          ximCount: (d.ximOps || []).length,
          wallMs: d.wallMs,
        });
      }
    }
  }
  return agg;
}

function renderMarkdown(agg: Aggregate, top: number): string {
  const out: string[] = [];
  out.push(`# Door coverage report`);
  out.push(``);
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push(``);
  out.push(`## Coverage`);
  out.push(`- Archives scanned: **${agg.archives}**`);
  out.push(`- Door binaries probed: **${agg.doors}**`);
  out.push(
    `- Clean exit (no remaining stubs, no missing, no timeout): **${agg.clean}** ` +
    `(${((agg.clean / Math.max(agg.doors, 1)) * 100).toFixed(1)}%)`,
  );
  out.push(`- Blocked by missing LVO: **${agg.blocked}**`);
  out.push(`- Timed out (interactive prompts): **${agg.timedOut}**`);
  out.push(``);

  if (agg.missingByName.size > 0) {
    out.push(`## Unimplemented LVOs (hard blockers)`);
    out.push(`| LVO | Doors blocked |`);
    out.push(`|------|------|`);
    for (const [k, n] of [...agg.missingByName.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)) {
      out.push(`| \`${k}\` | ${n} |`);
    }
    out.push(``);
  } else {
    out.push(`## Unimplemented LVOs: **none** — zero hard blockers across the scan.`);
    out.push(``);
  }

  out.push(`## Remaining stub LVOs (post-fix)`);
  if (agg.stubsByKey.size === 0) {
    out.push(`**None.** Every stub the scanned universe hits is now a real implementation.`);
  } else {
    out.push(`| LVO | Doors | Total calls |`);
    out.push(`|------|------|------|`);
    const ranked = [...agg.stubsByKey.entries()]
      .sort((a, b) => b[1].doors - a[1].doors || b[1].calls - a[1].calls);
    for (const [k, v] of ranked.slice(0, top)) {
      out.push(`| \`${k}\` | ${v.doors} | ${v.calls} |`);
    }
  }
  out.push(``);

  out.push(`## Top XIM ops by door-hit-count`);
  out.push(`| Op | Doors | Total calls |`);
  out.push(`|------|------|------|`);
  const ximRanked = [...agg.ximByName.entries()]
    .sort((a, b) => b[1].doors - a[1].doors || b[1].calls - a[1].calls);
  for (const [k, v] of ximRanked.slice(0, top)) {
    out.push(`| \`${k}\` | ${v.doors} | ${v.calls} |`);
  }
  out.push(``);

  out.push(`## Corpus candidates — distinct-fingerprint clean-exit doors`);
  out.push(`| Archive | Binary | $VER | XIM ops |`);
  out.push(`|------|------|------|------|`);
  const seen = new Set<string>();
  const distinct = agg.cleanCandidates
    .filter((c) => {
      if (seen.has(c.fingerprint)) return false;
      seen.add(c.fingerprint);
      return true;
    })
    .sort((a, b) => b.ximCount - a.ximCount);
  for (const c of distinct.slice(0, top)) {
    const ver = c.version ? `\`${c.version.slice(0, 40)}\`` : "_(none)_";
    out.push(`| \`${c.archive}\` | \`${c.binary}\` | ${ver} | ${c.ximCount} |`);
  }
  out.push(``);
  return out.join("\n");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.resultsDir)) {
    process.stderr.write(`[coverage] results dir not found: ${args.resultsDir}\n`);
    process.exit(2);
  }
  const agg = aggregate(args.resultsDir);
  if (args.json) {
    const out = {
      archives: agg.archives, doors: agg.doors, clean: agg.clean,
      blocked: agg.blocked, timedOut: agg.timedOut,
      stubs: [...agg.stubsByKey.entries()].map(([k, v]) => ({ key: k, ...v })),
      missing: [...agg.missingByName.entries()].map(([k, v]) => ({ key: k, doors: v })),
      xim: [...agg.ximByName.entries()].map(([k, v]) => ({ key: k, ...v })),
    };
    process.stdout.write(JSON.stringify(out, null, 2));
    return;
  }
  process.stdout.write(renderMarkdown(agg, args.top));
}

main();
