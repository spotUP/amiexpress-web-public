/**
 * WEB_MENU_STYLE: THE one reachability test for Classic in the menu style Tab cycle (Classic -> Scroll -> Cover flow
 * -> Classic). Both directions run through the board's real entry point, handleCommand, and the REAL Doors/MAINMENU
 * binary under the emulator:
 *
 *  1. A classic caller presses Tab on an empty command prompt: promptTabLeavesClassic stores Scroll, arms the notice,
 *     and MENU opens the door, whose catalogue carries "N Menu style: Scroll".
 *  2. Tab twice inside the door: STYLE+ scroll -> Cover flow, STYLE+ coverflow -> Classic. Classic leaves the door; the
 *     board draws its own MENU screen, then "Menu style: Classic. Tab for Scroll.", then the prompt.
 *
 * Sentinels are pass-through mocks (call counts, arguments), the same trick as main-menu-door-is-the-menu.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../..');
const BOARD = path.join(__dirname, 'compact-40', 'fixtures', 'menu-board');

jest.mock('../../src/utils/acs-access-loader');
jest.mock('../../src/database', () => ({
  db: new Proxy({}, { get: (_t, key) => {
    if (key === 'getUserById') return async () => ({ id: 'u1', username: 'Spot', slotNumber: 1, menuStyle: 'classic' });
    return async () => undefined;
  } }),
}));

import { EventEmitter } from 'events';
import { installDispatchHarness, register, doorOver } from './dispatch-harness';
import { handleCommand } from '../../src/handlers/command.handler';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

installDispatchHarness(root => {
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'Doors', 'MAINMENU'), path.join(root, 'Doors', 'MAINMENU'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'Commands', 'BBSCmd', 'MENU.info'), path.join(root, 'Commands', 'BBSCmd', 'MENU.info'));
  fs.cpSync(path.join(BOARD, 'Menus'), path.join(root, 'Menus'), { recursive: true });
  fs.cpSync(path.join(BOARD, 'Screens'), path.join(root, 'Screens'), { recursive: true });
});

// Pass-through mocks: the same functions, with call records.
const catalogues: string[] = [];
jest.mock('../../src/amiga-emulation/xim/menu', () => {
  const actual = jest.requireActual('../../src/amiga-emulation/xim/menu');
  return {
    ...actual,
    menuAnswer: jest.fn(async (request: string, ctx: unknown) => {
      const answer = await (actual.menuAnswer as (r: string, c: unknown) => Promise<string>)(request, ctx);
      if (/^OPEN MAIN/.test(request)) {
        const file = answer.split('\t')[1]?.replace(/^BBS:/, '') ?? '';
        const onDisk = file ? path.join(require('../../src/config').config.get('dataDir'), file) : '';
        catalogues.push(onDisk && fs.existsSync(onDisk) ? fs.readFileSync(onDisk, 'latin1') : '');
      }
      return answer;
    }),
  };
});
jest.mock('../../src/handlers/command-handler/menu', () => {
  const actual = jest.requireActual('../../src/handlers/command-handler/menu');
  return { ...actual, promptTabLeavesClassic: jest.fn(actual.promptTabLeavesClassic) };
});
jest.mock('../../src/handlers/screen.handler', () => {
  const actual = jest.requireActual('../../src/handlers/screen.handler');
  return { ...actual, displayScreen: jest.fn(actual.displayScreen) };
});
const xim = jest.requireMock('../../src/amiga-emulation/xim/menu');
const menu = jest.requireMock('../../src/handlers/command-handler/menu');
const screens = jest.requireMock('../../src/handlers/screen.handler');

class CaptureSocket extends EventEmitter {
  id = 'classic-tab-reach';
  connected = true;
  readonly ansi: string[] = [];
  emit(event: string, data?: any): boolean {
    if (event === 'ansi-output') this.ansi.push(typeof data === 'string' ? data : String(data ?? ''));
    return super.emit(event, data);
  }
}

async function until(pred: () => boolean, ms: number, what: string): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
    await new Promise(r => setTimeout(r, 100));
  }
}

describe('Classic in the menu style Tab cycle, through the board', () => {
  test('prompt Tab leaves Classic for the Scroll door; door Tab past Cover flow lands on the classic MENU screen', async () => {
    const menuTypes = Object.fromEntries(readTooltypeMap(path.join(REPO, 'Commands', 'BBSCmd', 'MENU.info')));
    await register({ ...doorOver('MENU', menuTypes), type: 'XIM', location: menuTypes.LOCATION });
    const user = { id: 'u1', username: 'Spot', realname: 'Johan', location: 'Old Town', slotNumber: 1, secLevel: 255,
      securityFlags: 'T'.repeat(128), userFlags: 0, editor: 'Prompt', zoomType: 0, availableForChat: true, protocol: 'zmodem',
      expert: 'N', menuStyle: 'classic' };
    const session: any = { state: 'loggedon', subState: LoggedOnSubState.READ_COMMAND, user, nodeId: 1,
      terminalType: 'ansi', petsciiMode: false, screenWidth: 80, screenHeight: 25, currentConf: 1, relConfNum: 1,
      currentConfName: 'General', tempData: {}, commandHistory: [], historyIndex: 0, historyCycle: 0, commandText: '',
      inputBuffer: '' };
    const socket = new CaptureSocket();
    const out = () => socket.ansi.join('');
    const frames = () => out().split('Page Sysop').length - 1;
    const send = (keys: string) => session.doorInputHandler(keys);
    const styleAsks = () => xim.menuAnswer.mock.calls.map((c: unknown[]) => String(c[0])).filter((r: string) => /^STYLE\+/.test(r));

    // 1. Tab on the empty prompt of a classic caller: the board's own key path.
    await handleCommand(socket as any, session, '\t');
    expect(menu.promptTabLeavesClassic).toHaveBeenCalledTimes(1);
    expect(user.menuStyle).toBe('scroll');
    await until(() => frames() >= 1, 60000, 'the Scroll door');
    expect(catalogues).toHaveLength(1);
    expect(catalogues[0]).toMatch(/^N Menu style: Scroll$/m);
    await until(() => out().includes('Menu style: Scroll'), 30000, 'the door naming the style');

    // 2. Tab in the door: Scroll -> Cover flow (the door stays), Cover flow -> Classic (the door leaves).
    send('\t');
    await until(() => user.menuStyle === 'coverflow', 30000, 'Cover flow stored');
    const before = out().length;
    send('\t');
    await until(() => user.menuStyle === 'classic', 30000, 'Classic stored');
    await until(() => /Menu \(.*mins\. left\)/.test(out().slice(before)), 60000, 'the prompt after Classic');
    expect(styleAsks()).toEqual(['STYLE+ scroll', 'STYLE+ coverflow']);

    // The board's MENU screen, then the Tab line, then the prompt - in that order.
    const tail = out().slice(before);
    expect((screens.displayScreen as jest.Mock).mock.calls.some((c: unknown[]) => String(c[2]).toUpperCase() === 'MENU')).toBe(true);
    const tabLine = tail.indexOf('Menu style: Classic. Tab for Scroll.');
    expect(tabLine).toBeGreaterThan(-1);
    expect(tail.slice(tabLine)).toMatch(/Menu \(.*mins\. left\)/);
    // Classic is the board's screen, not the door: nothing asks the door's verbs after the step to Classic.
    const asks = xim.menuAnswer.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(asks.slice(asks.lastIndexOf('STYLE+ coverflow') + 1).filter((r: string) => /^OPEN /.test(r))).toEqual([]);
  }, 240000);
});
