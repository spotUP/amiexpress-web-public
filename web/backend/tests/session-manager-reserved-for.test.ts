/**
 * Regression test for A-3: createSession() pulls reservedFor from the
 * per-node reservation service so the existing pre-login warning emit
 * (handlers/command-handler/pre-login.ts:237-245, express.e:29554-29557)
 * fires for caller sessions on a reserved node.
 *
 * Without this wiring, session.reservedFor stays undefined and the
 * BBSTITLE warning never displays — even though the sysop set a
 * reservation through the admin endpoint.
 */

import { createSession } from '../src/server/session-manager';
import {
  setNodeReservation,
  resetAllNodeReservations,
} from '../src/services/node-reservation.service';

describe('createSession + node-reservation.service wiring (A-3, express.e:29554-29557)', () => {
  beforeEach(() => {
    resetAllNodeReservations();
  });

  it('createSession populates session.reservedFor from the per-node store', () => {
    setNodeReservation(3, 'alice');
    const session = createSession(3);
    expect((session as any).reservedFor).toBe('alice');
  });

  it('createSession leaves reservedFor undefined when no reservation is set', () => {
    const session = createSession(4);
    expect((session as any).reservedFor).toBeFalsy();
  });

  it('per-node isolation — node 1 reservation does not leak into node 2 session', () => {
    setNodeReservation(1, 'alice');
    const session2 = createSession(2);
    expect((session2 as any).reservedFor).toBeFalsy();
  });
});
