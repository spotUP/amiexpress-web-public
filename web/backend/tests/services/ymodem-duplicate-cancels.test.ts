/**
 * YMODEM asks the same question ZMODEM does, and gets a blunter answer.
 *
 * P3-4, transfer row 2. express calls `dupe_check` on the name in the YMODEM
 * header block (xymodem.e:1082) and, when the board already has the file,
 * calls `xmodem_cancel` and stops (xymodem.e:1084). It cannot do what ZMODEM
 * does - there is no ZSKIP in YMODEM, so the batch ends rather than the file
 * being passed over.
 *
 * This port asked nothing at all: every byte arrived and the duplicate was
 * found afterwards.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { YmodemTransferManager } from '../../src/services/ymodem-transfer.service';

const SOH = 0x01;
const ACK = 0x06;
const CAN = 0x18;

/** CRC16-CCITT, the same one the manager checks blocks with. */
function crc16(data: Buffer): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/** A YMODEM block 0: the filename, a NUL, the size, and a CRC. */
function headerBlock(filename: string, size: number): Buffer {
  const payload = Buffer.alloc(128);
  const info = Buffer.from(`${filename}\x00${size} 0 0 0 1 ${size}`, 'latin1');
  info.copy(payload, 0, 0, Math.min(info.length, payload.length));
  const crc = crc16(payload);
  return Buffer.concat([
    Buffer.from([SOH, 0x00, 0xff]),
    payload,
    Buffer.from([(crc >> 8) & 0xff, crc & 0xff]),
  ]);
}

let dir = '';

function makeManager(isDuplicate: (name: string) => boolean | Promise<boolean>) {
  const wire: Buffer[] = [];
  const refused: string[] = [];
  const manager = new YmodemTransferManager({
    use1kBlocks: true,
    isDuplicate,
    onDuplicate: (name: string) => { refused.push(name); },
  });
  manager.setSendCallback((data: Buffer) => { wire.push(Buffer.from(data)); });
  return { manager, wire, refused };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const bytes = (wire: Buffer[]): number[] => [...Buffer.concat(wire)];

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ymodem-dupe-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ } });

describe('a file the board already has', () => {
  it('cancels the batch instead of receiving it - xymodem.e:1084', async () => {
    const { manager, wire, refused } = makeManager((name) => name === 'DUPE.LHA');
    await manager.startReceive(dir);
    wire.length = 0; // the 'C' that opens the receive

    manager.handleInput(headerBlock('DUPE.LHA', 4096));
    await flush();

    expect(refused).toEqual(['DUPE.LHA']);
    // express sends eight CANs, not two - a cancel a client misses leaves the
    // transfer hanging until it times out.
    expect(bytes(wire).filter((b) => b === CAN).length).toBe(8);
    // ...and block 0 is never ACKed, so no data is asked for.
    expect(bytes(wire)).not.toContain(ACK);
  });

  it('writes nothing to the receive directory', async () => {
    const { manager } = makeManager(() => true);
    await manager.startReceive(dir);

    manager.handleInput(headerBlock('DUPE.LHA', 4096));
    await flush();

    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('a file the board does not have', () => {
  it('is ACKed and the transfer goes on', async () => {
    const { manager, wire, refused } = makeManager(() => false);
    await manager.startReceive(dir);
    wire.length = 0;

    manager.handleInput(headerBlock('NEW.LHA', 4096));
    await flush();

    expect(refused).toEqual([]);
    expect(bytes(wire)).toContain(ACK);
    expect(bytes(wire).filter((b) => b === CAN).length).toBe(0);
  });

  it('is accepted when the rule itself fails', async () => {
    const { manager, wire } = makeManager(() => { throw new Error('database down'); });
    await manager.startReceive(dir);
    wire.length = 0;

    manager.handleInput(headerBlock('NEW.LHA', 4096));
    await flush();

    expect(bytes(wire)).toContain(ACK);
    expect(bytes(wire).filter((b) => b === CAN).length).toBe(0);
  });
});

describe('a board with no rule at all', () => {
  it('behaves exactly as it did before - everything is accepted', async () => {
    const wire: Buffer[] = [];
    const manager = new YmodemTransferManager({ use1kBlocks: true });
    manager.setSendCallback((data: Buffer) => { wire.push(Buffer.from(data)); });
    await manager.startReceive(dir);
    wire.length = 0;

    manager.handleInput(headerBlock('ANY.LHA', 128));
    await flush();

    expect(bytes(wire)).toContain(ACK);
  });
});
