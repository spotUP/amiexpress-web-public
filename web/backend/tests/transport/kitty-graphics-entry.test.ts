/**
 * KITTY GRAPHICS, DRIVEN THROUGH THE TELNET ENTRY POINT.
 *
 * The one reachability test for the feature
 * (thoughts/shared/plans/2026-11-08-kitty-graphics.md): a telnet caller's
 * terminal names itself, the board asks the kitty query, the terminal's OK
 * comes back inside the input stream and never reaches the command handler,
 * and a door's picture then leaves on the wire byte for byte - not folded at
 * 80 columns, though the caller is 132 wide and the fold is live for him.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import type { Socket } from 'socket.io';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import {
  setupTelnetSSHHandler,
  type TransportEmitter,
  type TransportSessionDeps,
} from '../../src/server/transport-session';
import type { TelnetConnection } from '../../src/server/telnet-server';
import type { BBSSession } from '../../src/index';
import { BBSApi } from '../../src/doors/BBSApi';
import { KITTY_PROBE } from '../../src/utils/kitty-graphics.util';
import { encodeKittyImage } from '../../src/services/kitty-graphics.service';

class FakeTransportConnection extends EventEmitter {
  public sessionId = 'telnet-21-kitty-entry-test';
  public nodeId = 21;
  public session: BBSSession | null = null;
  public written: Buffer[] = [];

  write(data: Buffer | string): void {
    this.written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data));
  }

  close(): void {}

  getRemoteAddress(): string {
    return '127.0.0.1';
  }

  wire(): string {
    return Buffer.concat(this.written).toString('latin1');
  }
}

function wideSession(): BBSSession {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.READ_COMMAND,
    user: { id: 21, username: 'NODE21', secLevel: 100 },
    nodeId: 21,
    currentConf: 1,
    conferenceId: 1,
    currentMsgBase: 1,
    timeRemaining: 3600,
    lastActivity: Date.now(),
    commandBuffer: '',
    menuPause: false,
    inputBuffer: '',
    relConfNum: 1,
    currentConfName: 'Main',
    tempData: {},
  } as unknown as BBSSession;
}

describe('kitty graphics through the telnet entry point', () => {
  it('probes, takes the OK out of the input, and sends an unfolded picture', () => {
    const connection = new FakeTransportConnection();
    connection.session = wideSession();
    const handleCommand = jest.fn();
    const deps: TransportSessionDeps = {
      io: {} as never,
      sessions: new Map<string, BBSSession>(),
      nodeManager: { releaseSession: jest.fn(async () => undefined) },
      handleCommand,
    };

    setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);
    connection.emit('terminal-type', {
      terminalType: 'XTERM-KITTY',
      isC64: false,
      unicodeCapable: true,
      width: 132,
      height: 40,
    });

    // The probe went out once, right after the TTYPE answer.
    expect(connection.wire()).toContain(KITTY_PROBE);
    expect(connection.session.kittyProbeSent).toBe(true);
    expect(connection.session.kittyGraphics).not.toBe(true);

    // The terminal's OK, cut by a packet boundary, then a real keypress.
    connection.emit('data', Buffer.from('\x1b_Gi=31;O', 'latin1'));
    expect(handleCommand).not.toHaveBeenCalled();
    connection.emit('data', Buffer.from('K\x1b\\M', 'latin1'));

    expect(connection.session.kittyGraphics).toBe(true);
    expect(handleCommand).toHaveBeenCalledTimes(1);
    expect(handleCommand.mock.calls[0][2]).toBe('M');

    // A 5000-byte picture is two APC chunks and ~6.7 KB of base64; any
    // fold at 80 columns would put CR LF inside it.
    const png = new Uint8Array(5000).map((_, k) => k & 0xff);
    const emitter = (connection as unknown as { emitter: TransportEmitter }).emitter;
    const api = new BBSApi(emitter as unknown as Socket, connection.session);
    connection.written = [];

    expect(api.kittyGraphics).toBe(true);
    expect(api.sendImage({ png }, { cols: 20, fallback: 'no picture' })).toBe(true);

    const apc = encodeKittyImage({ png }, { cols: 20 });
    expect(apc).not.toBeNull();
    expect(connection.wire()).toContain(apc as string);
    expect(connection.wire()).not.toContain('no picture');
  });

  it('a caller that never answered OK gets the fallback text', () => {
    const connection = new FakeTransportConnection();
    connection.session = wideSession();
    const deps: TransportSessionDeps = {
      io: {} as never,
      sessions: new Map<string, BBSSession>(),
      nodeManager: { releaseSession: jest.fn(async () => undefined) },
      handleCommand: jest.fn(),
    };
    setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);
    connection.emit('terminal-type', { terminalType: 'ANSI', isC64: false, width: 80, height: 25 });

    const emitter = (connection as unknown as { emitter: TransportEmitter }).emitter;
    const api = new BBSApi(emitter as unknown as Socket, connection.session);
    connection.written = [];

    expect(api.sendImage({ png: new Uint8Array([1, 2, 3]) }, { fallback: '[picture]' })).toBe(false);
    expect(connection.wire()).toContain('[picture]');
    expect(connection.wire()).not.toContain('\x1b_G');
  });
});
