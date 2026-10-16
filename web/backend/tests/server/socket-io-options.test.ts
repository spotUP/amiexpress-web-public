/**
 * One disconnect mechanism (session-persistence plan S7, Decisions 9 and 10).
 *
 * A dropped web caller comes back through the resume token and session
 * parking, nothing else: socket.io's own connectionStateRecovery is off, and
 * pingTimeout is socket.io's default 20 s so a frozen phone is noticed (and
 * its session parked) within pingInterval + pingTimeout = 45 s instead of
 * being held open on a dead transport for two minutes.
 *
 * Asserted on the options object index.ts spreads into `new Server(...)`,
 * as values - not on index.ts source text.
 */
import { SOCKET_IO_OPTIONS } from '../../src/server/socket-io-options';

describe('the socket.io server options', () => {
  it('notice a frozen socket in 45 s and leave recovery to session parking alone', () => {
    expect(SOCKET_IO_OPTIONS.pingTimeout).toBe(20000);
    expect((SOCKET_IO_OPTIONS.pingInterval ?? 0) + (SOCKET_IO_OPTIONS.pingTimeout ?? 0)).toBe(45000);
    expect('connectionStateRecovery' in SOCKET_IO_OPTIONS).toBe(false);
  });
});
