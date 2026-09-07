/**
 * A caller who drops and does not come back is logged off, not kept as a ghost.
 *
 * Live, 2026-09-07 21:28: the sysop's browser tab dropped (`ping timeout`),
 * the disconnect handler waited its 3 s grace and then wrote "User reconnected
 * during grace period, skipping cleanup" - with no reconnection anywhere in
 * the log. Its test was `Boolean(session.socketId)`, and a session still
 * holding the DEAD socket's own id passes that. The ghost stayed on /health
 * (`callers: 1`), and the deploy guard refused every deploy for an hour for a
 * sysop who had closed his browser.
 *
 * A reconnect is a REBIND: the restore path gives the session the new socket's
 * id. That, and only that, is what the grace check may accept.
 */
import { reboundSince } from '../../src/server/session-manager';

describe('after the disconnect grace period', () => {
  it('a session still holding the dead socket\'s id has NOT reconnected', () => {
    expect(reboundSince({ socketId: 'dead-socket' }, 'dead-socket')).toBe(false);
  });

  it('a session rebound to a new socket has', () => {
    expect(reboundSince({ socketId: 'new-socket' }, 'dead-socket')).toBe(true);
  });

  it('no session, or a session with no socket, has not', () => {
    expect(reboundSince(null, 'dead-socket')).toBe(false);
    expect(reboundSince(undefined, 'dead-socket')).toBe(false);
    expect(reboundSince({}, 'dead-socket')).toBe(false);
    expect(reboundSince({ socketId: '' }, 'dead-socket')).toBe(false);
  });
});
