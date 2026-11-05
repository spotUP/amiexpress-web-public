/**
 * M22: THE one reachability test for the bulletins door. A caller types B through the board's
 * real entry (handleCommand -> processCommand -> executeAmigaDoor -> the REAL Doors/BULLETINS
 * binary under the emulator -> AEW_MENU OPEN BULLETINS); picking bulletin 3 sends SHOW 3, the
 * exit tail hands it to showBulletin, the board displays bull3 itself (displayScreen), and after
 * the caller's key the door reopens on the same row; Esc leaves for the menu prompt, once.
 *
 * Sentinels are pass-through mocks (call counts, arguments), the same trick as the W14 test.
 * displayMenuPrompt is a local call in menu.ts, so the prompt is read from the capture instead.
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
import { handleCommand } from '../../src/handlers/command.handler';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const BULLETIN_THREE = 'BULLETIN THREE TEXT: the harbour opens at dawn';

installDispatchHarness(root => {
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'board', 'Doors', 'BULLETINS'), path.join(root, 'Doors', 'BULLETINS'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  for (const n of ['B.info', 'BULLS.info']) fs.copyFileSync(path.join(REPO, 'board', 'Commands', 'BBSCmd', n), path.join(root, 'Commands', 'BBSCmd', n));
  fs.cpSync(path.join(BOARD, 'Menus'), path.join(root, 'Menus'), { recursive: true });
  fs.cpSync(path.join(BOARD, 'Screens'), path.join(root, 'Screens'), { recursive: true });
  // The board's own bulletin directory (no conference one): BullHelp present, three bulletins with content.
  const dir = path.join(root, 'Bulletins');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'BullHelp.txt'), 'Bulletins\r\n');
  fs.writeFileSync(path.join(dir, 'Bull1.txt'), 'BULLETIN ONE TEXT\r\n');
  fs.writeFileSync(path.join(dir, 'Bull2.txt'), 'BULLETIN TWO TEXT\r\n');
  fs.writeFileSync(path.join(dir, 'Bull3.txt'), `${BULLETIN_THREE}\r\n`);
});

const opens: Array<{ request: string; at: number; catalogue: string }> = [];
const shows: string[] = [];
let outputLength = (): number => 0;
jest.mock('../../src/amiga-emulation/xim/menu', () => {
  const actual = jest.requireActual('../../src/amiga-emulation/xim/menu');
  return {
    ...actual,
    menuAnswer: jest.fn(async (request: string, ctx: { session: { nodeId?: number } }) => {
      const answer = await (actual.menuAnswer as (r: string, c: unknown) => Promise<string>)(request, ctx);
      if (/^SHOW /.test(request)) shows.push(request);
      if (/^OPEN BULLETINS/.test(request)) {
        const file = answer.split('\t')[1]?.replace(/^BBS:/, '') ?? '';
        const onDisk = file ? path.join(require('../../src/config').config.get('dataDir'), file) : '';
        opens.push({ request, at: outputLength(), catalogue: onDisk && fs.existsSync(onDisk) ? fs.readFileSync(onDisk, 'latin1') : '' });
      }
      return answer;
    }),
  };
});
jest.mock('../../src/handlers/commands/menu-door-exit', () => {
  const actual = jest.requireActual('../../src/handlers/commands/menu-door-exit');
  return { ...actual, takeMenuExit: jest.fn(actual.takeMenuExit), showBulletinThenReopen: jest.fn(actual.showBulletinThenReopen) };
});
jest.mock('../../src/handlers/commands/display-file-commands.handler', () => {
  const actual = jest.requireActual('../../src/handlers/commands/display-file-commands.handler');
  return { ...actual, showBulletin: jest.fn(actual.showBulletin) };
});
jest.mock('../../src/handlers/screen.handler', () => {
  const actual = jest.requireActual('../../src/handlers/screen.handler');
  return { ...actual, displayScreen: jest.fn(actual.displayScreen) };
});
const xim = jest.requireMock('../../src/amiga-emulation/xim/menu');
const display = jest.requireMock('../../src/handlers/commands/display-file-commands.handler');
const screens = jest.requireMock('../../src/handlers/screen.handler');

class CaptureSocket extends EventEmitter {
  id = 'm22-reach';
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

describe('B through the board: the bulletins door shows a bulletin and returns to the list', () => {
  test('B opens the list, 3 shows bulletin 3 through the board, the list reopens on it, Esc leaves for the prompt once', async () => {
    // The wiring server/initialization.ts does at boot (the harness mocks index.ts, which never runs it).
    display.setDisplayFileCommandsDependencies({
      displayScreen: screens.displayScreen, findSecurityScreen: require('../../src/utils/screen-security.util').findSecurityScreen,
      confScreenDir: path.join(require('../../src/config').config.get('dataDir'), 'Screens'), db: {}, hasKeysFile: () => false,
    });
    const bTypes = Object.fromEntries(readTooltypeMap(path.join(REPO, 'board', 'Commands', 'BBSCmd', 'B.info')));
    await register({ ...doorOver('B', bTypes), type: 'XIM', location: bTypes.LOCATION });
    const user = { id: 'u1', username: 'Spot', realname: 'Johan', location: 'Old Town', slotNumber: 1, secLevel: 255,
      securityFlags: 'T'.repeat(128), userFlags: 0, editor: 'Prompt', zoomType: 0, availableForChat: true, protocol: 'zmodem', expert: 'N' };
    const session: any = { state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, user, nodeId: 1,
      terminalType: 'ansi', petsciiMode: false, screenWidth: 80, screenHeight: 25, currentConf: 1, relConfNum: 1,
      currentConfName: 'General', tempData: {}, commandHistory: [], historyIndex: 0, historyCycle: 0, commandText: 'B' };
    const socket = new CaptureSocket();
    const out = () => socket.ansi.join('');
    outputLength = () => out().length;
    const frames = () => out().split('BULLETINS').length - 1;
    const send = (keys: string) => session.doorInputHandler(keys);

    const run = handleCommand(socket as any, session, '\r');
    await until(() => frames() >= 1, 60000, 'the first frame');
    send('3');
    await until(() => shows.length >= 1, 30000, 'SHOW 3');
    await until(() => out().includes(BULLETIN_THREE), 30000, 'the bulletin text');
    const textAt = out().indexOf(BULLETIN_THREE);
    // The caller owes the board a key before the list returns (the bulletin has no pause of its own).
    // The key dismisses the pause and the continuation reopens the door; that call returns only when the door ends.
    const dismiss = handleCommand(socket as any, session, ' ');
    await until(() => opens.length >= 2, 60000, 'the reopened list');
    await until(() => frames() >= 2, 60000, 'the second frame');
    const before = out().length;
    send('\x1b');
    await Promise.all([run, dismiss]);
    await until(() => /Menu \(.*mins\. left\)/.test(out().slice(before)), 30000, 'the prompt after Esc');

    // 1. OPEN BULLETINS, then SHOW 3, then OPEN BULLETINS again - and no third.
    const verbs = (xim.menuAnswer.mock.calls as unknown[][]).map(c => String(c[0])).filter(r => /^(OPEN BULLETINS|SHOW )/.test(r));
    expect(verbs).toEqual([expect.stringMatching(/^OPEN BULLETINS/), 'SHOW 3', expect.stringMatching(/^OPEN BULLETINS/)]);
    // 2. The board showed it: showBulletin(3) and the board's own display of a path ending bull3.
    expect((display.showBulletin as jest.Mock).mock.calls.map((c: unknown[]) => c[2])).toEqual([3]);
    const shown = (screens.displayScreen as jest.Mock).mock.calls.map((c: unknown[]) => String(c[2]));
    expect(shown.some(p => /bull3(\.\w+)?$/i.test(p))).toBe(true);
    // 3. The text came after the first frame, and before the reopened one.
    expect(textAt).toBeGreaterThan(opens[0]!.at);
    expect(textAt).toBeLessThan(opens[1]!.at);
    // 4. The reopened catalogue file carries the row of bulletin 3 (third entry: row 2); the first starts at the top.
    expect(opens[0]!.catalogue).toMatch(/^R 0$/m);
    expect(opens[1]!.catalogue).toMatch(/^R 2$/m);
    // 5. Esc: the plain prompt, the door is not opened a third time.
    expect(opens).toHaveLength(2);
  }, 240000);
});
