/**
 * The S an auto-rejoin runs returns to the join, not to the menu.
 *
 * express.e:5068 runs processSysCommand('S') inside joinConf, and the join
 * carries on to "Auto-ReJoined" and the stats. This board's S is a door
 * (zOOsTAtS); run as a typed command its exit drew the menu, so the prompt
 * stood above "Conference 4: Requests Auto-ReJoined" and the caller then
 * waited at a pause with no prompt on screen (sysop, 2026-09-30). A door run
 * inside a board flow is marked so its exit leaves the menu alone
 * (door.handler postDoorMenuAction 'caller').
 */
process.env.SKIP_DB_INIT = '1';

const seen: Array<{ cmd: string; callerContinues: boolean }> = [];
jest.mock('../../src/handlers/command.handler', () => ({
  ...jest.requireActual('../../src/handlers/command.handler'),
  processCommand: jest.fn(async (_socket: any, session: any, cmd: string) => {
    seen.push({ cmd, callerContinues: !!session.sysCommandCallerContinues });
    return 'SUCCESS';
  }),
  advanceDisplayFlow: jest.fn(async () => {}),
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn(async () => false),
  doPause: jest.fn(),
  checkScreenClear: jest.fn(),
  runQueuedScreenCommands: jest.fn(async () => {}),
}));
jest.mock('../../src/utils/message-pointers.util', () => ({
  getMailStatFile: jest.fn(async () => ({ lowestKey: 60, highMsgNum: 63, lowestNotDel: 60 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 63, lastMsgReadConf: 60, scanFlags: 0 })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));

import { joinConference, setConferences, setMessageBases, setHelpers, setConstants, FORCE_MAILSCAN_SKIP } from '../../src/handlers/operations/conference.handler';
import { postDoorMenuAction } from '../../src/handlers/door.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

beforeAll(() => {
  setConferences([{ id: 1, name: 'Amiga' }, { id: 2, name: 'C64' }, { id: 3, name: 'Console' }, { id: 4, name: 'Requests' }] as any);
  setMessageBases([{ id: 4, conferenceId: 4, name: 'Main' }] as any);
  setConstants({ SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState } as any);
  setHelpers({ callersLog: async () => {}, loadFlagged: async () => {}, loadHistory: async () => {} } as any);
});

it('runs S as part of the join, so a door S does not draw the menu', async () => {
  const socket: any = { id: `js-${Math.random()}`, emit: () => {}, on() {}, off() {}, removeListener() {} };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.AUTO_REJOIN, nodeId: 3, currentConf: 4,
    user: { id: 1, username: 'spot', secLevel: 20, securityFlags: '', confAccess: 'XXXX' }, tempData: {},
  };

  await joinConference(socket, session, 4, 4, false, true, FORCE_MAILSCAN_SKIP);

  expect(seen).toEqual([{ cmd: 'S', callerContinues: true }]);
  // And that mark is what the door runner reads at exit.
  expect(postDoorMenuAction({ ...session, sysCommandCallerContinues: true } as any)).toBe('caller');
  expect(session.sysCommandCallerContinues).toBeFalsy();
});
