/**
 * `MS` walks the conferences, and a CUSTOM one answers with its door.
 *
 * express.e:25250-25273 - internalCommandMS saves the caller's conference,
 * joins every conference and message base they can reach with
 * FORCE_MAILSCAN_ALL, and puts them back where they were. A conference whose
 * message base is a door (the CUSTOM tooltype) has no MailStats file for the
 * board to read, so that join must arrive at the door instead
 * (express.e:5121-5125, `customMsgbaseCmd(MAIL_SCAN, conf, 0)`).
 *
 * The plan (2026-09-14-subs-is-the-conference-message-base, P4.1) left this
 * untested on purpose: the code needed nothing, but nothing proved the walk
 * reaches the door ONCE PER CONFERENCE carrying the RIGHT conference number.
 * A board that scans conference 2 and hands the door a 1 looks perfectly
 * healthy and shows the caller another conference's mail.
 *
 * Two halves are pinned here, and the third already exists:
 *   1. MS asks for one join per conference and message base, with
 *      FORCE_MAILSCAN_ALL, and skips what the caller cannot reach.
 *   2. such a join, on a CUSTOM conference, calls the message-base door with
 *      MAIL_SCAN and THAT conference's number.
 *   3. that call reaching the door with the number on the session is already
 *      pinned by `a-custom-conference-hands-its-mail-to-a-door.test.ts`
 *      ("launches the door with the function and the conference on the
 *      session"), so it is not repeated.
 */
process.env.SKIP_DB_INIT = '1';

/** Every runCustomMsgbaseCommand the CUSTOM branch made, in order. */
const customCalls: Array<{ fn: number; confId: number; cmdLine: string }> = [];

jest.mock('../../src/services/custom-msgbase', () => {
  const actual = jest.requireActual('../../src/services/custom-msgbase');
  return {
    ...actual,
    runCustomMsgbaseCommand: jest.fn(
      async (_socket: any, _session: any, fn: number, confId: number, cmdLine: string) => {
        customCalls.push({ fn, confId, cmdLine });
        return true; // the door handled it, so the board must not scan too
      },
    ),
  };
});

/** Which conferences claim CUSTOM, per test. */
const custom = new Map<number, boolean>();
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  ...jest.requireActual('../../src/utils/conference-tooltypes.util'),
  getConferenceToolFlags: (conf: number) => ({ custom: custom.get(conf) === true }),
}));

/*
 * joinConference's collaborators are all screen, pointer and log work that a
 * mail scan does not decide anything about. They are stubbed to nothing so the
 * test fails for one reason only: which conference the door was asked about.
 */
jest.mock('../../src/handlers/screen.handler', () => ({ displayScreen: jest.fn(async () => {}) }));
jest.mock('../../src/handlers/command-handler/menu', () => ({ displayMainMenu: jest.fn(async () => {}) }));
jest.mock('../../src/utils/command-response.util', () => ({ finalizeCommand: jest.fn() }));
jest.mock('../../src/services/CallersLogManager', () => ({
  callersLogManager: {
    logConferenceJoin: jest.fn(async () => {}),
    logActivity: jest.fn(),
    log: jest.fn(async () => {}),
  },
}));
jest.mock('../../src/utils/message-pointers.util', () => ({
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
  getMailStatFile: jest.fn(() => null),
  loadMsgPointers: jest.fn(() => ({ lastReadMsg: 0, lastScanMsg: 0 })),
  saveMsgPointers: jest.fn(),
  validatePointers: jest.fn((p: any) => p),
}));
jest.mock('../../src/services/bbs-config-file.service', () => ({
  getBoardConfig: jest.fn(() => ({})),
}));
jest.mock('../../src/handlers/message/message-scan.handler', () => ({
  checkConfAccess: (_user: any, confId: number) => confId !== 3, // 3 is off limits
  checkMailConfScan: jest.fn(() => false),
}));

/*
 * `joinConference` is re-exported through a getter, so jest.spyOn cannot
 * redefine it ("Cannot redefine property"). Mocking the module with a jest.fn
 * that DELEGATES to the real implementation by default gives both halves of
 * this file what they need from one seam: the walk tests replace the
 * implementation to record what MS asked for, and the CUSTOM tests leave the
 * delegate in place so the real branch runs.
 */
jest.mock('../../src/handlers/operations/conference.handler', () => {
  const actual = jest.requireActual('../../src/handlers/operations/conference.handler');
  return { ...actual, joinConference: jest.fn((...args: any[]) => actual.joinConference(...args)) };
});

import * as conferenceHandler from '../../src/handlers/operations/conference.handler';
import { FORCE_MAILSCAN_ALL } from '../../src/handlers/operations/conference.handler';
import { MailFunction } from '../../src/services/custom-msgbase';
import {
  handleMailScanCommand,
  setAdvancedCommandsDependencies,
} from '../../src/handlers/commands/advanced-commands.handler';

const joinMock = conferenceHandler.joinConference as unknown as jest.Mock;
const realJoin = jest.requireActual(
  '../../src/handlers/operations/conference.handler',
).joinConference;

const CONFERENCES = [
  { id: 1, name: 'Amiga Chat' },
  { id: 2, name: 'Staff Only' },
  { id: 3, name: 'No Entry' },
];
/** Conference 1 keeps two bases; a walk must visit both. */
const MESSAGE_BASES = [
  { id: 1, conferenceId: 1, name: 'General' },
  { id: 2, conferenceId: 1, name: 'Trading' },
  { id: 1, conferenceId: 2, name: 'Staff' },
  { id: 1, conferenceId: 3, name: 'Hidden' },
];

function makeSocket() {
  return { emit: jest.fn() };
}

function makeSession(): any {
  return {
    user: { id: 'u1', slot: 1, name: 'SPOT' },
    currentConf: 1,
    currentMsgBase: 1,
    nodeId: 0,
  };
}

beforeEach(() => {
  customCalls.length = 0;
  custom.clear();
  jest.clearAllMocks();
  setAdvancedCommandsDependencies({
    conferences: CONFERENCES as any,
    messageBases: MESSAGE_BASES as any,
    messages: [] as any,
    checkConfAccess: (_user: any, confId: number) => confId !== 3,
  });
  conferenceHandler.setConferences(CONFERENCES as any);
  conferenceHandler.setMessageBases(MESSAGE_BASES as any);
  conferenceHandler.setHelpers({
    callersLog: jest.fn(async () => {}),
    loadFlagged: jest.fn(async () => {}),
    loadHistory: jest.fn(async () => {}),
  } as any);
  joinMock.mockClear();
  joinMock.mockImplementation((...args: any[]) => realJoin(...args));
});

describe('the MS walk itself', () => {
  it('joins every accessible conference and message base with a forced scan', async () => {
    joinMock.mockImplementation(async () => true as any);

    await handleMailScanCommand(makeSocket() as any, makeSession());

    // Conference 1 has two bases, conference 2 has one: three scanning joins,
    // then one more to put the caller back where they started.
    const scans = joinMock.mock.calls.filter((c: any[]) => c[6] === FORCE_MAILSCAN_ALL);
    expect(scans.map((c: any[]) => [c[2], c[3]])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
    // joinConf(conf,msgbase,TRUE,...): TRUE is confScan (express.e:25264), so
    // each base answers with the logon scan's table, not a J's "Found Mail!".
    expect(scans.every((c: any[]) => c[7] === true)).toBe(true);
  });

  it('does not join a conference the caller cannot reach', async () => {
    joinMock.mockImplementation(async () => true as any);

    await handleMailScanCommand(makeSocket() as any, makeSession());

    expect(joinMock.mock.calls.some((c: any[]) => c[2] === 3)).toBe(false);
  });

  it('puts the caller back in the conference they started in', async () => {
    joinMock.mockImplementation(async () => true as any);

    const session = makeSession();
    session.currentConf = 2;
    session.currentMsgBase = 1;
    await handleMailScanCommand(makeSocket() as any, session);

    const last = joinMock.mock.calls[joinMock.mock.calls.length - 1];
    expect([last[2], last[3]]).toEqual([2, 1]);
    expect(last[6]).not.toBe(FORCE_MAILSCAN_ALL); // restoring must not re-scan
  });
});

describe('what a CUSTOM conference does with that join', () => {
  it('asks its own door to scan, naming that conference', async () => {
    custom.set(2, true);

    await conferenceHandler.joinConference(
      makeSocket() as any, makeSession(), 2, 1, true, false, FORCE_MAILSCAN_ALL,
    );

    expect(customCalls).toEqual([
      { fn: MailFunction.SCAN, confId: 2, cmdLine: '' },
    ]);
  });

  it('names the conference being scanned, not the one the caller sits in', async () => {
    // The bug this guards: a walk that hands the door the caller's own
    // conference shows conference 1's mail while scanning conference 2.
    custom.set(2, true);
    const session = makeSession();
    session.currentConf = 1;

    await conferenceHandler.joinConference(
      makeSocket() as any, session, 2, 1, true, false, FORCE_MAILSCAN_ALL,
    );

    expect(customCalls.map((c) => c.confId)).toEqual([2]);
  });

  it('leaves an ordinary conference to the board', async () => {
    custom.set(2, false);

    await conferenceHandler.joinConference(
      makeSocket() as any, makeSession(), 2, 1, true, false, FORCE_MAILSCAN_ALL,
    );

    expect(customCalls).toEqual([]);
  });
});

describe('MS end to end, with nothing about the join stubbed out', () => {
  /*
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * `runJoinMailScan` used to be reachable only through
   * `continueJoinAfterBull`, which joinConference calls in two places, both
   * inside `if (!silent)`. MS joins silently, so MS scanned NOTHING: no board
   * scan, and for a CUSTOM conference no door. The command still printed
   * "Conferences scanned: 2" over an empty walk, which is why nobody caught
   * it - the only visible symptom was mail that never turned up.
   *
   * express.e:5119 puts the scan outside the display gate (`IF(confScan=FALSE)`
   * closes at 5117), so the silent path scans too.
   */
  it('asks each CUSTOM conference door to scan, once per message base', async () => {
    custom.set(1, true);
    custom.set(2, true);

    await handleMailScanCommand(makeSocket() as any, makeSession());

    // Conference 1 keeps two message bases and conference 2 keeps one. The
    // restoring join at the end asks for FORCE_MAILSCAN_SKIP and must not add
    // a fourth.
    expect(customCalls.map((c) => c.confId)).toEqual([1, 1, 2]);
    expect(customCalls.every((c) => c.fn === MailFunction.SCAN)).toBe(true);
  });

  it('asks only the conferences that are CUSTOM', async () => {
    custom.set(2, true); // conference 1 is an ordinary one

    await handleMailScanCommand(makeSocket() as any, makeSession());

    expect(customCalls.map((c) => c.confId)).toEqual([2]);
  });

  it('never asks about a conference the caller cannot reach', async () => {
    custom.set(1, true);
    custom.set(2, true);
    custom.set(3, true); // and 3 is off limits

    await handleMailScanCommand(makeSocket() as any, makeSession());

    expect(customCalls.some((c) => c.confId === 3)).toBe(false);
  });
});
