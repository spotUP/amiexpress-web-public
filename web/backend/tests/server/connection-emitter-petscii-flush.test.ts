/**
 * Task 10 controller add: the per-session AnsiToPetsciiTransducer holds a
 * trailing bare CR in `pending` until it sees whether a `\n` completes it.
 * `flushPendingPetscii` (connection-emitter.ts) is the boundary that
 * resolves it - called once, at the telnet/SSH input boundary
 * (index.ts's `connection.on('data', ...)`), never per emit.
 */
process.env.SKIP_DB_INIT = '1';

import { buildConnectionEmitter, flushPendingPetscii } from '../../src/server/connection-emitter';

function connectionWith(session: any) {
  const written: Buffer[] = [];
  const connection: any = {
    write: (b: Buffer | string) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(b)),
    session,
    sessionId: 'flush-test',
    on() {}, off() {}, close() {},
  };
  return { connection, written, all: () => Buffer.concat(written) };
}

describe('flushPendingPetscii', () => {
  it('a bare trailing CR is flushed to the wire as $9D-per-column BEFORE input is awaited', () => {
    const session: any = { terminalType: 'c64', petsciiMode: true };
    const { connection, all } = connectionWith(session);
    const emitter = buildConnectionEmitter(connection);

    // Move the cursor to column 5, then emit an ansi-output chunk ending in
    // a bare CR (no trailing \n in this chunk - the newline never comes,
    // e.g. a prompt like "...ready\r" with no more output before the input
    // wait).
    emitter.emit('ansi-output', 'ABCDE\r');
    const beforeFlush = all().length;

    // Nothing walked the cursor back yet - the CR is still held pending on
    // the transducer, not on the wire.
    expect(Array.from(all()).filter((b) => b === 0x9d)).toHaveLength(0);

    // Simulate the input-wait boundary (what index.ts's connection.on('data')
    // does before dispatching the keystroke).
    flushPendingPetscii(connection);

    const bytes = Array.from(all());
    expect(bytes.length).toBeGreaterThan(beforeFlush);
    // Cursor was at column 5 (after "ABCDE"): five $9D (cursor-left) bytes
    // walk it back to column 0, matching carriageOnly()'s per-column walk.
    expect(bytes.slice(beforeFlush)).toEqual([0x9d, 0x9d, 0x9d, 0x9d, 0x9d]);
  });

  it('a CRLF split across two emits still yields exactly one $0D - no doubling', () => {
    const session: any = { terminalType: 'c64', petsciiMode: true };
    const { connection, all } = connectionWith(session);
    const emitter = buildConnectionEmitter(connection);

    // Chunk 1 ends in a bare CR; chunk 2 starts with the completing LF.
    // NOTHING calls flushPendingPetscii between them - only a genuine
    // input-wait boundary would, and none occurs here because more output
    // is still coming.
    emitter.emit('ansi-output', 'line one\r');
    emitter.emit('ansi-output', '\nline two');

    const bytes = Array.from(all());
    expect(bytes.filter((b) => b === 0x0d)).toHaveLength(1);
    // No stray cursor-left walk was emitted for the CR half of the pair.
    expect(bytes.filter((b) => b === 0x9d)).toHaveLength(0);

    // A later flush at the real input boundary is a no-op: the transducer
    // has nothing pending because the CRLF was already resolved above.
    const lenBeforeFlush = bytes.length;
    flushPendingPetscii(connection);
    expect(all().length).toBe(lenBeforeFlush);
  });

  it('is a no-op for a session with no transducer (web sessions, or telnet before any ansi-output)', () => {
    const { connection, all } = connectionWith({ terminalType: 'modern', petsciiMode: false });
    flushPendingPetscii(connection);
    expect(all().length).toBe(0);
  });

  it('is a no-op with no session at all (pre-login telnet)', () => {
    const { connection, all } = connectionWith(null);
    expect(() => flushPendingPetscii(connection)).not.toThrow();
    expect(all().length).toBe(0);
  });
});
