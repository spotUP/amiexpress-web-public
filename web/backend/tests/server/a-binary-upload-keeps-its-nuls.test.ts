/**
 * An upload in BINARY keeps every byte the file holds.
 *
 * The telnet input path collapsed CR NUL to CR during a transfer - right for
 * a client that never negotiated BINARY and escapes CR as CR NUL (MuffinTerm),
 * wrong for one that did: RFC 856 has no CR rule for a binary sender, and a
 * file holding the bytes 0D 00 lost the 00. `sz` escapes neither by default,
 * so the upload looped on CRC errors and aborted - the "file transfers have
 * issues via telnet" the sysop reported (2026-09-27). Driven through the real
 * IAC state machine with a stubbed socket.
 */
jest.mock('../../src/index', () => ({ LOCALHOST_IPS: [] }));

import { EventEmitter } from 'events';
import { TelnetConnection } from '../../src/server/telnet-server';

const IAC = 255, WILL = 251, BINARY = 0;

function aLine(opts: { binary: boolean }) {
  const socket: any = new EventEmitter();
  socket.remoteAddress = '127.0.0.1';
  socket.write = jest.fn();
  socket.end = jest.fn();
  const connection = new TelnetConnection(socket);
  (connection as any).session = { transferRawActive: true };
  if (opts.binary) socket.emit('data', Buffer.from([IAC, WILL, BINARY]));
  const got: number[] = [];
  connection.on('data', (chunk: Buffer) => got.push(...chunk));
  return { send: (bytes: number[]) => socket.emit('data', Buffer.from(bytes)), got };
}

describe('a transfer from a client sending BINARY', () => {
  it('keeps the NUL after a CR', () => {
    const line = aLine({ binary: true });
    line.send([0x41, 0x0d, 0x00, 0x42]);
    expect(line.got).toEqual([0x41, 0x0d, 0x00, 0x42]);
  });

  it('keeps 0D FF 00, the FF arriving as IAC IAC', () => {
    const line = aLine({ binary: true });
    line.send([0x0d, IAC, IAC, 0x00]);
    expect(line.got).toEqual([0x0d, 0xff, 0x00]);
  });
});

describe('a transfer from a client that never negotiated BINARY', () => {
  it('still reads CR NUL as the CR it escapes', () => {
    const line = aLine({ binary: false });
    line.send([0x41, 0x0d, 0x00, 0x42]);
    expect(line.got).toEqual([0x41, 0x0d, 0x42]);
  });

  it('keeps a NUL that no CR came before', () => {
    const line = aLine({ binary: false });
    line.send([0x41, 0x00, 0x42]);
    expect(line.got).toEqual([0x41, 0x00, 0x42]);
  });

  it('keeps the NUL after an IAC IAC, which is data and not a CR', () => {
    const line = aLine({ binary: false });
    line.send([0x0d, IAC, IAC, 0x00]);
    expect(line.got).toEqual([0x0d, 0xff, 0x00]);
  });
});
