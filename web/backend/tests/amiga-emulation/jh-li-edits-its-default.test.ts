/**
 * JH_LI's string is the line's DEFAULT, not a prompt: express.e lineInput
 * (2202-2204) copies it into the edit buffer, prints it, and puts the cursor
 * after it - so backspace erases it and Enter returns it unchanged.
 *
 * File Description 1.1's "Change Tagline" (sysop, 2026-09-29: "i cant erase
 * the placeholder fully") sends JH_LI data=44 with the current tagline. We
 * printed it but started the buffer empty: backspace stopped at the old text,
 * and Enter would have handed the door an empty tagline.
 */

import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';

describe('JH_LI edits the default it is given (express.e:2202-2204)', () => {
  jest.setTimeout(5000);

  function buildHandler() {
    const emits: Array<[string, string]> = [];
    let paused = false;

    const socket: any = {
      emit: (ev: string, payload: string) => {
        emits.push([ev, payload]);
        return true;
      },
    };

    const writes: Array<{ kind: 'msg' | 'string'; addr: number; value: string }> = [];
    let replyData: number | null = null;

    const emulator: any = {
      pause: () => { paused = true; },
      resume: () => { paused = false; },
      readMemory: () => 0,
      readMemory32: () => 0,
      writeMemory: () => {},
    };

    const execLibrary: any = {
      replyMsg: () => {},
      putMsg: () => {},
    };

    const messageParser: any = {
      writeCommand: () => {},
      writeMessageString: (addr: number, value: string) => {
        writes.push({ kind: 'msg', addr, value });
      },
      writeString: (addr: number, value: string) => {
        writes.push({ kind: 'string', addr, value });
      },
      writeData: (_addr: number, value: number) => { replyData = value; },
      getCommandName: (_cmd: number) => 'SIG_LI',
    };

    const state: any = {
      registered: true,
      shuttingDown: false,
      nonStopText: false,
      autoPauseEnabled: false,
      lineCount: 0,
      lineWrap: 0,
      pauseLines: 24,
      language: '',
      confAccess: '',
      carrierDropped: false,
      rawArrow: false,
      transfering: false,
      doorSilent: false,
      usedXimInput: false,
    };

    const bbsSession: any = { user: { secLevel: 100 } };

    const handler = new XIMIOHandler(
      emulator,
      execLibrary,
      socket,
      messageParser,
      state,
      bbsSession,
    );
    // Stub the memory-backed prompt extraction for test simplicity.
    (handler as any).getMessageString = (m: any) => m.string || '';

    return {
      handler,
      emits,
      writes,
      get replyData() { return replyData; },
      get paused() { return paused; },
      state,
    };
  }

  const lineInput = (text: string, maxLen = 44): any => ({
    msgAddr: 0xdead0000, command: 0, data: maxLen, replyPort: 0, string: text,
  });
  const returned = (ctx: ReturnType<typeof buildHandler>) => ctx.writes.find((w) => w.kind === 'msg')?.value;

  test('Enter alone returns the default unchanged', () => {
    const ctx = buildHandler();
    ctx.handler.handleLineInput(lineInput('[---( spot )---]'));
    (ctx.handler as any).queueInput('\r');
    expect(returned(ctx)).toBe('[---( spot )---]');
    expect(ctx.replyData).toBe(1);
  });

  test('backspace erases the default, all the way, and no further', () => {
    const ctx = buildHandler();
    ctx.handler.handleLineInput(lineInput('abc'));
    for (let i = 0; i < 5; i++) (ctx.handler as any).queueInput('\x7f');
    (ctx.handler as any).queueInput('X');
    (ctx.handler as any).queueInput('\r');
    expect(returned(ctx)).toBe('X');
    const erases = ctx.emits.filter(([, p]) => p === '\b \b').length;
    expect(erases).toBe(3);
  });

  test('typing appends to the default, up to the door\'s length', () => {
    const ctx = buildHandler();
    ctx.handler.handleLineInput(lineInput('abc', 5));
    for (const ch of 'defg') (ctx.handler as any).queueInput(ch);
    (ctx.handler as any).queueInput('\r');
    expect(returned(ctx)).toBe('abcde');
  });

  test('a key no Amiga can hold is not stored, so backspace never erases past the line', () => {
    // Live 2026-09-29: Option-key characters (U+2260, U+2265) were stored but
    // not echoed; each later backspace ate a cell of the prompt.
    const ctx = buildHandler();
    ctx.handler.handleLineInput(lineInput('ab'));
    for (const ch of ['\u2260', '\u2265', '\u220e', '\x1b[A', '\x1b[D']) (ctx.handler as any).queueInput(ch);
    for (let i = 0; i < 10; i++) (ctx.handler as any).queueInput('\x7f');
    (ctx.handler as any).queueInput('\r');
    expect(returned(ctx)).toBe('');
    expect(ctx.emits.filter(([, p]) => p === '\b \b').length).toBe(2);
  });

  test('a Latin-1 letter is stored and echoed, as a byte the Amiga has', () => {
    const ctx = buildHandler();
    ctx.handler.handleLineInput(lineInput(''));
    (ctx.handler as any).queueInput('\u00e5');
    (ctx.handler as any).queueInput('\r');
    expect(returned(ctx)).toBe('\u00e5');
    expect(ctx.emits.some(([, p]) => p === '\u00e5')).toBe(true);
  });

  test('a temp-file path is shown as a prompt, never handed back as the answer', () => {
    const ctx = buildHandler();
    ctx.handler.handleLineInput(lineInput('RAM:list.txt', 40));
    (ctx.handler as any).queueInput('\r');
    expect(returned(ctx)).toBe('');
  });
});
