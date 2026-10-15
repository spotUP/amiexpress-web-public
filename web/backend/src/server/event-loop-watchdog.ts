/**
 * Kills a board whose event loop has stopped turning, so Docker can restart it.
 *
 * 2026-09-20: a caller ran GWall from `logon20.txt`. The last line in the
 * container log is `[BsdSocketLibrary] Received 2698 bytes` at 14:27:26 and
 * then nothing at all - no heartbeat, no `[DoorLifecycleManager] alive:`, no
 * request log. CPU sat at 100%, `curl /health` timed out from outside the
 * container AND from inside it, and the board stayed that way until it was
 * restarted by hand at 17:14. Two hours forty-seven minutes.
 *
 * Every fuse we already have runs ON the event loop: the door inactivity fuse
 * is a `setTimeout`, the execution loop yields every 5 ms and logs every 5 s,
 * the Docker health check shells `curl` INTO the process. A synchronous block
 * in the 68K emulator or in a trap handler takes all of them out together -
 * the fuse that is supposed to kill the door is queued behind the door.
 *
 * So the watch has to live off the loop. A worker thread holds one timestamp
 * in shared memory, the main thread bumps it once a second, and the worker
 * (whose own loop is free) kills the process when the bump stops. Docker's
 * `restart=unless-stopped` brings the board back in about a minute, which is
 * what the sysop would have done by hand.
 *
 * WHY A KILL AND NOT SOMETHING GENTLER: nothing gentler can run. A blocked
 * loop cannot handle SIGTERM, cannot flush, cannot answer a health check and
 * cannot end one door. The process is already unusable to every caller on it;
 * the only question is whether it comes back in a minute or when somebody
 * notices.
 *
 * THE THRESHOLD IS NOT A GUESS. Legitimate synchronous blocks exist and the
 * longest one we ship is bsdsocket `recv()`, which parks in `deasync` for up
 * to 30 s (BsdSocketLibrary.ts). DNS adds 5 s and connect 5 s. 120 s is four
 * times the longest honest block and still inside the sysop's patience.
 *
 * SIGUSR2 BEFORE SIGKILL: with `--report-on-signal` (set in the Dockerfile)
 * node writes a diagnostic report - including the JS stack of the blocked
 * main thread - from its own reporting thread, which a blocked loop does not
 * stop. That report is the only way we will ever see WHERE it froze, because
 * by definition nothing inside the process can log it. Without the flag
 * SIGUSR2's default action terminates the process, which is the same outcome
 * one step early, and SIGKILL follows as a backstop either way.
 */
import { Worker } from "worker_threads";

/** How often the main thread proves the loop is turning. */
export const WATCHDOG_BEAT_MS = 1000;

/** Silence that means the loop is gone, not merely busy. See the header. */
export const WATCHDOG_DEFAULT_STALL_SECONDS = 120;

/** Grace between the diagnostic signal and the kill. */
export const WATCHDOG_REPORT_GRACE_MS = 3000;

export interface EventLoopWatchdogOptions {
  /** Silence in seconds before the process is killed. 0 disables the watch. */
  stallSeconds?: number;
  /** Beat interval; only tests need to change it. */
  beatMs?: number;
  /** Grace between SIGUSR2 and SIGKILL; only tests need to change it. */
  reportGraceMs?: number;
}

export interface EventLoopWatchdog {
  /** Stops the watch and lets the worker exit. */
  stop(): Promise<void>;
}

/**
 * Reads the watch's configuration from the environment.
 *
 * ON in production, OFF elsewhere unless asked for: a laptop pausing on a
 * breakpoint is not a wedged board, and a debugger holds the loop for exactly
 * as long as the person stares at it. `EVENT_LOOP_WATCHDOG_SECONDS` overrides
 * both ways - `0` disables it on the live board, any number arms it locally.
 */
export function watchdogStallSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.EVENT_LOOP_WATCHDOG_SECONDS ?? "").trim();
  if (raw !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : WATCHDOG_DEFAULT_STALL_SECONDS;
  }
  return env.NODE_ENV === "production" ? WATCHDOG_DEFAULT_STALL_SECONDS : 0;
}

/**
 * The worker's whole program. It is inlined rather than shipped as a file
 * because the backend runs from source under tsx in production and from
 * `dist` nowhere: a `new Worker('./event-loop-watchdog.worker.js')` would
 * have to resolve differently in tsx, in jest and in the container, and a
 * watchdog that fails to start in one of them is worse than none.
 *
 * `Atomics.wait` is what keeps it honest - the worker sleeps in the kernel
 * rather than on a timer, so it cannot itself be starved by anything the main
 * thread does.
 */
const WORKER_SOURCE = `
const { workerData } = require('worker_threads');
const { sab, stallMs, beatMs, reportGraceMs, pid } = workerData;
const beats = new BigInt64Array(sab);
const sleeper = new Int32Array(new SharedArrayBuffer(4));

function now() { return Date.now(); }

for (;;) {
  Atomics.wait(sleeper, 0, 0, beatMs);
  const last = Number(Atomics.load(beats, 0));
  if (last === 0) continue;              // not started beating yet
  if (last < 0) break;                   // stop() asked us to leave
  const silent = now() - last;
  if (silent < stallMs) continue;

  console.error(
    '[EventLoopWatchdog] The event loop has not turned for ' +
    Math.round(silent / 1000) + 's (limit ' + Math.round(stallMs / 1000) + 's). ' +
    'The board cannot answer anyone in this state. Asking node for a diagnostic ' +
    'report (SIGUSR2), then killing the process so Docker restarts it.'
  );

  try { process.kill(pid, 'SIGUSR2'); } catch (e) { /* no report, kill anyway */ }
  Atomics.wait(sleeper, 0, 0, reportGraceMs);
  try { process.kill(pid, 'SIGKILL'); } catch (e) { /* already gone */ }
  break;
}
`;

/**
 * Starts the watch. Returns null when it is switched off, so the caller can
 * say so in the log rather than pretending a board is being watched.
 */
export function startEventLoopWatchdog(
  options: EventLoopWatchdogOptions = {},
): EventLoopWatchdog | null {
  const stallSeconds = options.stallSeconds ?? watchdogStallSeconds();
  if (stallSeconds <= 0) return null;

  const beatMs = options.beatMs ?? WATCHDOG_BEAT_MS;
  const reportGraceMs = options.reportGraceMs ?? WATCHDOG_REPORT_GRACE_MS;
  const sab = new SharedArrayBuffer(8);
  const beats = new BigInt64Array(sab);
  Atomics.store(beats, 0, BigInt(Date.now()));

  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: {
      sab,
      stallMs: stallSeconds * 1000,
      beatMs,
      reportGraceMs,
      pid: process.pid,
    },
  });
  // The watch must not be the reason the process stays up.
  worker.unref();

  const beat = setInterval(() => {
    Atomics.store(beats, 0, BigInt(Date.now()));
  }, beatMs);
  beat.unref?.();

  console.log(
    `[EventLoopWatchdog] Watching: the process is killed after ${stallSeconds}s ` +
      `without the event loop turning (beat every ${beatMs}ms).`,
  );

  return {
    async stop(): Promise<void> {
      clearInterval(beat);
      // A negative beat is the worker's exit word - it checks this before it
      // compares timestamps, so stopping never races with a kill decision.
      Atomics.store(beats, 0, BigInt(-1));
      await worker.terminate();
    },
  };
}
