/**
 * R0 - the instrument, validated before any count is quoted.
 *
 * `~/.claude/REACHABILITY_PROTOCOL.md` section 3: a sentinel that has never
 * been shown to go DEAD proves nothing. A spy that reads >= 1 on every run,
 * including runs where the path could not possibly have executed, is measuring
 * the test harness rather than the product - and every later row in
 * REACHED.tsv would inherit that.
 *
 * So this file does the same walk twice and asserts the sentinel MOVES:
 *
 *   telnet leg -> `TelnetConnection.prototype.write` is called   (LIVE)
 *   web leg    -> the same symbol is called ZERO times           (DEAD)
 *
 * The DEAD leg is a real walk, not a skipped one: `runPreLoginConnect` is the
 * same service the telnet leg reaches, driven with a web emitter. It paints a
 * caller's screen through a different transport, so the telnet writer must not
 * be on its path. If the DEAD count is ever > 0 the sentinel is measuring
 * something shared and is unfit for R1..R14.
 *
 * The sentinel is a PROTOTYPE method on purpose (protocol section 3, and
 * `feedback_regex_pin_cannot_prove_runtime`): ts-jest binds intra-module calls
 * locally, so a spy on a module-local export records zero whether the path ran
 * or not.
 */
import * as crypto from 'crypto';
import * as net from 'net';
import { TelnetServer, TelnetConnection } from '../../src/server/telnet-server';
import { setupTelnetSSHHandler, type TransportSessionDeps } from '../../src/server/transport-session';
import { runPreLoginConnect } from '../../src/services/login-connect.service';

jest.setTimeout(60000);

/** The prompt's own last characters - what step 01 ends on. */
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
    } else if (verb === 255) {
      out.push(255);
      i += 1;
    } else {
      i += 2;
    }
  }
  return Buffer.from(out);
}

function readUntil(
  attach: (onData: (chunk: Buffer) => void) => void,
  sentinel: string,
  what: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      reject(new Error(
        `${what}: never reached "${sentinel}" - got ${Buffer.concat(chunks).length} bytes`,
      ));
    }, 20000);
    attach((chunk) => {
      chunks.push(chunk);
      if (stripTelnetNegotiation(Buffer.concat(chunks)).toString('latin1').includes(sentinel)) {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      }
    });
  });
}

describe('R0 - the reachability instrument reports LIVE and DEAD', () => {
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    writeSpy = jest.spyOn(TelnetConnection.prototype, 'write');
  });
  afterEach(() => {
    writeSpy.mockRestore();
  });

  test('LIVE: a real telnet socket to the first paint calls TelnetConnection.prototype.write', async () => {
    const server = new TelnetServer(0);
    await server.start();
    server.on('connection', (c: TelnetConnection) => setupTelnetSSHHandler(c, 'telnet', deps()));
    const port = (server as any).server.address().port;

    const client = net.connect(port);
    client.on('error', () => undefined);
    try {
      const painted = await readUntil(
        (onData) => client.on('data', onData), STEP_01_SENTINEL, 'telnet',
      );
      expect(painted.length).toBeGreaterThan(0);
      expect(writeSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    } finally {
      client.destroy();
      await (server as any).stop?.();
    }
  });

  test('DEAD: the same service driven over a WEB emitter never touches the telnet writer', async () => {
    // A real walk of runPreLoginConnect - the service the telnet leg reaches -
    // with a web emitter. Bytes are produced; none of them go through the
    // telnet writer.
    const emitted: string[] = [];
    const emitter = {
      emit: (_event: string, data?: unknown) => { emitted.push(String(data ?? '')); },
      session: { nodeId: 4, connectionType: 'web' },
    } as any;
    const session = { nodeId: 4, connectionType: 'web' } as any;

    await runPreLoginConnect(emitter, session, { postBannerDelayMs: 0 } as any).catch(() => undefined);

    // The walk really happened...
    expect(emitted.join('').length).toBeGreaterThan(0);
    // ...and the sentinel stayed at zero, so it discriminates.
    expect(writeSpy.mock.calls.length).toBe(0);
  });
});
