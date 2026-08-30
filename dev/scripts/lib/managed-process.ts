/**
 * Starting and stopping a long-lived child process, without leaving orphans.
 *
 * Written after 104 backends were found running at once. watch-doors.ts had
 * two defects that only show up together, and both are structural rather
 * than incidental:
 *
 *   1. Its force-kill timer read the module-level `backendProcess`, three
 *      seconds after asking the CURRENT one to stop. A graceful stop that
 *      finished quickly let a new backend start inside that window, and the
 *      timer then SIGKILLed the replacement - the process it had just
 *      started. Every function here takes the ChildProcess it is acting on
 *      as an argument, so there is no shared variable left to go stale.
 *
 *   2. It spawned `npx tsx src/index.ts`, so its handle was the npx
 *      wrapper, not the server. Killing the wrapper leaves the real process
 *      re-parented to launchd/init - alive, holding its port, and no longer
 *      stoppable by the watcher. That is what every one of those 104
 *      corpses was: `node .../.bin/tsx src/index.ts` with no parent.
 *      startManaged spawns the resolved binary directly AND detaches it into
 *      its own process group, so stopManaged can signal the group and take
 *      whatever the process itself spawned (doors, emulators) with it.
 *
 * Nothing here is watcher-specific; it is the process half of watch-doors.ts,
 * split out because it is the half worth testing against real processes.
 */
import { spawn, ChildProcess, SpawnOptions } from 'child_process';

/** Whether a pid still exists. Signal 0 performs the permission and
 *  existence checks without delivering anything. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Signals a process AND everything it spawned.
 *
 * A negative pid addresses the process group, which only exists as its own
 * group because startManaged detached it. Falls back to signalling the bare
 * pid when there is no such group (a process someone else spawned
 * attached), so this is safe to call on any child.
 */
export function killTree(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
    return;
  } catch {
    // No process group under this pid (not detached), or it is already gone.
  }
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone - stopping something that has already stopped is a
    // success, not an error.
  }
}

export interface StartManagedOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stdio?: SpawnOptions['stdio'];
}

/**
 * Starts a child in its OWN process group, so it can later be stopped whole.
 *
 * `detached: true` is what creates the group. It also means the child no
 * longer receives the terminal's Ctrl+C - the caller's own SIGINT/SIGTERM
 * handler must stop it (watch-doors.ts's cleanup() does).
 */
export function startManaged(opts: StartManagedOptions): ChildProcess {
  return spawn(opts.command, opts.args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdio: opts.stdio ?? 'inherit',
    detached: true,
  });
}

export interface StopManagedOptions {
  /** How long the process gets to exit on SIGTERM before SIGKILL. */
  graceMs?: number;
  /** How long to keep waiting after SIGKILL before giving up. */
  killMs?: number;
  /** Poll interval for "has it actually gone yet". */
  pollMs?: number;
  /** Called once, if the process had to be force-killed. */
  onForce?: (pid: number) => void;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Stops one process and its group, and does not resolve until the pid is
 * really gone.
 *
 * Takes the process to stop as an argument on purpose: the caller's "current
 * process" variable may have moved on by the time the grace period expires,
 * and killing whatever it points at THEN is the bug this replaces.
 *
 * Resolves for a null/absent/already-dead process - stopping something that
 * is already stopped is a success. Returns whether a force-kill was needed,
 * so a caller can log it.
 */
export async function stopManaged(
  proc: ChildProcess | null,
  opts: StopManagedOptions = {}
): Promise<{ stopped: boolean; forced: boolean }> {
  const graceMs = opts.graceMs ?? 3000;
  const killMs = opts.killMs ?? 2000;
  const pollMs = opts.pollMs ?? 50;

  const pid = proc?.pid;
  if (!proc || pid === undefined) return { stopped: true, forced: false };
  if (!isAlive(pid)) return { stopped: true, forced: false };

  killTree(pid, 'SIGTERM');

  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return { stopped: true, forced: false };
    await sleep(pollMs);
  }
  if (!isAlive(pid)) return { stopped: true, forced: false };

  opts.onForce?.(pid);
  killTree(pid, 'SIGKILL');

  const killDeadline = Date.now() + killMs;
  while (Date.now() < killDeadline) {
    if (!isAlive(pid)) return { stopped: true, forced: true };
    await sleep(pollMs);
  }
  // A pid that survives SIGKILL is uninterruptible (stuck in a syscall) or
  // not ours to signal. Reported honestly rather than swallowed: the caller
  // is about to start a replacement that will collide with it.
  return { stopped: !isAlive(pid), forced: true };
}
