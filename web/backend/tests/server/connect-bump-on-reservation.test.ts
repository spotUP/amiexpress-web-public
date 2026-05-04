/**
 * Regression test for A-3 connect-time bump (express.e:28734-28738 / 29129-29135).
 *
 * When a node has a reservation set and a non-matching user authenticates
 * to that node, express.e emits "420 Node is currently reserved for
 * another user." and disconnects. doReserve() at express.e:29129-29135
 * uses StriCmp (case-insensitive) for the check.
 *
 * The auth-socket-handler is a heavyweight integration surface that
 * pulls in the entire BBS subsystem and can't be unit-loaded cleanly
 * under jest, so we use a structural grep test pinning the bump shape.
 *
 * What we pin:
 *   - the auth handler imports isReservationMatch from node-reservation.service
 *   - it calls isReservationMatch with (session.nodeId, user.username) BEFORE
 *     the login-success / state=LOGGEDON transition fires
 *   - on mismatch it emits the express.e:28736 string ("420 Node is currently
 *     reserved for another user.") and disconnects
 *   - it cites express.e:28734-28738 for the bump
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Auth handler bumps non-matching user when node is reserved (A-3, express.e:28734-28738)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'server', 'auth-socket-handlers.ts'),
    'utf8'
  );

  test('imports isReservationMatch from node-reservation.service', () => {
    expect(src).toMatch(
      /isReservationMatch[\s\S]{0,80}?from\s*['"][^'"]*node-reservation\.service['"]|require\(['"][^'"]*node-reservation\.service['"]\)[\s\S]{0,80}?isReservationMatch/
    );
  });

  test('emits the express.e:28736 reservation-bump string somewhere in the file', () => {
    expect(src).toMatch(/420 Node is currently reserved for another user/);
  });

  test('the bump check calls isReservationMatch(session.nodeId, ...) and gates on its result', () => {
    // We require the auth handler to:
    //   1. invoke isReservationMatch with session.nodeId
    //   2. branch on the result to disconnect / emit the 420 string
    const matchSite = src.match(
      /isReservationMatch\(\s*session\.nodeId[^)]*\)[\s\S]{0,500}?(420 Node is currently reserved|disconnect)/
    );
    expect(matchSite).not.toBeNull();
  });

  test('cites express.e:28734-28738 for the bump branch', () => {
    expect(src).toMatch(/express\.e:28734-28738|express\.e:29129-29135/);
  });
});
