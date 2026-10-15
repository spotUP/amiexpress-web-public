/**
 * A telnet caller can type a-ring.
 *
 * Output honoured the wire's charset (Latin-1 by default, CP437 or UTF-8 when
 * negotiated) but input was `data.toString("utf-8")` for everyone: an Amiga
 * client on the default wire sends a-ring as the one byte 0xE5, which UTF-8
 * cannot read, and the board received U+FFFD. Driven through
 * setupTelnetSSHHandler's data handler, the one every telnet keystroke takes.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { setupTelnetSSHHandler, type TransportSessionDeps } from '../../src/server/transport-session';
import { decodeFromWire } from '../../src/utils/wire-encoding.util';
import type { TelnetConnection } from '../../src/server/telnet-server';

class FakeConnection extends EventEmitter {
  session: any;
  sessionId = `telnet-${Math.random()}`;
  constructor(public nodeId: number) { super(); }
  write(): void {}
  close(): void {}
  getRemoteAddress(): string { return '127.0.0.1'; }
}

function caller(nodeId: number, wire: Record<string, unknown> = {}) {
  const connection = new FakeConnection(nodeId);
  connection.session = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.READ_COMMAND,
    user: { id: nodeId, username: `N${nodeId}`, secLevel: 100 }, nodeId,
    connectionType: 'telnet', tempData: {}, screenWidth: 80, screenHeight: 24, ...wire,
  };
  const handleCommand = jest.fn();
  const deps: TransportSessionDeps = {
    io: {} as never, sessions: new Map(), nodeManager: { releaseSession: jest.fn(async () => undefined) }, handleCommand,
  };
  setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);
  const type = (bytes: number[]) => connection.emit('data', Buffer.from(bytes));
  return { type, typed: () => handleCommand.mock.calls.map((c) => c[2]).join('') };
}

describe('a telnet caller typing a-ring', () => {
  it('arrives as a-ring from an Amiga client on the default Latin-1 wire', () => {
    const c = caller(41);
    c.type([0xe5]);
    expect(c.typed()).toBe('å');
  });

  it('still arrives as a-ring from a UTF-8 client left on that wire', () => {
    const c = caller(42);
    c.type([0xc3, 0xa5]);
    expect(c.typed()).toBe('å');
  });
});

describe('decodeFromWire', () => {
  it('reads a CP437 caller in CP437', () => {
    expect(decodeFromWire({ connectionType: 'telnet', wireCharset: 'cp437' } as any, Buffer.from([0x86]))).toBe('å');
  });

  it('leaves plain ASCII and a UTF-8 wire as they are', () => {
    expect(decodeFromWire({ connectionType: 'telnet' } as any, Buffer.from('hello'))).toBe('hello');
    expect(decodeFromWire({ connectionType: 'telnet', unicodeCapable: true } as any, Buffer.from([0xc3, 0xa5]))).toBe('å');
  });
});
