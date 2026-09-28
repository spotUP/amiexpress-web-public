/**
 * Regression: 68K door launch handlers must prefer the SQLite-loaded
 * `session.user.confAccess` string over the binary user.data probe
 * `UserDatabaseManager.readConfAccessFromDisk(slotIndex)`.
 *
 * Why: the binary probe reads 10 bytes at `slotIndex * USER_SIZE + 136`
 * and unconditionally pads positions 11-25 with 'X'. The padding is
 * a workaround for the binary's 10-conf ceiling — but it silently
 * misaligns when SQLite `slotNumber` doesn't match the binary record
 * position (which can happen after a regen, an import, or duplicate-
 * name appends).
 *
 * Live symptom (2026-05-20): sysop SQLite confaccess = 25 X's (full
 * access), binary slot 1 (= dbSlot 2 - 1) happened to be a different
 * user's record with zero confaccess bytes. The 11-25 padding then
 * granted only confs 11-N → JoinCnf with CURRENT_CNF=YES + NCONFS=14
 * displayed exactly 4 confs (#11-14), renumbered as [01..04].
 *
 * Same risk applies to user STATS — also held here.
 *
 * Driven through the REAL executeDoor -> executeAmigaDoor with the 68K
 * runtime replaced (the technique of tests/transport/browser-door-gate and
 * tests/doors/petscii-80/marked-doors-open-at-eighty): the disk probes answer
 * with a DIFFERENT user's record, and what is asserted is what the door is
 * actually handed - the session given to AmigaDoorSession. (launchAmigaDoor,
 * the other site this file used to pin, has no callers: see
 * tests/xim/dead-launch-path.test.ts.)
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
jest.mock('../src/services/DoorDropFileManager');
jest.mock('../src/services/CallersLogManager');

/** Every AmigaDoorSession the handler built, with the config it was given. */
const mockLaunches: Array<{ bbsSession: any }> = [];
jest.mock('../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    constructor(_socket: unknown, config: { bbsSession: any }) {
      // A snapshot: the session object lives on after the door exits.
      mockLaunches.push({
        bbsSession: {
          confAccess: config.bbsSession.confAccess,
          diskUserStats: config.bbsSession.diskUserStats,
        },
      });
    }
    async start(): Promise<void> { /* the door runs and exits */ }
    getExitState() { return {}; }
    isDoorRunning() { return false; }
  },
}));

const mockRoot = { value: '' };
jest.mock('../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: mockRoot.value,
    scanInstalledDoors: async () => [],
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));

import { executeDoor, setHelpers, type Door } from '../src/handlers/door.handler';
import { userDatabaseManager } from '../src/services/UserDatabaseManager';
import { BBSState, LoggedOnSubState } from '../src/constants/bbs-states';
import { config } from '../src/config';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

/** Full access in SQLite - the sysop's real row. */
const SQL_CONF_ACCESS = 'X'.repeat(25);
/** What the binary probe returns for the WRONG record: 11-25 padding only. */
const DISK_CONF_ACCESS = '0'.repeat(10) + 'X'.repeat(15);

describe('Door launch prefers SQLite confAccess + stats over binary slot probe', () => {
  let root: string;
  const realGet = config.get.bind(config);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'confaccess-sqlite-'));
    mockRoot.value = root;
    jest.spyOn(config, 'get').mockImplementation(((key: string) =>
      key === 'dataDir' ? root : (realGet as (k: string) => unknown)(key)) as never);
    fs.mkdirSync(path.join(root, 'Doors', 'JoinCnf'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'JoinCnf', 'JoinCnf'), Buffer.from([0x00, 0x00, 0x03, 0xf3]));
    mockLaunches.length = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** The sysop, logged on, with SQLite stats and a slot number that points elsewhere on disk. */
  function sysopSession(): any {
    return {
      state: BBSState.LOGGEDON,
      subState: LoggedOnSubState.PROCESS_COMMAND,
      nodeId: 1,
      currentConf: 1,
      screenWidth: 80,
      tempData: {},
      user: {
        id: 1, username: 'SYSOP', secLevel: 255, slotNumber: 2,
        confAccess: SQL_CONF_ACCESS,
        messagesPosted: 42, uploads: 3, downloads: 4, timesCalled: 99,
        bytesUpload: 777, bytesDownload: 888,
      },
    };
  }

  async function launch(session: any) {
    const door = {
      id: 'joincnf', name: 'JoinCnf', description: '', command: 'J',
      path: 'Doors/JoinCnf/JoinCnf', accessLevel: 0, enabled: true, type: 'XIM',
    } as unknown as Door;
    const socket: any = { id: `confaccess-${Math.random()}`, emit: () => true, on: () => undefined };
    await executeDoor(socket, session, door);
    expect(mockLaunches).toHaveLength(1);
    return mockLaunches[0].bbsSession;
  }

  test('executeAmigaDoor hands the door the SQLite confAccess, not the slot probe', async () => {
    const probe = jest.spyOn(userDatabaseManager, 'readConfAccessFromDisk').mockReturnValue(DISK_CONF_ACCESS);
    jest.spyOn(userDatabaseManager, 'readUserStatsFromDisk').mockReturnValue(null as never);

    const handed = await launch(sysopSession());

    expect(handed.confAccess).toBe(SQL_CONF_ACCESS);
    expect(probe).not.toHaveBeenCalled();
  });

  test('executeAmigaDoor hands the door the SQLite stats, not the slot probe', async () => {
    jest.spyOn(userDatabaseManager, 'readConfAccessFromDisk').mockReturnValue(DISK_CONF_ACCESS);
    const probe = jest.spyOn(userDatabaseManager, 'readUserStatsFromDisk')
      .mockReturnValue({ messagesPosted: 1, bytesUpload: 1 } as never);

    const handed = await launch(sysopSession());

    expect(handed.diskUserStats).toMatchObject({ messagesPosted: 42, bytesUpload: 777, bytesDownload: 888 });
    expect(probe).not.toHaveBeenCalled();
  });

  test('still falls back to the disk record when SQLite has no confAccess', async () => {
    // The round trip: the probe is a fallback, not dead code.
    const probe = jest.spyOn(userDatabaseManager, 'readConfAccessFromDisk').mockReturnValue(DISK_CONF_ACCESS);
    jest.spyOn(userDatabaseManager, 'readUserStatsFromDisk').mockReturnValue(null as never);
    const session = sysopSession();
    session.user.confAccess = '';

    const handed = await launch(session);

    expect(probe).toHaveBeenCalledWith(2);
    expect(handed.confAccess).toBe(DISK_CONF_ACCESS);
  });
});
