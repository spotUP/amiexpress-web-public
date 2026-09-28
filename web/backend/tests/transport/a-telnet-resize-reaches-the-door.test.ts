/**
 * A telnet caller's resize reaches the door that is running.
 *
 * The door was told about a resize on the web path only (socket-handlers
 * terminal-size -> bbsApi screen:resize), and the real terminal height lived
 * in `tempData.termHeight`, which only web set and any `tempData = {...}`
 * wiped. A TypeScript door never heard a telnet caller's NAWS or an SSH
 * caller's window-change (web-vs-telnet audit item 12, 2026-09-28). Driven
 * through setupTelnetSSHHandler's window-size listener, the one NAWS takes.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { setupTelnetSSHHandler, type TransportSessionDeps } from '../../src/server/transport-session';
import type { TelnetConnection } from '../../src/server/telnet-server';

class FakeConnection extends EventEmitter {
  session: any;
  sessionId = `telnet-resize-${Math.random()}`;
  constructor(public nodeId: number) { super(); }
  write(): void {}
  close(): void {}
  getRemoteAddress(): string { return '127.0.0.1'; }
}

function telnetCallerInADoor(nodeId: number, extra: Record<string, unknown> = {}) {
  const connection = new FakeConnection(nodeId);
  const heard: Array<[string, unknown]> = [];
  connection.session = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.DOOR_RUNNING,
    user: { id: nodeId, username: `N${nodeId}`, secLevel: 100 }, nodeId, connectionType: 'telnet',
    tempData: {}, screenWidth: 80, screenHeight: 24, terminalType: 'modern',
    bbsApi: { emitInternal: (event: string, payload: unknown) => heard.push([event, payload]) },
    ...extra,
  };
  const deps: TransportSessionDeps = {
    io: {} as never, sessions: new Map(), nodeManager: { releaseSession: jest.fn(async () => undefined) }, handleCommand: jest.fn(),
  };
  setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);
  return { connection, heard };
}

describe('a telnet resize', () => {
  it('tells the running door, and keeps the real height where a tempData reset cannot wipe it', () => {
    const { connection, heard } = telnetCallerInADoor(51);

    connection.emit('window-size', 100, 40);

    expect(heard).toEqual([['screen:resize', { cols: 100, rows: 40 }]]);
    expect(connection.session.wireHeight).toBe(40);
    connection.session.tempData = { inputBuffer: '' };
    expect(connection.session.wireHeight).toBe(40);
  });

  it('tells nobody when a PETSCII caller reports a size - his screen is 40x25', () => {
    const { connection, heard } = telnetCallerInADoor(52, { petsciiMode: true, terminalType: 'c64' });

    connection.emit('window-size', 80, 30);

    expect(heard).toEqual([]);
    expect(connection.session.wireHeight).toBeUndefined();
  });
});
