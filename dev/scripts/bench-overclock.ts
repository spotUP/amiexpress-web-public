#!/usr/bin/env node
/**
 * bench-overclock.ts — sweep every corpus door across DOOR_OVERCLOCK
 * factors and find the highest factor where the door still matches its
 * golden output.
 *
 * Strategy per door (binary-search-ish without the full bisect):
 *   1. Run at every factor in FACTORS ascending.
 *   2. Stop the moment the door's output stops matching its golden, or
 *      its run wall-time exceeds RUNTIME_BUDGET_MS (we treat "much
 *      slower" as a failure too — the whole point is speed).
 *   3. Record the last passing factor as the max-safe value.
 *
 * Output: report-overclock.json at repo root.
 *
 * The actual diffing is delegated to the existing corpus runner:
 *   DOOR_OVERCLOCK=<n> npx tsx dev/scripts/door-corpus/run.ts --only <id>
 * which already knows how to diff stdout against goldens/<id>/output.txt.
 *
 * Concurrency is hard-pinned to 1 — see memory
 * feedback_avoid_parallel_emulator_heat: more than one sustained 68K
 * emulator spikes load + fan. We add a small inter-spawn cooldown to
 * stay polite.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CORPUS = path.join(REPO_ROOT, "dev/scripts/door-corpus/corpus.json");
const RUN = path.join(REPO_ROOT, "dev/scripts/door-corpus/run.ts");
const REPORT = path.join(REPO_ROOT, "report-overclock.json");

// Sweep factors. Stops climbing the moment a door fails. Sparse enough
// to keep the whole run tractable (324 doors × ~6 levels worst case).
const FACTORS = [500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];

// Hard per-run timeout. The corpus runner has its own per-door timeout
// (corpus.json), but we add a wall-clock cap so a hung door doesn't
// pin the whole sweep.
const RUN_TIMEOUT_MS = 60_000;
const INTER_RUN_COOLDOWN_MS = 200;

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
  perFactor: Record<
    string,
    { status: "pass" | "fail" | "timeout"; wallMs: number; detail?: string }
  >;
  maxSafeFactor: number | null;
  speedupVs500x?: number;
}

interface Report {
  generatedAt: string;
  factors: number[];
  runTimeoutMs: number;
  doors: DoorResult[];
}

async function runOne(
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
        // Own process group so the timeout kill takes the whole tree
        // (npx → tsx → run-amiga-door → emulator subprocess).
        detached: true,
      },
    );

    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | null = null;
    let killed = false;

    proc.stdout?.on("data", (b) => {
      stdout += b.toString();
    });
    proc.stderr?.on("data", (b) => {
      stderr += b.toString();
    });

    timer = setTimeout(() => {
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
      if (timer) clearTimeout(timer);
      const wallMs = Date.now() - started;

      if (killed) {
        resolve({ status: "timeout", wallMs, detail: "killed by bench timer" });
        return;
      }

      // Corpus runner exits non-zero on any mismatch. With --only, the
      // exit code reflects just our door.
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

async function main() {
  const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8")) as {
    doors: CorpusEntry[];
  };

  const args = process.argv.slice(2);
  let entries = corpus.doors;

  const onlyArgIdx = args.indexOf("--only");
  if (onlyArgIdx >= 0 && args[onlyArgIdx + 1]) {
    const ids = args[onlyArgIdx + 1].split(",").map((s) => s.trim());
    entries = entries.filter((e) => ids.includes(e.id));
  }
  const limitArgIdx = args.indexOf("--limit");
  if (limitArgIdx >= 0 && args[limitArgIdx + 1]) {
    entries = entries.slice(0, parseInt(args[limitArgIdx + 1], 10));
  }
  const resumeArgIdx = args.indexOf("--resume");
  const resume = resumeArgIdx >= 0;

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
      factors: FACTORS,
      runTimeoutMs: RUN_TIMEOUT_MS,
      doors: [],
    };
  }

  let i = 0;
  for (const entry of entries) {
    i++;
    const binPath = path.join(REPO_ROOT, entry.binary);
    const binaryExists = fs.existsSync(binPath);

    const result: DoorResult = {
      id: entry.id,
      name: entry.name,
      binaryExists,
      perFactor: {},
      maxSafeFactor: null,
    };

    if (!binaryExists) {
      process.stdout.write(
        `[${i}/${entries.length}] ${entry.id}: SKIP (binary missing)\n`,
      );
      report.doors.push(result);
      fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
      continue;
    }

    process.stdout.write(`[${i}/${entries.length}] ${entry.id} (${entry.name})\n`);

    // Climb. Stop on first failure or timeout.
    for (const factor of FACTORS) {
      const r = await runOne(entry.id, factor);
      result.perFactor[String(factor)] = r;
      process.stdout.write(
        `    ${factor}x: ${r.status} (${r.wallMs}ms)${
          r.detail ? " — " + r.detail : ""
        }\n`,
      );
      if (r.status === "pass") {
        result.maxSafeFactor = factor;
      } else {
        // First non-pass — no point going higher.
        break;
      }
      // Cooldown between spawns (emulator heat, per memory).
      await new Promise((res) => setTimeout(res, INTER_RUN_COOLDOWN_MS));
    }

    // Speedup ratio vs 500x baseline, if both measured.
    const r500 = result.perFactor["500"];
    const rMax =
      result.maxSafeFactor !== null
        ? result.perFactor[String(result.maxSafeFactor)]
        : undefined;
    if (r500?.status === "pass" && rMax?.status === "pass") {
      result.speedupVs500x = +(r500.wallMs / rMax.wallMs).toFixed(2);
    }

    report.doors.push(result);
    // Flush after every door so a crash mid-sweep doesn't lose progress.
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  }

  // Final summary
  const passing = report.doors.filter((d) => d.maxSafeFactor !== null);
  const max = passing.reduce((acc, d) => Math.max(acc, d.maxSafeFactor!), 0);
  process.stdout.write(
    `\n[bench] done. ${passing.length}/${report.doors.length} doors passed at some factor; highest survivor: ${max}x\n`,
  );
  process.stdout.write(`[bench] report: ${REPORT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
