/**
 * Regression (sysop 2026-10-18, local): after a command picked in the MENU door (R, read to the end, Enter) no
 * prompt appeared. displayMainMenu armed its duplicate guard (skipNextDisplayFlowMenu) before handing the screen to
 * the door, and the door path returned without drawing a prompt, so the guard outlived the door and the display
 * flow's next DISPLAY_MENU pass was taken for a duplicate. The guard is armed only on the paths that draw the prompt.
 * Sentinel: runMenuDoor, stubbed so no emulator starts.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../..');
const BOARD = path.join(__dirname, 'compact-40', 'fixtures', 'menu-board');

jest.mock('../../src/utils/acs-access-loader');
jest.mock('../../src/database', () => ({
  db: new Proxy({}, { get: () => async () => undefined }),
}));
jest.mock('../../src/handlers/commands/menu-door-exit', () => ({
  ...jest.requireActual('../../src/handlers/commands/menu-door-exit'),
  runMenuDoor: jest.fn(async () => 'ran'),
}));

import { EventEmitter } from 'events';
import { installDispatchHarness, register, doorOver } from './dispatch-harness';
import { displayMainMenu } from '../../src/handlers/command-handler/menu';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const exit = jest.requireMock('../../src/handlers/commands/menu-door-exit');

installDispatchHarness(root => {
  // The launch re-reads the command directories, which keeps MENU only while its door is on disk.
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'board', 'Doors', 'MAINMENU'), path.join(root, 'Doors', 'MAINMENU'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'board', 'Commands', 'BBSCmd', 'MENU.info'), path.join(root, 'Commands', 'BBSCmd', 'MENU.info'));
  fs.cpSync(path.join(BOARD, 'Menus'), path.join(root, 'Menus'), { recursive: true });
  fs.cpSync(path.join(BOARD, 'Screens'), path.join(root, 'Screens'), { recursive: true });
});

class CaptureSocket extends EventEmitter {
  id = 'menu-handover';
  connected = true;
}

function caller(menuStyle: string): any {
  const user = { id: 'u1', username: 'Spot', slotNumber: 1, secLevel: 255, securityFlags: 'T'.repeat(128),
    userFlags: 0, expert: 'N', menuStyle };
  return { state: 'loggedon', subState: LoggedOnSubState.DISPLAY_MENU, user, nodeId: 1, terminalType: 'ansi',
    petsciiMode: false, screenWidth: 80, screenHeight: 25, currentConf: 1, relConfNum: 1, currentConfName: 'General',
    tempData: {}, commandHistory: [], historyIndex: 0, historyCycle: 0, commandText: '', inputBuffer: '' };
}

describe('the menu door handover leaves the next prompt to be drawn', () => {
  // Per test, as main-menu-door-is-the-menu does: the harness's own beforeEach resets the command cache.
  beforeEach(async () => {
    const menuTypes = Object.fromEntries(readTooltypeMap(path.join(REPO, 'board', 'Commands', 'BBSCmd', 'MENU.info')));
    await register({ ...doorOver('MENU', menuTypes), type: 'XIM', location: menuTypes.LOCATION });
  });
  beforeEach(() => (exit.runMenuDoor as jest.Mock).mockClear());

  test('the door ran: no duplicate guard is left armed', async () => {
    const session = caller('scroll');
    await displayMainMenu(new CaptureSocket() as any, session);
    expect(exit.runMenuDoor).toHaveBeenCalledTimes(1);
    expect(session.skipNextDisplayFlowMenu).toBeFalsy();
  });

  test('the classic screen drew the prompt: the guard is armed against a duplicate', async () => {
    const session = caller('classic');
    await displayMainMenu(new CaptureSocket() as any, session);
    expect(exit.runMenuDoor).not.toHaveBeenCalled();
    expect(session.skipNextDisplayFlowMenu).toBe(true);
  });
});
