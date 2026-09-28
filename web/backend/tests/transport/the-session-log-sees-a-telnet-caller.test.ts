/**
 * The sysop's session-log viewer sees a telnet caller.
 *
 * It was fed only by wrappers on a web socket's emit, so a telnet or SSH
 * caller never appeared on the admin session-log page (web-vs-telnet audit
 * item 15, 2026-09-28). Driven through setupTelnetSSHHandler, the entry every
 * telnet connection takes, and the connection emitter every board write to it
 * goes through.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { setupTelnetSSHHandler, type TransportSessionDeps } from '../../src/server/transport-session';
import { sessionLogManager } from '../../src/services/SessionLogManager';
import type { TelnetConnection } from '../../src/server/telnet-server';

it('records what the board said to a telnet caller and what he typed', () => {
  const connection: any = Object.assign(new EventEmitter(), {
    sessionId: `telnet-log-${Date.now()}`,
    nodeId: 61,
    write: () => {},
    close: () => {},
    getRemoteAddress: () => '127.0.0.1',
  });
  connection.session = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.READ_COMMAND, nodeId: 61,
    user: { id: 61, username: 'N61', secLevel: 100 }, connectionType: 'telnet', tempData: {},
    screenWidth: 80, screenHeight: 24, terminalType: 'modern',
  };
  const deps: TransportSessionDeps = {
    io: {} as never, sessions: new Map(), nodeManager: { releaseSession: jest.fn(async () => undefined) }, handleCommand: jest.fn(),
  };
  setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);

  connection.emitter.emit('ansi-output', 'WELCOME TO THE BOARD');
  connection.emit('data', Buffer.from('X'));

  const log = sessionLogManager.getSessionOutput(connection.sessionId) ?? '';
  expect(log).toContain('WELCOME TO THE BOARD');
  expect(JSON.stringify(sessionLogManager.getSessionLog(connection.sessionId))).toContain('X');
});
