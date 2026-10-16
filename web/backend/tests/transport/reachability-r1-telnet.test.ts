/**
 * R1 - a real telnet socket to a real TelnetServer, and the bytes a screen
 * file puts on the wire through it.
 *
 * The row has two clauses and they need different traffic, so this drives one
 * connection through both:
 *
 *   1. THE FIRST PAINT. A real socket, a real `TelnetServer` on an ephemeral
 *      port, through the same `setupTelnetSSHHandler` index.ts wires, to the
 *      graphics prompt. `TelnetConnection.prototype.write` is counted here.
 *      This paint is code-drawn (the connect banner, express.e:29507-29522)
 *      and has no file behind it - which is why clause 2 exists.
 *
 *   2. THE FILE'S BYTES. `tests/transport/wire-encoding.test.ts` already pins
 *      that a screen's bytes survive the encoder, but over a FAKE socket. This
 *      paints the same real screen over the LIVE connection made above -
 *      through the registered emitter, the real `connection-emitter` and the
 *      real `encodeForWire` - and compares what arrives on the socket against
 *      the file on disk. Nothing between the file and the wire is stubbed.
 *
 * `encodeForWire` is counted by its effect rather than a spy: SWC emits module
 * exports as non-configurable getters and `jest.spyOn` on one throws (recorded
 * on R2). Its effect here is the strongest available - the file's exact bytes,
 * latin1, arriving on a real socket. A stubbed or bypassed encoder cannot
 * produce them.
 *
 * The instrument was validated in R0: this same sentinel reads LIVE on a
 * telnet walk and DEAD on a web one.
 */
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { TelnetServer, TelnetConnection } from '../../src/server/telnet-server';
import {
  setupTelnetSSHHandler,
  whenTeardownsSettle,
  type TransportSessionDeps,
} from '../../src/server/transport-session';
import { emitterForSession } from '../../src/server/session-emitter-registry';
import { readAmigaTextFile, stripSauceMetadata } from '../../src/utils/amiga-text-decode.util';
import { openWindow } from './helpers/wire-quiet';

jest.setTimeout(60000);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// BBSTITLE is a NODE screen; the board reads Node<n>/BBSTITLE.txt. The Screens/ copy went in
// 5a3ec9bf7 (screens the board never reads).
const SCREEN = path.join(REPO_ROOT, 'Node1', 'BBSTITLE.txt');
const STEP_01_SENTINEL = 'A/R/P/P8/T/N';

const deps = (): TransportSessionDeps => ({
  io: {} as never,
  sessions: new Map(),
  nodeManager: { releaseSession: jest.fn(async () => undefined) },
  handleCommand: jest.fn(),
} as unknown as TransportSessionDeps);

function stripTelnetNegotiation(raw: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== 255) { out.push(raw[i]); continue; }
    const verb = raw[i + 1];
    if (verb === 250) {
      i += 2;
      while (i < raw.length && !(raw[i] === 255 && raw[i + 1] === 240)) i += 1;
      i += 1;
    } else if (verb === 255) { out.push(255); i += 1; } else { i += 2; }
  }
  return Buffer.from(out);
}

describe('R1 - a real telnet socket, and a screen file on the wire through it', () => {
  it('paints to the prompt, then delivers the file byte for byte', async () => {
    if (!fs.existsSync(SCREEN) || fs.statSync(SCREEN).size === 0) {
      throw new Error(
        `R1 needs the real screen: ${SCREEN} is absent or EMPTY. A 0-byte screen ` +
        `is a kill mid-write - restore it from git.`,
      );
    }

    const writeSpy = jest.spyOn(TelnetConnection.prototype, 'write');
    const server = new TelnetServer(0);
    await server.start();
    const connections: TelnetConnection[] = [];
    server.on('connection', (c: TelnetConnection) => {
      connections.push(c);
      setupTelnetSSHHandler(c, 'telnet', deps());
    });
    const port = (server as any).server.address().port;

    const client = net.connect(port);
    client.on('error', () => undefined);
    const chunks: Buffer[] = [];
    client.on('data', (c: Buffer) => chunks.push(c));

    try {
      // --- clause 1: the first paint, on the real entry point ---------------
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('never reached the prompt')), 20000);
        const check = () => {
          if (stripTelnetNegotiation(Buffer.concat(chunks)).toString('latin1').includes(STEP_01_SENTINEL)) {
            clearTimeout(timer); resolve();
          }
        };
        client.on('data', check);
        check();
      });

      const firstPaint = writeSpy.mock.calls.length;
      expect(firstPaint).toBeGreaterThanOrEqual(1);

      // --- clause 2: the file's bytes, over the SAME live connection --------
      const session = (connections[0] as any).session;
      expect(session).toBeDefined();
      const emitter = emitterForSession(session);
      expect(emitter).not.toBeNull();

      const decoded = readAmigaTextFile(SCREEN);
      expect(decoded.encoding).toBe('iso-8859-1');
      const fileBytes = stripSauceMetadata(fs.readFileSync(SCREEN));

      // The window opens on a QUIET wire. Clearing the capture while the
      // banner is still draining counts those bytes as part of the file, and
      // the byte-for-byte assertion below then fails by however many were in
      // flight - a failure that tracks machine load, not code.
      await openWindow(client, chunks);
      emitter!.emit('ansi-output', decoded.text, { sourceCharset: 'latin1' } as any);

      const arrived: Buffer = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`only ${Buffer.concat(chunks).length} of ${fileBytes.length} bytes arrived`)),
          20000);
        const check = () => {
          const got = stripTelnetNegotiation(Buffer.concat(chunks));
          // The emitter normalises bare LF to CRLF; undo exactly that to compare.
          const restored = Buffer.from(got.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
          if (restored.length >= fileBytes.length) { clearTimeout(timer); resolve(restored); }
        };
        client.on('data', check);
        check();
      });

      // encodeForWire ran: the file's own bytes are on a real socket.
      expect(arrived.length).toBe(fileBytes.length);
      expect(Buffer.compare(arrived, fileBytes)).toBe(0);
      // ...and the transport writer was used again for it.
      expect(writeSpy.mock.calls.length).toBeGreaterThan(firstPaint);
    } finally {
      client.destroy();
      await (server as any).stop?.();
      // The caller's logoff runs asynchronously past the close; let it finish
      // inside the test rather than inside jest's teardown.
      await whenTeardownsSettle();
      writeSpy.mockRestore();
    }
  });
});
