/**
 * A door's LOAD_CONFDB / SAVE_CONFDB move whole 74-byte confBase records,
 * and what a door saves is what the next join reads.
 *
 * express.e:3935-3939 (and 1477-1481): loadConfDB / saveConfDB copy
 * SIZEOF confBase - 74 bytes, axobjects.e:136-155 - at (account-1)*74, and a
 * save of the caller's own account is followed by loadMsgPointers(currentConf,1).
 * The port moved 64 bytes at (account-1)*64: every slot past the first was
 * read and written at the wrong offset, and the board's join read the
 * pointers from SQL, so a door's saved pointer was ignored anyway.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-confdb-'));
setBoardRoot(board);

jest.mock('../../src/database', () => ({
  db: { getUserById: jest.fn(async () => ({ slotNumber: 2 })) },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { XIMSystemCommandsHandler } = require('../../src/amiga-emulation/xim/system-commands');
const { XIMMessageParser } = require('../../src/amiga-emulation/xim/messages');
const { XIMCommand } = require('../../src/amiga-emulation/xim/types');
const mpfm = require('../../src/services/MessagePointerFileManager');
const { loadMsgPointers } = require('../../src/utils/message-pointers.util');
/* eslint-enable @typescript-eslint/no-var-requires */

const SIZE = 74;
const BUF = 0x9000;

class StubEmulator {
  private mem = new Map<number, number>();
  readMemory(a: number) { return this.mem.get(a) ?? 0; }
  writeMemory(a: number, v: number) { this.mem.set(a, v & 0xff); }
  readMemory16(a: number) { return (this.readMemory(a) << 8) | this.readMemory(a + 1); }
  readMemory32(a: number) { return ((this.readMemory16(a) << 16) | this.readMemory16(a + 2)) >>> 0; }
  writeMemory16(a: number, v: number) { this.writeMemory(a, v >> 8); this.writeMemory(a + 1, v); }
  writeMemory32(a: number, v: number) { this.writeMemory16(a, v >>> 16); this.writeMemory16(a + 2, v & 0xffff); }
  readString(a = 0, max = 200) { let s = ''; for (let i = 0; i < max; i++) { const b = this.readMemory(a + i); if (!b) break; s += String.fromCharCode(b); } return s; }
  bytes(a: number, n: number) { return Buffer.from(Array.from({ length: n }, (_, i) => this.readMemory(a + i))); }
  put(a: number, b: Buffer) { b.forEach((v, i) => this.writeMemory(a + i, v)); }
}

function recordWith(fields: Record<string, number>): Buffer {
  const rec = mpfm.deserializeConfBase(Buffer.alloc(SIZE));
  return mpfm.serializeConfBase({ ...rec, ...fields });
}

describe('LOAD_CONFDB / SAVE_CONFDB move whole confBase records', () => {
  let emulator: StubEmulator;
  let session: any;
  let handler: any;

  beforeEach(() => {
    fs.rmSync(path.join(board, 'Conf1'), { recursive: true, force: true });
    fs.mkdirSync(path.join(board, 'Conf1'), { recursive: true });
    const file = Buffer.alloc(SIZE * 3);
    recordWith({ confYM: 11, confRead: 12, ratio: 1 }).copy(file, 0);
    recordWith({ confYM: 21, confRead: 22, ratio: 5, ratioType: 2, messagesPosted: 9, active: 1 }).copy(file, SIZE);
    fs.writeFileSync(path.join(board, 'Conf1', 'Conf.DB'), file);

    emulator = new StubEmulator();
    session = { user: { slotNumber: 2 }, currentConf: 1, conferenceId: 1, lastMsgReadConf: 21, lastNewReadConf: 22 };
    handler = new XIMSystemCommandsHandler(
      emulator as never,
      { replyMsg: jest.fn() } as never,
      { emit: jest.fn(), on: jest.fn() } as never,
      new XIMMessageParser(emulator as never),
      session,
      {} as never,
    );
  });

  afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

  const msg = (command: number, slot: number) =>
    ({ msgAddr: 0x8000, command, data: slot, nodeId: 1, replyPort: 0, filler1: BUF, filler2: 0 });

  test('LOAD_CONFDB of slot 2 hands the door bytes 74..147, all 74 of them', () => {
    handler.handleAccountOrConf(msg(XIMCommand.LOAD_CONFDB, 2));

    const got = mpfm.deserializeConfBase(emulator.bytes(BUF, SIZE));
    expect(got.confYM).toBe(21);
    expect(got.ratio).toBe(5);
    expect(got.ratioType).toBe(2);
    expect(got.messagesPosted).toBe(9);
    expect(got.active).toBe(1);
  });

  test("SAVE_CONFDB writes slot 2 at offset 74, and the next join reads the door's pointers", async () => {
    emulator.put(BUF, recordWith({ confYM: 300, confRead: 301, ratio: 4 }));

    handler.handleAccountOrConf(msg(XIMCommand.SAVE_CONFDB, 2));

    const file = fs.readFileSync(path.join(board, 'Conf1', 'Conf.DB'));
    expect(file.length).toBe(SIZE * 3);
    const slot1 = mpfm.deserializeConfBase(file, 0);
    const slot2 = mpfm.deserializeConfBase(file, SIZE);
    expect(slot1.confYM).toBe(11); // the neighbour is untouched
    expect(slot2.confYM).toBe(300);
    expect(slot2.ratio).toBe(4);

    // express.e:3939 loadMsgPointers(currentConf,1): the session follows.
    expect(session.lastMsgReadConf).toBe(300);
    expect(session.lastNewReadConf).toBe(301);

    // The join's load (express.e:4882-4914) reads the record the door saved.
    const cb = await loadMsgPointers('caller', 1, 1);
    expect(cb.lastMsgReadConf).toBe(300);
    expect(cb.lastNewReadConf).toBe(301);
  });
});
