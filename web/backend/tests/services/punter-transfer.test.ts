/**
 * The Punter protocol, which a real Commodore has no alternative to.
 *
 * A C64 cannot speak ZMODEM. `info-commands.handler.ts:610` offers
 * "[6] Punter (C64)" in the live protocol menu and maps the answer to
 * `user.protocol = 'punter'`, and nothing has ever performed a Punter
 * transfer: `punter-transfer.service.ts` is reachable from no entry point and
 * had no tests at all. 744 lines of unverified protocol.
 *
 * Punter C1 (Steve Punter, 1984), as the module's own header states it:
 *
 *   handshakes  GOO, BAD, ACK, S/B, SYN - three ASCII bytes each
 *   block       [0-1] additive checksum, LE
 *               [2-3] cyclic checksum, LE
 *               [4]   size of the next block
 *               [5-6] block index, LE, 0xFFFF on the last
 *               [7+]  payload, at most 248 bytes
 *
 * These drive the real manager and read the bytes it puts on the wire.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { PunterTransferManager } from '../../src/services/punter-transfer.service';

const GOO = Buffer.from('GOO');
const ACK = Buffer.from('ACK');
const SB = Buffer.from('S/B');

function additive(block: Buffer): number {
  let sum = 0;
  for (let i = 4; i < block.length; i += 1) sum = (sum + block[i]) & 0xffff;
  return sum;
}

describe('a Punter send', () => {
  let dir: string;
  let file: string;
  let sent: Buffer[];
  let manager: PunterTransferManager;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'punter-'));
    file = path.join(dir, 'DEMO.PRG');
    fs.writeFileSync(file, Buffer.from('HELLO COMMODORE'));
    sent = [];
    manager = new PunterTransferManager({ timeout: 50 });
    manager.setSendCallback((data: Buffer) => { sent.push(Buffer.from(data)); });
  });

  afterEach(() => {
    manager.cancel();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('opens the conversation with GOO', async () => {
    await manager.startSend(file);

    expect(sent).toHaveLength(1);
    expect(sent[0].toString()).toBe('GOO');
  });

  it('is active once a send has started', async () => {
    await manager.startSend(file);

    expect(manager.isActive()).toBe(true);
  });

  it('refuses a file that is not there, rather than sending nothing', async () => {
    await expect(manager.startSend(path.join(dir, 'ABSENT.PRG'))).rejects.toThrow(/not found/i);
  });

  it('refuses to start a second transfer over a live one', async () => {
    await manager.startSend(file);

    await expect(manager.startSend(file)).rejects.toThrow(/in progress/i);
  });

  it('answers the receiver\'s GOO, and keeps talking', async () => {
    // The receiver replies GOO to the sender's GOO; the sender must move on
    // rather than sit waiting, which is what a stalled handshake looks like.
    await manager.startSend(file);
    const before = sent.length;

    manager.handleInput(GOO);

    expect(sent.length).toBeGreaterThan(before);
  });

  it('puts a well-formed block on the wire, with a checksum that verifies', async () => {
    await manager.startSend(file);
    manager.handleInput(GOO);
    manager.handleInput(ACK);
    manager.handleInput(SB);

    const block = sent.find((buf) => buf.length >= 7);
    expect(block).toBeDefined();
    const checksum = (block as Buffer).readUInt16LE(0);
    expect(checksum).toBe(additive(block as Buffer));
  });

  it('stops when cancelled', async () => {
    await manager.startSend(file);

    manager.cancel();

    expect(manager.isActive()).toBe(false);
  });
});

/**
 * The choice a caller makes in the protocol menu has to reach a protocol.
 *
 * `TransferProtocolManager` knew how to run all four protocols and was
 * instantiated by nothing: both live transfer paths said "All transports go
 * through lrzsz" and went straight to ZMODEM. So `[6] Punter (C64)` was a menu
 * entry that changed nothing, and a real Commodore - which cannot speak ZMODEM
 * at all - had no working transfer.
 */
describe('the protocol a caller picked is the protocol that runs', () => {
  const { getDefaultProtocol } = require('../../src/services/transfer-protocol.service');

  /** A real Commodore over telnet: PETSCII glyphs AND Commodore hardware. */
  const realC64: any = {
    petsciiMode: true, terminalType: 'c64', connectionType: 'telnet',
  };

  it('gives a real Commodore Punter, not ZMODEM it cannot speak', () => {
    expect(getDefaultProtocol(realC64)).toBe('punter');
  });

  it('honours an explicit choice from the protocol menu', () => {
    // info-commands.handler.ts:1380 maps the menu answer '6' to 'punter'.
    const amiga: any = { connectionType: 'telnet', user: { protocol: 'punter' } };

    expect(getDefaultProtocol(amiga)).toBe('punter');
  });

  it('still gives a browser ZMODEM', () => {
    const browser: any = { connectionType: 'web', terminalType: 'modern' };

    expect(getDefaultProtocol(browser)).toBe('zmodem');
  });

  it('routes a Punter session through the raw-transfer plumbing', async () => {
    // The wiring that makes it real: the manager must claim the session's raw
    // sink, or inbound bytes from the C64 never reach the protocol.
    const { TransferProtocolManager } = require('../../src/services/transfer-protocol.service');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'punter-wire-'));
    const file = path.join(dir, 'DEMO.PRG');
    fs.writeFileSync(file, Buffer.from('DATA'));
    const session: any = { ...realC64, user: { protocol: 'punter' }, nodeId: 1 };
    const sent: Buffer[] = [];

    const manager = new TransferProtocolManager(
      session,
      { type: 'telnet', send: (buf: Buffer) => { sent.push(Buffer.from(buf)); } },
      { direction: 'download', files: [file], protocol: 'punter' },
    );
    await manager.start();

    expect(session.transferRawActive).toBe(true);
    expect(typeof session.transferRawSink).toBe('function');
    expect(sent.map((b) => b.toString()).join('')).toContain('GOO');

    manager.cancel();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
