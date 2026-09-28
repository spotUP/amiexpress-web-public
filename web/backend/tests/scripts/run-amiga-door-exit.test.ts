/**
 * Regression: run-amiga-door.ts must process.exit(0) once the door
 * session resolves. Several XIM handlers (notably JH_MCI's dynamic
 * import of screen.handler) transitively load index.ts, whose
 * top-level IIFE spins up the database + Telnet + HTTP servers and
 * keeps the Node event loop alive indefinitely. Before the explicit
 * exit, doors that issued JH_MCI (e.g. MDB-ConfUpdater, Hststat)
 * timed out in the corpus runner even though they sent JH_SHUTDOWN
 * cleanly.
 *
 * Driven by loading the REAL harness module in-process with the 68K
 * runtime replaced: AmigaDoorSession.start() resolves (or rejects) at once,
 * and process.exit is captured instead of taken. What is asserted is the
 * exit code the harness asks for on each outcome - 0 once the door is
 * done, 1 when it failed - and that the success exit waits for stdout to
 * drain first (the corpus runner pipes stdout; an immediate exit dropped the
 * `who` golden's last lines, 2026-05-14). No emulator runs.
 */
import * as path from 'path';

const doorOutcome: { fail: Error | null } = { fail: null };

jest.mock('../../src/scripts/console-to-stderr', () => ({}));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    async start(): Promise<void> {
      if (doorOutcome.fail) throw doorOutcome.fail;
    }
  },
}));

const HARNESS = path.resolve(__dirname, '..', '..', 'src', 'scripts', 'run-amiga-door.ts');

/**
 * Load the harness once, as `tsx run-amiga-door.ts <door> <node>` would, and
 * resolve with the code it passed to process.exit.
 */
async function runHarness(): Promise<{ code: number | undefined; drainedFirst: boolean }> {
  const savedArgv = process.argv;
  const savedTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const signalListeners = {
    SIGTERM: process.listeners('SIGTERM'),
    SIGINT: process.listeners('SIGINT'),
  };
  let drained = false;
  let drainedBeforeExit = false;

  // A terminal on stdin: the harness only reads a scripted-input pipe
  // when stdin is NOT a TTY, and jest's stdin is whatever launched it.
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  process.argv = ['node', HARNESS, '/nowhere/door', '1'];

  const write = jest.spyOn(process.stdout, 'write').mockImplementation(((
    _chunk: unknown,
    cb?: unknown,
  ) => {
    if (typeof cb === 'function') {
      setImmediate(() => {
        drained = true;
        (cb as () => void)();
      });
    }
    return true;
  }) as never);

  try {
    const code = await new Promise<number | undefined>((resolve) => {
      jest.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        drainedBeforeExit = drained;
        resolve(c);
        return undefined as never;
      }) as never);
      jest.isolateModules(() => {
        require(HARNESS);
      });
    });
    return { code, drainedFirst: drainedBeforeExit };
  } finally {
    write.mockRestore();
    jest.restoreAllMocks();
    process.argv = savedArgv;
    if (savedTTY) Object.defineProperty(process.stdin, 'isTTY', savedTTY);
    else delete (process.stdin as { isTTY?: boolean }).isTTY;
    // The harness hangs a ledger dump on both signals; do not leave them on
    // the jest worker.
    for (const sig of ['SIGTERM', 'SIGINT'] as const) {
      for (const l of process.listeners(sig)) {
        if (!signalListeners[sig].includes(l)) process.removeListener(sig, l);
      }
    }
  }
}

describe('run-amiga-door.ts exit behaviour', () => {
  afterEach(() => {
    doorOutcome.fail = null;
  });

  it('force-exits with 0 after the door session resolves, once stdout has drained', async () => {
    const run = await runHarness();

    expect(run.code).toBe(0);
    expect(run.drainedFirst).toBe(true);
  });

  it('exits with 1 when the door session fails', async () => {
    doorOutcome.fail = new Error('door blew up');
    // The harness reports the failure on console.error before exiting.
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const run = await runHarness();
      expect(run.code).toBe(1);
    } finally {
      err.mockRestore();
    }
  });
});
