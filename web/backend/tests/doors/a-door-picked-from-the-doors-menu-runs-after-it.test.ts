/**
 * Live bug: the sysop picked PHREAKWARS from the DOORS door (opened from the
 * 68K MENU door). PhreakWars seemed to exit at once - the MENU door came
 * back over it while PhreakWars kept running underneath.
 *
 * DOORS disposes its terminal mode before handing the pick on, and the SDK's
 * dispose() clears session.inDoorManager. BBSApi.executeCommand decided "a
 * door is still running" from that flag, so the pick ran INSIDE DOORS'
 * execute() instead of being queued for after it; DOORS then returned and
 * the parked MENU relaunch ran over PhreakWars.
 *
 * Invariant: a command a door asks the board to run executes after that
 * door's execute() has returned, whatever the door did to its input manager.
 *
 * Driven through the real executeDoor -> executeTypeScriptDoor path, with
 * the door module registered under the name executeTypeScriptDoor imports
 * (the technique of a-conference-bulletin-is-shown-to-the-end.test.ts).
 * handleCommand is the sentinel: the queued pick reaches it from the drain.
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
const mockRoot = { value: '' };
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: mockRoot.value,
    scanInstalledDoors: async () => [],
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));
const mockEvents: string[] = [];
jest.mock('../../src/handlers/command.handler', () => {
  const actual = jest.requireActual('../../src/handlers/command.handler');
  return {
    ...actual,
    handleCommand: jest.fn(async (_socket: unknown, session: { commandText?: string }) => {
      mockEvents.push(`board runs ${session.commandText}`);
    }),
  };
});

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { executeDoor, setHelpers, type Door } from '../../src/handlers/door.handler';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import * as amigafs from '../../src/utils/amigafs';
import { config } from '../../src/config';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

let root: string;
const originalDataDir = config.get('dataDir');
const savedDataDirEnv = process.env.BBS_DATA_DIR;

beforeEach(() => {
  mockEvents.length = 0;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'doors-menu-pick-'));
  mockRoot.value = root;
  config.set('dataDir', root);
  process.env.BBS_DATA_DIR = root;
});

afterEach(() => {
  jest.restoreAllMocks();
  config.set('dataDir', originalDataDir);
  if (savedDataDirEnv === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = savedDataDirEnv;
  fs.rmSync(root, { recursive: true, force: true });
  flushAllBuffers();
});

/** A DOORS-like door: dispose() (inDoorManager=false), then hand the pick to the board. */
async function runTheDoorsMenuPicking(pick: string) {
  const NOW = 1_700_000_000_000;
  const entry = path.join(root, 'Doors', 'doors-menu', 'index.ts');
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, '');
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.doMock(
    `file://${amigafs.resolvePath(entry)}?t=${NOW}`,
    () => ({
      __esModule: true,
      default: {
        getConfig: () => ({ name: 'doors-menu' }),
        execute: async ({ bbs, bbsSession }: any) => {
          mockEvents.push('doors menu starts');
          bbsSession.inDoorManager = false;   // what the SDK's dispose() does
          await bbs.executeCommand(pick);
          mockEvents.push('doors menu returns');
        },
      },
    }),
    { virtual: true },
  );
  const socket = {
    id: `doors-menu-pick-${Math.random().toString(36).slice(2)}`,
    emit: () => true,
    on: () => undefined,
  } as any;
  const session = {
    nodeId: 1, state: BBSState.LOGGEDON, subState: LoggedOnSubState.PROCESS_COMMAND,
    currentConf: 1, relConfNum: 1, ansiEnabled: true, screenWidth: 80,
    user: { id: 1, username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
    tempData: {},
  } as any;
  await executeDoor(socket, session, {
    id: 'doors-menu', name: 'doors-menu', description: '', command: 'DOORS',
    path: 'Doors/doors-menu', accessLevel: 0, enabled: true, type: 'typescript',
  } as unknown as Door);
  return session;
}

describe('a door picked from the doors menu runs before the menu door comes back', () => {
  it('runs the pick after the doors menu has returned, not inside it', async () => {
    const session = await runTheDoorsMenuPicking('PHREAKWARS');
    expect(mockEvents).toEqual([
      'doors menu starts',
      'doors menu returns',
      'board runs PHREAKWARS',
    ]);
    expect(session.pendingDoorCommands).toBeUndefined();
    expect(session.doorExecuting).toBe(false);
  });
});
