/**
 * The start rule. A server that never starts looks exactly like one nobody
 * has tried to use, so this is asserted rather than assumed.
 */
import * as net from 'net';
import { startFtpServer, ftpEnabled, ftpPortFrom, DEFAULT_FTP_PORT } from '../../src/ftp/start-ftp';
import type { FtpDeps } from '../../src/ftp/ftp-session';

const deps: FtpDeps = {
  authenticate: async () => null,
  reserveNode: async () => 1,
  releaseNode: async () => undefined,
  log: () => undefined,
  timeRemainingMinutes: () => 0,
};

test('a board that has not turned FTP on gets no listener', async () => {
  expect(await startFtpServer({ ftp_enabled: false }, deps)).toBeNull();
  expect(await startFtpServer(null, deps)).toBeNull();
});

test('a board that turned it on gets one, and it accepts a connection', async () => {
  const server = await startFtpServer({ ftp_enabled: true }, deps, { FTP_PORT: '0', FTP_HOST: '127.0.0.1' });
  expect(server).not.toBeNull();

  const port = server!.address()!.port;
  const greeting = await new Promise<string>(resolve => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('data', chunk => { resolve(chunk.toString()); socket.destroy(); });
  });

  expect(greeting).toContain('220 Welcome to Ami-Express FTP server.');
  await server!.stop();
});

test('the environment can switch FTP on, but never off', () => {
  // A developer must be able to run this on his own machine without editing
  // the board's icon: every deploy of the live board drops the callers on it.
  expect(ftpEnabled({ ftp_enabled: false }, { FTP_ENABLED: '1' })).toBe(true);
  expect(ftpEnabled(null, { FTP_ENABLED: 'true' })).toBe(true);

  expect(ftpEnabled({ ftp_enabled: false }, {})).toBe(false);
  expect(ftpEnabled({ ftp_enabled: false }, { FTP_ENABLED: '0' })).toBe(false);
  expect(ftpEnabled({ ftp_enabled: true }, {})).toBe(true);
});

test('the port comes from the env first, then the admin, then 2121', () => {
  expect(ftpPortFrom({ ftp_port: 2200 }, { FTP_PORT: '2300' })).toBe(2300);
  expect(ftpPortFrom({ ftp_port: 2200 }, {})).toBe(2200);
  expect(ftpPortFrom({}, {})).toBe(DEFAULT_FTP_PORT);
  // Port 0 means "any free port" and must survive as itself: falling back to
  // 2121 makes a test that asked for an ephemeral port collide with whatever
  // holds the default.
  expect(ftpPortFrom({ ftp_port: 2200 }, { FTP_PORT: '0' })).toBe(0);
  expect(ftpPortFrom({ ftp_port: 2200 }, { FTP_PORT: 'banana' })).toBe(2200);
  expect(ftpPortFrom(null, {})).toBe(DEFAULT_FTP_PORT);
  // 21 is privileged and contested; the sysop chose 2121.
  expect(DEFAULT_FTP_PORT).toBe(2121);
});
