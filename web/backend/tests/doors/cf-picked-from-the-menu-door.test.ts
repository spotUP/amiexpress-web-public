/**
 * CF typed in the main menu door keeps the caller in CF's own prompts (sysop, 2026-10-17: at "Edit which flags
 * [M]ailScan, ..." the M ran the board's M command - ANSI colour off - "the door doesnt get the input the bbs does").
 *
 * THE one reachability test for a board command with a sub-state prompt picked from the menu door. The real path:
 * the display flow opens the REAL Doors/MAINMENU binary under the emulator, the caller types `cf` RETURN in it
 * (AEW_MENU RUN), the door exits and the exit tail runs CF through processCommand. CF parks CF_FLAG_SELECT_INPUT
 * (express.e:24750 readChar), so the caller's next key belongs to CF: `M` picks the mail-scan mask, `2` RETURN
 * (express.e:24770 lineInput) flips conference 2's M flag. The keys go through the same rule the socket handler uses:
 * a running door's doorInputHandler while one is up, handleCommand otherwise.
 *
 * Sentinels: handleCFFlagSelectInput / handleCFConfSelectInput are pass-through mocks (call counts, arguments), and
 * the flag store records the write.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../..');
const BOARD = path.join(__dirname, 'compact-40', 'fixtures', 'menu-board');

jest.mock('../../src/utils/acs-access-loader');
jest.mock('../../src/utils/message-pointers.util');
jest.mock('../../src/database', () => ({
  db: new Proxy({}, { get: (_t, key) => {
    if (key === 'getUserById') return async () => ({ id: 'u1', username: 'Spot', slotNumber: 1, menuStyle: 'scroll' });
    if (key === 'getMessageBases') return async (confId: number) => [{ id: confId, name: 'Main', conferenceid: confId }];
    return async () => undefined;
  } }),
}));
jest.mock('../../src/handlers/commands/advanced-commands.handler', () => {
  const actual = jest.requireActual('../../src/handlers/commands/advanced-commands.handler');
  return {
    ...actual,
    handleCFFlagSelectInput: jest.fn(actual.handleCFFlagSelectInput),
    handleCFConfSelectInput: jest.fn(actual.handleCFConfSelectInput),
  };
});
jest.mock('../../src/handlers/chat/preference-chat-commands.handler', () => {
  const actual = jest.requireActual('../../src/handlers/chat/preference-chat-commands.handler');
  return { ...actual, handleAnsiModeCommand: jest.fn(actual.handleAnsiModeCommand) };
});

import { EventEmitter } from 'events';
import { installDispatchHarness, register, doorOver } from './dispatch-harness';
import { advanceDisplayFlow, handleCommand } from '../../src/handlers/command.handler';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { setAdvancedCommandsDependencies } from '../../src/handlers/commands/advanced-commands.handler';
import * as pointers from '../../src/utils/message-pointers.util';
import { flushOutput } from '../../src/utils/output.util';

installDispatchHarness(root => {
  fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'board', 'Doors', 'MAINMENU'), path.join(root, 'Doors', 'MAINMENU'));
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'board', 'Commands', 'BBSCmd', 'MENU.info'), path.join(root, 'Commands', 'BBSCmd', 'MENU.info'));
  fs.cpSync(path.join(BOARD, 'Menus'), path.join(root, 'Menus'), { recursive: true });
  fs.cpSync(path.join(BOARD, 'Screens'), path.join(root, 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
});

const advanced = jest.requireMock('../../src/handlers/commands/advanced-commands.handler');

class CaptureSocket extends EventEmitter {
  id = 'cf-from-menu-door';
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

const MAIL_SCAN_MASK = 4;

describe('CF picked from the menu door', () => {
  test('cf RETURN in the door, then M reaches the flag editor and 2 RETURN flips conference 2 mail scan', async () => {
    const flags = new Map<number, number>();
    (pointers.getConferenceScanFlags as jest.Mock).mockImplementation(async (_u: string, conf: number) => flags.get(conf) ?? 0);
    (pointers.setConferenceScanFlags as jest.Mock).mockImplementation(
      async (_u: string, conf: number, _b: number, change: (f: number) => number) => {
        const next = change(flags.get(conf) ?? 0) & 0xff;
        flags.set(conf, next);
        return next;
      });
    setAdvancedCommandsDependencies({
      conferences: [{ id: 1, name: 'Amiga Demoscene!' }, { id: 2, name: 'C64 Demoscene' }] as any,
      messageBases: [], messages: [], checkConfAccess: () => true,
    });
    const menuTypes = Object.fromEntries(readTooltypeMap(path.join(REPO, 'board', 'Commands', 'BBSCmd', 'MENU.info')));
    await register({ ...doorOver('MENU', menuTypes), type: 'XIM', location: menuTypes.LOCATION });
    const user = { id: 'u1', username: 'Spot', realname: 'Johan', location: 'Old Town', slotNumber: 1, secLevel: 255,
      securityFlags: 'T'.repeat(128), userFlags: 0, editor: 'Prompt', zoomType: 0, availableForChat: true, protocol: 'zmodem', expert: 'N', menuStyle: 'scroll' };
    const session: any = { state: 'loggedon', subState: LoggedOnSubState.DISPLAY_MENU, user, nodeId: 1,
      terminalType: 'ansi', petsciiMode: false, screenWidth: 80, screenHeight: 25, currentConf: 1, relConfNum: 1,
      currentConfName: 'General', tempData: {}, commandHistory: [], historyIndex: 0, historyCycle: 0, commandText: '',
      inputBuffer: '' };
    const socket = new CaptureSocket();
    const out = () => { flushOutput(socket as any); return socket.ansi.join(''); };
    const frames = () => out().split('Page Sysop').length - 1;
    // socket-handlers.ts: a running door's keys go to its doorInputHandler, every other key to handleCommand.
    const send = async (keys: string) => {
      for (const key of keys) {
        if (session.inDoorManager && session.doorInputHandler) session.doorInputHandler(key);
        else await handleCommand(socket as any, session, key);
      }
    };
    const prefs = jest.requireMock('../../src/handlers/chat/preference-chat-commands.handler');
    const ansiToggles = () => (prefs.handleAnsiModeCommand as jest.Mock).mock.calls.length;

    void advanceDisplayFlow(socket as any, session);
    await until(() => frames() >= 1, 60000, 'the menu door');
    const togglesBefore = ansiToggles();

    await send('cf\r');
    await until(() => /Edit which flags \[M\]ailScan/.test(out()), 60000, 'the CF flag prompt');
    // Let the exit tail finish: a relaunched menu door would take the next key.
    await new Promise(r => setTimeout(r, 1500));
    expect(session.subState).toBe(LoggedOnSubState.CF_FLAG_SELECT_INPUT);

    await send('M');
    await until(() => advanced.handleCFFlagSelectInput.mock.calls.length > 0, 10000, 'M reaching CF');
    expect(advanced.handleCFFlagSelectInput.mock.calls[0][2]).toBe('M');
    expect(ansiToggles()).toBe(togglesBefore);
    expect(session.subState).toBe(LoggedOnSubState.CF_CONF_SELECT_INPUT);

    await send('2\r');
    await until(() => advanced.handleCFConfSelectInput.mock.calls.length > 0, 10000, '2 RETURN reaching CF');
    expect(flags.get(2)! & MAIL_SCAN_MASK).toBe(MAIL_SCAN_MASK);
    expect(flags.get(1) ?? 0).toBe(0);
  }, 240000);
});
