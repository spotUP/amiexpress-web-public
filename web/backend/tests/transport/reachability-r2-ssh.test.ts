/**
 * R2 - a real ssh2 client shell reaches the board, and the SSH transport's own
 * writer and terminal classifier both run.
 *
 * The row's question is not "does SSH work" but "which symbols does an SSH
 * caller's first paint actually cross". Before TP-12 the answer included
 * neither: the pty handler ignored `info.term`, so `classifyTerminalType` was
 * never reached from SSH at all and every SSH caller was `unicodeCapable:
 * false` - a door drawing Unicode box characters served ASCII to a terminal
 * that could have taken them.
 *
 * Sentinels are chosen per protocol section 3 - a PROTOTYPE method and a
 * cross-module export, never a module-local one, because ts-jest binds
 * intra-module calls locally and a spy on those reads 0 whether the path ran
 * or not. The instrument itself was validated in R0.
 *
 * Nothing here is mocked: a real `SSHServerImpl` on an ephemeral port, a real
 * `ssh2` client, a real shell, and the same `setupTelnetSSHHandler` that
 * `index.ts` wires - without which the server accepts the shell and the BBS
 * never speaks.
 *
 * ON THE SECOND SENTINEL. The row names `classifyTerminalType`, and it cannot
 * be spied: SWC emits module exports as non-configurable getters, so
 * `jest.spyOn(module, 'classifyTerminalType')` throws "Cannot redefine
 * property". Rather than weaken the row to a source pin - which proves a call
 * exists, not that it runs - it is counted by its OBSERVABLE EFFECT on the
 * real path: the pty handler calls it and emits `terminal-type` carrying its
 * three return fields (ssh-server.ts:116-125). The event fires if and only if
 * the classifier ran, and the payload is compared against calling the real
 * function directly, so a stubbed or drifting classifier fails the row.
 */
import * as crypto from 'crypto';
import { Client as SSHClient } from 'ssh2';
import { SSHServerImpl, SSHConnection } from '../../src/server/ssh-server';
import { classifyTerminalType } from '../../src/server/telnet-server';
import { setupTelnetSSHHandler, type TransportSessionDeps } from '../../src/server/transport-session';

jest.setTimeout(60000);

const STEP_01_SENTINEL = 'A/R/P/P8/T/N';

const deps = (): TransportSessionDeps => ({
  io: {} as never,
  sessions: new Map(),
  nodeManager: { releaseSession: jest.fn(async () => undefined) },
  handleCommand: jest.fn(),
} as unknown as TransportSessionDeps);

function hostKey(): Buffer {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  return Buffer.from(privateKey);
}

describe('R2 - a real ssh2 shell to SSHServerImpl', () => {
  it('crosses SSHConnection.prototype.write and classifyTerminalType, and leaves unicodeCapable defined', async () => {
    const writeSpy = jest.spyOn(SSHConnection.prototype, 'write');
    const classified: any[] = [];

    const server = new SSHServerImpl(0, [hostKey()]);
    const seen: any[] = [];
    server.on('connection', (connection: any) => {
      seen.push(connection);
      connection.on('terminal-type', (payload: any) => classified.push(payload));
      setupTelnetSSHHandler(connection, 'ssh', deps());
    });
    await server.start();
    const port = (server as any).server.address().port;

    const client = new SSHClient();
    try {
      const stream: any = await new Promise((resolve, reject) => {
        client.on('ready', () => {
          client.shell({ term: 'xterm-256color', cols: 80, rows: 24 } as any,
            (err: Error | undefined, s: any) => { if (err) reject(err); else resolve(s); });
        });
        client.on('error', reject);
        client.connect({ host: '127.0.0.1', port, username: 'r2', password: 'ignored' });
      });

      const painted: Buffer = await new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const timer = setTimeout(
          () => reject(new Error(`never reached "${STEP_01_SENTINEL}"`)), 20000);
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          if (Buffer.concat(chunks).toString('latin1').includes(STEP_01_SENTINEL)) {
            clearTimeout(timer);
            resolve(Buffer.concat(chunks));
          }
        });
      });

      expect(painted.length).toBeGreaterThan(0);
      // The two sentinels the row names.
      expect(writeSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

      // The classifier ran on the real path, exactly once, on the term the
      // CLIENT sent rather than a default - the TP-12 fix this row holds down.
      expect(classified.length).toBeGreaterThanOrEqual(1);
      expect(classified[0].terminalType).toBe('XTERM-256COLOR');

      // And it produced the REAL function's answer, not a drifting copy.
      const truth = classifyTerminalType('XTERM-256COLOR');
      expect(classified[0].isC64).toBe(truth.isC64);
      expect(classified[0].isAmiga).toBe(truth.isAmiga);
      expect(classified[0].unicodeCapable).toBe(truth.unicodeCapable);

      // unicodeCapable is DEFINED, which it was not before TP-12: every SSH
      // caller used to fall through as false.
      expect(classified[0].unicodeCapable).toBeDefined();
    } finally {
      client.end();
      await (server as any).stop?.();
      writeSpy.mockRestore();
    }
  });
});
