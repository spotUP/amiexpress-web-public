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
import { SSHConnection } from '../../src/server/ssh-server';
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
  public writableEnded = false;
  end(): void {
    this.log.push('end');
    this.writableEnded = true;
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

  it('writes and ends nothing on a socket the caller already closed', () => {
    const socket = new StubNetSocket();
    const connection = new TelnetConnection(socket as unknown as import('net').Socket);
    socket.log.length = 0;
    socket.destroyed = true;
    connection.close();
    expect(socket.log).toEqual([]);
  });
});

describe('a telnet line that is already down', () => {
  it('a second hangup writes nothing after end', () => {
    const socket = new StubNetSocket();
    const connection = new TelnetConnection(socket as unknown as import('net').Socket);
    socket.log.length = 0;
    connection.close();
    connection.close();
    expect(socket.log).toEqual([`write:${MOUSE_REPORTING_OFF}`, 'end']);
  });

  it('a door still drawing after the hangup writes nothing after end', () => {
    const socket = new StubNetSocket();
    const connection = new TelnetConnection(socket as unknown as import('net').Socket);
    connection.close();
    socket.log.length = 0;
    connection.write('late frame');
    expect(socket.log).toEqual([]);
  });

  it('the caller closing its half gets mouse-off before the socket auto-ends', () => {
    const socket = new StubNetSocket();
    const connection = new TelnetConnection(socket as unknown as import('net').Socket);
    socket.log.length = 0;
    // net's own auto-end listener, registered before ours in real life.
    socket.on('end', () => socket.end());
    socket.emit('end');
    expect(socket.log).toEqual([`write:${MOUSE_REPORTING_OFF}`, 'end']);
    void connection;
  });
});

describe('an SSH hangup', () => {
  function make() {
    const client: any = new EventEmitter();
    client.end = jest.fn();
    const connection = new SSHConnection(client, 1);
    const writes: string[] = [];
    (connection as any).stream = {
      write: (d: any) => writes.push(String(d)),
      close: jest.fn(),
    };
    return { connection, client, writes };
  }

  it('turns mouse reporting off before the stream closes', () => {
    const { connection, writes } = make();
    connection.close();
    expect(writes).toEqual([MOUSE_REPORTING_OFF]);
  });

  it('a second hangup and a late write put nothing on the stream', () => {
    const { connection, client, writes } = make();
    connection.close();
    connection.close();
    connection.write('late frame');
    expect(writes).toEqual([MOUSE_REPORTING_OFF]);
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
