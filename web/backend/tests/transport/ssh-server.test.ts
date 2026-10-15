/**
 * SSH IS A TRANSPORT THE BOARD KNOWS ABOUT.
 *
 * TP-12. `ssh-server.ts` had never been imported by a single one of this
 * repo's backend tests, and it showed:
 *
 *   - the SSH client's terminal type was never read, so every SSH caller
 *     was `unicodeCapable: false` and every blessed door drew in Amiga/ACS
 *     fallback mode;
 *   - a pty request carried the window size and said nothing, so a caller
 *     who never resized sat at the session manager's 80x24 default;
 *   - anything written before the shell handler ran was DISCARDED, silently.
 *
 * These drive the real `SSHConnection` through a fake ssh2 `session`, which
 * is the same object shape ssh2 hands the real one.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import { SSHConnection } from '../../src/server/ssh-server';
import { classifyTerminalType } from '../../src/server/telnet-server';

/** The ssh2 Connection surface SSHConnection actually uses. */
class FakeConnection extends EventEmitter {
  public ended = false;
  end() { this.ended = true; }
}

/** The ssh2 session surface, plus the stream a shell request accepts. */
function driveConnection() {
  const connection = new FakeConnection();
  const ssh = new SSHConnection(connection as any);

  const session = new EventEmitter();
  const written: Buffer[] = [];
  const stream = Object.assign(new EventEmitter(), {
    write: (chunk: any) => written.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'latin1')),
  });

  connection.emit('ready');
  // ssh2 calls the handler with an `accept` that RETURNS the session.
  connection.emit('session', () => session);

  return {
    ssh,
    connection,
    written,
    pty: (info: Record<string, unknown>) => session.emit('pty', () => undefined, () => undefined, info),
    shell: () => session.emit('shell', () => stream, () => undefined),
  };
}

/** What the session applier is handed. */
type TerminalTypeEvent = {
  terminalType: string;
  isC64: boolean;
  isAmiga: boolean;
  unicodeCapable: boolean;
  width: number;
  height: number;
};

describe("an SSH caller's terminal reaches the session", () => {
  it('reports its type, its unicode capability and its real geometry', () => {
    const caller = driveConnection();
    const seen: TerminalTypeEvent[] = [];
    const sizes: Array<[number, number]> = [];
    caller.ssh.on('terminal-type', (info: TerminalTypeEvent) => seen.push(info));
    caller.ssh.on('window-size', (w: number, h: number) => sizes.push([w, h]));

    caller.pty({ term: 'xterm-256color', cols: 132, rows: 50 });

    expect(seen).toHaveLength(1);
    expect(seen[0].terminalType).toBe('XTERM-256COLOR');
    expect(seen[0].unicodeCapable).toBe(true);
    expect(seen[0].width).toBe(132);
    expect(seen[0].height).toBe(50);
    // A pty request carries the size; only `window-change` used to say so.
    expect(sizes).toEqual([[132, 50]]);
  });

  it('is classified by the same predicate telnet uses, not a second copy', () => {
    const caller = driveConnection();
    const seen: TerminalTypeEvent[] = [];
    caller.ssh.on('terminal-type', (info: TerminalTypeEvent) => seen.push(info));

    caller.pty({ term: 'vt220', cols: 80, rows: 24 });

    const { isAmiga, unicodeCapable } = classifyTerminalType('VT220');
    expect(seen[0].isAmiga).toBe(isAmiga);
    expect(seen[0].unicodeCapable).toBe(unicodeCapable);
  });

  it('says nothing when the client offers no terminal type', () => {
    const caller = driveConnection();
    const seen: TerminalTypeEvent[] = [];
    caller.ssh.on('terminal-type', (info: TerminalTypeEvent) => seen.push(info));

    caller.pty({ cols: 80, rows: 24 });

    // Nothing to classify: the session keeps whatever it already had rather
    // than being told it is an UNKNOWN Amiga terminal.
    expect(seen).toEqual([]);
  });

  it('does not turn PETSCII on for a C64 terminal string (non-goal, pinned)', () => {
    const caller = driveConnection();
    const seen: TerminalTypeEvent[] = [];
    caller.ssh.on('terminal-type', (info: TerminalTypeEvent) => seen.push(info));

    caller.pty({ term: 'C64', cols: 80, rows: 24 });

    // Recorded and carried, so the applier can log it...
    expect(seen[0].isC64).toBe(true);
    // ...and a C64 is 40x25 by definition, whatever the pty claimed.
    expect(seen[0].width).toBe(40);
    expect(seen[0].height).toBe(25);
    // The graphics prompt is what turns PETSCII on, for every transport.
    expect((caller.ssh as any).session?.petsciiMode).toBeUndefined();
  });
});

describe('the first screen is not lost', () => {
  it('queues what is written before the shell exists, and sends it in order', () => {
    const caller = driveConnection();

    caller.ssh.write('first\r\n');
    caller.ssh.write(Buffer.from([0x1b, 0x5b, 0x32, 0x4a]));
    expect(caller.written).toEqual([]);

    caller.shell();

    expect(Buffer.concat(caller.written).toString('latin1'))
      .toBe('first\r\n\x1b[2J');
  });

  it('writes straight through once the shell is open', () => {
    const caller = driveConnection();
    caller.shell();

    caller.ssh.write('after');

    expect(Buffer.concat(caller.written).toString('latin1')).toBe('after');
  });
});

describe('transport auth stays permissive - a DECISION, not an oversight', () => {
  /**
   * SSH here is a pure transport, exactly as telnet is: telnet has no
   * transport auth at all and the BBS's own login IS the credential.
   * Rejecting `none` would break every client that connects
   * SSH-as-transport with an arbitrary username and would buy nothing,
   * because the next screen asks for a username and password anyway.
   */
  const authOutcome = (method: string) => {
    const connection = new FakeConnection();
    new SSHConnection(connection as any);
    let accepted = false;
    let rejected = false;
    connection.emit('authentication', {
      method,
      username: 'anybody',
      accept: () => { accepted = true; },
      reject: () => { rejected = true; },
    });
    return { accepted, rejected };
  };

  it.each(['none', 'password', 'keyboard-interactive'])('accepts %s', (method) => {
    expect(authOutcome(method)).toEqual({ accepted: true, rejected: false });
  });

  it('rejects publickey, which this board cannot check', () => {
    expect(authOutcome('publickey')).toEqual({ accepted: false, rejected: true });
  });
});
