/**
 * "users report massive mouse leak when they log off" (sysop, 2026-09-30):
 * a telnet caller's own shell filled with `35;54;15M35;54;14M...` after the
 * board hung up. Their terminal was still in xterm any-motion mouse mode, and
 * the reports it kept sending landed at their prompt.
 *
 * Mouse-off was sent at door exit and at G. Every board-side hangup - G, the
 * idle and time-limit logoffs, a sysop kick, a door dropping carrier - ends in
 * the connection's close(), and that is where it is sent now.
 */
import { EventEmitter } from 'events';
import { TelnetConnection } from '../../src/server/telnet-server';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { MOUSE_REPORTING_OFF } from '../../src/utils/terminal-modes';

class StubNetSocket extends EventEmitter {
  public remoteAddress = '127.0.0.1';
  public destroyed = false;
  public log: string[] = [];
  write(data: Buffer | string): boolean {
    this.log.push(`write:${typeof data === 'string' ? data : Buffer.from(data).toString('latin1')}`);
    return true;
  }
  end(): void {
    this.log.push('end');
  }
}

describe('a telnet hangup', () => {
  it('turns every mouse-reporting mode off before the line goes down', () => {
    const socket = new StubNetSocket();
    const connection = new TelnetConnection(socket as unknown as import('net').Socket);
    const emitter = buildConnectionEmitter(connection);
    socket.log.length = 0; // telnet negotiation written by the constructor

    // The board's own hangup, as beginLogoff and the transport rulings do it.
    (emitter as any).disconnect();

    expect(socket.log).toEqual([`write:${MOUSE_REPORTING_OFF}`, 'end']);
  });

  it('writes nothing to a socket the caller already closed', () => {
    const socket = new StubNetSocket();
    const connection = new TelnetConnection(socket as unknown as import('net').Socket);
    socket.log.length = 0;
    socket.destroyed = true;
    connection.close();
    expect(socket.log).toEqual(['end']);
  });
});
