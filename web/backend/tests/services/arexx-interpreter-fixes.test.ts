// @ts-nocheck
/**
 * Regression tests for the AREXX TS interpreter fixes shipped 2026-05-11
 * during the Sent_FE → Jdn-Csent door chain bring-up. Each test pins
 * exactly one prior bug so a future change can't silently regress it.
 *
 * The fixes covered here:
 *   1. CALL <label> recursion is bounded (was unbounded → OOM)
 *   2. Bare-symbol clause is routed through ADDRESS aliases when the
 *      symbol resolves to a known host command (e.g. `GC=getchar; gc;`
 *      now actually invokes GETCHAR)
 *   3. `IF expr; THEN action;` (stray ; between expr and THEN) is
 *      re-stitched before execution (was throwing "Invalid IF statement")
 *   4. PROMPT / QUERY accumulates a CR-terminated line (was returning
 *      on first character, breaking line-input doors)
 *   5. TRIM builtin exists and aliases STRIP(s, 'B')
 *
 * Each test runs the TS interpreter in isolation (no MOIRA, no BBS
 * session). Mock session pumps single-char inputs to doorInputHandler
 * the same way the central socket router does.
 */

process.env.SKIP_DB_INIT = '1';
import { AREXXInterpreter } from '../../src/services/arexx.service';

function makeCtx(opts?: { inputs?: string[]; deleteHandlerPerChar?: boolean }) {
  const session: any = { doorInputHandler: undefined, user: { username: 'sysop' }, currentConf: 1 };
  let pumpCount = 0;
  const inputs = opts?.inputs ?? [];
  // GETCHAR vs PROMPT have different handler-lifecycle semantics:
  //   - GETCHAR consumes ONE char and deletes the handler on the way out.
  //     Test pump must restore-handler-or-poll for the next call.
  //   - PROMPT keeps the handler set across many chars, deleting itself
  //     only on CR/Ctrl+C. Test pump must NOT delete from outside.
  // Default = PROMPT-style (don't delete from outside, just call).
  const deleteOnCall = opts?.deleteHandlerPerChar ?? false;
  const pump = setInterval(() => {
    if (session.doorInputHandler && pumpCount < inputs.length) {
      const ch = inputs[pumpCount++];
      const h = session.doorInputHandler;
      if (deleteOnCall) delete session.doorInputHandler;
      h(ch);
    }
  }, 1);
  const output: string[] = [];
  const ctx: any = {
    session,
    user: { username: 'sysop', secLevel: 255, id: 1 },
    socket: { emit: () => {} },
    output: (text: string) => { output.push(text); },
    parameters: [],
  };
  return { ctx, output, stop: () => clearInterval(pump) };
}

async function run(script: string, opts?: { inputs?: string[]; deleteHandlerPerChar?: boolean }): Promise<{ success: boolean; output: string; error?: string }> {
  const { ctx, output, stop } = makeCtx(opts);
  try {
    const interp = new AREXXInterpreter(ctx, []);
    const r = await interp.execute(script);
    return { success: r.success, output: output.join(''), error: r.error };
  } finally {
    stop();
  }
}

describe('AREXX interpreter — 2026-05-11 fixes', () => {
  test('CALL <label> recursion is bounded (max-depth, no OOM)', async () => {
    // Build a script that recurses through `call abfrage` forever the
    // way Jdn-Csent.rexx does. Pre-fix: ran unbounded, OOM'd v8 at 4 GB.
    // Post-fix: throws "Maximum recursion depth exceeded" cleanly.
    const script = `abfrage:; call abfrage`;
    const r = await run(script);
    expect(r.success).toBe(false);
    expect(r.error || '').toMatch(/Maximum recursion depth exceeded/);
  }, 15000);

  test('Bare-symbol clause is dispatched via ADDRESS when variable resolves to a host command name', async () => {
    // `GC = getchar` sets GC = the literal string "GETCHAR". A bare
    // `gc;` clause must then evaluate `gc`, see it resolves to a known
    // host command, and dispatch. Pre-fix it was a no-op statement.
    // We verify by checking that GETCHAR's effect (consume one input
    // char into RESULT) actually happens. Test pumps a single 'x'.
    const script = `
      GC = getchar
      gc
      say "got=" || result
    `;
    const r = await run(script, { inputs: ['x'], deleteHandlerPerChar: true });
    expect(r.success).toBe(true);
    expect(r.output).toMatch(/got=x/);
  }, 8000);

  test('IF expr; THEN action is re-stitched (stray semicolon tolerated)', async () => {
    // Pre-fix: preprocessor split on ; → "IF 1=1" + "THEN say 'ok'"
    // → executeIf saw the orphan IF and threw "Invalid IF statement".
    // Post-fix: preprocessor rejoins dangling IF with following THEN.
    // (Real-world: Jdn-Csent's `IF Open(DF,cfg); THEN DO;` line.)
    const script = `IF 1=1; THEN say "ok"`;
    const r = await run(script);
    expect(r.success).toBe(true);
    expect(r.output).toContain('ok');
  });

  test('PROMPT / QUERY accumulates a CR-terminated line', async () => {
    // Pre-fix: Prompt returned on first character. Pumping 'h','e','l',
    // 'l','o','\r' would yield "h" instead of "hello". Post-fix it
    // accumulates until CR.
    const script = `
      QUERY
      say "line=[" || result || "]"
    `;
    const r = await run(script, { inputs: ['h', 'e', 'l', 'l', 'o', '\r'] });
    expect(r.success).toBe(true);
    expect(r.output).toMatch(/line=\[hello\]/);
  }, 8000);

  test('TRIM is callable from script via the function dispatcher', async () => {
    // AREXXFunctions is module-private; reachability from a script via
    // the function dispatcher is the contract that matters for shipped
    // doors (Jdn-Csent.rexx: `oehh = TRIM(Result)`).
    const script = `
      x = trim("  abc  ")
      y = trim("---foo---", "-")
      say "[" || x || "][" || y || "]"
    `;
    const r = await run(script);
    expect(r.success).toBe(true);
    expect(r.output).toMatch(/\[abc\]\[foo\]/);
  });
});
