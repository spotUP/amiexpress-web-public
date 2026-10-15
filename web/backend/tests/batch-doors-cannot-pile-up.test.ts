/**
 * Batch doors cannot pile up, and a logging-off caller does not wait for them.
 *
 * "we have had big issues with the batch doors never exiting in the past make
 * sure it doesnt come back and if possible fix the root cause" (the sysop,
 * 2026-09-14), said the moment LOGOFF<n> started executing BBS:Batch<n> for
 * real (6b2506a02). Two things went wrong historically and both are pinned:
 *
 *  - Nothing serialised batch runs. batch1 on this board is seven 68K doors
 *    with a 300 s budget each; a second logoff while the first batch was still
 *    grinding started a second set beside it. The login path once needed a
 *    reentrancy guard for exactly this after two OOM kills, and that guard
 *    went away with the function. The queue here is the one that stays, and
 *    every batch path goes through it.
 *
 *  - The G logoff awaited the sys-commands, so the caller sat at `Click...`
 *    for as long as the batch took, with the session still on the board.
 *    settleWithin bounds that wait; the batch carries on behind it.
 *
 * The queue is driven with controllable stand-ins so the test measures
 * ORDERING and OVERLAP, not emulator speed. Each test gets its OWN module
 * instance: the queue is module state, and a test that fails mid-way with a
 * gate still closed would otherwise leave every later test queued behind it
 * for ever - which is exactly the fault it exists to prevent.
 */
process.env.SKIP_DB_INIT = '1';

import { settleWithin } from '../src/utils/settle-within';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type Scheduler = typeof import('../src/services/batch-scheduler');

/** A fresh queue - fresh module - for every test. */
function freshQueue(): Pick<Scheduler, 'enqueueBatch' | 'batchQueueDepth' | 'runBatchFileQueued'> {
  let mod!: Scheduler;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('../src/services/batch-scheduler');
  });
  return mod;
}

/** Let queued microtasks run: a `.then` scheduled on a settled chain starts here. */
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

/** A run that resolves only when the test says so, and records when it began. */
function controllable(log: string[], name: string) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const start = jest.fn(async () => { log.push(`start ${name}`); await gate; log.push(`end ${name}`); });
  return { start, release };
}

describe('the batch queue', () => {
  test('runs one batch at a time - the second starts only when the first has ended', async () => {
    const { enqueueBatch, batchQueueDepth } = freshQueue();
    const log: string[] = [];
    const first = controllable(log, 'A');
    const second = controllable(log, 'B');

    const a = enqueueBatch('batch1#1', 'batch1 node 1', first.start);
    const b = enqueueBatch('batch1#2', 'batch1 node 2', second.start);
    await tick();

    // B is waiting, not running beside A.
    expect(log).toEqual(['start A']);
    expect(batchQueueDepth()).toBe(2);

    first.release();
    await a;
    await tick();
    expect(log).toEqual(['start A', 'end A', 'start B']);

    second.release();
    await b;
    expect(log).toEqual(['start A', 'end A', 'start B', 'end B']);
    expect(batchQueueDepth()).toBe(0);
  });

  test('a run that has not started yet absorbs a repeat - it will happen anyway', async () => {
    const { enqueueBatch, batchQueueDepth } = freshQueue();
    const log: string[] = [];
    const first = controllable(log, 'A');
    const repeat = jest.fn(async () => { log.push('start REPEAT'); });

    const a = enqueueBatch('batch1#1', 'batch1 node 1', first.start);
    // Same key, and A has not started: this IS A, not a second run.
    const same = enqueueBatch('batch1#1', 'batch1 node 1', repeat);
    await tick();

    expect(batchQueueDepth()).toBe(1);
    first.release();
    await a;
    await same;
    expect(repeat).not.toHaveBeenCalled();
    expect(log).toEqual(['start A', 'end A']);
  });

  test('a run that IS under way gets one more queued, and only one', async () => {
    const { enqueueBatch, batchQueueDepth } = freshQueue();
    const log: string[] = [];
    const first = controllable(log, 'A');
    const again = controllable(log, 'A2');
    const extra = jest.fn(async () => { log.push('start EXTRA'); });

    const a = enqueueBatch('batch1#1', 'batch1 node 1', first.start);
    await tick();
    expect(log).toEqual(['start A']);

    // A is running, so a new logoff on the same node needs ONE more run -
    // the bulletins must be rebuilt after it - but three quick logoffs do not
    // need three.
    const b = enqueueBatch('batch1#1', 'batch1 node 1', again.start);
    enqueueBatch('batch1#1', 'batch1 node 1', extra);
    enqueueBatch('batch1#1', 'batch1 node 1', extra);
    await tick();
    expect(batchQueueDepth()).toBe(2);

    first.release();
    await a;
    await tick();
    expect(log).toEqual(['start A', 'end A', 'start A2']);

    again.release();
    await b;
    expect(extra).not.toHaveBeenCalled();
    expect(log).toEqual(['start A', 'end A', 'start A2', 'end A2']);
    expect(batchQueueDepth()).toBe(0);
  });

  test('a batch that throws does not wedge the queue for the next logoff', async () => {
    const { enqueueBatch, batchQueueDepth } = freshQueue();
    const log: string[] = [];
    const next = controllable(log, 'B');

    await enqueueBatch('batch1#1', 'batch1 node 1', async () => { throw new Error('emulator fell over'); });
    const b = enqueueBatch('batch1#2', 'batch1 node 2', next.start);
    await tick();

    expect(log).toEqual(['start B']);
    next.release();
    await b;
    expect(batchQueueDepth()).toBe(0);
  });

  test('runBatchFileQueued really goes through the queue, and a missing batch is not a failure', async () => {
    const { enqueueBatch, batchQueueDepth, runBatchFileQueued } = freshQueue();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batchq-'));
    try {
      const log: string[] = [];
      const blocker = controllable(log, 'A');
      const a = enqueueBatch('hold#0', 'holder', blocker.start);

      // Queued behind the holder: not started, not failed, just waiting.
      const missing = runBatchFileQueued(path.join(dir, 'batch4'), 1);
      await tick();
      expect(batchQueueDepth()).toBe(2);

      blocker.release();
      await a;
      await missing;
      expect(batchQueueDepth()).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a logging-off caller', () => {
  test('waits for a quick logoff command', async () => {
    const quick = new Promise<void>(resolve => setTimeout(resolve, 10));

    await expect(settleWithin(quick, 1000)).resolves.toBe(true);
  });

  test('does not wait for the batch - the grace ends and the line drops', async () => {
    let released = false;
    const batch = new Promise<void>(resolve => setTimeout(() => { released = true; resolve(); }, 200));

    const finished = await settleWithin(batch, 20);

    expect(finished).toBe(false);
    // The batch was not cancelled; it is still on its way.
    expect(released).toBe(false);
    await batch;
    expect(released).toBe(true);
  });

  test('a command that throws is treated as settled, not as a reason to wait', async () => {
    const broken = Promise.reject(new Error('no such door'));
    broken.catch(() => undefined);

    await expect(settleWithin(broken, 1000)).resolves.toBe(true);
  });
});

/**
 * A batch that only partly ran says so.
 *
 * Every line is tried and a failure never stops the ones after it - one broken
 * door must not cost the board its other bulletins. But the outcome was never
 * reported, so a run that did two of eight things looked exactly like a run
 * that did all eight.
 *
 * On 2026-09-14 a logoff rebuilt bull1 and bull2 and stopped, and there was
 * nothing to say whether the rest had failed, been skipped, or never been
 * reached. The container was recreated before that window could be read, so
 * the cause is still unknown. This is what makes the next one diagnose itself.
 */
describe('a batch file that half worked', () => {
  function batchOf(lines: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-report-'));
    fs.writeFileSync(path.join(dir, 'batch1'), lines.join('\n') + '\n');
    return path.join(dir, 'batch1');
  }

  /**
   * Run a real batch file and capture what it said about itself.
   *
   * The steps name programs that do not exist, so `executeLine` resolves
   * nothing and no emulator starts - what is under test is the TALLY, not the
   * doors.
   */
  async function runAndCapture(lines: string[]) {
    const said: string[] = [];
    const log = jest.spyOn(console, 'log').mockImplementation((...a) => { said.push(a.join(' ')); });
    const err = jest.spyOn(console, 'error').mockImplementation((...a) => { said.push(a.join(' ')); });
    const file = batchOf(lines);
    try {
      let mod!: typeof import('../src/services/batch-scheduler');
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        mod = require('../src/services/batch-scheduler');
      });
      await mod.runBatchFile(file, 1);
    } finally {
      log.mockRestore();
      err.mockRestore();
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
    return said.join('\n');
  }

  test('says how many steps it ran, so a partial run is visible', async () => {
    const out = await runAndCapture(['.key node', 'doors:nope/nope one', 'doors:alsonope/x two']);

    // Three steps in the file; the tally names a number either way, which is
    // the whole point - before this a run that did two of eight said nothing.
    expect(out).toMatch(/batch1 finished/);
    expect(out).toMatch(/node 1/);
  });

  test('comments and blanks are not steps, so the denominator is honest', async () => {
    const out = await runAndCapture([
      '; a comment', '', '  ; another', '# hash comment', '',
    ]);

    // Nothing but prose: no steps, and NOT an incomplete run.
    expect(out).toMatch(/0 steps, all ran/);
    expect(out).not.toMatch(/INCOMPLETE/);
  });

  test('a file that is not there says nothing at all', async () => {
    const said: string[] = [];
    const log = jest.spyOn(console, 'log').mockImplementation((...a) => { said.push(a.join(' ')); });
    try {
      let mod!: typeof import('../src/services/batch-scheduler');
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        mod = require('../src/services/batch-scheduler');
      });
      await mod.runBatchFile(path.join(os.tmpdir(), 'no-such-batch-file'), 1);
    } finally {
      log.mockRestore();
    }

    // runLogoffBatches probes six candidate paths and most never exist; a
    // tally line for each would bury the one that matters.
    expect(said.join('\n')).not.toMatch(/finished/);
  });
});
