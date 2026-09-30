/**
 * A conference's join scan must outlive the conference's bulletin.
 *
 * express.e runs the join's mail scan at 5119-5128 - AFTER `SCREEN_CONF_BULL`
 * (5058), after its `doPause` (5059), and after the "Joining Conference" line
 * (5079-5088). The port ran it FIRST, before the bulletin was drawn.
 *
 * That was invisible for years because an ordinary scan prints a few lines a
 * caller can live without. It stopped being invisible when a conference's
 * message base became a DOOR: with the `CUSTOM` tooltype the scan IS
 * `MSGBASE.DEF`, its entire output is the new-topic listing, and this board's
 * bulletins open with `~f`. So the door printed the listing and the
 * bulletin's clear erased it a moment later.
 *
 * The sysop, 2026-09-14, joining conference 2 - the one CUSTOM conference on
 * this board whose bulletin carries no `~XISUBSCAN` of its own: "i see no subs
 * though". The other four hid it, because their bulletins run the door a
 * second time from inside the art, AFTER the clear.
 *
 * Third of its kind in one evening, after the tip door erasing the join
 * listing (996397e14) and the last `~SP` segment being erased by the next
 * screen (9ab303fb1). Same shape each time: something is drawn, and something
 * else clears the screen before the caller has read it.
 *
 * DRIVEN THROUGH `joinConference` ITSELF. An earlier draft of this file called
 * the two mocks in the order it expected and asserted that order, which is a
 * test of the test. The order is the product's to get right, so the product is
 * what runs here, with only the screen and the door's own module replaced.
 */
process.env.SKIP_DB_INIT = '1';

/** What the caller would see, in the order the join emits it. */
const events: string[] = [];

const runCustomMsgbaseCommand = jest.fn(async () => {
  events.push('scan');
  return true;
});
jest.mock('../../src/services/custom-msgbase', () => ({
  MailFunction: { READ: 1, CREATE: 2, SCAN: 3, STATS: 4, SYSOP_COMMENT: 6, ZOOM: 7 },
  runCustomMsgbaseCommand: (...args: any[]) => runCustomMsgbaseCommand(...(args as [])),
  tryCustomMsgbase: jest.fn(async () => false),
  customMsgbaseDoor: jest.fn(() => null),
  doorConference: jest.fn(() => 0),
  doorConferenceName: jest.fn(() => ''),
}));

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn(async (_s: any, _sess: any, name: string) => {
    // The bulletin is the screen that CLEARS - `~f` is its first line on this
    // board - so its position in this list is the whole question.
    if (String(name).toUpperCase().includes('BULL')) events.push('bulletin');
    return false;   // no pause: the join runs straight through to the tail
  }),
  doPause: jest.fn(),
  checkScreenClear: jest.fn(),
  runQueuedScreenCommands: jest.fn(async () => {}),
}));


/** The board's own answers, so the join is about ORDER and nothing else. */
jest.mock('../../src/handlers/message/message-scan.handler', () => ({
  checkConfAccess: () => true,
  checkMailConfScan: async () => true,
  performSingleConfMailScan: jest.fn(async () => {}),
}));

/** Conference 2 is CUSTOM: its message base is a door. */
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: () => ({
    custom: true,
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

import {
  joinConference,
  FORCE_MAILSCAN_ALL,
  setConferences,
  setMessageBases,
  setHelpers,
  setConstants,
} from '../../src/handlers/operations/conference.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

/** A board with one CUSTOM conference, which is what conference 2 is. */
function aBoardWithACustomConference() {
  setConferences([
    { id: 1, name: 'Amiga Demoscene' },
    { id: 2, name: 'Internal' },
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

function aCaller() {
  const socket = {
    id: `join-scan-${Math.random().toString(36).slice(2)}`,
    emit: () => {},
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

describe('joining a conference whose message base is a door', () => {
  beforeEach(() => {
    events.length = 0;
    runCustomMsgbaseCommand.mockClear();
    aBoardWithACustomConference();
  });

  it('runs the scan AFTER the bulletin, not before it', async () => {
    // Red before the fix: ['scan', 'bulletin'] - the door printed the listing
    // and the bulletin's `~f` wiped it.
    const { socket, session } = aCaller();

    await joinConference(socket, session, 2, 2, false, false, FORCE_MAILSCAN_ALL, false);

    const seen = events.filter((e) => e === 'bulletin' || e === 'scan');
    expect(seen.indexOf('scan')).toBeGreaterThan(seen.indexOf('bulletin'));
  });

  it('still runs the scan at all', async () => {
    // The round trip. Moving it later must not move it out of the join: a
    // caller who joins a CUSTOM conference and is shown nothing is the bug
    // this started as.
    const { socket, session } = aCaller();

    await joinConference(socket, session, 2, 2, false, false, FORCE_MAILSCAN_ALL, false);

    // The door is asked twice, as express.e asks it: MAIL_STATS for the join's
    // stats (5109), then MAIL_SCAN (5124). Exactly one scan.
    const scans = runCustomMsgbaseCommand.mock.calls.filter((c: any[]) => c[2] === 3);
    expect(scans).toHaveLength(1);
  });

  it('asks the door for that conference, not for whichever was current', async () => {
    // `param2` is the conference the door reads (XIM 601). The caller was in
    // conference 1 when the join began.
    const { socket, session } = aCaller();

    await joinConference(socket, session, 2, 2, false, false, FORCE_MAILSCAN_ALL, false);

    const args = runCustomMsgbaseCommand.mock.calls.find((c: any[]) => c[2] === 3) as unknown as any[];
    expect(args[3]).toBe(2);
  });
});
