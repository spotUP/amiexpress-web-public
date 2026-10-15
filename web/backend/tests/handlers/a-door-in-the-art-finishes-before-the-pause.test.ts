/**
 * A door the bulletin launched must finish before the join pauses.
 *
 * `displayScreen` does not wait for the commands it finds in a screen.
 * `executeScreenCommands` schedules them on `setImmediate` and hands back
 * `session.pendingScreenCommand` for whoever needs them finished - and
 * nothing on the join path ever did. So `doPause` printed
 * `(Pause)...Space To Resume:` while a `~XI` door was still mid-flight, and
 * the prompt landed INSIDE the art, above rows the screen had not finished
 * putting on the wire.
 *
 * Every conference bulletin on this board ends with `~XISUBSCAN` except
 * conference 2's. The sysop, 2026-09-14, with a screenshot of the prompt
 * sitting between the uPtOwN logo and its bottom rule: "issue, prompt in the
 * ascii". Conference 2 - the one whose art carries no door - rendered
 * correctly, and that difference is what identified the door.
 *
 * `door.handler.ts:2551` already awaits this same promise before starting a
 * door of its own, so the contract existed; the join simply did not honour it.
 *
 * Driven through `joinConference`, with a door that resolves on its own
 * schedule: a test that let the door finish synchronously would pass on the
 * broken code, because the race is the defect.
 */
process.env.SKIP_DB_INIT = '1';

/** The order the caller would see things happen in. */
const events: string[] = [];

/** Released by hand, so "the door is still running" is a real state. */
let finishTheDoor: () => void = () => {};

jest.mock('../../src/services/custom-msgbase', () => ({
  MailFunction: { READ: 1, CREATE: 2, SCAN: 3, STATS: 4, SYSOP_COMMENT: 6, ZOOM: 7 },
  runCustomMsgbaseCommand: jest.fn(async () => false),
  tryCustomMsgbase: jest.fn(async () => false),
  customMsgbaseDoor: jest.fn(() => null),
  doorConference: jest.fn(() => 0),
  doorConferenceName: jest.fn(() => ''),
}));

jest.mock('../../src/handlers/screen.handler', () => ({
  /**
   * A bulletin carrying `~XISUBSCAN`: it draws, then leaves a door running.
   * That is exactly what displayScreen does with a screen command - it does
   * NOT await it.
   */
  displayScreen: jest.fn(async (_s: any, sess: any, name: string) => {
    if (!String(name).toUpperCase().includes('BULL')) return false;
    events.push('art');
    sess.pendingScreenCommand = new Promise<void>((resolve) => {
      finishTheDoor = () => {
        events.push('door');
        resolve();
      };
    });
    return true;
  }),
  doPause: jest.fn((_s: any, sess: any) => {
    events.push('pause');
    sess.paginatedScreen = { lines: ['\r\n'], nextIndex: 0, pageSize: 1, eventName: 'ansi-output', kind: 'doPause' };
  }),
  checkScreenClear: jest.fn(),
  runQueuedScreenCommands: jest.fn(async () => {}),
}));

jest.mock('../../src/handlers/message/message-scan.handler', () => ({
  checkConfAccess: () => true,
  checkMailConfScan: async () => false,
  performSingleConfMailScan: jest.fn(async () => {}),
}));

jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: () => ({
    custom: false,
    forceNewscan: false, noNewscan: false, showNewFiles: false,
    noNewFiles: false, forceMenus: false, noBulls: false, noConfBulls: false,
  }),
}));

jest.mock('../../src/utils/message-pointers.util', () => ({
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
  getMailStatFile: jest.fn(() => ({ lowestKey: 1, highMsgNum: 0, lowestNotDel: 1 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 0, lastMsgReadConf: 0 })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));

import {
  joinConference,
  FORCE_MAILSCAN_NONE,
  setConferences,
  setMessageBases,
  setHelpers,
  setConstants,
} from '../../src/handlers/operations/conference.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

function aBoard() {
  // Five conferences, because the join's forward-walk clamps against the
  // COUNT (express.e:4982-4993), not against the ids present.
  setConferences([
    { id: 1, name: 'Amiga Demoscene' }, { id: 2, name: 'Internal' },
    { id: 3, name: 'Three' }, { id: 4, name: 'Four' }, { id: 5, name: 'Five' },
  ] as any);
  setMessageBases([{ id: 5, conferenceId: 5, name: 'General' }] as any);
  setConstants({
    SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState,
  } as any);
  setHelpers({
    callersLog: async () => {}, loadFlagged: async () => {}, loadHistory: async () => {},
  } as any);
}

function aCaller() {
  const socket = {
    id: `art-door-${Math.random().toString(36).slice(2)}`,
    emit: () => {},
    on: () => {},
  } as any;
  const session = {
    nodeId: 1, currentConf: 1, relConfNum: 1,
    user: { id: 1, username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
    tempData: {},
  } as any;
  return { socket, session };
}

describe('a conference bulletin that launches a door', () => {
  beforeEach(() => {
    events.length = 0;
    finishTheDoor = () => {};
    aBoard();
  });

  it('does not print the pause while the door is still running', async () => {
    // Red before the fix: ['art', 'pause', 'door'] - the prompt went out in
    // the middle of the screen the door was still writing to.
    const { socket, session } = aCaller();

    const joining = joinConference(socket, session, 5, 5, false, false, FORCE_MAILSCAN_NONE, false);
    // Let the join reach the point where it would pause, then release the door.
    await new Promise((r) => setImmediate(r));
    finishTheDoor();
    await joining;

    expect(events).toEqual(['art', 'door', 'pause']);
  });

  it('still pauses once the door has finished', async () => {
    // The round trip: waiting must not swallow the pause. A join that draws a
    // bulletin and never stops is the opposite complaint.
    const { socket, session } = aCaller();

    const joining = joinConference(socket, session, 5, 5, false, false, FORCE_MAILSCAN_NONE, false);
    await new Promise((r) => setImmediate(r));
    finishTheDoor();
    await joining;

    expect(events).toContain('pause');
  });

  it('does not hang when the bulletin launches no door', async () => {
    // `pendingScreenCommand` is absent for a screen with no commands, which
    // is most screens on most boards - that path must not wait for anything.
    const { socket, session } = aCaller();
    const { displayScreen } = require('../../src/handlers/screen.handler');
    (displayScreen as jest.Mock).mockImplementationOnce(async (_s: any, _sess: any, name: string) => {
      if (String(name).toUpperCase().includes('BULL')) events.push('art');
      return true;
    });

    await joinConference(socket, session, 5, 5, false, false, FORCE_MAILSCAN_NONE, false);

    expect(events).toEqual(['art', 'pause']);
  });
});
