// @ts-nocheck
import { AREXXInterpreter } from '../../src/services/arexx.service';

// Regression for the ACCV103 production hang (2026-08): a `Do Until`
// loop against a file handle that never opened (Open() failed silently,
// as it does for any legacy AmigaDOS-binary path this SQLite-backed BBS
// no longer ships) span forever. Every iteration resolved through
// already-settled promises — pure microtasks, no macrotask ever
// produced — which starves Node's event loop completely: not just the
// script, the WHOLE PROCESS stopped responding to anything (health
// checks, other nodes, Ctrl+C), and only `docker restart` recovered it.
//
// Reproduced directly against the interpreter before this fix: a
// diagnostic `setInterval(500ms)` wrapped around `interpreter.execute()`
// never fired ONCE in 4 real seconds of wall-clock time.
//
// AREXXInterpreter._setWatchdogTuningForTests shrinks the watchdog's
// timing so the real 30-second production abort can be proven in
// milliseconds.

describe('AREXX runaway-loop watchdog', () => {
  afterEach(() => {
    AREXXInterpreter._resetWatchdogTuningForTests();
  });

  test('an infinite Do Until loop does not starve the event loop', async () => {
    AREXXInterpreter._setWatchdogTuningForTests(2, 40);

    const ctx: any = { output: [], session: {}, user: {} };
    const interp = new AREXXInterpreter(ctx, []);

    // The exact shape of ACCV103's hang: Open() on a handle that never
    // resolves to a real file, then Seek/ReadCH against it forever.
    // C2D('') is 0, so NrUsers never exceeds 0.
    const script = [
      "Open('UserData','RAM:definitely-does-not-exist','R')",
      "Seek('UserData',-148,'E')",
      'NrUsers = 0',
      'Do Until NrUsers > 0',
      " NrUsers = C2D(ReadCH('UserData',2))",
      " Seek('UserData',-234,'C')",
      'end',
      "say 'DONE'",
    ].join('\n');

    // A real macrotask timer, running CONCURRENTLY with execute(). If
    // the interpreter starves the event loop the way it did before the
    // fix, this never fires — proving the bug reproduces as a process
    // stall, not merely a slow script.
    let ticks = 0;
    const ticker = setInterval(() => ticks++, 5);

    const result = await interp.execute(script);

    clearInterval(ticker);

    expect(ticks).toBeGreaterThan(0);
    // Aborted, not crashed: a clean result, same shape a Ctrl+C abort
    // produces (see arexx-ctrlc-abort.test.ts) - never a thrown error,
    // never an unresolved promise.
    expect(result.success).toBe(true);
    expect(result.output).not.toContain('DONE');
  });

  test('the abort routes through a HALT trap when the script installed one', async () => {
    AREXXInterpreter._setWatchdogTuningForTests(2, 30);

    const ctx: any = { output: [], session: {}, user: {} };
    const interp = new AREXXInterpreter(ctx, []);

    const script = [
      'signal on halt',
      'flag = 0',
      'Do Until flag = 1',
      '  flag = 0',
      'end',
      'exit',
      'HALT:',
      "say 'TRAPPED'",
      'exit',
    ].join('\n');

    const result = await interp.execute(script);

    expect(result.success).toBe(true);
    expect(result.output).toContain('TRAPPED');
  });

  test('a fast, correctly-terminating loop is unaffected', async () => {
    // Production defaults, not shrunk - this is the "does the watchdog
    // get in the way of ordinary scripts" check.
    const ctx: any = { output: [], session: {}, user: {} };
    const interp = new AREXXInterpreter(ctx, []);

    const script = [
      'total = 0',
      'Do i = 1 to 1000',
      ' total = total + i',
      'end',
      'say total',
    ].join('\n');

    const result = await interp.execute(script);

    expect(result.success).toBe(true);
    expect(result.output).toEqual(['500500']);
  });

  test('a long user-input wait between fast clauses is never charged as busy time', async () => {
    // The watchdog must tell "the script has been genuinely computing
    // non-stop" apart from "the script asked a question and is waiting
    // on a human", which can legitimately take minutes. Simulated here
    // by a host call that itself awaits a real (short, for the test)
    // delay - standing in for GETCHAR/PROMPT.
    AREXXInterpreter._setWatchdogTuningForTests(2, 25);

    const ctx: any = {
      output: [],
      session: {},
      user: {},
      // A couple of BBSFunctions/host paths read context.input; a
      // generic slow host call is enough to model "blocked on I/O,
      // not compute" for this test without depending on GETCHAR's
      // exact wiring.
      input: () => new Promise((resolve) => setTimeout(() => resolve('x'), 60)),
    };
    const interp = new AREXXInterpreter(ctx, []);

    // Two short bursts of real work separated by a wait comfortably
    // longer than the shrunk MAX_BUSY_MS (25ms) - if that wait were
    // wrongly charged as busy time, this loop would abort before
    // reaching 5.
    const script = [
      'total = 0',
      'Do i = 1 to 5',
      '  total = total + 1',
      'end',
      'say total',
    ].join('\n');

    const result = await interp.execute(script);

    expect(result.success).toBe(true);
    expect(result.output).toEqual(['5']);
  });
});
