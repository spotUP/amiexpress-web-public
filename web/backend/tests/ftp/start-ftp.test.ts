/**
 * The start rule. A server that never starts looks exactly like one nobody
 * has tried to use, so this is asserted rather than assumed.
 */
import * as net from 'net';
import { startFtpServer, ftpPortFrom, DEFAULT_FTP_PORT } from '../../src/ftp/start-ftp';
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

test('the port comes from the env first, then the admin, then 2121', () => {
  expect(ftpPortFrom({ ftp_port: 2200 }, { FTP_PORT: '2300' })).toBe(2300);
  expect(ftpPortFrom({ ftp_port: 2200 }, {})).toBe(2200);
  expect(ftpPortFrom({}, {})).toBe(DEFAULT_FTP_PORT);
  expect(ftpPortFrom(null, {})).toBe(DEFAULT_FTP_PORT);
  // 21 is privileged and contested; the sysop chose 2121.
  expect(DEFAULT_FTP_PORT).toBe(2121);
});
