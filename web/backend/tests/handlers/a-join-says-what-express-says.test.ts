/**
 * What a join prints, as express.e prints it (joinConf 5062-5115).
 *
 *  - Every join that is not quiet shows the message stats, not only an
 *    auto-rejoin (audit M8).
 *  - The logon rejoin is an AUTO join: express.e:28574 passes
 *    FORCE_MAILSCAN_SKIP in joinConf's `auto` slot, so the caller sees
 *    "Conference N: X Auto-ReJoined" and the stats (audit M9).
 *  - "Last message auto scanned" is lastNewReadConf-1, and 1 only when that
 *    is below zero (audit M16).
 *
 * Driven through the display flow's AUTO_REJOIN step and through J.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn(async () => false),
  doPause: jest.fn(),
  checkScreenClear: jest.fn(),
  runQueuedScreenCommands: jest.fn(async () => {}),
}));
jest.mock('../../src/utils/message-pointers.util', () => ({
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
  getMailStatFile: jest.fn(async () => ({ lowestKey: 1, highMsgNum: 11, lowestNotDel: 1 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 1, lastMsgReadConf: 4, scanFlags: 0 })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));

import { joinConference, setConferences, setMessageBases, setHelpers, setConstants, FORCE_MAILSCAN_SKIP } from '../../src/handlers/operations/conference.handler';
import { advanceDisplayFlow } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

beforeAll(() => {
  setConferences([{ id: 1, name: 'Amiga Demoscene!' }, { id: 2, name: 'C64 Demoscene' }] as any);
  setMessageBases([{ id: 1, conferenceId: 1, name: 'Main' }, { id: 2, conferenceId: 2, name: 'Main' }] as any);
  setConstants({ SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState } as any);
  setHelpers({ callersLog: async () => {}, loadFlagged: async () => {}, loadHistory: async () => {} } as any);
});

function caller(subState: string) {
  const out: string[] = [];
  const socket: any = { id: `jx-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
  const session: any = {
    state: 'loggedon', subState, nodeId: 1, currentConf: 1, relConfNum: 1, confRJoin: 2, menuPause: true,
    user: { id: 1, username: 'spot', secLevel: 20, securityFlags: '', confAccess: 'XX', autoRejoin: 2, confRJoin: 2 },
    tempData: {},
  };
  const plain = () => new Promise<string>((r) => setTimeout(() => r(out.join('').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')), 60));
  return { socket, session, plain };
}

describe('a join', () => {
  it('at logon is an auto-rejoin, with the stats', async () => {
    const c = caller(LoggedOnSubState.AUTO_REJOIN);
    await advanceDisplayFlow(c.socket, c.session);
    const text = await c.plain();
    expect(text).toContain('Conference 2: C64 Demoscene Auto-ReJoined');
    expect(text).not.toContain('Joining Conference');
    expect(text).toContain('Total messages           : 10');
  });

  it('by J shows the stats as well, and the clamp is express.e\'s', async () => {
    const c = caller(LoggedOnSubState.READ_COMMAND);
    await joinConference(c.socket, c.session, 2, 2, false, false, FORCE_MAILSCAN_SKIP);
    const text = await c.plain();
    expect(text).toContain('Joining Conference: C64 Demoscene');
    expect(text).toContain('Total messages           : 10');
    // lastNewReadConf 1: 1-1 = 0, and 0 is not below zero.
    expect(text).toContain('Last message auto scanned: 0');
    expect(text).toContain('Last message read        : 4');
  });
});
