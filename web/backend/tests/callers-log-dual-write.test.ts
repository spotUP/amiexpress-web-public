/**
 * Regression: 3 user-action callers-log sites that were SQL-only (only
 * the web activity widget saw them) must also write to the disk
 * BBS:Node{X}/CallersLog file for express.e parity.
 *
 * Audit reference:
 *   thoughts/shared/research/2026-05-18_sqlite-disk-parity-audit.md
 *   §"Callers log — BIFURCATED BY DESIGN"
 *
 * Sites originally SQL-only:
 *   - operations/conference.handler.ts: 'Joined conference'
 *   (file/file.handler.ts 'Deleted file' / 'Moved file' went with the old FM, which nothing reached;
 *    the live FM logs through file-maintenance.handler.)
 *
 * Driven through the real handler: `joinConference` runs with
 * an injected SQL `callersLog` spy and a stubbed disk `callersLogManager`,
 * and each event must reach BOTH loggers. The join harness is the one
 * tests/handlers/the-join-scan-survives-the-bulletin.test.ts uses; the DIR
 * file writer is stubbed so a delete never touches the real board.
 */
process.env.SKIP_DB_INIT = '1';

const logActivity = jest.fn();
jest.mock('../src/services/CallersLogManager', () => ({
  callersLogManager: { logActivity: (...args: unknown[]) => logActivity(...args) },
}));
jest.mock('../src/services/custom-msgbase', () => ({
  MailFunction: { READ: 1, CREATE: 2, SCAN: 3, STATS: 4, SYSOP_COMMENT: 6, ZOOM: 7 },
  runCustomMsgbaseCommand: jest.fn(async () => true),
  tryCustomMsgbase: jest.fn(async () => false),
  customMsgbaseDoor: jest.fn(() => null),
  doorConference: jest.fn(() => 0),
  doorConferenceName: jest.fn(() => ''),
}));
jest.mock('../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn(async () => false),
  doPause: jest.fn(),
  checkScreenClear: jest.fn(),
  runQueuedScreenCommands: jest.fn(async () => {}),
  startPagination: jest.fn(),
}));
jest.mock('../src/handlers/message/message-scan.handler', () => ({
  checkConfAccess: () => true,
  checkMailConfScan: async () => true,
  performSingleConfMailScan: jest.fn(async () => {}),
}));
jest.mock('../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: () => ({
    custom: true,
    forceNewscan: false, noNewscan: false, showNewFiles: false,
    noNewFiles: false, forceMenus: false, noBulls: false, noConfBulls: false,
  }),
}));
jest.mock('../src/utils/message-pointers.util', () => ({
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
  getMailStatFile: jest.fn(() => ({ lowestKey: 1, highMsgNum: 0, lowestNotDel: 1 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 0, lastMsgReadConf: 0 })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));

import {
  joinConference,
  setConferences,
  setMessageBases,
  setHelpers,
  setConstants,
} from '../src/handlers/operations/conference.handler';
import {
  setCallersLog,
  setFileSearchDependencies,
} from '../src/handlers/file/file.handler';
import { LoggedOnSubState } from '../src/constants/bbs-states';

const sqlLog = jest.fn(async (..._args: unknown[]) => undefined);

function aCaller(tempData: any = {}) {
  const socket = { id: 'dual-write', emit: () => {}, on: () => {} } as any;
  const session = {
    nodeId: 3,
    currentConf: 1,
    relConfNum: 1,
    user: { id: 1, username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
    tempData,
  } as any;
  return { socket, session };
}

beforeEach(() => {
  logActivity.mockClear();
  sqlLog.mockClear();
  setCallersLog(sqlLog as any);
  setFileSearchDependencies({
    searchFilesByName: jest.fn(),
    searchFilesAdvanced: jest.fn(),
    getFileEntry: jest.fn(),
    deleteFileEntry: jest.fn(async () => undefined),
    moveFileEntry: jest.fn(async () => undefined),
    updateFileDescription: jest.fn(),
    getFileAreas: jest.fn(),
  });
});

describe('callers-log dual write: SQL + disk parity', () => {
  test('Joined conference logs to both callersLog (SQL) and callersLogManager (disk)', async () => {
    setConferences([{ id: 1, name: 'Amiga Demoscene' }, { id: 2, name: 'Internal' }] as any);
    setMessageBases([{ id: 2, conferenceId: 2, name: 'General' }] as any);
    setConstants({ SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState } as any);
    setHelpers({ callersLog: sqlLog, loadFlagged: async () => {}, loadHistory: async () => {} } as any);
    const { socket, session } = aCaller();

    await joinConference(socket, session, 2, 2, false, false);

    expect(sqlLog.mock.calls.filter((c) => c[2] === 'Joined conference')).toHaveLength(1);
    // express.e:5084, 5089-5090: `\t<name> (<conf>) Conference Joined`.
    expect(logActivity).toHaveBeenCalledWith(3, '\tInternal (2) Conference Joined');
  });

  test("a conference scan's join writes no CallersLog line (express.e:5056 IF(confScan=FALSE))", async () => {
    setConferences([{ id: 1, name: 'Amiga Demoscene' }, { id: 2, name: 'Internal' }] as any);
    setMessageBases([{ id: 2, conferenceId: 2, name: 'General' }] as any);
    setConstants({ SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState } as any);
    setHelpers({ callersLog: sqlLog, loadFlagged: async () => {}, loadHistory: async () => {} } as any);
    const { socket, session } = aCaller();

    await joinConference(socket, session, 2, 2, false, false, 0, true);

    expect(logActivity).not.toHaveBeenCalled();
  });

});
