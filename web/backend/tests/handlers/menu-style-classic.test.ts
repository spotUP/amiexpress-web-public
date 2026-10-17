/**
 * R1 (menu styles plan): a caller on "Classic screen" gets express.e's own main menu.
 * displayMainMenu -> launchMenuDoor decides 'fallback' after the MENU-def and access checks,
 * so the MENU door is never entered and SCREEN_MENU is drawn (express.e:28586).
 * The control case (cover flow) proves the door path is otherwise open in this setup.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(true),
  doPause: jest.fn(),
  hasKeysFile: jest.fn().mockReturnValue(false),
  hasKeysFileForResolvedPath: jest.fn().mockReturnValue(false),
  parseMciCodes: jest.fn((t: string) => t),
}));
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getConfig: jest.fn().mockReturnValue({ get: jest.fn((key: string) => key === 'bbsName' ? 'TestBBS' : null) }),
  getMessageBases: jest.fn().mockReturnValue([]),
  getProcessOlmMessageQueue: jest.fn().mockReturnValue(null),
  getScreenMenu: jest.fn().mockReturnValue('MENU'),
}));
jest.mock('../../src/utils/time-tracking.util', () => ({
  updateTimeUsed: jest.fn(),
  getTimeRemainingMinutes: jest.fn().mockReturnValue(60),
}));
jest.mock('../../src/handlers/time-limit.handler', () => ({ checkTimeUsed: jest.fn().mockResolvedValue(false) }));
jest.mock('../../src/utils/output.util', () => ({ emitText: jest.fn(), emitPrompt: jest.fn() }));
jest.mock('../../src/handlers/command-execution.handler', () => ({
  commandCache: { bbscmd: new Map([['MENU', { name: 'MENU', access: 0, location: 'Doors:MAINMENU/MainMenu' }]]), syscmd: new Map() },
  revalidateBbsCommandsIfChanged: jest.fn(),
  doorLevelForCommandAccess: jest.fn().mockReturnValue(0),
}));
jest.mock('../../src/handlers/commands/menu-door-exit', () => ({
  ...jest.requireActual('../../src/handlers/commands/menu-door-exit'),
  runMenuDoor: jest.fn().mockResolvedValue('ran'),
}));

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { displayMainMenu } from '../../src/handlers/command-handler/menu';
import { displayScreen } from '../../src/handlers/screen.handler';
import { runMenuDoor } from '../../src/handlers/commands/menu-door-exit';
import { config } from '../../src/config';

const session = (menuStyle: string) => ({
  user: { id: 1, username: 'tester', expert: 'N', secLevel: 10, securityFlags: 'T'.repeat(128), menuStyle },
  subState: LoggedOnSubState.READ_COMMAND, relConfNum: 1, currentConf: 1, currentConfName: 'General',
  currentMsgBase: 1, timeRemaining: 3600, cmdShortcuts: false, shortcuts: new Map(), paginatedScreen: null,
  lastScreenHadPause: false, doorExpertMode: false, nodeId: 1, screenWidth: 80,
}) as never;

let root = '';
let previous: unknown;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-style-classic-'));
  previous = config.get('dataDir');
  config.set('dataDir', root);
});
afterAll(() => { config.set('dataDir', previous as string); fs.rmSync(root, { recursive: true, force: true }); });
beforeEach(() => { (runMenuDoor as jest.Mock).mockClear(); (displayScreen as jest.Mock).mockClear(); });

test('Classic screen: the MENU door is never run and SCREEN_MENU is drawn', async () => {
  await displayMainMenu({ emit: jest.fn() }, session('classic'), true, true);
  expect(runMenuDoor).toHaveBeenCalledTimes(0);
  expect(displayScreen).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'MENU');
});

test('a board default of Classic screen at the caller\'s level does the same', async () => {
  fs.mkdirSync(path.join(root, 'Menus'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Menus/MAIN.json'), JSON.stringify({ style: { standard: { '0': 'classic' } } }));
  try {
    await displayMainMenu({ emit: jest.fn() }, session(''), true, true);
    expect(runMenuDoor).toHaveBeenCalledTimes(0);
    expect(displayScreen).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'MENU');
  } finally { fs.rmSync(path.join(root, 'Menus'), { recursive: true, force: true }); }
});

test('control: Cover flow runs the MENU door and draws no SCREEN_MENU', async () => {
  await displayMainMenu({ emit: jest.fn() }, session('coverflow'), true, true);
  expect(runMenuDoor).toHaveBeenCalledTimes(1);
  expect(displayScreen).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'MENU');
});
