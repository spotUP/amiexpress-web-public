/**
 * An SSH caller's session gets what the pty said.
 *
 * ssh2 delivers `pty` (terminal type, size) before `shell`, and the BBS
 * session is made on `ready`, from `shell`. The pty's reports were emitted to
 * a connection with no session and dropped, and the only writer of
 * `unicodeCapable` on the backend was telnet's own listener - so every SSH
 * caller was 80x24 until he resized, and Latin-1 for ever (web-vs-telnet
 * audit item 1, 2026-09-28). The old tests asserted the EMITTED event; this
 * asserts the session.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import { SSHConnection, applyPtyToSession } from '../../src/server/ssh-server';
import { resolveWireCharset } from '../../src/utils/wire-encoding.util';

function sshCaller(info: Record<string, unknown>) {
  const connection = Object.assign(new EventEmitter(), { end() {} });
  const ssh = new SSHConnection(connection as any);
  const sshSession = new EventEmitter();
  connection.emit('ready');
  connection.emit('session', () => sshSession);
  sshSession.emit('pty', () => undefined, () => undefined, info);
  return ssh;
}

describe('an SSH caller', () => {
  it('gets the pty size and a UTF-8 wire from a UTF-8 terminal', () => {
    const ssh = sshCaller({ term: 'xterm-256color', cols: 132, rows: 43 });
    const session: any = { connectionType: 'ssh', screenWidth: 80, screenHeight: 24, tempData: {} };

    applyPtyToSession(ssh, session);

    expect(session.screenWidth).toBe(132);
    expect(session.screenHeight).toBe(43);
    expect(session.unicodeCapable).toBe(true);
    expect(resolveWireCharset(session)).toBe('utf-8');
  });

  it('still gets the size from a pty that names no terminal', () => {
    const ssh = sshCaller({ cols: 100, rows: 30 });
    const session: any = { connectionType: 'ssh', screenWidth: 80, screenHeight: 24, tempData: {} };

    applyPtyToSession(ssh, session);

    expect(session.screenWidth).toBe(100);
    expect(session.unicodeCapable).toBeUndefined();
  });
});
