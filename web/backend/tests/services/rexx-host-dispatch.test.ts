// @ts-nocheck
/**
 * #78 Phase 4-skeleton — host-command parser + dispatch registry.
 */

import {
  parseHostCommand,
  dispatchHostCommand,
  dispatchHostCommandLine,
  registerHostCommand,
  unregisterHostCommand,
  hasHostCommand,
  _resetHostCommandRegistry,
} from '../../src/services/arexx/rexx-host-dispatch';

describe('parseHostCommand — RexxMast host-line tokeniser', () => {
  test('uppercase command name + tokenised args', () => {
    const p = parseHostCommand('bbswrite hello world');
    expect(p.name).toBe('BBSWRITE');
    expect(p.args).toEqual(['hello', 'world']);
  });

  test("preserves embedded whitespace inside double quotes", () => {
    const p = parseHostCommand('BBSWRITE "hello there world"');
    expect(p.args).toEqual(['hello there world']);
  });

  test('preserves embedded whitespace inside single quotes', () => {
    const p = parseHostCommand("BBSWRITE 'hello there'");
    expect(p.args).toEqual(['hello there']);
  });

  test("doubled quote inside same-quoted token = literal quote (REXX convention)", () => {
    const p = parseHostCommand("OUTSTR 'it''s ok'");
    expect(p.args).toEqual(["it's ok"]);
  });

  test('mixed quoted + unquoted', () => {
    const p = parseHostCommand('BBSLOG INFO "user joined conf 5"');
    expect(p.name).toBe('BBSLOG');
    expect(p.args).toEqual(['INFO', 'user joined conf 5']);
  });

  test('empty line produces empty name + empty args', () => {
    const p = parseHostCommand('');
    expect(p.name).toBe('');
    expect(p.args).toEqual([]);
  });

  test('whitespace-only line treated as empty', () => {
    const p = parseHostCommand('   \t  ');
    expect(p.name).toBe('');
    expect(p.args).toEqual([]);
  });

  test('raw is preserved verbatim', () => {
    const p = parseHostCommand('  BBSREAD  ');
    expect(p.raw).toBe('  BBSREAD  ');
  });
});

describe('dispatchHostCommand — registry routing', () => {
  beforeEach(() => {
    _resetHostCommandRegistry();
  });

  test('unknown command returns ERROR (result1=10) with descriptive message', async () => {
    const r = await dispatchHostCommand({ name: 'NOPE', args: [], raw: 'nope' }, { output: [] });
    expect(r.result1).toBe(10);
    expect(r.resultString).toMatch(/unknown command: NOPE/);
  });

  test('empty command line returns 5 + descriptive message', async () => {
    const r = await dispatchHostCommandLine('', { output: [] });
    expect(r.result1).toBe(5);
    expect(r.resultString).toMatch(/empty command line/);
  });

  test('handler exception becomes result1=20 SEVERE', async () => {
    registerHostCommand('CRASH', async () => { throw new Error('boom'); });
    const r = await dispatchHostCommandLine('crash', { output: [] });
    expect(r.result1).toBe(20);
    expect(r.resultString).toMatch(/CRASH failed: boom/);
  });

  test('custom handler is dispatched + result is returned verbatim', async () => {
    registerHostCommand('PING', async (args) => ({
      result1: 0,
      resultString: `pong:${args.join(',')}`,
    }));
    const r = await dispatchHostCommandLine('ping a b c', { output: [] });
    expect(r.result1).toBe(0);
    expect(r.resultString).toBe('pong:a,b,c');
  });

  test('case-insensitive registration + lookup', () => {
    registerHostCommand('mixedCase', async () => ({ result1: 0 }));
    expect(hasHostCommand('MIXEDCASE')).toBe(true);
    expect(hasHostCommand('mixedcase')).toBe(true);
    unregisterHostCommand('MixedCase');
    expect(hasHostCommand('mixedcase')).toBe(false);
  });

  test('default registry includes core BBS commands', () => {
    // Phase 4-skeleton ships a representative subset; phase 4-real
    // adds the full set. The contract: BBSWRITE / BBSREAD / OUTSTR /
    // GETCHAR / GC / BBSLOG must always be registered as the BBS
    // commands every classic AmiExpress AREXX script uses.
    expect(hasHostCommand('BBSWRITE')).toBe(true);
    expect(hasHostCommand('BBSREAD')).toBe(true);
    expect(hasHostCommand('OUTSTR')).toBe(true);
    expect(hasHostCommand('GETCHAR')).toBe(true);
    expect(hasHostCommand('GC')).toBe(true);
    expect(hasHostCommand('BBSLOG')).toBe(true);
  });

  test('_resetHostCommandRegistry restores defaults', () => {
    registerHostCommand('TEMP', async () => ({ result1: 0 }));
    expect(hasHostCommand('TEMP')).toBe(true);
    _resetHostCommandRegistry();
    expect(hasHostCommand('TEMP')).toBe(false);
    expect(hasHostCommand('BBSWRITE')).toBe(true);
  });
});
