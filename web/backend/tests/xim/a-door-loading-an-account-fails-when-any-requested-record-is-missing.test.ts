/**
 * express.e doorMsgLoadAccount (4546-4569) + loadAccount (7977-8022).
 *
 * The caller's own slot always answers 1 (4557-4562). Any other slot answers
 * 1 only when loadAccount read EVERY record the door asked for: a short or
 * missing user.misc is RESULT_FAILURE even though user.data and user.keys
 * were read. The port answered 1 when ANY record loaded.
 * Kept (see system-commands.ts): the misc record of the caller's own slot is
 * the file's, where express.e copies loggedOnUserKeys over it (4560).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-loadacct-'));
process.env.BBS_DATA_DIR = board;
process.env.SKIP_DB_INIT = '1';

/* eslint-disable @typescript-eslint/no-var-requires */
const { XIMSystemCommandsHandler } = require('../../src/amiga-emulation/xim/system-commands');
const { XIMMessageParser } = require('../../src/amiga-emulation/xim/messages');
const { XIMCommand } = require('../../src/amiga-emulation/xim/types');
const { DoorConstants } = require('../../src/amiga-emulation/DoorTypes');
const { userFileManager } = require('../../src/services/UserFileManager');
/* eslint-enable @typescript-eslint/no-var-requires */

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
  readString() { return ''; }
  writeString() { /* unused */ }
}

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

function handlerFor(callerSlot: number) {
  const emulator = new StubEmulator();
  const handler = new XIMSystemCommandsHandler(
    emulator as never,
    { replyMsg: jest.fn() } as never,
    { emit: jest.fn(), on: jest.fn() } as never,
    new XIMMessageParser(emulator as never),
    { user: { slotNumber: callerSlot, username: 'caller' }, currentConf: 1, conferenceId: 1 },
    {} as never,
  );
  return { emulator, handler };
}

const load = (slot: number) =>
  ({ msgAddr: MSG, command: XIMCommand.LOAD_ACCOUNT, data: slot, nodeId: 1, replyPort: 0, filler1: USER_BUF, filler2: KEYS_BUF, filler3: MISC_BUF });

beforeEach(() => {
  const u = { username: 'other', location: 'x', securityLevel: 10, timesCalled: 1, created: new Date(0), lastLogin: new Date(0) } as never;
  fs.writeFileSync(path.join(board, 'user.data'), userFileManager.userRecord(u, 1));
  fs.writeFileSync(path.join(board, 'user.keys'), userFileManager.userKeysRecord(u, 1));
});

test('another slot answers 1 only when user.data, user.keys and user.misc all read', () => {
  fs.writeFileSync(path.join(board, 'user.misc'), Buffer.alloc(userFileManager.recordLayout().miscSize, 7));
  const { emulator, handler } = handlerFor(99);
  handler.handleAccountOrConf(load(1));
  expect(emulator.readMemory32(MSG + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(1);
});

test('a short user.misc answers 0 although user.data and user.keys were read', () => {
  fs.writeFileSync(path.join(board, 'user.misc'), Buffer.alloc(10));
  const { emulator, handler } = handlerFor(99);
  handler.handleAccountOrConf(load(1));
  expect(emulator.readMemory32(MSG + DoorConstants.MESSAGE_DATA_OFFSET)).toBe(0);
  expect(emulator.readMemory32(MSG + DoorConstants.MESSAGE_DATA_OFFSET)).not.toBe(1);
});
