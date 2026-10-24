/**
 * Regression tests for the shared pre-login connect-time pipeline.
 *
 * Before extraction the three transports (web, telnet, SSH) each
 * open-coded their own connect-time flow. They drifted: FRONTEND
 * syscmd only ran on web; operator-chat listeners and SamiLog
 * refresh were web-only; telnet/SSH never fired the AREXX 'login'
 * trigger. Today's refactor collapses them into runPreLoginConnect.
 *
 * These tests DRIVE it. The pipeline's collaborators are replaced by
 * recorders, so the service's own body runs and each step is counted
 * where it lands. Each transport is driven from its real entry point -
 * a real TelnetServer and a real SSHServerImpl on ephemeral ports with
 * real clients, and index.ts's own socket.io `connection` handler - and
 * the service's export is a sentinel that records who reached it. If a
 * transport stops routing through the service the tests fail loudly -
 * that's the whole point.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';

/** Every call that reached runPreLoginConnect, in any module registry. */
const mockReached: Array<{ emitter: unknown; session: any; ctx: any }> = [];
/** While true the sentinel records and returns; while false it runs the real service. */
const mockSentinel = { on: false };

jest.mock('../../src/services/login-connect.service', () => {
  const actual = jest.requireActual('../../src/services/login-connect.service');
  return {
    ...actual,
    runPreLoginConnect: (emitter: unknown, session: any, ctx: any) => {
      mockReached.push({ emitter, session, ctx });
      return mockSentinel.on ? Promise.resolve({ ok: true }) : actual.runPreLoginConnect(emitter, session, ctx);
    },
  };
});

// The pipeline's collaborators, each a recorder.
const mockSteps = {
  executeOn: jest.fn(async () => undefined),
  operatorChat: jest.fn(),
  samiLog: jest.fn(async () => undefined),
  runSysCommand: jest.fn(async () => 0),
  arexx: jest.fn(async () => undefined),
};
jest.mock('../../src/services/batch-scheduler', () => ({
  ...jest.requireActual('../../src/services/batch-scheduler'),
  runExecuteOn: (...a: unknown[]) => (mockSteps.executeOn as any)(...a),
}));
jest.mock('../../src/handlers/operator-chat.handler', () => ({
  setupOperatorChatListeners: (...a: unknown[]) => (mockSteps.operatorChat as any)(...a),
}));
jest.mock('../../src/services/SamiLogService', () => ({
  ...jest.requireActual('../../src/services/SamiLogService'),
  triggerSamiLogRefresh: (...a: unknown[]) => (mockSteps.samiLog as any)(...a),
}));
jest.mock('../../src/handlers/command-execution.handler', () => ({
  runSysCommand: (...a: unknown[]) => (mockSteps.runSysCommand as any)(...a),
  commandCache: { syscmd: new Map() },
}));
jest.mock('../../src/services/arexx.service', () => ({
  ...jest.requireActual('../../src/services/arexx.service'),
  arexxEngine: { executeTrigger: (...a: unknown[]) => (mockSteps.arexx as any)(...a) },
}));

import { runPreLoginConnect, ANSI_GRAPHICS_PROMPT } from '../../src/services/login-connect.service';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

jest.setTimeout(60000);

function recorder() {
  const said: string[] = [];
  return { said, emitter: { id: 'drv', emit: (event: string, payload: unknown) => { if (event === 'ansi-output') said.push(String(payload)); } } as any };
}

let quiet: jest.SpyInstance[] = [];
beforeEach(() => {
  mockReached.length = 0;
  mockSentinel.on = false;
  for (const step of Object.values(mockSteps)) step.mockClear();
  quiet = [jest.spyOn(console, 'log').mockImplementation(() => {}), jest.spyOn(console, 'warn').mockImplementation(() => {})];
});
afterEach(() => { for (const q of quiet) q.mockRestore(); });

describe('runPreLoginConnect — connect-time unification', () => {
  describe('service shape', () => {
    it('runs the operator-chat / samilog / FRONTEND / prompt / arexx pipeline', async () => {
      const { said, emitter } = recorder();
      const session: any = { nodeId: 4, connectionType: 'telnet', tempData: {} };

      await runPreLoginConnect(emitter, session, { socketId: 'telnet-4-1' });

      expect(mockSteps.operatorChat).toHaveBeenCalledWith(emitter, session);
      expect(mockSteps.samiLog).toHaveBeenCalledTimes(1);
      // FRONTEND syscmd - uppercase, the syscmd cache key.
      expect(mockSteps.runSysCommand).toHaveBeenCalledWith(emitter, session, 'FRONTEND', '');
      // Graphics prompt + parked state.
      expect(said.join('')).toContain(ANSI_GRAPHICS_PROMPT.trim());
      expect(said.join('')).toMatch(/ANSI, RIP, PETSCII, TELETEXT OR NO GRAPHICS/);
      expect(session.subState).toBe(LoggedOnSubState.ANSI_PROMPT);
      // AREXX login trigger fires on every transport (was web-only).
      expect(mockSteps.arexx).toHaveBeenCalledWith('login', expect.objectContaining({ sessionId: 'telnet-4-1' }));
    });

    it('short-circuits before the prompt when passwordResetState is set', async () => {
      const { said, emitter } = recorder();
      const session: any = { nodeId: 4, connectionType: 'telnet', tempData: {}, passwordResetState: 'await_confirm' };

      const result = await runPreLoginConnect(emitter, session, { socketId: 'telnet-4-2' });

      expect(result).toEqual(expect.objectContaining({ passwordResetActive: true }));
      expect(said.join('')).not.toContain('A/R/P');
      expect(session.subState).toBeUndefined();
      expect(mockSteps.arexx).not.toHaveBeenCalled();
    });

    // Task 6 / audit F1-F3: this is the prompt real telnet/SSH/web callers
    // actually see at connect time (runPreLoginConnect emits it directly,
    // independent of any keypress) — so it, not command-handler/core.ts's
    // copy, is what a real C64 caller needs to be legible and to invite
    // the DEL-probe.
    it('graphics prompt is uppercase-only ASCII and invites <DEL>', () => {
      // Read the actual runtime string value, not the source text — the
      // source text's own "\r\n" escape sequence contains lowercase r/n
      // as characters, which would false-positive a source-regex check.
      expect(typeof ANSI_GRAPHICS_PROMPT).toBe('string');

      expect(ANSI_GRAPHICS_PROMPT).toContain('<DEL>');
      // No lowercase ASCII letters anywhere in the actual (post-escape) string.
      expect(ANSI_GRAPHICS_PROMPT).not.toMatch(/[a-z]/);
    });

    // Sysop addendum (2026-09-02): the graphics question and the A/R/P/N
    // prompt (originally lines 2+3) are merged into one line; the C64 DEL
    // invite keeps its own line so it still can't word-wrap mid-word on a
    // real C64's 40-col screen. Assert the shape (two lines, DEL line
    // <=40 cols, question last with the input cursor sitting right after
    // it) rather than pinning one giant string.
    it('graphics prompt is two lines, DEL line <=40 columns, question last', () => {
      // Leading "\r\n" is just a blank-line separator from prior screen
      // content, not a "line" with visible width — strip it before splitting.
      const body = (ANSI_GRAPHICS_PROMPT as string).replace(/^\r\n/, '');
      const lines = body.split('\r\n');

      expect(lines.length).toBe(2);
      expect(lines[0].length).toBeLessThanOrEqual(40);

      const lastLine = lines[lines.length - 1];
      // Question mark comes last, followed only by a trailing space for
      // the input cursor — no CRLF after it.
      expect(lastLine).toMatch(/\? $/);
      expect(ANSI_GRAPHICS_PROMPT.endsWith('\r\n')).toBe(false);
    });
  });

  describe('all three transport entry points route through the service', () => {
    const deps = (): any => ({
      io: {} as never,
      sessions: new Map(),
      nodeManager: { releaseSession: jest.fn(async () => undefined) },
      handleCommand: jest.fn(),
    });

    /** Resolve once the sentinel has been reached, or fail after `ms`. */
    const reached = (ms: number) => new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const poll = setInterval(() => {
        if (mockReached.length > 0) { clearInterval(poll); resolve(); }
        else if (Date.now() - started > ms) { clearInterval(poll); reject(new Error('runPreLoginConnect was never reached')); }
      }, 20);
    });

    it('web (index.ts io.on connection) calls runPreLoginConnect', async () => {
      mockSentinel.on = true;
      // index.ts's own `connection` handler, captured from a stand-in
      // socket.io Server; nothing else about the module is replaced.
      const handlers: Record<string, (...a: any[]) => unknown> = {};
      let assign: jest.SpyInstance | undefined;
      jest.isolateModules(() => {
        jest.doMock('socket.io', () => ({
          Server: class {
            engine = { on() { /* no transport */ } };
            sockets = { sockets: new Map() };
            use() { return this; }
            on(event: string, cb: (...a: any[]) => unknown) { handlers[event] = cb; return this; }
            to() { return { emit() { return true; } }; }
            in() { return { emit() { return true; } }; }
            emit() { return true; }
            of() { return this; }
          },
        }));
        const { nodeManager } = require('../../src/services/node-manager.service');
        assign = jest.spyOn(nodeManager, 'assignSessionToNode').mockResolvedValue({ nodeId: 6 } as never);
        require('../../src/index');
      });
      const socket: any = {
        id: 'web-drive-1',
        handshake: { address: '10.9.8.7', headers: {}, query: {} },
        emit() { return true; }, on() { return socket; }, onAny() { return socket; },
        join() { return socket; }, disconnect() { return socket; }, removeAllListeners() { return socket; },
      };
      try {
        expect(typeof handlers.connection).toBe('function');
        await handlers.connection(socket);
        expect(mockReached).toHaveLength(1);
        // The web caller's emitter is the session's LINK over his socket
        // (server/web-connection.ts), not the raw socket.
        expect(mockReached[0].emitter).toBe(mockReached[0].session.webLink);
        expect((mockReached[0].emitter as { raw: unknown }).raw).toBe(socket);
        expect(mockReached[0].session).toEqual(expect.objectContaining({ nodeId: 6, connectionType: 'web' }));
      } finally {
        assign?.mockRestore();
        jest.dontMock('socket.io');
      }
    });

    it('telnet (telnet-server.ts) calls runPreLoginConnect from showPrompt', async () => {
      mockSentinel.on = true;
      const { TelnetServer } = require('../../src/server/telnet-server');
      const { setupTelnetSSHHandler } = require('../../src/server/transport-session');
      const server = new TelnetServer(0);
      await server.start();
      const connections: any[] = [];
      server.on('connection', (c: any) => { connections.push(c); setupTelnetSSHHandler(c, 'telnet', deps()); });
      const client = net.connect((server as any).server.address().port);
      client.on('error', () => undefined);
      try {
        await reached(20000);
        expect(mockReached[0].emitter).toBe(connections[0].emitter);
        expect(mockReached[0].session).toBe(connections[0].session);
      } finally {
        client.destroy();
        await (server as any).stop?.();
      }
    });

    it('ssh (ssh-server.ts) calls runPreLoginConnect from the ready handler', async () => {
      mockSentinel.on = true;
      const { SSHServerImpl } = require('../../src/server/ssh-server');
      const { setupTelnetSSHHandler } = require('../../src/server/transport-session');
      const { Client: SSHClient } = require('ssh2');
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      });
      const server = new SSHServerImpl(0, [Buffer.from(privateKey)]);
      const connections: any[] = [];
      server.on('connection', (c: any) => { connections.push(c); setupTelnetSSHHandler(c, 'ssh', deps()); });
      await server.start();
      const client = new SSHClient();
      try {
        await new Promise<void>((resolve, reject) => {
          client.on('ready', () => {
            client.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err: Error | undefined) => (err ? reject(err) : resolve()));
          });
          client.on('error', reject);
          client.connect({ host: '127.0.0.1', port: (server as any).server.address().port, username: 'lc', password: 'ignored' });
        });
        await reached(20000);
        expect(mockReached[0].emitter).toBe(connections[0].emitter);
        expect(mockReached[0].session).toBe(connections[0].session);
      } finally {
        client.end();
        await (server as any).stop?.();
      }
    });

    it('no transport open-codes the inline FRONTEND syscmd path', () => {
      // REASONABLE source read: an absence across the three entry points (a
      // second, inline FRONTEND call beside the service's). Any quoting.
      const transports = ['index.ts', 'server/telnet-server.ts', 'server/ssh-server.ts'];
      for (const rel of transports) {
        const src = fs.readFileSync(path.resolve(__dirname, '../../src', rel), 'utf8');
        expect(src).not.toMatch(/runSysCommand\([^)]*['"`]FRONTEND['"`]/);
      }
    });
  });
});
