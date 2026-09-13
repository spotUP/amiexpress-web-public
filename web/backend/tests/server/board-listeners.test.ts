/**
 * "What does the board listen on" has one answer, and it is the real one.
 *
 * `board-listeners.ts` exists so the door-settings guard can refuse a door
 * aimed at this process. That is only worth anything if the list matches what
 * `index.ts` actually binds - a stale constant would wave through the very
 * port that took the board down on 2026-09-13.
 *
 * So the defaults are pinned against index.ts's own literals here. If someone
 * moves telnet off 64128 in index.ts and not here, this test is where the two
 * stop agreeing.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  boardListeners,
  boardListenerFor,
  isLoopbackHost,
  LISTENER_DEFAULTS,
} from '../../src/server/board-listeners';

const INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'index.ts'), 'utf8');

describe('the board\'s own listeners', () => {
  it('carries the same default ports index.ts binds', () => {
    // index.ts: parseInt(process.env.TELNET_PORT || "64128")
    expect(INDEX).toContain(`process.env.TELNET_PORT || "${LISTENER_DEFAULTS.telnet}"`);
    expect(INDEX).toContain(`process.env.SSH_PORT || "${LISTENER_DEFAULTS.ssh}"`);
    // index.ts: process.env.PORT || config.get("port"), whose default is 3001
    expect(INDEX).toContain('process.env.PORT || config.get("port")');
    const runtimeConfig = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'config.ts'),
      'utf8'
    );
    expect(runtimeConfig).toContain(`port: ${LISTENER_DEFAULTS.http}`);
  });

  it('follows the environment when a port is moved', () => {
    const moved = boardListeners({ PORT: '8080', TELNET_PORT: '2323', SSH_PORT: '2222' });
    const ports = moved.map((l) => l.port);

    expect(ports).toContain(8080);
    expect(ports).toContain(2323);
    expect(ports).toContain(2222);
    expect(ports).not.toContain(LISTENER_DEFAULTS.http);
  });

  it('includes the PETSCII port only when the sysop has set one', () => {
    expect(boardListeners({}).map((l) => l.port)).not.toContain(6400);
    expect(boardListeners({ TELNET_PETSCII_PORT: '6400' }).map((l) => l.port)).toContain(6400);
  });

  it('names what each port serves, for a message a sysop can act on', () => {
    const http = boardListeners({}).find((l) => l.port === LISTENER_DEFAULTS.http);

    expect(http?.serves).toMatch(/web terminal|API/i);
  });

  it('knows every spelling of this machine, and no other host', () => {
    for (const host of ['127.0.0.1', 'localhost', 'LOCALHOST', '::1', '0.0.0.0', ' 127.0.0.1 ']) {
      expect(isLoopbackHost(host)).toBe(true);
    }
    expect(isLoopbackHost('texttv.example.com')).toBe(false);
    expect(isLoopbackHost('10.0.0.5')).toBe(false);
  });

  it('matches a port only when the host is this machine', () => {
    const listeners = boardListeners({});

    expect(boardListenerFor('127.0.0.1', LISTENER_DEFAULTS.http, listeners)).toBeDefined();
    expect(boardListenerFor('example.com', LISTENER_DEFAULTS.http, listeners)).toBeUndefined();
    expect(boardListenerFor('127.0.0.1', 3002, listeners)).toBeUndefined();
  });
});
