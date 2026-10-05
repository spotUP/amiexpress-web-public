/**
 * A door that does the reading can advance the caller's read pointer.
 *
 * SUBS reads the message base off the disk itself so it runs on a real Amiga,
 * and ships an `R.info` override so it can replace the `R` command outright.
 * Once it does, nothing advances the pointer: express.e's writers are all
 * board-side readers (`readit` at :12370/:12376, the ASCII/QWK dumps at
 * :26493/:26725), and there is no command a door can send. Every message then
 * reads as new for ever - which is exactly what the live board showed on
 * 2026-09-13: `103 messages here. 103 new for you.`, with every pointer in
 * `conf_base` sitting at 0.
 *
 * AEW_SETPOINTER is the extension that closes it, and these are its rules.
 * The degradation contract is the important one: the request is a WRITE
 * (data 0), and an AmiExpress that has never heard of the command replies
 * with data unchanged - also 0. So `1` means stored and `0` means "you are
 * talking to a board that will not do this", with no version check, and SUBS
 * keeps working either way.
 */
process.env.SKIP_DB_INIT = '1';

const loadMsgPointers = jest.fn();
const saveMsgPointers = jest.fn();
jest.mock('../../src/utils/message-pointers.util', () => ({
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
  loadMsgPointers: (...a: unknown[]) => loadMsgPointers(...a),
  saveMsgPointers: (...a: unknown[]) => saveMsgPointers(...a),
}));

import { handleSetPointer } from '../../src/amiga-emulation/xim/msgpointer';
import { isIOCommand } from '../../src/amiga-emulation/xim/command-classes';

/** A session in a conference, with pointers where the board left them. */
function sessionAt(lastRead: number, lastScanned: number) {
  return {
    user: { id: 'u-1' },
    currentConf: 3,
    currentMsgBase: 1,
    lastMsgReadConf: lastRead,
    lastNewReadConf: lastScanned,
  };
}

describe('a door setting the caller read pointer', () => {
  beforeEach(() => {
    loadMsgPointers.mockReset();
    saveMsgPointers.mockReset();
    loadMsgPointers.mockResolvedValue({
      userId: 'u-1', conferenceId: 3, messageBaseId: 1,
      lastMsgReadConf: 0, lastNewReadConf: 0,
    });
    saveMsgPointers.mockResolvedValue(undefined);
  });

  it('stores the manual read pointer and says it did', async () => {
    const session = sessionAt(0, 0);

    await expect(handleSetPointer('READ 42', session)).resolves.toBe(1);

    expect(session.lastMsgReadConf).toBe(42);
    expect(saveMsgPointers).toHaveBeenCalledTimes(1);
    expect(saveMsgPointers.mock.calls[0][0]).toMatchObject({ lastMsgReadConf: 42 });
  });

  it('stores the scan pointer separately from the read pointer', async () => {
    const session = sessionAt(0, 0);

    await expect(handleSetPointer('SCAN 7', session)).resolves.toBe(1);

    expect(session.lastNewReadConf).toBe(7);
    expect(session.lastMsgReadConf).toBe(0);
    expect(saveMsgPointers.mock.calls[0][0]).toMatchObject({ lastNewReadConf: 7 });
  });

  it('carries the OTHER pointer through untouched', async () => {
    // conference.handler copies session -> confBase on join. If this handler
    // wrote only its own field, the next join would put the stale value back
    // over it and the door's work would silently vanish.
    const session = sessionAt(90, 12);

    await expect(handleSetPointer('READ 99', session)).resolves.toBe(1);

    expect(saveMsgPointers.mock.calls[0][0]).toMatchObject({
      lastMsgReadConf: 99,
      lastNewReadConf: 12,
    });
  });

  it('only ever moves a pointer FORWARD', async () => {
    // express.e never assigns plainly: it is
    // `IF(msgNum>lastMsgReadConf) THEN lastMsgReadConf:=msgNum`
    // (express.e:12370). A door walking the list backwards, or re-reading an
    // old message, must not un-read everything after it.
    const session = sessionAt(200, 0);

    await expect(handleSetPointer('READ 5', session)).resolves.toBe(1);

    expect(session.lastMsgReadConf).toBe(200);
    expect(saveMsgPointers.mock.calls[0][0]).toMatchObject({ lastMsgReadConf: 200 });
  });

  describe('refusing, which the door treats exactly like an old board', () => {
    it.each([
      ['a verb it does not know', 'MARK 5'],
      ['no verb at all', ''],
      ['a missing number', 'READ'],
      ['a number that is not one', 'READ abc'],
      ['a negative pointer', 'READ -1'],
      ['a fractional pointer', 'READ 4.5'],
    ])('answers 0 for %s', async (_why, request) => {
      await expect(handleSetPointer(request, sessionAt(0, 0))).resolves.toBe(0);
      expect(saveMsgPointers).not.toHaveBeenCalled();
    });

    it('answers 0 when nobody is logged on', async () => {
      await expect(handleSetPointer('READ 5', { currentConf: 3, currentMsgBase: 1 })).resolves.toBe(0);
      expect(saveMsgPointers).not.toHaveBeenCalled();
    });

    it('answers 0 outside a conference', async () => {
      const session = { user: { id: 'u-1' }, currentConf: 0, currentMsgBase: 1 };
      await expect(handleSetPointer('READ 5', session)).resolves.toBe(0);
      expect(saveMsgPointers).not.toHaveBeenCalled();
    });

    it('answers 0 rather than throwing when the board cannot write', async () => {
      // A door must never hang or die because a pointer would not store. 0
      // leaves it in the state a real AmiExpress would, which it handles.
      saveMsgPointers.mockRejectedValue(new Error('database is locked'));

      await expect(handleSetPointer('READ 5', sessionAt(0, 0))).resolves.toBe(0);
    });
  });

  it('takes the verb in any case, like every other XIM text verb', async () => {
    await expect(handleSetPointer('read 3', sessionAt(0, 0))).resolves.toBe(1);
  });
});

/**
 * The handler above is unreachable unless XIMProtocol ROUTES 10300.
 *
 * That is the step this board has forgotten twice, and its own source says so:
 * AEW_THEME was implemented in xim/data-query.ts and left out of
 * `isDataQueryCommand`, so THEMEC got "UNHANDLED COMMAND: 10100" and drew
 * every theme in the classic palette. The handler was fine; the route was
 * missing. So this drives `handleMessage` - the entry point AmigaDoorSession
 * calls - and asserts what the DOOR gets back.
 */
describe('AEW_SETPOINTER, through the door entry point', () => {
  const { XIMProtocol } = require('../../src/amiga-emulation/XIMProtocol');
  const { XIMCommand } = require('../../src/amiga-emulation/xim/types');

  /** Memory the message and its embedded string live in, addressed as a door does. */
  function makeEmulator() {
    const mem = new Map<number, number>();
    return {
      mem,
      readMemory8: (a: number) => mem.get(a) ?? 0,
      writeMemory8: (a: number, v: number) => { mem.set(a, v & 0xff); },
      readMemory: (a: number) => mem.get(a) ?? 0,
      writeMemory: (a: number, v: number) => { mem.set(a, v & 0xff); },
      readMemory16: () => 0,
      writeMemory16: () => undefined,
      readMemory32: () => 0,
      writeMemory32: () => undefined,
      readString: (addr: number, max = 64) => {
        let out = '';
        for (let i = 0; i < max; i++) {
          const b = mem.get(addr + i) ?? 0;
          if (b === 0) break;
          out += String.fromCharCode(b);
        }
        return out;
      },
      writeString: (addr: number, text: string) => {
        for (let i = 0; i < text.length; i++) mem.set(addr + i, text.charCodeAt(i));
        mem.set(addr + text.length, 0);
      },
    } as any;
  }

  function makeProtocol(session: Record<string, unknown>) {
    const emulator = makeEmulator();
    const execLibrary = { replyMsg: jest.fn() } as any;
    const socket = { emit: jest.fn(), on: jest.fn() } as any;
    const protocol = new XIMProtocol(emulator, execLibrary, socket, 1, {
      nodeId: 1, doorCommand: 'SUBS', ...session,
    } as any);
    return { protocol, emulator, execLibrary };
  }

  /** A WRITE: data 0, which is also what an old board replies. */
  function setPointer(text: string) {
    return {
      command: XIMCommand.AEW_SETPOINTER,
      data: 0,
      msgAddr: 0x1000,
      string: text,
      replyPort: 0x2000,
    } as any;
  }

  it('is routed, which is the step that gets forgotten', () => {
    const { protocol } = makeProtocol({});
    // Same move as `isDataQueryCommand`: the classifier is a function now.
    const isIO = isIOCommand;

    expect(isIO(XIMCommand.AEW_SETPOINTER)).toBe(true);
  });

  it('answers the door instead of falling through to UNHANDLED COMMAND', async () => {
    const { protocol, execLibrary } = makeProtocol({
      user: { id: 'u-1' }, currentConf: 1, currentMsgBase: 1,
      lastMsgReadConf: 0, lastNewReadConf: 0,
    });

    await protocol.handleMessage(setPointer('READ 12'));

    expect(execLibrary.replyMsg).toHaveBeenCalled();
  });

  it('moves the pointer the door named', async () => {
    const session: Record<string, unknown> = {
      user: { id: 'u-1' }, currentConf: 1, currentMsgBase: 1,
      lastMsgReadConf: 0, lastNewReadConf: 0,
    };
    const { protocol } = makeProtocol(session);

    await protocol.handleMessage(setPointer('READ 12'));

    // bbsSession is the object passed in, so the door's work is visible to
    // every other reader in the process - which is the whole point.
    expect((protocol as any).bbsSession.lastMsgReadConf).toBe(12);
  });
});
