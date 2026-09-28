/**
 * Regression test for A-3 logoff clear (express.e:8213).
 *
 * After a user logs off, the per-node reservation must be cleared so the
 * next caller isn't blocked by a stale reservation pointing at the user
 * who just left. express.e does this in writeLogoff at line 8213
 * (StrCopy(reservedName,'')).
 *
 * Driven through the REAL handleGoodbyeCommand (system-commands.handler,
 * loaded unmocked as tests/system-commands.test.ts does): a node carries a
 * reservation in the real node-reservation service, the caller says G Y,
 * and the reservation must be gone - on that node only. The LOGOFF
 * sys-commands are stubbed; they run doors and are not what is under test.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/command-execution.handler', () => ({
  runSysCommand: jest.fn().mockResolvedValue(undefined),
}));

import { handleGoodbyeCommand, setSystemCommandsDependencies } from '../../src/handlers/commands/system-commands.handler';
import {
  setNodeReservation, getNodeReservation, resetAllNodeReservations,
} from '../../src/services/node-reservation.service';

describe('handleGoodbyeCommand clears node reservation on logoff (A-3, express.e:8213)', () => {
  beforeEach(() => {
    resetAllNodeReservations();
    setSystemCommandsDependencies({
      displayScreen: async () => true,
      findSecurityScreen: () => null,
    } as any);
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('a caller who says goodbye releases the reservation on his node', async () => {
    jest.useFakeTimers(); // the 2 s force-disconnect timer
    setNodeReservation(3, 'spot');
    setNodeReservation(4, 'someone');
    const socket: any = { emit: jest.fn(), disconnect: jest.fn() };
    const session: any = {
      nodeId: 3, tempData: {}, shortcuts: new Map(),
      user: { username: 'spot', slotNumber: 2 },
      flagManager: { getCount: () => 0, save: jest.fn() },
    };

    await handleGoodbyeCommand(socket, session, 'Y');

    expect(getNodeReservation(3)).toBeNull();
    // Only the caller's own node: the next node's reservation stands.
    expect(getNodeReservation(4)).toBe('someone');
  });
});
