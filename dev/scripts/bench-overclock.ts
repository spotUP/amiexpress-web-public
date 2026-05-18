#!/usr/bin/env node
/**
 * bench-overclock.ts — fast top-down sweep to find the max-safe
 * DOOR_OVERCLOCK factor for every corpus door.
 *
 * Strategy:
 *   For each door, try factors in descending order: [100000, 25000, 5000,
 *   1000, 500, 100]. First one that passes its golden diff wins. Most
 *   doors pass at 100000x (WHO's pattern — startup dwarfs compute), so
 *   the common case is ONE run per door.
 *
 *   Within a phase, batches run in parallel (default 3 — bench is brief
 *   and intentional, the per-memory cap of 1 sustained applies to
 *   day-long corpus runs, not 30-min benches).
 *
 * Output: report-overclock.json at repo root (flushed after every door).
 *
 * Flags:
 *   --concurrency N   parallel doors per phase (default 3)
 *   --only ids        comma-sep door ids to test
 *   --limit N         only the first N doors
 *   --resume          skip doors already in report-overclock.json
 *   --factors a,b,c   override descending factor list
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CORPUS = path.join(REPO_ROOT, "dev/scripts/door-corpus/corpus.json");
const RUN = path.join(REPO_ROOT, "dev/scripts/door-corpus/run.ts");
const REPORT = path.join(REPO_ROOT, "report-overclock.json");

const DEFAULT_FACTORS = [100000, 25000, 5000, 1000, 500, 100];
const RUN_TIMEOUT_MS = 60_000;

interface CorpusEntry {
  id: string;
  name: string;
  binary: string;
  timeoutMs?: number;
}

interface DoorResult {
  id: string;
  name: string;
  binaryExists: boolean;
  // Sparse record — only stores factors actually tested.
  perFactor: Record<
    string,
    { status: "pass" | "fail" | "timeout"; wallMs: number; detail?: string }
  >;
  maxSafeFactor: number | null;
}

interface Report {
  generatedAt: string;
  factors: number[];
  runTimeoutMs: number;
  doors: DoorResult[];
}

function runOne(
  id: string,
  factor: number,
): Promise<{ status: "pass" | "fail" | "timeout"; wallMs: number; detail?: string }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const proc = spawn(
      "npx",
      ["tsx", RUN, "--only", id, "--concurrency", "1"],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          DOOR_OVERCLOCK: String(factor),
          FORCE_COLOR: "0",
        },
        detached: true,
      },
    );

    let stdout = "";
    let stderr = "";
    let killed = false;

    proc.stdout?.on("data", (b) => {
      stdout += b.toString();
    });
    proc.stderr?.on("data", (b) => {
      stderr += b.toString();
    });

    const timer = setTimeout(() => {
      killed = true;
      try {
        if (proc.pid) process.kill(-proc.pid, "SIGKILL");
      } catch {
        /* ignore */
      }
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, RUN_TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const wallMs = Date.now() - started;

      if (killed) {
        resolve({ status: "timeout", wallMs, detail: "killed by bench timer" });
        return;
      }

      if (code === 0 && /:\s*pass\b/.test(stdout)) {
        resolve({ status: "pass", wallMs });
      } else {
        const lastLine =
          stdout.split("\n").reverse().find((l) => /\S/.test(l)) ||
          stderr.split("\n").reverse().find((l) => /\S/.test(l)) ||
          `exit ${code}`;
        resolve({ status: "fail", wallMs, detail: lastLine.trim().slice(0, 200) });
      }
    });
  });
}

async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function take() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => take()));
  return results;
}

async function main() {
  const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8")) as {
    doors: CorpusEntry[];
  };

  const args = process.argv.slice(2);
  let entries = corpus.doors;

  let concurrency = 3;
  let factors = DEFAULT_FACTORS;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--concurrency") concurrency = parseInt(args[++i], 10);
    else if (a === "--only") {
      const ids = args[++i].split(",").map((s) => s.trim());
      entries = entries.filter((e) => ids.includes(e.id));
    } else if (a === "--limit") entries = entries.slice(0, parseInt(args[++i], 10));
    else if (a === "--factors")
      factors = args[++i].split(",").map((s) => parseInt(s.trim(), 10));
  }

  const resume = args.includes("--resume");

  let report: Report;
  if (resume && fs.existsSync(REPORT)) {
    report = JSON.parse(fs.readFileSync(REPORT, "utf8")) as Report;
    const done = new Set(report.doors.map((d) => d.id));
    entries = entries.filter((e) => !done.has(e.id));
    process.stdout.write(
      `[bench] resuming; ${report.doors.length} already done, ${entries.length} to go\n`,
    );
  } else {
    report = {
      generatedAt: new Date().toISOString(),
      factors,
      runTimeoutMs: RUN_TIMEOUT_MS,
      doors: [],
    };
  }

  process.stdout.write(
    `[bench] ${entries.length} doors, concurrency=${concurrency}, factors=[${factors.join(",")}], top-down\n`,
  );

  // Two-pass: split into doors with binary present vs missing first to
  // keep the parallel batch hot (no wasted slots on instant skips).
  const present: CorpusEntry[] = [];
  for (const e of entries) {
    const exists = fs.existsSync(path.join(REPO_ROOT, e.binary));
    if (exists) {
      present.push(e);
    } else {
      report.doors.push({
        id: e.id,
        name: e.name,
        binaryExists: false,
        perFactor: {},
        maxSafeFactor: null,
      });
      process.stdout.write(`  ${e.id}: SKIP (missing binary)\n`);
    }
  }
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  let completed = 0;
  const total = present.length;

  // Flush mutex — many workers writing same file concurrently is fine on
  // Node's serial event loop, but we batch the actual fs.writeFileSync
  // calls so we don't pay JSON.stringify on every status update.
  let flushTimer: NodeJS.Timeout | null = null;
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    }, 500);
  };

  await pool(present, concurrency, async (entry) => {
    const result: DoorResult = {
      id: entry.id,
      name: entry.name,
      binaryExists: true,
      perFactor: {},
      maxSafeFactor: null,
    };

    // Top-down: first factor that passes is the answer.
    for (const factor of factors) {
      const r = await runOne(entry.id, factor);
      result.perFactor[String(factor)] = r;
      if (r.status === "pass") {
        result.maxSafeFactor = factor;
        break;
      }
    }

    completed++;
    const tag = result.maxSafeFactor
      ? `max=${result.maxSafeFactor}x`
      : "FAIL all factors";
    const wall = Object.values(result.perFactor).reduce(
      (acc, v) => acc + v.wallMs,
      0,
    );
    process.stdout.write(
      `[${completed}/${total}] ${entry.id}: ${tag} (${wall}ms, ${Object.keys(result.perFactor).length} run(s))\n`,
    );

    report.doors.push(result);
    scheduleFlush();
    return result;
  });

  // Final flush
  if (flushTimer) clearTimeout(flushTimer);
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  // Summary buckets
  const buckets = new Map<string, number>();
  for (const d of report.doors) {
    if (!d.binaryExists) {
      buckets.set("missing", (buckets.get("missing") ?? 0) + 1);
      continue;
    }
    const k = d.maxSafeFactor === null ? "fail" : `${d.maxSafeFactor}x`;
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  process.stdout.write(`\n[bench] done.\n`);
  for (const [k, v] of [...buckets.entries()].sort()) {
    process.stdout.write(`  ${k}: ${v}\n`);
  }
  process.stdout.write(`[bench] report: ${REPORT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
