/**
 * Stopping a backend must stop THAT backend, and all of it.
 *
 * 104 backends were found running at once on this machine, every one of them
 * `node .../.bin/tsx src/index.ts` re-parented to launchd. Two defects in
 * dev/scripts/watch-doors.ts produced them, and both are exercised here
 * against real child processes rather than mocks - a mock cannot orphan
 * anything, which is the entire failure mode:
 *
 *   1. The force-kill timer read the module-level `backendProcess` three
 *      seconds after asking the then-current one to stop, so a quick
 *      graceful stop let a replacement start inside that window and the
 *      timer killed the replacement.
 *   2. The watcher's handle was the `npx` wrapper, not the server, so
 *      killing it left the real process alive with no parent.
 */
import { spawn } from 'child_process';
import { startManaged, stopManaged, isAlive, killTree } from '../../../../dev/scripts/lib/managed-process';

/** A child that ignores SIGTERM outright - what a hung backend looks like.
 *  It announces itself only AFTER installing the handler: signalling a node
 *  process that is still bootstrapping kills it on the default handler, and
 *  a test that raced that way would report "no force-kill needed" for the
 *  wrong reason. */
const IGNORES_SIGTERM =
  "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stdout.write('ready\\n');";

/** A child that exits promptly on SIGTERM - a healthy backend. */
const EXITS_ON_SIGTERM = "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);";

/** A child that spawns a grandchild ignoring SIGTERM, then prints its pid.
 *  The grandchild stands in for what the backend itself spawns (doors,
 *  emulators) - and for the tsx process an `npx` wrapper hides. */
const SPAWNS_A_GRANDCHILD = `
  const { spawn } = require('child_process');
  const kid = spawn(process.execPath, ['-e', ${JSON.stringify(IGNORES_SIGTERM)}], { stdio: ['ignore', 'pipe', 'ignore'] });
  kid.stdout.once('data', () => process.stdout.write(String(kid.pid) + '\\n'));
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
`;

const started: number[] = [];

function track<T extends { pid?: number }>(proc: T): T {
  if (proc.pid) started.push(proc.pid);
  return proc;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Resolves with the child's first line of stdout - its "I am up" marker. */
function firstLine(proc: { stdout: NodeJS.ReadableStream | null }, what: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} never reported`)), 5000);
    proc.stdout!.once('data', (chunk: Buffer) => {
      clearTimeout(timer);
      resolve(chunk.toString().trim());
    });
  });
}

/** A started, detached child that has confirmed it is up. */
async function startReady(script: string): Promise<import('child_process').ChildProcess> {
  const proc = track(startManaged({
    command: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'ignore'],
  }));
  await firstLine(proc, 'child');
  return proc;
}

async function waitForGone(pid: number, ms = 3000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await sleep(25);
  }
  return !isAlive(pid);
}

afterEach(() => {
  // Nothing this suite starts may outlive it - that is the very defect
  // under test.
  for (const pid of started.splice(0)) {
    if (isAlive(pid)) killTree(pid, 'SIGKILL');
  }
});

describe('stopManaged', () => {
  it('stops the process it was given and only resolves once it is really gone', async () => {
    const proc = track(startManaged({
      command: process.execPath,
      args: ['-e', EXITS_ON_SIGTERM],
      cwd: process.cwd(),
      stdio: 'ignore',
    }));
    const pid = proc.pid!;

    const result = await stopManaged(proc, { graceMs: 3000 });

    expect(result).toEqual({ stopped: true, forced: false });
    expect(isAlive(pid)).toBe(false);
  });

  it('force-kills a process that ignores SIGTERM, after the grace period', async () => {
    const proc = await startReady(IGNORES_SIGTERM);
    const pid = proc.pid!;
    const onForce = jest.fn();

    const result = await stopManaged(proc, { graceMs: 300, onForce });

    expect(onForce).toHaveBeenCalledWith(pid);
    expect(result.forced).toBe(true);
    expect(result.stopped).toBe(true);
    expect(isAlive(pid)).toBe(false);
  });

  it('takes the whole process group, so nothing is left re-parented', async () => {
    // The 104 corpses were exactly this: a child of the process that was
    // killed, still running with no parent. Killing the group is what stops
    // a wrapper's real workload dying alone.
    const proc = track(startManaged({
      command: process.execPath,
      args: ['-e', SPAWNS_A_GRANDCHILD],
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
    const grandchildPid = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('grandchild never reported its pid')), 5000);
      proc.stdout!.once('data', (chunk: Buffer) => {
        clearTimeout(timer);
        resolve(parseInt(chunk.toString().trim(), 10));
      });
    });
    started.push(grandchildPid);
    expect(isAlive(grandchildPid)).toBe(true);

    await stopManaged(proc, { graceMs: 300 });

    expect(isAlive(proc.pid!)).toBe(false);
    expect(await waitForGone(grandchildPid)).toBe(true);
  });

  it('never touches a process started while it was waiting out the grace period', async () => {
    // The regression. The old code armed a timer and, three seconds later,
    // killed whatever the module's `backendProcess` pointed at - by then the
    // REPLACEMENT backend. stopManaged is given the process to stop, so a
    // process started mid-stop is not reachable from it at all.
    const doomed = await startReady(IGNORES_SIGTERM);

    const stopping = stopManaged(doomed, { graceMs: 500 });

    const replacement = await startReady(IGNORES_SIGTERM);

    await stopping;
    // Well past the old 3s timer, which is when it used to fire.
    await sleep(600);

    expect(isAlive(doomed.pid!)).toBe(false);
    expect(isAlive(replacement.pid!)).toBe(true);
  });

  it('treats an absent or already-dead process as stopped', async () => {
    await expect(stopManaged(null)).resolves.toEqual({ stopped: true, forced: false });

    const proc = track(startManaged({
      command: process.execPath,
      args: ['-e', 'process.exit(0)'],
      cwd: process.cwd(),
      stdio: 'ignore',
    }));
    await waitForGone(proc.pid!);

    await expect(stopManaged(proc, { graceMs: 100 })).resolves.toEqual({ stopped: true, forced: false });
  });
});

describe('startManaged', () => {
  it('puts the child in its own process group, which is what makes a group kill possible', async () => {
    const proc = track(startManaged({
      command: process.execPath,
      args: ['-e', EXITS_ON_SIGTERM],
      cwd: process.cwd(),
      stdio: 'ignore',
    }));

    // A detached child leads its own group, so its pgid equals its pid. An
    // attached one would inherit this test runner's group - and signalling
    // that group would take jest down with it.
    const { execSync } = require('child_process') as typeof import('child_process');
    const pgid = parseInt(execSync(`ps -o pgid= -p ${proc.pid}`).toString().trim(), 10);
    expect(pgid).toBe(proc.pid);

    await stopManaged(proc, { graceMs: 1000 });
  });

  it('is not a plain spawn: an attached child shares the runner group', () => {
    // Pins WHY startManaged exists rather than calling spawn directly.
    const attached = track(spawn(process.execPath, ['-e', EXITS_ON_SIGTERM], { stdio: 'ignore' }));
    const { execSync } = require('child_process') as typeof import('child_process');
    const pgid = parseInt(execSync(`ps -o pgid= -p ${attached.pid}`).toString().trim(), 10);

    expect(pgid).not.toBe(attached.pid);

    attached.kill('SIGKILL');
  });
});

describe('watch-doors.ts wiring', () => {
  const source = require('fs').readFileSync(
    require('path').resolve(__dirname, '../../../../dev/scripts/watch-doors.ts'),
    'utf8'
  ) as string;

  it('starts the backend through startManaged, not a bare spawn', () => {
    expect(source).toMatch(/backendProcess = startManaged\(/);
    expect(source).not.toMatch(/backendProcess = spawn\(/);
  });

  it('does not put npx between the watcher and the backend on the normal path', () => {
    // npx is only reachable from the no-local-install fallback, which warns.
    const npxLines = source.split('\n').filter(line => line.includes("'npx'"));
    expect(npxLines).toHaveLength(1);
    expect(source).toMatch(/web\/backend\/node_modules\/\.bin\/tsx/);
  });

  it('stops the backend by handing stopManaged the process, never a shared variable', () => {
    expect(source).toMatch(/const proc = backendProcess;/);
    expect(source).toMatch(/await stopManaged\(proc, \{/);
    // The shape that caused the leak: a timer that force-kills whatever the
    // module-level handle points at when it fires.
    expect(source).not.toMatch(/setTimeout\([\s\S]{0,200}backendProcess\.kill\('SIGKILL'\)/);
  });
});
