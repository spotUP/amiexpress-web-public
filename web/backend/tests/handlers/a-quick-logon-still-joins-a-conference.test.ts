/**
 * A quick logon ("[Q=SKIP BULLS]" at the graphics prompt) still rejoins the
 * caller's conference - without its bulletin.
 *
 * The quick path went straight to the menu, so no conference was ever joined
 * and the prompt read "[0:General] Menu" - the session's start-up placeholder
 * (sysop, 2026-09-30). MS then tried to put the caller back into that
 * conference 0. The quick logon now enters the display flow at AUTO_REJOIN,
 * express.e's rejoin (28574), and the flag skips CONF_BULL on the way.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn(async () => false),
  doPause: jest.fn(),
  checkScreenClear: jest.fn(),
  runQueuedScreenCommands: jest.fn(async () => {}),
}));
jest.mock('../../src/utils/message-pointers.util', () => ({
  getMailStatFile: jest.fn(async () => ({ lowestKey: 1, highMsgNum: 1, lowestNotDel: 0 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 0, lastMsgReadConf: 0, scanFlags: 0 })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));

import { setConferences, setMessageBases, setHelpers, setConstants } from '../../src/handlers/operations/conference.handler';
import { advanceDisplayFlow } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { displayScreen } from '../../src/handlers/screen.handler';

const displayScreenMock = displayScreen as unknown as jest.Mock;

beforeAll(() => {
  setConferences([{ id: 1, name: 'Amiga Demoscene!' }, { id: 2, name: 'C64 Demoscene' }] as any);
  setMessageBases([{ id: 1, conferenceId: 1, name: 'Main' }, { id: 2, conferenceId: 2, name: 'Main' }] as any);
  setConstants({ SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState } as any);
  setHelpers({ callersLog: async () => {}, loadFlagged: async () => {}, loadHistory: async () => {} } as any);
});

describe('a quick logon', () => {
  it('rejoins the caller\'s conference, and shows no conference bulletin', async () => {
    const socket: any = { id: `ql-${Math.random()}`, emit: () => {}, on() {}, off() {}, removeListener() {} };
    const session: any = {
      state: 'loggedon', subState: LoggedOnSubState.AUTO_REJOIN, nodeId: 1, menuPause: true,
      // What a fresh session holds before any join (session-manager defaults).
      currentConf: 0, relConfNum: 0, currentConfName: 'General', confRJoin: 2,
      user: { id: 1, username: 'spot', secLevel: 255, securityFlags: '', confAccess: 'XX', autoRejoin: 2, confRJoin: 2 },
      tempData: { quickLogon: true },
    };

    await advanceDisplayFlow(socket, session);

    expect(session.currentConf).toBe(2);
    expect(session.relConfNum).toBe(2);
    expect(session.currentConfName).toBe('C64 Demoscene');
    expect(displayScreenMock.mock.calls.map((c: any[]) => c[2])).not.toContain('CONF_BULL');
    expect(session.tempData.quickLogon).toBe(false);
  });
});
