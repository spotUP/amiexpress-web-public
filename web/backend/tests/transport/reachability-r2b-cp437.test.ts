/**
 * R2b - the encoder's SOURCE-CHARSET carrier, proved on a real socket.
 *
 * `encodeForWire` has a fast path: when the payload's `sourceCharset` matches
 * the caller's `wireCharset`, the bytes are reproduced exactly rather than
 * transcoded. That is what lets a CP437 `.ans` reach a CP437 terminal as the
 * artist drew it - every 0xC9, 0xB0, 0xBC intact - instead of arriving as
 * Latin-1 fraction glyphs or a field of `?`.
 *
 * `tests/transport/wire-encoding.test.ts` already pins this, over a FAKE
 * socket. This row drives it end to end: a real `TelnetServer` on an ephemeral
 * port, a real client socket, the real `setupTelnetSSHHandler`, the registered
 * emitter, the real `connection-emitter` and the real encoder. Nothing between
 * the art and the wire is stubbed, so the bytes arriving on the socket are the
 * whole proof that the carrier survived the trip.
 *
 * `encodeForWire` cannot be spied - SWC emits module exports as
 * non-configurable getters and `jest.spyOn` throws (recorded on R2) - so it is
 * counted by that effect. The instrument for the transport writer beside it
 * was validated in R0: LIVE on telnet, DEAD on web.
 *
 * The negative half is asserted too, on the SAME connection: with the caller's
 * `wireCharset` left at its Latin-1 default, the identical payload must NOT
 * arrive as those bytes. Without that, a test that transcoded everything to
 * mush would still pass the first assertion by accident.
 */
import * as net from 'net';
import * as iconv from 'iconv-lite';
import { TelnetServer, TelnetConnection } from '../../src/server/telnet-server';
import { setupTelnetSSHHandler, type TransportSessionDeps } from '../../src/server/transport-session';
import { emitterForSession } from '../../src/server/session-emitter-registry';
import { fromCharset } from '../../src/utils/output-pacing';

jest.setTimeout(60000);

const STEP_01_SENTINEL = 'A/R/P/P8/T/N';

/** A framed box in CP437: the double-line corners and the three shade blocks. */
const CP437_ART = Buffer.from([
  0xc9, 0xcd, 0xcd, 0xcd, 0xbb, 0x0d, 0x0a,
  0xba, 0xb0, 0xb2, 0xb0, 0xba, 0x0d, 0x0a,
  0xc8, 0xcd, 0xcd, 0xcd, 0xbc,
]);

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

describe('R2b - a CP437 .ans reaches a CP437 caller as the file s own bytes', () => {
  it('carries sourceCharset through a real socket, and does not when the caller is Latin-1', async () => {
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

    const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

    try {
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

      const session = (connections[0] as any).session;
      const emitter = emitterForSession(session);
      expect(emitter).not.toBeNull();

      const text: string = iconv.decode(CP437_ART, 'cp437');

      // --- the caller IS a CP437 terminal: bytes reproduced exactly ---------
      session.wireCharset = 'cp437';
      chunks.length = 0;
      emitter!.emit('ansi-output', text, fromCharset('cp437'));
      await settle();
      const cp437Wire = stripTelnetNegotiation(Buffer.concat(chunks));

      expect(cp437Wire.length).toBe(CP437_ART.length);
      expect(Buffer.compare(cp437Wire, CP437_ART)).toBe(0);
      // The art really is high-bit; a test that lost it would still be "equal"
      // to a payload that never had any.
      expect(cp437Wire.some((b) => b >= 0x80)).toBe(true);

      // --- the same payload to a Latin-1 caller must NOT be those bytes -----
      session.wireCharset = undefined;
      chunks.length = 0;
      emitter!.emit('ansi-output', text, fromCharset('cp437'));
      await settle();
      const latinWire = stripTelnetNegotiation(Buffer.concat(chunks));

      expect(latinWire.length).toBeGreaterThan(0);
      expect(Buffer.compare(latinWire, CP437_ART)).not.toBe(0);
      // It is folded to ASCII line art rather than served as mush.
      for (const b of latinWire) expect(b).toBeLessThan(0x80);
      expect(latinWire.indexOf(0x3f)).toBe(-1);   // no '?' substitutions

      expect(writeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      client.destroy();
      await (server as any).stop?.();
      writeSpy.mockRestore();
    }
  });
});
