/**
 * Tests for the per-node reservation service (audit A-3, full parity).
 *
 * express.e:29129-29135 doReserve(username) rejects callers whose handle
 * doesn't match `reservedName` (case-insensitive — StriCmp at 29131).
 * Sysop F4 toggle at express.e:7649-7656 sets/clears the per-node string;
 * logoff at 8213 clears it. The web equivalent is this service:
 *   - in-memory Map<nodeId, string>
 *   - case-insensitive matchers helper for the connect-time bump
 *   - per-node isolation
 */

import {
  setNodeReservation,
  getNodeReservation,
  clearNodeReservation,
  isReservationMatch,
  resetAllNodeReservations,
} from '../../src/services/node-reservation.service';

describe('node-reservation.service (A-3 full parity, express.e:29129-29135 / 7649-7656 / 8213)', () => {
  beforeEach(() => {
    resetAllNodeReservations();
  });

  describe('set/get/clear', () => {
    it('stores a username for a node and reads it back', () => {
      setNodeReservation(1, 'alice');
      expect(getNodeReservation(1)).toBe('alice');
    });

    it('returns null for a node with no reservation', () => {
      expect(getNodeReservation(7)).toBeNull();
    });

    it('clearNodeReservation removes the reservation', () => {
      setNodeReservation(2, 'bob');
      expect(getNodeReservation(2)).toBe('bob');
      clearNodeReservation(2);
      expect(getNodeReservation(2)).toBeNull();
    });

    it('clearNodeReservation on an unset node is a no-op', () => {
      expect(() => clearNodeReservation(99)).not.toThrow();
      expect(getNodeReservation(99)).toBeNull();
    });

    it('setting empty/whitespace clears the reservation (express.e:7652-7653 toggle)', () => {
      setNodeReservation(3, 'carol');
      setNodeReservation(3, '');
      expect(getNodeReservation(3)).toBeNull();
      setNodeReservation(3, 'carol');
      setNodeReservation(3, '   ');
      expect(getNodeReservation(3)).toBeNull();
    });

    it('overwrites an existing reservation on the same node', () => {
      setNodeReservation(4, 'alice');
      setNodeReservation(4, 'bob');
      expect(getNodeReservation(4)).toBe('bob');
    });
  });

  describe('per-node isolation', () => {
    it('reservations on one node do not leak to another', () => {
      setNodeReservation(1, 'alice');
      setNodeReservation(2, 'bob');
      expect(getNodeReservation(1)).toBe('alice');
      expect(getNodeReservation(2)).toBe('bob');
      clearNodeReservation(1);
      expect(getNodeReservation(1)).toBeNull();
      expect(getNodeReservation(2)).toBe('bob');
    });
  });

  describe('isReservationMatch (case-insensitive — express.e:29131 StriCmp)', () => {
    it('returns true when no reservation is set (anyone can connect)', () => {
      expect(isReservationMatch(1, 'alice')).toBe(true);
    });

    it('returns true when username matches reservation exactly', () => {
      setNodeReservation(1, 'alice');
      expect(isReservationMatch(1, 'alice')).toBe(true);
    });

    it('returns true when username matches reservation case-insensitively', () => {
      setNodeReservation(1, 'Alice');
      expect(isReservationMatch(1, 'ALICE')).toBe(true);
      expect(isReservationMatch(1, 'alice')).toBe(true);
    });

    it('returns false when username does not match reservation', () => {
      setNodeReservation(1, 'alice');
      expect(isReservationMatch(1, 'bob')).toBe(false);
    });

    it('treats null/empty input username as non-matching when reservation is set', () => {
      setNodeReservation(1, 'alice');
      expect(isReservationMatch(1, '')).toBe(false);
      expect(isReservationMatch(1, null as any)).toBe(false);
      expect(isReservationMatch(1, undefined as any)).toBe(false);
    });
  });
});
