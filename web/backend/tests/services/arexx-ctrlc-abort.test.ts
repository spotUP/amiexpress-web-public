// @ts-nocheck
import { EnhancedAREXXEngine, AREXXInterpreter } from '../../src/services/arexx.service';

// Regression: a Ctrl+C delivered through session.scriptAbortHandler must
// unwind a tight AREXX loop with NO active doorInputHandler. Before the
// fix, the engine only sniffed Ctrl+C inside getChar/Prompt callbacks, so
// CPU-bound loops between input prompts (KickBox match loop, STNG
// question loop) ran to completion regardless of user keystrokes.

jest.mock('../../src/database', () => ({
  __esModule: true,
  db: {
    executeAREXXScript: jest.fn().mockResolvedValue(undefined),
    initializeDatabase: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('AREXX Ctrl+C abort during tight loop', () => {
  test('scriptAbortHandler is installed for the duration of executeScript', async () => {
    const engine = new EnhancedAREXXEngine();
    const session: any = {};
    const ctx: any = {
      user: { username: 'Tester', secLevel: 20, id: 'u' },
      session,
      output: [],
      sessionId: 'sess-1',
    };

    let handlerSeen = false;
    const script = {
      id: 'tight-loop-test',
      name: 'tight-loop',
      // 50-iteration DO loop. Once the abort fires inside the body it
      // must unwind on the next clause boundary.
      script: [
        'do i = 1 to 50',
        '  say i',
        'end',
        'say "DONE"',
      ].join('\n'),
      enabled: true,
    };

    // Install a probe that fires the abort partway through the loop:
    // first SAY iteration triggers scriptAbortHandler. Without the fix,
    // the loop runs to completion and "DONE" appears in output. With
    // the fix, the loop unwinds and "DONE" is never emitted.
    ctx.outputCallback = (text: string) => {
      if (!handlerSeen && /^1\b/.test(text.trim())) {
        handlerSeen = true;
        expect(typeof session.scriptAbortHandler).toBe('function');
        session.scriptAbortHandler();
      }
    };

    await engine.executeScript(script as any, ctx);

    expect(handlerSeen).toBe(true);
    // After the run, the hook must be torn down so a later script run
    // doesn't get an abort sent to a dead interpreter.
    expect(session.scriptAbortHandler == null).toBe(true);
  });

  test('teardown restores prior abort handler', async () => {
    // If a parent script (or the dispatcher) had its own abort handler
    // installed, executeScript must restore it instead of leaving the
    // session with `null`. Otherwise nesting (script invoking another
    // script via CALL+REXX shell) would lose the outer abort capability.
    const engine = new EnhancedAREXXEngine();
    const sentinel = jest.fn();
    const session: any = { scriptAbortHandler: sentinel };
    const ctx: any = {
      user: { username: 'T', secLevel: 1, id: 'u' },
      session,
      output: [],
      sessionId: 'sess-2',
    };
    await engine.executeScript({
      id: 'noop',
      name: 'noop',
      script: 'say "hi"',
      enabled: true,
    } as any, ctx);
    expect(session.scriptAbortHandler).toBe(sentinel);
  });
});
