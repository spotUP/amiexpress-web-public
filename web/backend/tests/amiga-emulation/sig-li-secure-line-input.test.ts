/**
 * Regression: SIG_LI (XIM 912) secure line input must echo '*' for typed
 * characters, not the literal char (express.e:1543-1544 conPuts('*')),
 * write the entered string back into msg.string + reply data=1, and cap
 * input at 30 chars regardless of msg.data (express.e:1548).
 *
 * Earlier behaviour: SIG_LI was a stub in system-commands.ts that wrote
 * an empty string and replied 0, so any door using getPass2 received
 * an empty password and silently failed.
 */

import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';

describe('XIMIOHandler.handleSecureLineInput (SIG_LI / express.e:4205-4207)', () => {
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

  function buildMsg(prompt: string, maxLen = 50): any {
    return {
      msgAddr: 0xdead0000,
      command: 912, // SIG_LI
      data: maxLen,
      replyPort: 0,
      string: prompt,
    };
  }

  test('emits the prompt then echoes "*" for each typed char (not the literal char)', () => {
    const ctx = buildHandler();
    ctx.handler.handleSecureLineInput(buildMsg('Enter Password: '));

    // Prompt should have been emitted first (express.e:1517 aePuts(prompt)).
    expect(ctx.emits[0]).toEqual(['ansi-output', 'Enter Password: ']);

    // Feed three chars + Enter.
    (ctx.handler as any).queueInput('a');
    (ctx.handler as any).queueInput('B');
    (ctx.handler as any).queueInput('c');
    (ctx.handler as any).queueInput('\r');

    // Each typed visible char must echo as '*', not the literal ('a','B','c').
    const echoed = ctx.emits
      .filter(([ev]) => ev === 'ansi-output')
      .slice(1) // skip the prompt
      .map(([, payload]) => payload);
    expect(echoed).toEqual(['*', '*', '*']);

    // The buffer that goes back to the door must contain the real chars.
    const msgWrite = ctx.writes.find(w => w.kind === 'msg');
    expect(msgWrite?.value).toBe('aBc');

    // Reply data=1 on success (writeCommand carries the reply data here).
    expect(ctx.replyData).toBe(1);
  });

  test('caps input at 30 chars per express.e:1548 even when msg.data is larger', () => {
    const ctx = buildHandler();
    ctx.handler.handleSecureLineInput(buildMsg('PW: ', 200));

    // Type 35 chars, only first 30 should be captured.
    for (let i = 0; i < 35; i++) {
      (ctx.handler as any).queueInput('x');
    }
    (ctx.handler as any).queueInput('\r');

    const msgWrite = ctx.writes.find(w => w.kind === 'msg');
    expect(msgWrite?.value.length).toBe(30);
  });

  test('backspace erases last char and emits "\\b \\b"', () => {
    const ctx = buildHandler();
    ctx.handler.handleSecureLineInput(buildMsg('PW: '));

    (ctx.handler as any).queueInput('a');
    (ctx.handler as any).queueInput('b');
    (ctx.handler as any).queueInput('\b');
    (ctx.handler as any).queueInput('c');
    (ctx.handler as any).queueInput('\r');

    const msgWrite = ctx.writes.find(w => w.kind === 'msg');
    expect(msgWrite?.value).toBe('ac');

    const echoed = ctx.emits
      .filter(([ev]) => ev === 'ansi-output')
      .slice(1) // skip prompt
      .map(([, payload]) => payload);
    expect(echoed).toEqual(['*', '*', '\b \b', '*']);
  });

  test('after SIG_LI completes, a subsequent JH_LI echoes literal chars again (flag is cleared)', () => {
    const ctx = buildHandler();

    // First: SIG_LI session
    ctx.handler.handleSecureLineInput(buildMsg('PW: '));
    (ctx.handler as any).queueInput('s');
    (ctx.handler as any).queueInput('\r');

    // Now: JH_LI — must echo literal char, not '*'.
    const liMsg: any = {
      msgAddr: 0xbeef0000,
      command: 0, // JH_LI
      data: 50,
      replyPort: 0,
      string: '',
    };
    ctx.handler.handleLineInput(liMsg);

    const beforeEcho = ctx.emits.length;
    (ctx.handler as any).queueInput('Z');

    const newEmits = ctx.emits.slice(beforeEcho);
    const visible = newEmits
      .filter(([ev]) => ev === 'ansi-output')
      .map(([, payload]) => payload);
    expect(visible).toEqual(['Z']);
  });
});
