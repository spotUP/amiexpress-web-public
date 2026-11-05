/**
 * WEB_: Tab on an empty command prompt opens the menu door by running `?`, for an expert (who never sees the menu
 * after a command) and a novice who left the door with no pick alike (sysop 2026-10-18). Driven through the board's real entry point, handleCommand, with the MENU
 * door registered and the caller on the Scroll style (Classic takes the style-cycle branch instead, see
 * classic-in-the-tab-cycle.test.ts). Sentinel: handleQuestionMarkCommand, stubbed so no emulator starts.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../..');
const BOARD = path.join(__dirname, 'compact-40', 'fixtures', 'menu-board');

jest.mock('../../src/utils/acs-access-loader');
jest.mock('../../src/database', () => ({
  db: new Proxy({}, { get: () => async () => undefined }),
}));
jest.mock('../../src/handlers/commands/display-file-commands.handler', () => ({
  ...jest.requireActual('../../src/handlers/commands/display-file-commands.handler'),
  handleQuestionMarkCommand: jest.fn(async () => undefined),
}));

import { EventEmitter } from 'events';
import { installDispatchHarness, register, doorOver } from './dispatch-harness';
import { handleCommand } from '../../src/handlers/command.handler';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const display = jest.requireMock('../../src/handlers/commands/display-file-commands.handler');

installDispatchHarness(root => {
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'board', 'Commands', 'BBSCmd', 'MENU.info'), path.join(root, 'Commands', 'BBSCmd', 'MENU.info'));
  fs.cpSync(path.join(BOARD, 'Menus'), path.join(root, 'Menus'), { recursive: true });
  fs.cpSync(path.join(BOARD, 'Screens'), path.join(root, 'Screens'), { recursive: true });
});

class CaptureSocket extends EventEmitter {
  id = 'prompt-tab';
  connected = true;
}

function caller(expert: 'X' | 'N', inputBuffer = ''): any {
  const user = { id: 'u1', username: 'Spot', slotNumber: 1, secLevel: 255, securityFlags: 'T'.repeat(128),
    userFlags: 0, expert, menuStyle: 'scroll' };
  return { state: 'loggedon', subState: LoggedOnSubState.READ_COMMAND, user, nodeId: 1, terminalType: 'ansi',
    petsciiMode: false, screenWidth: 80, screenHeight: 25, currentConf: 1, relConfNum: 1, currentConfName: 'General',
    tempData: {}, commandHistory: [], historyIndex: 0, historyCycle: 0, commandText: '', inputBuffer };
}

async function until(pred: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await new Promise(r => setTimeout(r, 20));
  return pred();
}

describe('Tab on an empty prompt shows the menu', () => {
  beforeAll(async () => {
    const menuTypes = Object.fromEntries(readTooltypeMap(path.join(REPO, 'board', 'Commands', 'BBSCmd', 'MENU.info')));
    await register({ ...doorOver('MENU', menuTypes), type: 'XIM', location: menuTypes.LOCATION });
  });
  beforeEach(() => (display.handleQuestionMarkCommand as jest.Mock).mockClear());

  test('an expert on the Scroll style: Tab runs ? once', async () => {
    await handleCommand(new CaptureSocket() as any, caller('X'), '\t');
    expect(await until(() => display.handleQuestionMarkCommand.mock.calls.length > 0, 2000)).toBe(true);
    expect(display.handleQuestionMarkCommand).toHaveBeenCalledTimes(1);
  });

  test('a novice at a bare prompt (left the door with no pick): Tab runs ? once', async () => {
    await handleCommand(new CaptureSocket() as any, caller('N'), '\t');
    expect(await until(() => display.handleQuestionMarkCommand.mock.calls.length > 0, 2000)).toBe(true);
    expect(display.handleQuestionMarkCommand).toHaveBeenCalledTimes(1);
  });

  test('Tab after typed text keeps its completion meaning: no ?', async () => {
    await handleCommand(new CaptureSocket() as any, caller('N', 'zz'), '\t');
    expect(await until(() => display.handleQuestionMarkCommand.mock.calls.length > 0, 500)).toBe(false);
  });
});
