/**
 * The watchdog exists because of one outage: 2026-09-20, the event loop
 * stopped turning inside a 68K door at 14:27 and the board answered nobody
 * until it was restarted by hand at 17:14. So the test that matters is not
 * "does it compile" - it is "does a process whose main thread is spinning in
 * a `while` loop actually die". That needs a real process with a real blocked
 * loop, which is what the second test here runs.
 */
import { execFile, spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  WATCHDOG_DEFAULT_STALL_SECONDS,
  watchdogStallSeconds,
} from "../../src/server/event-loop-watchdog";

describe("watchdogStallSeconds", () => {
  it("arms itself on the live board and stays out of the way elsewhere", () => {
    expect(watchdogStallSeconds({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(
      WATCHDOG_DEFAULT_STALL_SECONDS,
    );
    expect(watchdogStallSeconds({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(0);
    expect(watchdogStallSeconds({} as NodeJS.ProcessEnv)).toBe(0);
  });

  it("lets the environment arm it locally and disarm it live", () => {
    expect(
      watchdogStallSeconds({ EVENT_LOOP_WATCHDOG_SECONDS: "5" } as NodeJS.ProcessEnv),
    ).toBe(5);
    expect(
      watchdogStallSeconds({
        NODE_ENV: "production",
        EVENT_LOOP_WATCHDOG_SECONDS: "0",
      } as NodeJS.ProcessEnv),
    ).toBe(0);
  });

  it("falls back to the default rather than to no watch when the value is nonsense", () => {
    expect(
      watchdogStallSeconds({ EVENT_LOOP_WATCHDOG_SECONDS: "soon" } as NodeJS.ProcessEnv),
    ).toBe(WATCHDOG_DEFAULT_STALL_SECONDS);
  });
});

describe("a process whose event loop has stopped", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "watchdog-test-"));
  const modulePath = path.resolve(__dirname, "../../src/server/event-loop-watchdog.ts");
  const tsx = path.resolve(__dirname, "../../node_modules/.bin/tsx");

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("is killed, so Docker can restart the board", async () => {
    const script = path.join(tmpDir, "blocked-loop.ts");
    fs.writeFileSync(
      script,
      [
        `import { startEventLoopWatchdog } from ${JSON.stringify(modulePath)};`,
        "startEventLoopWatchdog({ stallSeconds: 2, beatMs: 100, reportGraceMs: 200 });",
        "console.log('armed');",
        // Hold the loop the way the emulator held it: synchronously, with no
        // await, no timer and no I/O. Long enough that only the watchdog can
        // end this process.
        "setTimeout(() => { const until = Date.now() + 60000; while (Date.now() < until) {} }, 300);",
      ].join("\n"),
    );

    const startedAt = Date.now();
    const child = spawn(tsx, [script], { stdio: ["ignore", "pipe", "pipe"] });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => child.on("exit", (code, signal) => resolve({ code, signal })),
    );
    // Our own backstop, so a watchdog that does nothing fails the test
    // instead of hanging it for the 60 s the child would otherwise spin.
    const guard = setTimeout(() => child.kill("SIGTERM"), 20000);

    const { code, signal } = await exited;
    clearTimeout(guard);
    const elapsed = Date.now() - startedAt;

    // SIGUSR2 is the diagnostic-report signal, which without
    // `--report-on-signal` terminates by default; SIGKILL is the backstop
    // the watchdog sends three ticks later. Either means it acted.
    //
    // The death is reported as an EXIT CODE, not a signal, because `tsx`
    // runs the script in a child of its own and passes 128+signum up when
    // that child is signalled - so a test that only looked at `signal`
    // would fail on a watchdog that worked perfectly.
    const bySignal = signal === "SIGUSR2" || signal === "SIGKILL";
    const byRelayedSignal =
      code === 128 + os.constants.signals.SIGUSR2 ||
      code === 128 + os.constants.signals.SIGKILL;

    expect(bySignal || byRelayedSignal).toBe(true);
    // A 2 s limit, killed on the first check after it: anything near the
    // 20 s guard means the watch is running on the blocked loop after all.
    expect(elapsed).toBeLessThan(10000);
  }, 40000);

  it("leaves a healthy process alone", async () => {
    const script = path.join(tmpDir, "healthy-loop.ts");
    fs.writeFileSync(
      script,
      [
        `import { startEventLoopWatchdog } from ${JSON.stringify(modulePath)};`,
        "const watch = startEventLoopWatchdog({ stallSeconds: 2, beatMs: 100, reportGraceMs: 200 });",
        // Four seconds of ordinary asynchronous work - twice the stall limit,
        // so a watchdog that counted wall clock instead of silence would kill
        // this one too.
        "let ticks = 0;",
        "const timer = setInterval(() => { ticks += 1; }, 50);",
        "setTimeout(async () => { clearInterval(timer); await watch?.stop(); console.log('ticks=' + ticks); }, 4000);",
      ].join("\n"),
    );

    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      execFile(tsx, [script], { timeout: 30000 }, (err, stdout) => {
        if (err) reject(new Error(`${err.message}\n${stdout}`));
        else resolve({ stdout });
      });
    });

    expect(stdout).toMatch(/ticks=\d+/);
  }, 40000);
});
