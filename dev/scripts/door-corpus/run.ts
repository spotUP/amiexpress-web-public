#!/usr/bin/env node
/**
 * Door corpus runner — boots each door in corpus.json under the existing
 * `web/backend/src/scripts/run-amiga-door.ts` harness, captures the
 * ANSI-output stream + a small trace of XIM/exec activity, and diffs
 * against `goldens/<id>/output.txt` (+ optional `trace.txt`).
 *
 * Modes:
 *   --capture          : run each door, write goldens/<id>/output.txt
 *   --capture <id>     : same but only the named door
 *   (no args)          : run all doors, diff against goldens, exit non-zero on mismatch
 *   --only <id>        : run only the named door (still diffs)
 *   --timeout <ms>     : override timeout (overrides corpus.json per-entry)
 *   --keep-ansi        : keep raw ANSI escapes in goldens (default: strip for readability)
 *
 * Convention:
 *   stdout from run-amiga-door = door's rendered ANSI output (what the
 *     user would see on screen). Captured to output.txt.
 *   stderr = log lines from the emulator/library traps. We extract the
 *     [XIM]/[ExecLibrary]/[exec-vectors] lines into trace.txt for a
 *     stable cross-run signal (timing-free).
 *
 * No need for a running BBS — the harness boots the 68K binary in
 * isolation. Same approach the existing run-amiga-door.ts CLI uses.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface CorpusEntry {
  id: string;
  name: string;
  category: string;
  binary: string;
  doorType: string;
  command?: string;
  timeoutMs?: number;
  assigns?: Record<string, string>;
  toolTypes?: Record<string, string>;
  inputScript?: Array<{ delayMs: number; data: string }>;
  notes?: string;
}

interface Corpus {
  doors: CorpusEntry[];
}

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const HARNESS = path.join(
  REPO_ROOT,
  "web/backend/src/scripts/run-amiga-door.ts",
);
const CORPUS_PATH = path.join(__dirname, "corpus.json");
const GOLDENS_DIR = path.join(__dirname, "goldens");

const ANSI_STRIP = /\x1b\[[0-9;?]*[A-Za-z]/g;
const TRACE_RE = /^\[(XIM|ExecLibrary|exec-vectors|LibraryTraps|HUNK)\b/;
// Lines that are stable in *content* but jitter in *position* relative to
// peers (async log races); drop them so corpus diffs stay quiet.
const TRACE_DROP = /\[(LockTrace)\]|MEMORY-READ\] readMemory32/;

function parseArgs(argv: string[]): {
  capture: boolean;
  only: string | null;
  timeoutOverride: number | null;
  keepAnsi: boolean;
  concurrency: number;
} {
  const out = {
    capture: false,
    only: null as string | null,
    timeoutOverride: null as number | null,
    keepAnsi: false,
    // Each door spawns its own emulator subprocess, so parallelism is
    // bounded by CPU + RAM rather than emulator state. Default 4 on a
    // typical dev box; cuts the 36-door corpus from ~3 min serial to
    // ~50 sec. Drop to 1 if running alongside bulk-probe.
    concurrency: 4,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--capture") {
      out.capture = true;
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out.only = next;
        i += 1;
      }
    } else if (a === "--only") {
      out.only = argv[i + 1];
      i += 1;
    } else if (a === "--timeout") {
      out.timeoutOverride = Number(argv[i + 1]);
      i += 1;
    } else if (a === "--keep-ansi") {
      out.keepAnsi = true;
    } else if (a === "--concurrency" || a === "-j") {
      out.concurrency = Math.max(1, Number(argv[i + 1]) || 1);
      i += 1;
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: run.ts [--capture [<id>]] [--only <id>] [--timeout <ms>] [--keep-ansi] [--concurrency N | -j N]\n",
      );
      process.exit(0);
    } else if (a.startsWith("--")) {
      process.stderr.write(`[corpus] unknown flag: ${a}\n`);
      process.exit(2);
    }
  }
  return out;
}

function loadCorpus(): Corpus {
  const raw = fs.readFileSync(CORPUS_PATH, "utf8");
  return JSON.parse(raw) as Corpus;
}

function stripAnsi(s: string): string {
  return s.replace(ANSI_STRIP, "");
}

// Mask common live-time/date formats so doors that render the wall clock
// (5D-Clock, easystatus, ConfStats etc.) stay diff-stable. Applied to
// both golden and got before comparing — the on-disk golden remains the
// raw door output, but equality is tested against the masked form.
// Patterns conservative on purpose: anchor to whitespace or line edges
// so we don't mangle e.g. opcode hex 0x14:00:00 (none of those exist in
// Amiga door output, but the principle holds).
// Trailing boundary uses (?=\D|$) instead of \b so the mask also fires
// when a door glues the time straight to a letter (DOORSae_sysinfo
// renders "...2026 15:50:59Kickstart..." — between '9' and 'K' there
// is no \b because both are word chars).
const TIME_HMS = /(^|[\s\[(\|])(\d{1,2}):(\d{2}):(\d{2})(?=\D|$)/g;
// HH:M or HH:MM — some doors (easystatus) render single-digit minutes
// flush-against the next field ("16:0Main..."). \d{1,2} for minutes
// catches both forms without false-positives on opcode-like contexts.
const TIME_HM  = /(^|[\s\[(\|])(\d{1,2}):(\d{1,2})(\b|[a-zA-Z])/g;
const DOW_DATE = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}/g;
const DATE_DMY = /\b\d{1,2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}\b/g;

function maskTimes(s: string): string {
  return s
    .replace(TIME_HMS, "$1HH:MM:SS")
    .replace(TIME_HM, "$1HH:MM$4")
    .replace(DOW_DATE, "DOW DD-MON-YYYY")
    .replace(DATE_DMY, "DD-MON-YYYY");
}

const TRACE_LINE_CAP = 500;

function extractTrace(stderr: string): string {
  // Strip cycle counts / addresses / hex pointers that drift run-to-run.
  // Keep the operation name + symbolic args. Capped at TRACE_LINE_CAP
  // so a door that hangs (non-terminating after a config error) doesn't
  // produce a multi-MB golden — past the cap the trace signal degrades
  // anyway. Doors that legitimately need more events should be driven
  // to completion with scripted inputs (corpus runner extension, TBD).
  const NORM_HEX = /0x[0-9a-fA-F]+/g;
  const NORM_DEC = /\b\d{4,}\b/g; // 4+-digit numbers (cycle counts, sizes)
  const out: string[] = [];
  const seenSig = new Set<string>();
  // First pass: collect dedup'd-by-signature lines so a hung door's
  // repetitive Wait/Signal trap loop doesn't dominate the cap.
  for (const l of stderr.split(/\r?\n/)) {
    if (!TRACE_RE.test(l)) continue;
    if (TRACE_DROP.test(l)) continue;
    const normalised = l.replace(NORM_HEX, "0x?").replace(NORM_DEC, "?");
    if (seenSig.has(normalised)) continue;
    seenSig.add(normalised);
    out.push(normalised);
    if (out.length >= TRACE_LINE_CAP) {
      out.push(
        `[corpus] trace capped at ${TRACE_LINE_CAP} unique-signature lines`,
      );
      break;
    }
  }
  return out.join("\n");
}

function runDoor(
  entry: CorpusEntry,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const binaryAbs = path.isAbsolute(entry.binary)
      ? entry.binary
      : path.join(REPO_ROOT, entry.binary);

    const args: string[] = [
      "tsx",
      HARNESS,
      binaryAbs,
      "1", // nodeId
      "--doortype",
      entry.doorType,
    ];
    if (entry.command) args.push("--command", entry.command);
    if (entry.assigns) args.push("--assigns", JSON.stringify(entry.assigns));
    if (entry.toolTypes)
      args.push("--tooltypes", JSON.stringify(entry.toolTypes));

    const proc = spawn("npx", args, {
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: "0" },
      // Pipe stdin so the harness's scripted-input reader picks up
      // (it skips when process.stdin.isTTY=true).
      stdio: ["pipe", "pipe", "pipe"],
      // detached so the timeout-kill can reach the grandchild tsx via
      // process-group signal (proc.kill on the npx wrapper alone
      // leaves orphans on macOS).
      detached: true,
    });

    // Feed inputScript (if any) into the harness's stdin. The format
    // `<delayMs> <bytes>` matches what run-amiga-door.ts parses
    // (see parseInputScript / decodeEscapes there).
    if (entry.inputScript && entry.inputScript.length > 0) {
      const script = entry.inputScript
        .map((s) => `${s.delayMs} ${s.data}`)
        .join("\n") + "\n";
      proc.stdin.write(script);
    }
    proc.stdin.end();

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (proc.pid !== undefined) process.kill(-proc.pid, "SIGKILL");
      } catch { /* ignore */ }
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
    }, timeoutMs);

    proc.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
    proc.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      stderr += `\n[corpus] spawn error: ${err.message}\n`;
      resolve({ code: -1, stdout, stderr, timedOut });
    });
  });
}

interface Result {
  id: string;
  status: "pass" | "fail" | "captured" | "timeout" | "error";
  detail?: string;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const corpus = loadCorpus();

  if (!fs.existsSync(HARNESS)) {
    process.stderr.write(`[corpus] harness not found: ${HARNESS}\n`);
    process.exit(2);
  }

  const entries = opts.only
    ? corpus.doors.filter((d) => d.id === opts.only)
    : corpus.doors;
  if (entries.length === 0) {
    process.stderr.write(`[corpus] no doors matched (only=${opts.only})\n`);
    process.exit(2);
  }

  const processOne = async (entry: CorpusEntry): Promise<Result> => {
    const timeoutMs =
      opts.timeoutOverride ?? entry.timeoutMs ?? 15000;
    process.stdout.write(
      `[corpus] running ${entry.id} (${entry.category}) timeout=${timeoutMs}ms\n`,
    );
    const run = await runDoor(entry, timeoutMs);

    if (run.timedOut) {
      process.stdout.write(`  ${entry.id}: TIMEOUT (after ${timeoutMs}ms)\n`);
      return { id: entry.id, status: "timeout" };
    }
    if (run.code !== 0) {
      process.stdout.write(
        `  ${entry.id}: ERROR exit=${run.code}\n` +
        `    stderr-tail: ${run.stderr.split("\n").slice(-5).join(" | ")}\n`,
      );
      return { id: entry.id, status: "error", detail: `exit code ${run.code}` };
    }

    const renderedOutput = opts.keepAnsi
      ? run.stdout
      : stripAnsi(run.stdout);
    const traceOutput = extractTrace(run.stderr);
    const goldenDir = path.join(GOLDENS_DIR, entry.id);

    if (opts.capture) {
      fs.mkdirSync(goldenDir, { recursive: true });
      fs.writeFileSync(path.join(goldenDir, "output.txt"), renderedOutput);
      fs.writeFileSync(path.join(goldenDir, "trace.txt"), traceOutput + "\n");
      process.stdout.write(
        `  ${entry.id}: CAPTURED ` +
        `output=${renderedOutput.length}B trace=${traceOutput.split("\n").length} lines\n`,
      );
      return { id: entry.id, status: "captured" };
    }

    const outputPath = path.join(goldenDir, "output.txt");
    const tracePath = path.join(goldenDir, "trace.txt");
    if (!fs.existsSync(outputPath)) {
      process.stdout.write(`  ${entry.id}: FAIL no golden (run --capture)\n`);
      return {
        id: entry.id,
        status: "fail",
        detail: `no golden at ${outputPath} — run --capture first`,
      };
    }

    const goldenOutput = fs.readFileSync(outputPath, "utf8");
    const goldenTrace = fs.existsSync(tracePath)
      ? fs.readFileSync(tracePath, "utf8").replace(/\n$/, "")
      : null;

    // Compare time-masked forms so live-time renderers stay stable.
    // Goldens on disk remain raw + human-readable; equality is tested
    // against the masked transform.
    const outputDiff = maskTimes(goldenOutput) !== maskTimes(renderedOutput);
    const traceDiff =
      goldenTrace !== null && maskTimes(goldenTrace) !== maskTimes(traceOutput);

    if (outputDiff || traceDiff) {
      const detail: string[] = [];
      if (outputDiff) {
        detail.push(
          `output: golden ${goldenOutput.length}B vs got ${renderedOutput.length}B`,
        );
      }
      if (traceDiff) {
        detail.push(
          `trace: golden ${goldenTrace?.split("\n").length} lines vs got ${traceOutput.split("\n").length}`,
        );
      }
      // Write the "got" side under .got/ so the diff is easy to inspect.
      const gotDir = path.join(goldenDir, ".got");
      fs.mkdirSync(gotDir, { recursive: true });
      fs.writeFileSync(path.join(gotDir, "output.txt"), renderedOutput);
      fs.writeFileSync(path.join(gotDir, "trace.txt"), traceOutput);
      process.stdout.write(
        `  ${entry.id}: FAIL ${detail.join("; ")} (got files: ${gotDir})\n`,
      );
      return { id: entry.id, status: "fail", detail: detail.join("; ") };
    }

    process.stdout.write(`  ${entry.id}: pass\n`);
    return { id: entry.id, status: "pass" };
  };

  // Run doors with bounded concurrency. Each emulator subprocess is
  // independent (no shared state), so this is purely a CPU/RAM gate.
  const results: Result[] = [];
  let nextIdx = 0;
  const workers = Array.from({ length: Math.min(opts.concurrency, entries.length) }, async () => {
    while (true) {
      const i = nextIdx++;
      if (i >= entries.length) return;
      results.push(await processOne(entries[i]));
    }
  });
  await Promise.all(workers);

  // Summary
  const tally: Record<string, number> = {};
  for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
  const summary = Object.entries(tally)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  process.stdout.write(`\n[corpus] ${results.length} door(s) ${summary}\n`);

  const ok =
    results.every((r) => r.status === "pass" || r.status === "captured");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`[corpus] fatal: ${err?.stack || err}\n`);
  process.exit(2);
});
