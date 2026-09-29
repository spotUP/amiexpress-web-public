/**
 * A door's colour lasts until the door changes it - express.e's JH_SM is
 * aePuts(msg.string) and nothing else (3406-3411), so attributes carry from
 * one message to the next exactly as they would on the console.
 *
 * File Description 1.1 opens its frame with ESC[34m once and draws the rows
 * after it (`|-----|`, `|    |`) with no colour of their own. We appended
 * ESC[0m to every coloured message that ended in a newline (added for
 * AquaScan's "More?" prompt, which express.e prints uncoloured too), so those
 * rows came out white: "the frame is supposed to be blue" (sysop, 2026-09-29).
 */

import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';

describe('JH_SM leaves the door\'s colour alone (express.e:3406-3411)', () => {
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

  const sm = (text: string): any => ({ msgAddr: 0xdead0000, command: 4, data: 1, replyPort: 0, string: text });
  const wire = (ctx: ReturnType<typeof buildHandler>) =>
    ctx.emits.filter(([ev]) => ev === 'ansi-output').map(([, p]) => p).join('');

  test('a colour set in one message is still on in the next', () => {
    const ctx = buildHandler();
    ctx.handler.handleSendMessage(sm('\x1b[34m.------------.'));
    ctx.handler.handleSendMessage(sm('|------------|'));
    const out = wire(ctx);
    expect(out).toContain('\x1b[34m.------------.');
    expect(out).toContain('|------------|');
    expect(out).not.toContain('\x1b[0m');
  });

  test('a reset the door sends itself is passed on as sent', () => {
    const ctx = buildHandler();
    ctx.handler.handleSendMessage(sm('\x1b[33mhi\x1b[0m'));
    expect(wire(ctx).match(/\x1b\[0m/g)?.length).toBe(1);
  });
});
