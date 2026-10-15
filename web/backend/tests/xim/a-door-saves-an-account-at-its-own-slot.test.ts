/**
 * A door's LOAD_ACCOUNT / SAVE_ACCOUNT move whole user.data, user.keys and
 * user.misc records - and a door that saves slot 5 leaves slots 4 and 6 alone.
 *
 * express.e loadAccount (7977-8022) and saveAccount (8025-8077) move
 * SIZEOF user / userKeys / userMisc bytes at (slot-1)*SIZEOF: 232, 56 and
 * 248 (axobjects.e:11-99, slotNumber INT at 84 after a pad byte at 83). The
 * XIM door path stepped through the files at 239 / 54 / 256 and read and
 * wrote slotNumber at 83, so only slot 1 loaded right, and a door saving any
 * higher slot wrote across the neighbouring records.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-account-'));
process.env.BBS_DATA_DIR = board;
process.env.SKIP_DB_INIT = '1';

/* eslint-disable @typescript-eslint/no-var-requires */
const { XIMSystemCommandsHandler } = require('../../src/amiga-emulation/xim/system-commands');
const { XIMMessageParser } = require('../../src/amiga-emulation/xim/messages');
const { XIMProtocol } = require('../../src/amiga-emulation/XIMProtocol');
const { XIMCommand } = require('../../src/amiga-emulation/xim/types');
const { DoorConstants } = require('../../src/amiga-emulation/DoorTypes');
const { userFileManager } = require('../../src/services/UserFileManager');
/* eslint-enable @typescript-eslint/no-var-requires */

// axobjects.e SIZEOF user / userKeys / userMisc.
const USER = 232;
const KEYS = 56;
const MISC = 248;
const SLOTS = 7;
const MSG = 0x8000;
const USER_BUF = 0x9000;
const KEYS_BUF = 0x9400;
const MISC_BUF = 0x9800;

class StubEmulator {
  private mem = new Map<number, number>();
  readMemory(a: number) { return this.mem.get(a) ?? 0; }
  writeMemory(a: number, v: number) { this.mem.set(a, v & 0xff); }
  readMemory16(a: number) { return (this.readMemory(a) << 8) | this.readMemory(a + 1); }
  readMemory32(a: number) { return ((this.readMemory16(a) << 16) | this.readMemory16(a + 2)) >>> 0; }
  writeMemory16(a: number, v: number) { this.writeMemory(a, v >> 8); this.writeMemory(a + 1, v); }
  writeMemory32(a: number, v: number) { this.writeMemory16(a, v >>> 16); this.writeMemory16(a + 2, v & 0xffff); }
  readString(a = 0, max = 200) { let s = ''; for (let i = 0; i < max; i++) { const b = this.readMemory(a + i); if (!b) break; s += String.fromCharCode(b); } return s; }
  writeString() { /* unused */ }
  bytes(a: number, n: number) { return Buffer.from(Array.from({ length: n }, (_, i) => this.readMemory(a + i))); }
  put(a: number, b: Buffer) { b.forEach((v, i) => this.writeMemory(a + i, v)); }
}

/** Seven accounts written by the board's own serializer, misc as a byte pattern. */
function writeFixture(): { data: Buffer; keys: Buffer; misc: Buffer } {
  const data: Buffer[] = [];
  const keys: Buffer[] = [];
  const misc: Buffer[] = [];
  for (let n = 1; n <= SLOTS; n++) {
    const user = {
      username: `caller${n}`, location: `Town ${n}`, securityLevel: 10 * n, timesCalled: 100 + n,
      created: new Date(0), lastLogin: new Date(0),
    } as never;
    data.push(userFileManager.userRecord(user, n));
    keys.push(userFileManager.userKeysRecord(user, n));
    misc.push(Buffer.from(Array.from({ length: MISC }, (_, i) => (i * 7 + n * 13) & 0xff)));
  }
  const files = { data: Buffer.concat(data), keys: Buffer.concat(keys), misc: Buffer.concat(misc) };
  fs.writeFileSync(path.join(board, 'user.data'), files.data);
  fs.writeFileSync(path.join(board, 'user.keys'), files.keys);
  fs.writeFileSync(path.join(board, 'user.misc'), files.misc);
  return files;
}

const disk = () => ({
  data: fs.readFileSync(path.join(board, 'user.data')),
  keys: fs.readFileSync(path.join(board, 'user.keys')),
  misc: fs.readFileSync(path.join(board, 'user.misc')),
});

const record = (file: Buffer, size: number, slot: number) => file.subarray((slot - 1) * size, slot * size);

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

describe('LOAD_ACCOUNT / SAVE_ACCOUNT move whole user records', () => {
  let emulator: StubEmulator;
  let handler: any;
  let fixture: ReturnType<typeof writeFixture>;

  beforeEach(() => {
    fixture = writeFixture();
    emulator = new StubEmulator();
    handler = new XIMSystemCommandsHandler(
      emulator as never,
      { replyMsg: jest.fn() } as never,
      { emit: jest.fn(), on: jest.fn() } as never,
      new XIMMessageParser(emulator as never),
      { user: { slotNumber: 1 }, currentConf: 1, conferenceId: 1 },
      {} as never,
    );
  });

  const msg = (command: number, slot: number) =>
    ({ msgAddr: MSG, command, data: slot, nodeId: 1, replyPort: 0, filler1: USER_BUF, filler2: KEYS_BUF, filler3: MISC_BUF });

  test('a door loading slot 5 gets slot 5, all 232/56/248 bytes of it', () => {
    handler.handleAccountOrConf(msg(XIMCommand.LOAD_ACCOUNT, 5));

    expect(emulator.bytes(USER_BUF, USER)).toEqual(record(fixture.data, USER, 5));
    expect(emulator.bytes(KEYS_BUF, KEYS)).toEqual(record(fixture.keys, KEYS, 5));
    expect(emulator.bytes(MISC_BUF, MISC)).toEqual(record(fixture.misc, MISC, 5));
  });

  test('loading slot 5 and saving it back leaves all three files byte-for-byte unchanged', () => {
    handler.handleAccountOrConf(msg(XIMCommand.LOAD_ACCOUNT, 5));
    handler.handleAccountOrConf(msg(XIMCommand.SAVE_ACCOUNT, 5));

    const after = disk();
    expect(after.data.equals(fixture.data)).toBe(true);
    expect(after.keys.equals(fixture.keys)).toBe(true);
    expect(after.misc.equals(fixture.misc)).toBe(true);
  });

  test("a door's edit to slot 5 lands in slot 5 and slots 4 and 6 are untouched", () => {
    handler.handleAccountOrConf(msg(XIMCommand.LOAD_ACCOUNT, 5));
    // The door renames the caller's town (location[30] at 40) and sets the
    // lines per screen (lineLength, byte 230 - near the record's end, where a
    // 239-byte stride spills into the next caller's record).
    emulator.put(USER_BUF + 40, Buffer.from('Edited\0', 'latin1'));
    emulator.writeMemory(USER_BUF + 230, 30);
    handler.handleAccountOrConf(msg(XIMCommand.SAVE_ACCOUNT, 5));

    const after = disk();
    expect(after.data.length).toBe(fixture.data.length);
    for (const slot of [4, 6]) {
      expect(record(after.data, USER, slot)).toEqual(record(fixture.data, USER, slot));
      expect(record(after.keys, KEYS, slot)).toEqual(record(fixture.keys, KEYS, slot));
      expect(record(after.misc, MISC, slot)).toEqual(record(fixture.misc, MISC, slot));
    }
    expect(record(after.data, USER, 5).subarray(40, 47).toString('latin1')).toBe('Edited\0');
    expect(record(after.data, USER, 5).readInt16BE(84)).toBe(5);
    expect(record(after.data, USER, 5)[230]).toBe(30);
  });

  test('LAST_ACCOUNTNUM counts 232-byte records', () => {
    handler.handleAccountOrConf(msg(XIMCommand.LAST_ACCOUNTNUM, 0));
    // express.e findLastAccount: size / SIZEOF user = 7.
    expect(emulator.readMemory32(MSG + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(SLOTS);
  });
});

describe('the door dispatch reaches the shared record layout', () => {
  test("SAVE_ACCOUNT through XIMProtocol writes slot 5 with UserFileManager's layout", async () => {
    const fixture = writeFixture();
    const emulator = new StubEmulator();
    const protocol = new XIMProtocol(
      emulator as never,
      { replyMsg: jest.fn(), putMsg: jest.fn() } as never,
      { emit: jest.fn(), on: jest.fn() } as never,
      1,
      { nodeId: 1, doorCommand: 'ACCT', user: { slotNumber: 1 }, currentConf: 1, conferenceId: 1 },
    );
    const sentinel = jest.spyOn(userFileManager, 'recordLayout');

    // The jhMessage a 68K door puts on the port: full length, so filler3 counts.
    emulator.writeMemory16(MSG + DoorConstants.MESSAGE_LENGTH_OFFSET, DoorConstants.MESSAGE_FILLER3_OFFSET + 4);
    emulator.writeMemory32(MSG + DoorConstants.MESSAGE_COMMAND_OFFSET, XIMCommand.SAVE_ACCOUNT);
    emulator.writeMemory32(MSG + DoorConstants.MESSAGE_DATA_OFFSET, 5);
    emulator.writeMemory32(MSG + DoorConstants.MESSAGE_FILLER1_OFFSET, USER_BUF);
    emulator.writeMemory32(MSG + DoorConstants.MESSAGE_FILLER2_OFFSET, KEYS_BUF);
    emulator.writeMemory32(MSG + DoorConstants.MESSAGE_FILLER3_OFFSET, MISC_BUF);
    const edited = Buffer.from(record(fixture.data, USER, 5));
    edited.write('Door was here\0', 40, 'latin1');
    emulator.put(USER_BUF, edited);
    emulator.put(KEYS_BUF, record(fixture.keys, KEYS, 5));
    emulator.put(MISC_BUF, record(fixture.misc, MISC, 5));

    await protocol.handleMessage(protocol.parseMessage(MSG));

    expect(sentinel).toHaveBeenCalled();
    const after = disk();
    expect(record(after.data, USER, 5)).toEqual(edited);
    expect(record(after.data, USER, 4)).toEqual(record(fixture.data, USER, 4));
    expect(record(after.data, USER, 6)).toEqual(record(fixture.data, USER, 6));
    expect(after.keys.equals(fixture.keys)).toBe(true);
    expect(after.misc.equals(fixture.misc)).toBe(true);
    sentinel.mockRestore();
  });
});
