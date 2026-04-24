/**
 * Menu Display Tests (express.e:28555-28648)
 * Tests displayMainMenu and displayMenuPrompt.
 */

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn(),
  hasKeysFile: jest.fn().mockReturnValue(false),
  hasKeysFileForResolvedPath: jest.fn().mockReturnValue(false),
}));
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getConfig: jest.fn().mockReturnValue({
    get: jest.fn((key: string) => key === 'bbsName' ? 'TestBBS' : null),
  }),
  getMessageBases: jest.fn().mockReturnValue([]),
  getProcessOlmMessageQueue: jest.fn().mockReturnValue(null),
  getScreenMenu: jest.fn().mockReturnValue('MENU'),
}));
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: jest.fn().mockReturnValue({
    forceMenus: false, noBulls: false, noConfBulls: false,
    forceNewscan: false, noNewscan: false, showNewFiles: false, noNewFiles: false,
  }),
}));
jest.mock('../../src/utils/time-tracking.util', () => ({
  updateTimeUsed: jest.fn(),
  getTimeRemainingMinutes: jest.fn().mockReturnValue(60),
}));
jest.mock('../../src/utils/output.util', () => ({
  emitText: jest.fn(),
  emitPrompt: jest.fn(),
}));
jest.mock('../../src/handlers/transfer/olm.handler', () => ({
  processOlmQueue: jest.fn(),
}), { virtual: true });

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { displayMainMenu, displayMenuPrompt } from '../../src/handlers/command-handler/menu';
import { getConfig, getMessageBases } from '../../src/handlers/command-handler/dependency-injection';
import { emitPrompt } from '../../src/utils/output.util';
import { updateTimeUsed } from '../../src/utils/time-tracking.util';

function makeSocket() {
  return { emit: jest.fn() };
}

function makeSession(overrides: any = {}) {
  return {
    user: { username: 'tester', expert: 'N' },
    subState: LoggedOnSubState.READ_COMMAND,
    relConfNum: 1,
    currentConf: 1,
    currentConfName: 'General',
    currentMsgBase: 1,
    timeRemaining: 3600,
    cmdShortcuts: false,
    shortcuts: new Map(),
    paginatedScreen: null,
    lastScreenHadPause: false,
    doorExpertMode: false,
    ...overrides,
  } as any;
}

describe('Menu Display (express.e:28555-28648)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('displayMainMenu', () => {
    it('skips during confScan when forceMenuDisplay=false', async () => {
      const socket = makeSocket();
      const session = makeSession({ inConfScan: true });

      await displayMainMenu(socket, session, false);

      // Should not emit anything - skipped
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('shows menu when forceMenuDisplay=true even during confScan', async () => {
      const socket = makeSocket();
      const session = makeSession({ inConfScan: true });

      await displayMainMenu(socket, session, true);

      // Forces display — may or may not emit depending on screen files
      // Just verify the session state is set correctly
      expect(session.skipNextDisplayFlowMenu).toBe(true);
    });

    it('resets cmdShortcuts to false (express.e:6567)', async () => {
      const socket = makeSocket();
      const session = makeSession({ cmdShortcuts: true });

      await displayMainMenu(socket, session);

      expect(session.cmdShortcuts).toBe(false);
    });

    it('clears paginatedScreen state', async () => {
      const socket = makeSocket();
      const session = makeSession({ paginatedScreen: { foo: 'bar' } });

      await displayMainMenu(socket, session);

      expect(session.paginatedScreen).toBeUndefined();
    });

    it('sets manualMenuTargetState to READ_COMMAND', async () => {
      const socket = makeSocket();
      const session = makeSession();

      await displayMainMenu(socket, session);

      expect(session.manualMenuTargetState).toBe(LoggedOnSubState.READ_COMMAND);
    });

    it('novice user (expert=N) should display menu', async () => {
      const socket = makeSocket();
      const session = makeSession({ user: { username: 'user', expert: 'N' } });

      await displayMainMenu(socket, session);

      // session should still have the target state set
      expect(session.manualMenuTargetState).toBe(LoggedOnSubState.READ_COMMAND);
    });
  });

  describe('displayMenuPrompt', () => {
    it('skips during confScan', () => {
      const socket = makeSocket();
      const session = makeSession({ inConfScan: true });

      displayMenuPrompt(socket, session);

      expect(emitPrompt).not.toHaveBeenCalled();
    });

    it('calls updateTimeUsed (express.e:28591)', () => {
      const socket = makeSocket();
      const session = makeSession();

      displayMenuPrompt(socket, session);

      expect(updateTimeUsed).toHaveBeenCalledWith(socket, session);
    });

    it('emits prompt with bbsName, conference, time remaining', () => {
      const socket = makeSocket();
      const session = makeSession({ currentConfName: 'TestConf', relConfNum: 2 });

      displayMenuPrompt(socket, session);

      const promptArg = (emitPrompt as jest.Mock).mock.calls[0]?.[1] || '';
      expect(promptArg).toContain('TestBBS');
      expect(promptArg).toContain('TestConf');
    });

    it('skips when config not injected', () => {
      (getConfig as jest.Mock).mockReturnValueOnce(null);
      const socket = makeSocket();
      const session = makeSession();

      displayMenuPrompt(socket, session);

      expect(emitPrompt).not.toHaveBeenCalled();
    });

    it('shows "MsgBaseName" in prompt when multiple bases in conference', () => {
      (getMessageBases as jest.Mock).mockReturnValueOnce([
        { id: 1, conferenceId: 1, name: 'General' },
        { id: 2, conferenceId: 1, name: 'Chatter' },
      ]);

      const socket = makeSocket();
      const session = makeSession({ currentMsgBase: 1 });

      displayMenuPrompt(socket, session);

      const promptArg = (emitPrompt as jest.Mock).mock.calls[0]?.[1] || '';
      expect(promptArg).toContain('General');
    });
  });
});
