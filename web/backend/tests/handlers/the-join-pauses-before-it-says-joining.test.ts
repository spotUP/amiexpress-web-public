/**
 * The join's pause belongs AFTER the bulletin and BEFORE "Joining Conference".
 *
 * express.e:5058-5061:
 *
 *     IF displayScreen(SCREEN_CONF_BULL)
 *       temp:=doPause()
 *
 * and only then 5079-5088's "Joining Conference: <name>". `displayScreen`
 * returns once the WHOLE file has been shown, so the `~SP` pauses inside a
 * bulletin are the screen's own - the join still owes exactly one pause at the
 * end, wherever the art happened to be split.
 *
 * The port attached the join's continuation straight to the last segment's
 * dismissal, so on a segmented bulletin there was no pause at all between the
 * art and the join's own lines. The pause the caller then saw came from the
 * display flow afterwards, landing AFTER "Joining Conference" rather than
 * before it.
 *
 * The sysop saw it on a bulletin whose last segment is `~f` + `~CC_ctop`
 * (2026-09-14): ConfTop's table and the join's lines arrived as one screenful,
 * with the pause at the bottom.
 *
 * The COUNT does not change - it is the same pause `doPause` installs for an
 * unsegmented bulletin - only where it falls.
 */
process.env.SKIP_DB_INIT = '1';

/** What the caller would see, in the order the join produces it. */
const events: string[] = [];

/** Pretends a boundary prompt went up, the way the real one does for art. */
const armSegmentBoundaryPause = jest.fn((_s: any, session: any) => {
  events.push('boundary');
  session.paginatedScreen = { kind: 'doPause' };
  return true;
});

const doPause = jest.fn((_s: any, _sess: any, after?: () => void) => {
  events.push('pause');
  // A real doPause holds the screen until a key; the continuation runs on
  // dismissal. Running it straight away is what a caller pressing space does.
  after?.();
});

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn(async (_s: any, session: any, name: string) => {
    if (!String(name).toUpperCase().includes('BULL')) return false;
    events.push('bulletin');
    /*
     * A bulletin split by `~SP`, which is what every conference bulletin on
     * this board is. The segment machinery pauses BETWEEN segments and fires
     * `onComplete` after the last - the case this test exists for.
     */
    session.screenSegments = { segments: [], screenName: 'CONF_BULL' };
    return true;
  }),
  doPause: (...args: any[]) => doPause(...(args as [any, any, any])),
  armSegmentBoundaryPause: (...args: any[]) => armSegmentBoundaryPause(...(args as [any, any])),
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
  getMailStatFile: jest.fn(() => ({ lowestKey: 1, highMsgNum: 0, lowestNotDel: 1 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 0, lastMsgReadConf: 0 })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));

import { flushOutput } from '../../src/utils/output.util';
import {
  joinConference,
  FORCE_MAILSCAN_ALL,
  setConferences,
  setMessageBases,
  setHelpers,
  setConstants,
} from '../../src/handlers/operations/conference.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

function aBoard() {
  setConferences([
    { id: 1, name: 'Amiga Demoscene' },
    { id: 2, name: 'Console Demoscene' },
  ] as any);
  setMessageBases([{ id: 2, conferenceId: 2, name: 'General' }] as any);
  setConstants({
    SCREEN_BULL: 'BULL',
    SCREEN_NODE_BULL: 'NODE_BULL',
    SCREEN_CONF_BULL: 'CONF_BULL',
    LoggedOnSubState,
  } as any);
  setHelpers({
    callersLog: async () => {},
    loadFlagged: async () => {},
    loadHistory: async () => {},
  } as any);
}

/** A caller whose terminal records the join's own lines in order. */
/**
 * Drive the join the way the board does: `joinConference` shows the bulletin
 * and YIELDS, and the segment machinery calls `onComplete` once the last
 * segment has been shown. What that callback does is the product's decision -
 * this only pulls the trigger.
 */
async function joinAndFinishTheBulletin(socket: any, session: any) {
  await joinConference(socket, session, 2, 2, false, false, FORCE_MAILSCAN_ALL, false);
  const onComplete = (session.screenSegments as any)?.onComplete;
  expect(typeof onComplete).toBe('function');   // the join must leave one
  await onComplete();
  // The join writes through the ordered output buffer; read the wire.
  flushOutput(socket);
}

function aCaller() {
  const socket = {
    id: `join-pause-${Math.random().toString(36).slice(2)}`,
    emit: (_event: string, data?: unknown) => {
      if (typeof data === 'string' && data.includes('Joining Conference')) {
        events.push('joining');
      }
    },
    on: () => {},
  } as any;
  const session = {
    nodeId: 1,
    currentConf: 1,
    relConfNum: 1,
    user: { id: 1, username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
    tempData: {},
  } as any;
  return { socket, session };
}

describe('the pause a conference join owes', () => {
  beforeEach(() => {
    events.length = 0;
    doPause.mockClear();
    armSegmentBoundaryPause.mockClear();
    aBoard();
  });

  /*
   * Found driving a login over telnet, 2026-09-27: h7's conference 2 bulletin
   * left its first segment with no prompt of its own, and the join armed
   * none, so the caller waited at the art for a key nothing asked for.
   */
  it('stops at the bulletin\'s first ~SP when nothing else put a prompt up', async () => {
    const { socket, session } = aCaller();

    await joinConference(socket, session, 2, 2, false, false, FORCE_MAILSCAN_ALL, false);

    expect(armSegmentBoundaryPause).toHaveBeenCalledTimes(1);
    expect(session.paginatedScreen).toBeTruthy();
  });

  it('does not arm a second prompt when the bulletin already put one up', async () => {
    const { socket, session } = aCaller();
    const { displayScreen } = require('../../src/handlers/screen.handler');
    displayScreen.mockImplementationOnce(async (_s: any, sess: any) => {
      events.push('bulletin');
      sess.screenSegments = { segments: ['more'], screenName: 'CONF_BULL' };
      sess.paginatedScreen = { kind: 'doPause' };
      return true;
    });

    await joinConference(socket, session, 2, 2, false, false, FORCE_MAILSCAN_ALL, false);

    expect(armSegmentBoundaryPause).not.toHaveBeenCalled();
  });

  it('falls between the bulletin and "Joining Conference"', async () => {
    // Red before the fix: ['bulletin', 'joining'] - no pause at all, and the
    // caller met one only later, after the line it should have preceded.
    const { socket, session } = aCaller();

    await joinAndFinishTheBulletin(socket, session);

    // `boundary` is the bulletin's own `~SP` prompt; `pause` is the join's.
    expect(events).toEqual(['bulletin', 'boundary', 'pause', 'joining']);
  });

  it('is one pause, not a second one stacked on the segments', async () => {
    // The `~SP` pauses inside the art belong to the screen. The join adds the
    // single doPause express.e:5059 adds, and no more.
    const { socket, session } = aCaller();

    await joinAndFinishTheBulletin(socket, session);

    expect(doPause).toHaveBeenCalledTimes(1);
  });

  it('still runs the rest of the join when the caller dismisses it', async () => {
    // The round trip: a pause that never hands control back would lose the
    // join's own output entirely, which is worse than the bug.
    const { socket, session } = aCaller();

    await joinAndFinishTheBulletin(socket, session);

    expect(events).toContain('joining');
  });
});
