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
jest.mock('../../src/config', () => ({ config: { get: () => '/nowhere' } }));
const processCommand = jest.fn(async () => 'SUCCESS');
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
const register = (access?: number) => commandCache.bbscmd.set('MENU', { access });

beforeEach(() => {
  jest.clearAllMocks();
  commandCache.bbscmd.clear();
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
  test('an expert caller keeps expert mode: no door at the prompt', async () => {
    register(); const c = caller({}, { expert: 'X' });
    await displayMainMenu(c.socket, c.session, false, true);
    expect(processCommand).not.toHaveBeenCalled();
    expect(displayScreen).not.toHaveBeenCalled();
  });
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
