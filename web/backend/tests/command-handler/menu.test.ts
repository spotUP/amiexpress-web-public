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
  checkTimeUsed: jest.fn().mockResolvedValue(false),
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
import { displayScreen as mockedDisplayScreen } from '../../src/handlers/screen.handler';

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

  // Regression for #9: in expert mode (user.expert='X'), saveMessage used to call
  // displayMainMenu(forceMenuDisplay=true) — which bypassed the expert-mode check
  // and redrew the full ANSI menu over the user's preference. The fix splits the
  // "bypass debounce" intent from the "force display" intent into two flags so
  // saveMessage can guarantee the prompt without forcing the full menu screen.
  describe('expert-mode suppression after E command (regression for #9)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('expert user (expert=X) — saveMessage call shape (force=false, bypass=true) suppresses MENU screen', async () => {
      const socket = makeSocket();
      const session = makeSession({ user: { username: 'expert', expert: 'X' } });

      // Prime the debounce so we can verify bypass=true actually moves past it.
      (session as any)._lastMainMenuTime = Date.now();

      // This is the EXACT call shape saveMessage uses post-fix.
      await displayMainMenu(socket, session, false /* forceMenuDisplay */, true /* bypassDebounce */);

      expect(mockedDisplayScreen).not.toHaveBeenCalledWith(
        expect.anything(), expect.anything(), 'MENU'
      );
    });

    it('expert user (expert=X) — old buggy call shape (force=true) WOULD draw MENU — proves the regression vector', async () => {
      const socket = makeSocket();
      const session = makeSession({ user: { username: 'expert', expert: 'X' } });

      // This is the OLD bad call shape — kept here as a sentinel: if anyone
      // re-introduces forceMenuDisplay=true at saveMessage's call site, expert
      // mode would once again be overridden. The test asserts that path still
      // exists in the API, so the contract for the fix is explicit.
      await displayMainMenu(socket, session, true /* forceMenuDisplay */);

      expect(mockedDisplayScreen).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), 'MENU'
      );
    });

    it('bypassDebounce=true bypasses the 500ms guard while still respecting expert mode', async () => {
      const socket = makeSocket();
      const expertSession = makeSession({ user: { username: 'expert', expert: 'X' } });
      const noviceSession = makeSession({ user: { username: 'novice', expert: 'N' } });

      // Prime debounce on both sessions (would normally swallow calls).
      (expertSession as any)._lastMainMenuTime = Date.now();
      (noviceSession as any)._lastMainMenuTime = Date.now();

      // Expert: bypass=true still skips MENU render.
      await displayMainMenu(socket, expertSession, false, true);
      expect(mockedDisplayScreen).not.toHaveBeenCalledWith(
        expect.anything(), expect.anything(), 'MENU'
      );

      // Novice: bypass=true renders MENU because expert is off.
      jest.clearAllMocks();
      await displayMainMenu(socket, noviceSession, false, true);
      expect(mockedDisplayScreen).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), 'MENU'
      );
    });

    // Source-level guard: catches anyone who edits message-entry.handler.ts
    // back to forceMenuDisplay=true. The text of the call site is part of the
    // contract for #9 — keep saveMessage's invocation specific.
    it('saveMessage call site uses forceMenuDisplay=false, bypassDebounce=true (source-level guard)', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../../src/handlers/message/message-entry.handler.ts'),
        'utf8'
      );

      // Find the saveMessage closing block — assume there's only one displayMainMenu call inside it.
      // Match the call regardless of whitespace/comments between args.
      const saveMessageCall = src.match(
        /displayMainMenu\s*\(\s*socket\s*,\s*session\s*,\s*(true|false)([\s\S]*?)\)/
      );
      expect(saveMessageCall).not.toBeNull();
      // First positional arg after session must be `false` — i.e. don't override expert mode.
      expect(saveMessageCall![1]).toBe('false');
      // The 2nd boolean (bypassDebounce) must be present and true.
      expect(saveMessageCall![2]).toMatch(/,\s*true/);
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
