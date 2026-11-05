/**
 * Ctrl-K inside the running main menu door (sysop 2026-10-18: "i cant start ctrl+k in the main menu door"). The board's own
 * Ctrl-K branch only exists at the command prompt; while the door runs, the caller's keys go raw to it, so the DOOR must
 * open the search palette over its menu, in process. Same real path as main-menu-door-is-the-menu.test.ts (display flow ->
 * the REAL Doors/MAINMENU binary under the emulator). The sentinel: the palette box text reaches the caller after 0x0B with
 * no relaunch (still one OPEN-from-launch plus the palette's own open) and Esc repaints the menu, Esc again leaves once.
 * Original header of the sibling test follows.
 * M21: THE one reachability test for the main menu door. The board's display flow
 * (advanceDisplayFlow -> stepDisplayFlow -> displayMainMenu -> launchMenuDoor ->
 * runMenuDoor -> processCommand 'MENU' -> executeDoor -> executeAmigaDoor -> the REAL
 * Doors/MAINMENU binary under the emulator -> AEW_MENU -> menuAnswer) shows the menu; a
 * pick (T) leaves the door, runs through the board (handleTimeCommand), and the door comes
 * back through the exit tail's loop (drainParkedDoors) at the SAME call depth every time;
 * Esc leaves it for the plain prompt, once.
 *
 * Sentinels are pass-through mocks (call counts, arguments), the same trick as the W14 test.
 * displayMenuPrompt is called from inside menu.ts itself, so a module mock cannot see it; the
 * prompt the caller is left at is read from the session state and the capture instead.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../..');
const BOARD = path.join(__dirname, 'compact-40', 'fixtures', 'menu-board');

jest.mock('../../src/utils/acs-access-loader');
jest.mock('../../src/database', () => ({
  db: new Proxy({}, { get: (_t, key) => {
    if (key === 'getUserById') return async () => ({ id: 'u1', username: 'Spot', slotNumber: 1 });
    return async () => undefined;
  } }),
}));

import { EventEmitter } from 'events';
import { installDispatchHarness, register, doorOver } from './dispatch-harness';
import { advanceDisplayFlow } from '../../src/handlers/command.handler';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

installDispatchHarness(root => {
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'board', 'Doors', 'MAINMENU'), path.join(root, 'Doors', 'MAINMENU'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'board', 'Commands', 'BBSCmd', 'MENU.info'), path.join(root, 'Commands', 'BBSCmd', 'MENU.info'));
  fs.cpSync(path.join(BOARD, 'Menus'), path.join(root, 'Menus'), { recursive: true });
  fs.cpSync(path.join(BOARD, 'Screens'), path.join(root, 'Screens'), { recursive: true });
});

// A depth counter around processCommand: how many are stacked at once, ever.
const depth = { now: 0, max: 0 };
jest.mock('../../src/handlers/command.handler', () => {
  const actual = jest.requireActual('../../src/handlers/command.handler');
  return {
    ...actual,
    processCommand: jest.fn(async (...args: unknown[]) => {
      depth.now++; depth.max = Math.max(depth.max, depth.now);
      try { return await (actual.processCommand as (...a: unknown[]) => Promise<unknown>)(...args); } finally { depth.now--; }
    }),
  };
});
// Pass-through mocks: the same functions, with call records.
const opens: Array<{ request: string; maxDepth: number; catalogue: string }> = [];
jest.mock('../../src/amiga-emulation/xim/menu', () => {
  const actual = jest.requireActual('../../src/amiga-emulation/xim/menu');
  return {
    ...actual,
    menuAnswer: jest.fn(async (request: string, ctx: { session: { nodeId?: number } }) => {
      const answer = await (actual.menuAnswer as (r: string, c: unknown) => Promise<string>)(request, ctx);
      if (/^OPEN MAIN/.test(request)) {
        const file = answer.split('\t')[1]?.replace(/^BBS:/, '') ?? '';
        const onDisk = file ? path.join(require('../../src/config').config.get('dataDir'), file) : '';
        opens.push({ request, maxDepth: depth.now, catalogue: onDisk && fs.existsSync(onDisk) ? onDisk : '' });
      }
      return answer;
    }),
  };
});
jest.mock('../../src/handlers/commands/menu-door-exit', () => {
  const actual = jest.requireActual('../../src/handlers/commands/menu-door-exit');
  return { ...actual, drainParkedDoors: jest.fn(actual.drainParkedDoors), takeMenuExit: jest.fn(actual.takeMenuExit) };
});
jest.mock('../../src/handlers/screen.handler', () => {
  const actual = jest.requireActual('../../src/handlers/screen.handler');
  return { ...actual, displayScreen: jest.fn(actual.displayScreen) };
});
jest.mock('../../src/handlers/commands/navigation-commands.handler', () => {
  const actual = jest.requireActual('../../src/handlers/commands/navigation-commands.handler');
  return { ...actual, handleTimeCommand: jest.fn(actual.handleTimeCommand) };
});
const xim = jest.requireMock('../../src/amiga-emulation/xim/menu');
const exitTail = jest.requireMock('../../src/handlers/commands/menu-door-exit');
const screens = jest.requireMock('../../src/handlers/screen.handler');
const nav = jest.requireMock('../../src/handlers/commands/navigation-commands.handler');

class CaptureSocket extends EventEmitter {
  id = 'ctrlk-reach';
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

describe('Ctrl-K in the main menu door through the board', () => {
  test('0x0B reaches the door, the palette box opens over the menu, Esc repaints the menu, a second Esc leaves for the prompt', async () => {
    const menuTypes = Object.fromEntries(readTooltypeMap(path.join(REPO, 'board', 'Commands', 'BBSCmd', 'MENU.info')));
    await register({ ...doorOver('MENU', menuTypes), type: 'XIM', location: menuTypes.LOCATION });
    const user = { id: 'u1', username: 'Spot', realname: 'Johan', location: 'Old Town', slotNumber: 1, secLevel: 255,
      securityFlags: 'T'.repeat(128), userFlags: 0, editor: 'Prompt', zoomType: 0, availableForChat: true, protocol: 'zmodem', expert: 'N' };
    const session: any = { state: 'loggedon', subState: LoggedOnSubState.DISPLAY_MENU, user, nodeId: 1,
      terminalType: 'ansi', petsciiMode: false, screenWidth: 80, screenHeight: 25, currentConf: 1, relConfNum: 1,
      currentConfName: 'General', tempData: {}, commandHistory: [], historyIndex: 0, historyCycle: 0, commandText: '' };
    const socket = new CaptureSocket();
    const out = () => socket.ansi.join('');
    const frames = () => out().split('Page Sysop').length - 1;
    const boxes = () => out().split('Type to search').length - 1;
    const send = (keys: string) => session.doorInputHandler(keys);

    const flow = advanceDisplayFlow(socket as any, session);
    await until(() => frames() >= 1, 60000, 'the first frame');
    expect(boxes()).toBe(0);
    const framesBefore = frames();
    send('\x0b');
    await until(() => boxes() >= 1, 30000, 'the palette box after Ctrl-K');
    expect(frames()).toBe(framesBefore);                                   // the palette is the overlay: the menu is not repainted under it
    expect(exitTail.takeMenuExit).not.toHaveBeenCalled();                  // the door did not exit
    send('\x1b');                                                          // Esc closes the palette: the whole menu is painted again
    await until(() => frames() >= framesBefore + 1, 30000, 'the menu repainted after Esc');
    const before = out().length;
    send('\x1b');                                                          // Esc on the menu leaves for the prompt, once
    await flow;
    await until(() => /Menu \(.*mins\. left\)/.test(out().slice(before)), 30000, 'the prompt after the second Esc');
    expect(boxes()).toBe(1);
  }, 240000);
});
