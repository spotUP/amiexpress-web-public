/**
 * express.e doorMsgSaveAccount (4570-4598) + saveAccount (8025-8077).
 *
 * A record whose slotNumber is 0 is saved at doorMsg.data with keys.number
 * forced to 0 (4579-4581); a record with its own slotNumber goes to THAT slot
 * whatever doorMsg.data says (4582-4584). The record is never renumbered.
 * Not ported on purpose: timeLimit/convertAccess after a self-save (4587-4597)
 * - the port derives time left from timeTotal/timeUsed, convertAccess is its
 * own ledger gap.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-saveacct-'));
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
  put(addr: number, buf: Buffer) { buf.forEach((b, i) => this.writeMemory(addr + i, b)); }
}

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

const layout = () => userFileManager.recordLayout();
const account = { username: 'door', location: 'x', securityLevel: 10, timesCalled: 1, created: new Date(0), lastLogin: new Date(0) } as never;

function save(recordSlot: number, msgData: number) {
  const emulator = new StubEmulator();
  const handler = new XIMSystemCommandsHandler(
    emulator as never,
    { replyMsg: jest.fn() } as never,
    { emit: jest.fn(), on: jest.fn() } as never,
    new XIMMessageParser(emulator as never),
    { user: { slotNumber: 99, username: 'caller' }, currentConf: 1, conferenceId: 1 },
    {} as never,
  );
  const user = userFileManager.userRecord(account, recordSlot);
  user.writeInt16BE(recordSlot, layout().slotNumberOffset);
  const keys = userFileManager.userKeysRecord(account, 7);
  emulator.put(USER_BUF, user);
  emulator.put(KEYS_BUF, keys);
  emulator.put(MISC_BUF, Buffer.alloc(layout().miscSize, 3));
  handler.handleAccountOrConf({ msgAddr: MSG, command: XIMCommand.SAVE_ACCOUNT, data: msgData, nodeId: 1, replyPort: 0, filler1: USER_BUF, filler2: KEYS_BUF, filler3: MISC_BUF });
  return emulator.readMemory32(MSG + DoorConstants.MESSAGE_DATA_OFFSET);
}

const slotOf = (file: string, size: number, off: number, slot: number, wide: boolean) => {
  const buf = fs.readFileSync(path.join(board, file));
  const at = (slot - 1) * size + off;
  return wide ? buf.readInt32BE(at) : buf.readInt16BE(at);
};

test('a record with slotNumber 0 is stored at the message slot, keeps slotNumber 0 and keys.number 0', () => {
  expect(save(0, 3)).toBe(1);
  const l = layout();
  expect(slotOf('user.data', l.userSize, l.slotNumberOffset, 3, false)).toBe(0);
  expect(slotOf('user.keys', l.keysSize, l.keysNumberOffset, 3, true)).toBe(0);
  expect(fs.statSync(path.join(board, 'user.misc')).size).toBe(3 * l.miscSize);
});

test('a record with its own slotNumber is stored there, not at the message slot', () => {
  expect(save(2, 5)).toBe(1);
  const l = layout();
  expect(slotOf('user.data', l.userSize, l.slotNumberOffset, 2, false)).toBe(2);
  expect(fs.statSync(path.join(board, 'user.data')).size).toBe(3 * l.userSize);
});
