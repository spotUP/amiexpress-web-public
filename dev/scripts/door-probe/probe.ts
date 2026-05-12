#!/usr/bin/env node
/**
 * Door probe — point at any 68K binary, boot it through the existing
 * `web/backend/src/scripts/run-amiga-door.ts` harness, then report what
 * it actually exercised: XIM ops, LVOs (by library, with real/stub/
 * missing status), errors, and an actionable next-step recommendation.
 *
 * Purpose: turn the new-door bring-up loop from "fire it up, watch
 * logs, guess" into a one-shot diagnosis. The probe doesn't fix
 * anything; it surfaces *what to fix* so the engineer can target the
 * right code path on the first try.
 *
 * Usage:
 *   npx tsx dev/scripts/door-probe/probe.ts <binary> [options]
 *
 * Options:
 *   --doortype XIM|SIM|TIM|IIM|SUP    default XIM
 *   --command <name>                  pass through to harness --command
 *   --timeout <ms>                    default 12000
 *   --input-script <file>             stdin script (lines: "<delayMs> <bytes>")
 *   --out <report.md>                 write report to file (else stdout)
 *   --json                            emit JSON instead of markdown
 *   --assigns <json> / --tooltypes <json>  pass through to harness
 *
 * The probe is read-only — it never mutates the door binary or its
 * .info file. It does spawn an emulator process, so don't run it
 * against a door already running on the live BBS (use a separate
 * working copy or shut down that node first).
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const HARNESS = path.join(
  REPO_ROOT,
  "web/backend/src/scripts/run-amiga-door.ts",
);

interface ProbeOpts {
  binary: string;
  doorType: string;
  command?: string;
  timeoutMs: number;
  inputScriptPath?: string;
  outPath?: string;
  emitJson: boolean;
  assigns?: Record<string, string>;
  toolTypes?: Record<string, string>;
}

function parseArgs(argv: string[]): ProbeOpts {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(
      "Usage: probe.ts <binary> [--doortype <type>] [--command <name>] [--timeout <ms>] [--input-script <file>] [--out <report.md>] [--json] [--assigns <json>] [--tooltypes <json>]\n",
    );
    process.exit(argv.length === 0 ? 2 : 0);
  }
  const opts: ProbeOpts = {
    binary: argv[0],
    doorType: "XIM",
    timeoutMs: 12000,
    emitJson: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--doortype") { opts.doorType = next; i += 1; }
    else if (a === "--command") { opts.command = next; i += 1; }
    else if (a === "--timeout") { opts.timeoutMs = Number(next); i += 1; }
    else if (a === "--input-script") { opts.inputScriptPath = next; i += 1; }
    else if (a === "--out") { opts.outPath = next; i += 1; }
    else if (a === "--json") { opts.emitJson = true; }
    else if (a === "--assigns") { opts.assigns = JSON.parse(next); i += 1; }
    else if (a === "--tooltypes") { opts.toolTypes = JSON.parse(next); i += 1; }
    else if (a.startsWith("--")) {
      process.stderr.write(`[probe] unknown flag: ${a}\n`); process.exit(2);
    }
  }
  return opts;
}

interface ProbeResult {
  binary: string;
  binaryAbs: string;
  doorType: string;
  command?: string;
  size: number;
  hunkMagic: string;
  isHunk: boolean;
  versionString: string | null;
  aedoorRefs: string[];
  libraryNamesReferenced: string[];

  exitCode: number;
  timedOut: boolean;
  wallMs: number;
  stdoutBytes: number;
  stdoutPreview: string;

  ximOps: Array<{ name: string; count: number }>;
  lvosByLibrary: Record<
    string,
    Array<{ name: string; status: "real" | "stub" | "missing"; count: number }>
  >;
  errors: string[];
  unimplemented: string[];

  recommendations: string[];
}

const TRACE_LVO_PATTERNS = {
  // [LibraryTraps] Stubbed exec.library SendIO at PC=0x...
  STUB: /\[LibraryTraps\] Stubbed (\S+) (\S+) at PC=/,
  // [ExecLibrary]  call patterns (real handlers)
  EXEC_REAL: /\[ExecLibrary\](?:\[Trap\])?(?:\[(\w+)\])?\s+(\w+)\(/,
  // [ExecLibrary] AllocMem TRAP: size=...
  EXEC_TRAP_DECL: /\[exec-vectors\] (\w+) TRAP/,
  // [LibraryTraps] *** UNIMPLEMENTED EXEC FUNCTION: <name> ***
  MISSING: /\[LibraryTraps\] \*\*\* UNIMPLEMENTED \S+ FUNCTION: (\S+) \*\*\*/,
  // [ExecLibrary]   AllocMem(330, ...) result: ...
  EXEC_REAL_INLINE: /\[ExecLibrary\]\s+(\w+)\(/,
};

const XIM_LINE = /\[XIM(?:Protocol)?\][^\n]*cmd=(\d+)\s+\(([^)]+)\)/;
const VER_RE = /\$VER:\s+([^\x00-\x1f]+?)(?:\s{2,}|\x00|$)/;

function extractStrings(buf: Buffer): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < buf.length; i += 1) {
    const c = buf[i];
    if (c >= 0x20 && c <= 0x7e) {
      cur += String.fromCharCode(c);
    } else if (cur.length >= 5) {
      out.push(cur);
      cur = "";
    } else {
      cur = "";
    }
  }
  if (cur.length >= 5) out.push(cur);
  return out;
}

function classifyBinary(buf: Buffer): {
  hunkMagic: string;
  isHunk: boolean;
  versionString: string | null;
  aedoorRefs: string[];
  libraryNamesReferenced: string[];
} {
  const hunkMagic =
    buf.length >= 4 ? buf.subarray(0, 4).toString("hex") : "??";
  const isHunk = hunkMagic === "000003f3";
  const strings = extractStrings(buf);
  const verLine = strings.find((s) => s.startsWith("$VER:"));
  const versionString = verLine ? (verLine.match(VER_RE)?.[1] ?? verLine) : null;

  const aedoorRefs = strings
    .filter((s) => /AEDoor/.test(s) || /^AEDoorRP|^AEDoorPort/.test(s))
    .slice(0, 10);
  const libs = strings.filter((s) => /\.library$/.test(s));
  const seen = new Set<string>();
  const libraryNamesReferenced: string[] = [];
  for (const l of libs) {
    if (!seen.has(l)) { seen.add(l); libraryNamesReferenced.push(l); }
  }
  return { hunkMagic, isHunk, versionString, aedoorRefs, libraryNamesReferenced };
}

function parseTrace(stderr: string): {
  ximOps: Map<string, number>;
  lvos: Map<string, Map<string, { status: "real" | "stub" | "missing"; count: number }>>;
  errors: string[];
  unimplemented: string[];
} {
  const ximOps = new Map<string, number>();
  const lvos = new Map<string, Map<string, { status: "real" | "stub" | "missing"; count: number }>>();
  const errors: string[] = [];
  const unimplemented = new Set<string>();

  const bumpLvo = (lib: string, name: string, status: "real" | "stub" | "missing") => {
    if (!lvos.has(lib)) lvos.set(lib, new Map());
    const m = lvos.get(lib)!;
    const prev = m.get(name);
    if (!prev) {
      m.set(name, { status, count: 1 });
    } else {
      // "real" trumps "stub" trumps "missing" (we always prefer the most-complete sighting)
      const rank = { missing: 0, stub: 1, real: 2 } as const;
      const newStatus = rank[status] > rank[prev.status] ? status : prev.status;
      m.set(name, { status: newStatus, count: prev.count + 1 });
    }
  };

  for (const raw of stderr.split(/\r?\n/)) {
    const ximM = raw.match(XIM_LINE);
    if (ximM) {
      const opName = ximM[2];
      ximOps.set(opName, (ximOps.get(opName) ?? 0) + 1);
      continue;
    }
    const missingM = raw.match(TRACE_LVO_PATTERNS.MISSING);
    if (missingM) {
      const fnName = missingM[1];
      unimplemented.add(fnName);
      bumpLvo("exec.library?", fnName, "missing");
      continue;
    }
    const stubM = raw.match(TRACE_LVO_PATTERNS.STUB);
    if (stubM) {
      bumpLvo(stubM[1], stubM[2], "stub");
      continue;
    }
    const execTrap = raw.match(TRACE_LVO_PATTERNS.EXEC_TRAP_DECL);
    if (execTrap) {
      bumpLvo("exec.library", execTrap[1], "real");
      continue;
    }
    const execRealBracket = raw.match(TRACE_LVO_PATTERNS.EXEC_REAL);
    if (execRealBracket && execRealBracket[1] && execRealBracket[2]) {
      bumpLvo("exec.library", execRealBracket[1], "real");
      continue;
    }
    const execRealInline = raw.match(TRACE_LVO_PATTERNS.EXEC_REAL_INLINE);
    if (execRealInline) {
      bumpLvo("exec.library", execRealInline[1], "real");
      continue;
    }
    if (/\[LibraryTraps\]\s+\*\*\*|\[ERROR\]|Error:|panic/i.test(raw)
        && !raw.includes("FULLY OPERATIONAL")) {
      errors.push(raw.trim());
    }
  }
  return { ximOps, lvos, errors, unimplemented: Array.from(unimplemented) };
}

function buildRecommendations(r: Omit<ProbeResult, "recommendations">): string[] {
  const recs: string[] = [];
  if (!r.isHunk) {
    recs.push(`Not a valid 68K Hunk binary (magic ${r.hunkMagic}) — verify path.`);
    return recs;
  }
  if (r.unimplemented.length > 0) {
    recs.push(
      `Missing LVO impl(s): ${r.unimplemented.join(", ")} — these are hard blockers; the door will fault or return garbage until they're real.`,
    );
  }
  const stubsHit: string[] = [];
  for (const [lib, fns] of Object.entries(r.lvosByLibrary)) {
    for (const f of fns) {
      if (f.status === "stub") stubsHit.push(`${lib}::${f.name} (${f.count})`);
    }
  }
  if (stubsHit.length > 0) {
    recs.push(
      `Stubbed LVOs the door actually called: ${stubsHit.join(", ")}. ` +
      `These return success but no behaviour — read the NDK autodoc for each, ` +
      `implement properly, then re-probe.`,
    );
  }
  if (r.timedOut) {
    recs.push(
      "Door did not exit within the timeout. Either it's waiting on input " +
      "(provide `--input-script`) or it's stuck in a loop. Inspect the " +
      "stdout preview + last trap lines for context.",
    );
  } else if (r.exitCode !== 0) {
    recs.push(
      `Harness exit=${r.exitCode}. Check stderr in detail; usually one of: ` +
      `unimplemented LVO above the catch, MOIRA fault, missing rom/library.`,
    );
  }
  if (r.errors.length > 0) {
    recs.push(
      `Errors logged: review these — typically a missing config file, ` +
      `wrong tooltype, or unimplemented branch. First 3: ${r.errors.slice(0, 3).join(" | ")}`,
    );
  }
  if (r.ximOps.length === 0 && r.doorType.toUpperCase() === "XIM") {
    recs.push(
      "No XIM ops observed — door declared as XIM but didn't call AEDoor.library. " +
      "Either the wrong doorType is set (try SIM/TIM), the binary needs an arg " +
      "the harness isn't passing, or it died before AEDoor handshake.",
    );
  }
  if (recs.length === 0) {
    recs.push(
      "No blockers detected. Door appears to run on the current emulator. " +
      "Add to the regression corpus: `dev/scripts/door-corpus/corpus.json` " +
      "+ `npx tsx dev/scripts/door-corpus/run.ts --capture <id>`.",
    );
  }
  return recs;
}

function spawnHarness(
  opts: ProbeOpts,
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean; wallMs: number }> {
  return new Promise((resolve) => {
    const binAbs = path.isAbsolute(opts.binary)
      ? opts.binary
      : path.join(REPO_ROOT, opts.binary);
    // Convert ms → seconds for the harness's --timeout flag (it takes
    // seconds, defaults to 300). Pin slightly below the probe's hard
    // cap so the harness's clean shutdown fires before SIGKILL.
    const harnessTimeoutSec = Math.max(1, Math.ceil(opts.timeoutMs / 1000) - 1);
    const args: string[] = [
      "tsx", HARNESS, binAbs, "1",
      "--doortype", opts.doorType,
      "--timeout", String(harnessTimeoutSec),
    ];
    if (opts.command) args.push("--command", opts.command);
    if (opts.assigns) args.push("--assigns", JSON.stringify(opts.assigns));
    if (opts.toolTypes) args.push("--tooltypes", JSON.stringify(opts.toolTypes));
    const t0 = Date.now();
    const proc = spawn("npx", args, {
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["pipe", "pipe", "pipe"],
      // detached + new process group → kill(-pid) reaches every child.
      // Without this, SIGKILL on the npx wrapper leaves the grandchild
      // tsx process running as an orphan, and bulk-probe's wall clock
      // bloats to many minutes per misbehaving door.
      detached: true,
    });
    if (opts.inputScriptPath) {
      try {
        const txt = fs.readFileSync(opts.inputScriptPath, "utf8");
        proc.stdin.write(txt);
      } catch (err: any) {
        process.stderr.write(`[probe] failed to read --input-script: ${err.message}\n`);
      }
    }
    proc.stdin.end();
    let stdout = ""; let stderr = ""; let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // Kill the whole process group (negative pid). detached:true
      // above makes proc.pid the leader; kill(-pid) hits the whole tree.
      try {
        if (proc.pid !== undefined) process.kill(-proc.pid, "SIGKILL");
      } catch { /* ignore */ }
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
    }, opts.timeoutMs);
    proc.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
    proc.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut, wallMs: Date.now() - t0 });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      stderr += `\n[probe] spawn error: ${err.message}\n`;
      resolve({ code: -1, stdout, stderr, timedOut: false, wallMs: Date.now() - t0 });
    });
  });
}

function renderMarkdown(r: ProbeResult): string {
  const stripAnsi = (s: string) =>
    s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  const lines: string[] = [];
  lines.push(`# Door probe — ${path.basename(r.binary)}`);
  lines.push("");
  lines.push(`- Path: \`${r.binaryAbs}\``);
  lines.push(`- Size: ${r.size} bytes`);
  lines.push(`- Hunk magic: \`0x${r.hunkMagic}\` (${r.isHunk ? "valid 68K" : "NOT a Hunk binary"})`);
  lines.push(`- Declared type: ${r.doorType}${r.command ? ` (command \`${r.command}\`)` : ""}`);
  if (r.versionString) lines.push(`- Version string: \`${r.versionString}\``);
  if (r.libraryNamesReferenced.length > 0) {
    lines.push(`- Libraries referenced: ${r.libraryNamesReferenced.map((l) => `\`${l}\``).join(", ")}`);
  }
  if (r.aedoorRefs.length > 0) {
    lines.push(`- AEDoor refs: ${r.aedoorRefs.map((s) => `\`${s}\``).join(", ")}`);
  }
  lines.push("");
  lines.push("## Run result");
  lines.push(`- Exit: ${r.timedOut ? "TIMEOUT" : `code ${r.exitCode}`}`);
  lines.push(`- Wall clock: ${r.wallMs} ms`);
  lines.push(`- Stdout: ${r.stdoutBytes} bytes`);
  if (r.stdoutPreview.trim().length > 0) {
    lines.push("");
    lines.push("```");
    lines.push(stripAnsi(r.stdoutPreview).split(/\r?\n/).slice(0, 30).join("\n"));
    lines.push("```");
  }
  lines.push("");
  lines.push("## XIM ops");
  if (r.ximOps.length === 0) {
    lines.push("_(none observed)_");
  } else {
    for (const o of r.ximOps) lines.push(`- \`${o.name}\` × ${o.count}`);
  }
  lines.push("");
  lines.push("## LVOs called");
  const libs = Object.keys(r.lvosByLibrary).sort();
  if (libs.length === 0) {
    lines.push("_(none observed)_");
  } else {
    for (const lib of libs) {
      lines.push(`### ${lib}`);
      for (const f of r.lvosByLibrary[lib]) {
        const badge = f.status === "real" ? "OK" : f.status === "stub" ? "STUB" : "MISSING";
        lines.push(`- [${badge}] \`${f.name}\` × ${f.count}`);
      }
      lines.push("");
    }
  }
  if (r.unimplemented.length > 0) {
    lines.push("## Unimplemented LVOs (hard blockers)");
    for (const u of r.unimplemented) lines.push(`- ${u}`);
    lines.push("");
  }
  if (r.errors.length > 0) {
    lines.push("## Errors observed");
    for (const e of r.errors.slice(0, 20)) lines.push(`- ${e}`);
    if (r.errors.length > 20) lines.push(`- _(+${r.errors.length - 20} more)_`);
    lines.push("");
  }
  lines.push("## Recommendations");
  for (const rec of r.recommendations) lines.push(`- ${rec}`);
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const binAbs = path.isAbsolute(opts.binary)
    ? opts.binary
    : path.join(REPO_ROOT, opts.binary);

  if (!fs.existsSync(binAbs)) {
    process.stderr.write(`[probe] binary not found: ${binAbs}\n`);
    process.exit(2);
  }
  const buf = fs.readFileSync(binAbs);
  const ident = classifyBinary(buf);

  process.stderr.write(`[probe] running ${path.basename(binAbs)} (${opts.doorType}, ${buf.length}B)\n`);
  const run = await spawnHarness(opts);
  const trace = parseTrace(run.stderr);

  const partial: Omit<ProbeResult, "recommendations"> = {
    binary: opts.binary,
    binaryAbs: binAbs,
    doorType: opts.doorType,
    command: opts.command,
    size: buf.length,
    hunkMagic: ident.hunkMagic,
    isHunk: ident.isHunk,
    versionString: ident.versionString,
    aedoorRefs: ident.aedoorRefs,
    libraryNamesReferenced: ident.libraryNamesReferenced,
    exitCode: run.code,
    timedOut: run.timedOut,
    wallMs: run.wallMs,
    stdoutBytes: run.stdout.length,
    stdoutPreview: run.stdout.slice(0, 2000),
    ximOps: [...trace.ximOps.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    lvosByLibrary: Object.fromEntries(
      [...trace.lvos.entries()].map(([lib, fns]) => [
        lib,
        [...fns.entries()]
          .map(([name, info]) => ({ name, ...info }))
          .sort((a, b) =>
            a.status === b.status ? a.name.localeCompare(b.name) :
            a.status === "missing" ? -1 : b.status === "missing" ? 1 :
            a.status === "stub" ? -1 : 1),
      ]),
    ),
    errors: trace.errors,
    unimplemented: trace.unimplemented,
  };
  const result: ProbeResult = {
    ...partial,
    recommendations: buildRecommendations(partial),
  };

  const report = opts.emitJson
    ? JSON.stringify(result, null, 2)
    : renderMarkdown(result);
  if (opts.outPath) {
    fs.writeFileSync(opts.outPath, report);
    process.stderr.write(`[probe] report written to ${opts.outPath}\n`);
  } else {
    process.stdout.write(report);
    if (!report.endsWith("\n")) process.stdout.write("\n");
  }

  // Exit non-zero on hard problems so probe.ts can be used in CI for
  // a new-door smoke check.
  const hasBlocker = !result.isHunk || result.unimplemented.length > 0;
  process.exit(hasBlocker ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`[probe] fatal: ${err?.stack || err}\n`);
  process.exit(2);
});
