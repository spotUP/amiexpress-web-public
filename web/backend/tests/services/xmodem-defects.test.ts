/**
 * Three defects in XMODEM/YMODEM, now that a caller can actually reach them.
 *
 * These were unreachable code until the protocol menu was wired up, so none of
 * it had ever run against a real client. Each is checked against xymodem.e
 * rather than taken from the audit - two of the audit's transfer findings did
 * not survive that check (see the commit message).
 *
 *   cancel        xymodem.e:309-326 sends EIGHT CANs and then ten 0x02 bytes;
 *                 this sent two. One or two CANs get swallowed by a noisy line
 *                 or a receiver mid-block, and a cancel the client never sees
 *                 leaves the transfer hanging until it times out.
 *   CRC fallback  xymodem.e:283-300 chooses the first-block request between
 *                 `C` (CRC) and NAK (8-bit checksum). A sender too old to
 *                 understand `C` never answers it, and this resent `C` until it
 *                 ran out of retries - the transfer was impossible, not slow.
 *   input purge   xymodem.e:255-280 drains the input queue before answering,
 *                 and logs how many bytes it dumped. After a bad block the rest
 *                 of that block is still arriving; left buffered it is parsed
 *                 as the next block, so one line error cascades into sequence
 *                 errors until the retry budget is gone.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { XmodemTransferManager } from '../../src/services/xmodem-transfer.service';
import { YmodemTransferManager } from '../../src/services/ymodem-transfer.service';

const CAN = 0x18;
const NAK = 0x15;
const C = 0x43;

function collector() {
  const sent: Buffer[] = [];
  return { sent, send: (data: Buffer) => { sent.push(Buffer.from(data)); } };
}

function bytesOf(sent: Buffer[]): number[] {
  return Array.from(Buffer.concat(sent));
}

describe('cancelling a transfer', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmodem-'));
    file = path.join(dir, 'DEMO.BIN');
    fs.writeFileSync(file, Buffer.alloc(300, 0x41));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('sends express\'s eight CANs, not two', async () => {
    const sink = collector();
    const manager: any = new (XmodemTransferManager as any)({ timeout: 50 });
    manager.setSendCallback(sink.send);
    await manager.startSend(file);
    sink.sent.length = 0;

    manager.cancel();

    expect(bytesOf(sink.sent).filter((b) => b === CAN)).toHaveLength(8);
  });

  it('follows them with the ten bytes express sends', async () => {
    const sink = collector();
    const manager: any = new (XmodemTransferManager as any)({ timeout: 50 });
    manager.setSendCallback(sink.send);
    await manager.startSend(file);
    sink.sent.length = 0;

    manager.cancel();

    expect(bytesOf(sink.sent).filter((b) => b === 0x02)).toHaveLength(10);
  });

  it('does the same for YMODEM', async () => {
    const sink = collector();
    const manager: any = new (YmodemTransferManager as any)({ timeout: 50 });
    manager.setSendCallback(sink.send);
    await manager.startSend([{ path: file, name: 'DEMO.BIN' }]);
    sink.sent.length = 0;

    manager.cancel();

    expect(bytesOf(sink.sent).filter((b) => b === CAN)).toHaveLength(8);
  });
});

describe('a receiver whose CRC request goes unanswered', () => {
  let dir: string;

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmodem-rx-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('asks for CRC first', async () => {
    const sink = collector();
    const manager: any = new (XmodemTransferManager as any)({ timeout: 50, mode: 'crc' });
    manager.setSendCallback(sink.send);

    await manager.startReceive(path.join(dir, 'in.bin'));

    expect(bytesOf(sink.sent)).toContain(C);
    manager.cancel();
  });

  it('drops to checksum after three unanswered attempts', async () => {
    const sink = collector();
    const manager: any = new (XmodemTransferManager as any)({ timeout: 50, mode: 'crc' });
    manager.setSendCallback(sink.send);
    await manager.startReceive(path.join(dir, 'in.bin'));
    sink.sent.length = 0;

    // Three timeouts with no answer, as an old checksum-only sender gives.
    manager.handleTimeout();
    manager.handleTimeout();
    manager.handleTimeout();

    expect(bytesOf(sink.sent)).toContain(NAK);
    manager.cancel();
  });

  it('does not abandon CRC on the very first timeout', async () => {
    const sink = collector();
    const manager: any = new (XmodemTransferManager as any)({ timeout: 50, mode: 'crc' });
    manager.setSendCallback(sink.send);
    await manager.startReceive(path.join(dir, 'in.bin'));
    sink.sent.length = 0;

    manager.handleTimeout();

    expect(bytesOf(sink.sent)).toContain(C);
    expect(bytesOf(sink.sent)).not.toContain(NAK);
    manager.cancel();
  });
});

describe('answering after a bad block', () => {
  let dir: string;

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmodem-purge-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('dumps the buffered remains of the bad block before it NAKs', async () => {
    const manager: any = new (XmodemTransferManager as any)({ timeout: 50 });
    manager.setSendCallback(collector().send);
    await manager.startReceive(path.join(dir, 'in.bin'));
    manager.receiveBuffer = Buffer.from([1, 2, 3, 4, 5]);

    manager.sendNak();

    expect(manager.receiveBuffer).toHaveLength(0);
    manager.cancel();
  });
});
