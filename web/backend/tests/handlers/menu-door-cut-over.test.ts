/**
 * M19: the main menu is the MENU door wherever the board shows its menu (display flow
 * and `?`); Menu.txt stays the fallback. One wiring test through displayMainMenu and
 * handleQuestionMarkCommand with processCommand as the sentinel.
 */
const commandCache = { bbscmd: new Map<string, any>(), syscmd: new Map<string, any>() };
jest.mock('../../src/handlers/command-execution.handler', () => ({
  commandCache,
  revalidateBbsCommandsIfChanged: jest.fn(),
  doorLevelForCommandAccess: (a: number | undefined) => (a === 0 ? 99999 : a && a > 0 ? a : 0),
}));
// A stand-in door that runs: it reaches its exit tail, as executeAmigaDoor does at door.handler.ts:~3147.
let doorBehaviour: (s: any, session: any) => Promise<unknown> = async (_s, session) => {
  const e = require('../../src/handlers/commands/menu-door-exit');
  e.enterExitTail(session); e.leaveExitTail(session); return 'SUCCESS';
};
const processCommand = jest.fn(async (s: any, session: any) => doorBehaviour(s, session));
jest.mock('../../src/handlers/command.handler', () => ({ processCommand: (...a: unknown[]) => (processCommand as any)(...a) }));
const displayScreen = jest.fn(async () => false);
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: (...a: unknown[]) => (displayScreen as any)(...a),
  doPause: jest.fn(),
}));
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getConfig: () => ({ get: () => 'TestBBS' }),
  getMessageBases: () => [],
  getProcessOlmMessageQueue: () => null,
  getScreenMenu: () => 'MENU',
}));
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: () => ({ forceMenus: false }),
}));
jest.mock('../../src/utils/time-tracking.util', () => ({ updateTimeUsed: jest.fn(), getTimeRemainingMinutes: () => 60 }));
jest.mock('../../src/handlers/time-limit.handler', () => ({ checkTimeUsed: async () => false }));
const emitPrompt = jest.fn();
jest.mock('../../src/utils/output.util', () => ({ emitText: jest.fn(), emitPrompt: (...a: unknown[]) => emitPrompt(...a) }));
jest.mock('../../src/utils/door-min-columns.util', () => ({
  ...jest.requireActual('../../src/utils/door-min-columns.util'),
  doorRefusedForWidth: () => false,
}));

jest.mock('../../src/handlers/door.handler', () => ({ theCallerIsLeaving: () => false }));
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { displayMainMenu } from '../../src/handlers/command-handler/menu';
import { handleQuestionMarkCommand } from '../../src/handlers/commands/display-file-commands.handler';
import * as exit from '../../src/handlers/commands/menu-door-exit';

function caller(over: any = {}, user: any = {}) {
  const socket: any = { emit: jest.fn(), connected: true };
  const session: any = {
    user: { username: 't', expert: 'N', secLevel: 10, ...user },
    subState: LoggedOnSubState.DISPLAY_MENU, relConfNum: 1, currentConf: 1, currentConfName: 'G',
    currentMsgBase: 1, timeRemaining: 3600, shortcuts: new Map(), nodeId: 1, ...over,
  };
  return { socket, session };
}
const board = fs.mkdtempSync(path.join(os.tmpdir(), 'mcut-'));
const binary = path.join(board, 'Doors', 'MAINMENU', 'mainmenu');
fs.mkdirSync(path.dirname(binary), { recursive: true });
fs.writeFileSync(binary, 'x');
const restoreRoot = setBoardRoot(board);
afterAll(() => { restoreRoot(); fs.rmSync(board, { recursive: true, force: true }); });
const register = (access?: number) => commandCache.bbscmd.set('MENU', { access, location: 'Doors/MAINMENU/mainmenu' });

beforeEach(() => {
  jest.clearAllMocks();
  commandCache.bbscmd.clear();
  fs.writeFileSync(binary, 'x');
  doorBehaviour = async (_s, session) => { exit.enterExitTail(session); exit.leaveExitTail(session); return 'SUCCESS'; };
});

describe('display flow', () => {
  test('a registered MENU runs once and Menu.txt is not drawn', async () => {
    register(); const c = caller();
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).toHaveBeenCalledTimes(1);
    expect(processCommand).toHaveBeenCalledWith(c.socket, c.session, 'MENU', '');
    expect(displayScreen).not.toHaveBeenCalled();
  });
  test('no MENU registered: the art menu draws as today', async () => {
    const c = caller();
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).not.toHaveBeenCalled();
    expect(displayScreen).toHaveBeenCalledWith(c.socket, c.session, 'MENU');
  });
  test.each([['teletext', { texttvMode: true }], ['rip', { ripMode: true }]])('a %s caller gets the art menu', async (_n, mode) => {
    register(); const c = caller(mode);
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).not.toHaveBeenCalled();
    expect(displayScreen).toHaveBeenCalled();
  });
  test('a caller below MENU ACCESS gets the art menu', async () => {
    register(200); const c = caller();
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).not.toHaveBeenCalled();
    expect(displayScreen).toHaveBeenCalled();
  });
  test('after Esc (dismissed): no door, no art menu, only the prompt, and the flag is consumed', async () => {
    register(); const c = caller();
    exit.markMenuDoorDismissed(c.session);
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).not.toHaveBeenCalled();
    expect(displayScreen).not.toHaveBeenCalled();
    expect(emitPrompt).toHaveBeenCalled();
    expect(exit.takeMenuDoorDismissed(c.session)).toBe(false);
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).toHaveBeenCalledTimes(1);
  });
  test('inside an exit tail the door is parked, not launched', async () => {
    register(); const c = caller();
    exit.enterExitTail(c.session);
    await displayMainMenu(c.socket, c.session, false, true);
    exit.leaveExitTail(c.session);
    expect(processCommand).not.toHaveBeenCalled();
    expect(displayScreen).not.toHaveBeenCalled();
    expect(exit.hasParkedDoor(c.session)).toBe(true);
    exit.clearParkedDoors(c.session);
  });
  test('a registered MENU whose binary is missing: Menu.txt is drawn and the caller gets a prompt', async () => {
    register(); fs.rmSync(binary); const c = caller();
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).not.toHaveBeenCalled();
    expect(displayScreen).toHaveBeenCalledWith(c.socket, c.session, 'MENU');
    expect(emitPrompt).toHaveBeenCalled();
  });
  test('a launch that returns without the door running falls back once and latches', async () => {
    register(); const c = caller();
    doorBehaviour = async () => 'SUCCESS';   // returned without a word, never reached a tail
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).toHaveBeenCalledTimes(1);
    expect(displayScreen).toHaveBeenCalledWith(c.socket, c.session, 'MENU');
    expect(emitPrompt).toHaveBeenCalled();
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).toHaveBeenCalledTimes(1);   // latched: the door is not tried again this session
    expect(displayScreen).toHaveBeenCalledTimes(2);
  });
  test('a door that throws before its tail: one attempt, then Menu.txt, no recursion', async () => {
    register(); const c = caller();
    doorBehaviour = async () => { throw new Error('boom'); };
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).toHaveBeenCalledTimes(1);
    expect(displayScreen).toHaveBeenCalledTimes(1);
    expect(emitPrompt).toHaveBeenCalled();
  });
  test('executeAmigaDoor catch redrawing the menu mid-launch does not relaunch the door', async () => {
    register(); const c = caller();
    doorBehaviour = async (s, session) => { await displayMainMenu(s, session, false, true); return 'SUCCESS'; };  // the crash handler
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).toHaveBeenCalledTimes(1);
    expect(displayScreen).toHaveBeenCalledTimes(1);     // drawn once, by the handler, not again by the outer call
    expect(emitPrompt).toHaveBeenCalledTimes(1);
  });
  test('an expert caller keeps expert mode: no door at the prompt', async () => {
    register(); const c = caller({}, { expert: 'X' });
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).not.toHaveBeenCalled();
    expect(displayScreen).not.toHaveBeenCalled();
  });
});

test('an expert who left the door with Esc after ? does not skip the next forced display', async () => {
  register(); const c = caller({}, { expert: 'X' });
  exit.markMenuDoorDismissed(c.session);
  await displayMainMenu(c.socket, c.session, false, true);   // post-door display for an expert: nothing shown
  expect(processCommand).not.toHaveBeenCalled();
  await displayMainMenu(c.socket, c.session, true, true);    // a forced display
  expect(processCommand).toHaveBeenCalledTimes(1);
});

describe('?', () => {
  test.each([['expert', 'X'], ['non-expert', 'N']])('opens the door for an %s caller', async (_n, expert) => {
    register(); const c = caller({}, { expert });
    await handleQuestionMarkCommand(c.socket, c.session);
    expect(processCommand).toHaveBeenCalledWith(c.socket, c.session, 'MENU', '');
    expect(displayScreen).not.toHaveBeenCalled();
  });
  test('with no MENU registered: the non-expert no-op and the expert redraw are unchanged', async () => {
    const n = caller({ subState: LoggedOnSubState.PROCESS_COMMAND }, { expert: 'N' });
    await handleQuestionMarkCommand(n.socket, n.session);
    expect(n.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(processCommand).not.toHaveBeenCalled();
    const e = caller({}, { expert: 'X' });
    await handleQuestionMarkCommand(e.socket, e.session);
    expect(displayScreen).toHaveBeenCalledWith(e.socket, e.session, 'MENU');
  });
  test('? consumes a pending dismissal so the door opens', async () => {
    register(); const c = caller();
    exit.markMenuDoorDismissed(c.session);
    await handleQuestionMarkCommand(c.socket, c.session);
    expect(processCommand).toHaveBeenCalledTimes(1);
    expect(exit.takeMenuDoorDismissed(c.session)).toBe(false);
  });
});

describe('a parked MENU relaunch (the exit-tail drain)', () => {
  const HARD_CAP = 6;
  /** park a MENU relaunch the way a door's exit tail does, then let the outermost tail drain it */
  async function parkAndDrain(c: { socket: any; session: any }) {
    exit.enterExitTail(c.session);
    await displayMainMenu(c.socket, c.session, false, true);
    expect(exit.hasParkedDoor(c.session)).toBe(true);
    exit.leaveExitTail(c.session);
    await exit.drainParkedDoors(c.socket, c.session);
  }
  test('a relaunch that throws before its tail is tried once, then Menu.txt and a prompt', async () => {
    register(); const c = caller();
    doorBehaviour = async () => { if (processCommand.mock.calls.length > HARD_CAP) return 'STOP'; throw new Error('boom'); };
    await parkAndDrain(c);
    expect(processCommand).toHaveBeenCalledTimes(1);
    expect(displayScreen).toHaveBeenCalledWith(c.socket, c.session, 'MENU');
    expect(emitPrompt).toHaveBeenCalledTimes(1);
    expect(exit.hasParkedDoor(c.session)).toBe(false);
  });
  test('a relaunch whose crash handler redraws the menu does not loop', async () => {
    register(); const c = caller();
    doorBehaviour = async (s, session) => {
      if (processCommand.mock.calls.length > HARD_CAP) return 'STOP';
      await new Promise((r) => setTimeout(r, 0));
      await displayMainMenu(s, session, false, true);   // executeAmigaDoor's catch
      return 'SUCCESS';
    };
    await parkAndDrain(c);
    expect(processCommand).toHaveBeenCalledTimes(1);
    expect(displayScreen).toHaveBeenCalledTimes(1);
    expect(emitPrompt).toHaveBeenCalledTimes(1);
  });
  test('a relaunch that returns silently without a tail is latched: art menu and a prompt', async () => {
    register(); const c = caller();
    doorBehaviour = async () => 'SUCCESS';
    await parkAndDrain(c);
    expect(processCommand).toHaveBeenCalledTimes(1);
    expect(displayScreen).toHaveBeenCalledTimes(1);
    expect(emitPrompt).toHaveBeenCalledTimes(1);
    expect(exit.menuDoorFailed(c.session)).toBe(true);
  });
  test('a latched session never parks again', async () => {
    register(); const c = caller();
    exit.markMenuDoorFailed(c.session);
    exit.enterExitTail(c.session);
    await displayMainMenu(c.socket, c.session, false, true);
    exit.leaveExitTail(c.session);
    expect(exit.hasParkedDoor(c.session)).toBe(false);
    expect(displayScreen).toHaveBeenCalledWith(c.socket, c.session, 'MENU');
  });
  test('the latch is per session: another session still launches', async () => {
    register(); const a = caller(); const b = caller();
    exit.markMenuDoorFailed(a.session);
    await displayMainMenu(a.socket, a.session, false, true);
    expect(processCommand).not.toHaveBeenCalled();
    await displayMainMenu(b.socket, b.session, false, true);
    expect(processCommand).toHaveBeenCalledTimes(1);
  });
});
