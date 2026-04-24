/**
 * User Edit States Tests
 * Tests the W_EDIT_* state machine: character buffering, echo, enter-to-commit.
 */

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

// Mock all the actual W_EDIT handlers so we only test routing/buffering
jest.mock('../../src/handlers/commands/info-commands.handler', () => ({
  handleWOptionSelectInput: jest.fn().mockResolvedValue(undefined),
  handleWEditNameInput: jest.fn().mockResolvedValue(undefined),
  handleWEditEmailInput: jest.fn().mockResolvedValue(undefined),
  handleWEditRealnameInput: jest.fn().mockResolvedValue(undefined),
  handleWEditInternetnameInput: jest.fn().mockResolvedValue(undefined),
  handleWEditLocationInput: jest.fn().mockResolvedValue(undefined),
  handleWEditPhoneInput: jest.fn().mockResolvedValue(undefined),
  handleWEditPasswordInput: jest.fn().mockResolvedValue(undefined),
  handleWEditPasswordConfirmInput: jest.fn().mockResolvedValue(undefined),
  handleWEditLinesInput: jest.fn().mockResolvedValue(undefined),
  handleWEditComputerInput: jest.fn().mockResolvedValue(undefined),
  handleWEditScreentypeInput: jest.fn().mockResolvedValue(undefined),
  handleWEditProtocolInput: jest.fn().mockResolvedValue(undefined),
  handleWEditTranslatorInput: jest.fn().mockResolvedValue(undefined),
  handleWEditModemSpeedInput: jest.fn().mockResolvedValue(undefined),
  handleWEditFontInput: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/handlers/user/gdpr.handler', () => ({
  handleForgetMeConfirmInput: jest.fn().mockResolvedValue(undefined),
  handleForgetMePasswordInput: jest.fn().mockResolvedValue(undefined),
  handleForgetMeUsernameInput: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/handlers/command-handler/input-helpers', () => ({
  handleBufferedInput: jest.fn(),
}));
jest.mock('../../src/utils/output.util', () => ({
  emitText: jest.fn(),
}));

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import {
  isUserEditState,
  handleUserEditInput,
  getUserEditStates,
} from '../../src/handlers/command-handler/user-edit-states';
import { handleWEditNameInput } from '../../src/handlers/commands/info-commands.handler';
import { emitText } from '../../src/utils/output.util';

function makeSocket() {
  return { emit: jest.fn() };
}

function makeSession(subState: LoggedOnSubState, inputBuffer = '') {
  return { subState, inputBuffer, user: { username: 'tester' } } as any;
}

describe('User Edit States', () => {
  describe('isUserEditState', () => {
    it('returns true for W_EDIT_NAME', () => {
      expect(isUserEditState(LoggedOnSubState.W_EDIT_NAME)).toBe(true);
    });

    it('returns true for W_EDIT_PASSWORD', () => {
      expect(isUserEditState(LoggedOnSubState.W_EDIT_PASSWORD)).toBe(true);
    });

    it('returns true for W_OPTION_SELECT', () => {
      expect(isUserEditState(LoggedOnSubState.W_OPTION_SELECT)).toBe(true);
    });

    it('returns false for READ_COMMAND', () => {
      expect(isUserEditState(LoggedOnSubState.READ_COMMAND)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isUserEditState(undefined)).toBe(false);
    });
  });

  describe('getUserEditStates', () => {
    it('returns a non-empty array', () => {
      const states = getUserEditStates();
      expect(Array.isArray(states)).toBe(true);
      expect(states.length).toBeGreaterThan(0);
    });

    it('includes W_EDIT_NAME, W_EDIT_PASSWORD, W_OPTION_SELECT', () => {
      const states = getUserEditStates();
      expect(states).toContain(LoggedOnSubState.W_EDIT_NAME);
      expect(states).toContain(LoggedOnSubState.W_EDIT_PASSWORD);
      expect(states).toContain(LoggedOnSubState.W_OPTION_SELECT);
    });
  });

  describe('handleUserEditInput — buffering', () => {
    it('printable character is appended to inputBuffer', async () => {
      const socket = makeSocket();
      const session = makeSession(LoggedOnSubState.W_EDIT_NAME, '');

      const handled = await handleUserEditInput(socket, session, 'A');

      expect(handled).toBe(true);
      expect(session.inputBuffer).toBe('A');
    });

    it('multiple characters accumulate in buffer', async () => {
      const socket = makeSocket();
      const session = makeSession(LoggedOnSubState.W_EDIT_NAME, '');

      await handleUserEditInput(socket, session, 'H');
      await handleUserEditInput(socket, session, 'i');

      expect(session.inputBuffer).toBe('Hi');
    });

    it('echo states echo printable chars (W_EDIT_NAME)', async () => {
      const socket = makeSocket();
      const session = makeSession(LoggedOnSubState.W_EDIT_NAME);

      await handleUserEditInput(socket, session, 'X');

      expect(emitText).toHaveBeenCalledWith(socket, 'X');
    });

    it('password state does NOT echo (W_EDIT_PASSWORD)', async () => {
      (emitText as jest.Mock).mockClear();
      const socket = makeSocket();
      const session = makeSession(LoggedOnSubState.W_EDIT_PASSWORD);

      await handleUserEditInput(socket, session, 'P');

      expect(emitText).not.toHaveBeenCalledWith(socket, 'P');
    });

    it('backspace removes last character', async () => {
      const socket = makeSocket();
      const session = makeSession(LoggedOnSubState.W_EDIT_NAME, 'AB');

      await handleUserEditInput(socket, session, '\x7f');

      expect(session.inputBuffer).toBe('A');
    });

    it('backspace on empty buffer does nothing', async () => {
      const socket = makeSocket();
      const session = makeSession(LoggedOnSubState.W_EDIT_NAME, '');

      const handled = await handleUserEditInput(socket, session, '\b');

      expect(handled).toBe(true);
      expect(session.inputBuffer).toBe('');
    });

    it('Enter commits buffer and calls handler', async () => {
      (handleWEditNameInput as jest.Mock).mockClear();
      const socket = makeSocket();
      const session = makeSession(LoggedOnSubState.W_EDIT_NAME, 'NewName');

      const handled = await handleUserEditInput(socket, session, '\r');

      expect(handled).toBe(true);
      expect(handleWEditNameInput).toHaveBeenCalledWith(socket, session, 'NewName');
      expect(session.inputBuffer).toBe(''); // cleared after commit
    });

    it('newline also commits buffer', async () => {
      (handleWEditNameInput as jest.Mock).mockClear();
      const socket = makeSocket();
      const session = makeSession(LoggedOnSubState.W_EDIT_NAME, 'Value');

      await handleUserEditInput(socket, session, '\n');

      expect(handleWEditNameInput).toHaveBeenCalledWith(socket, session, 'Value');
    });

    it('returns false for unregistered state', async () => {
      const socket = makeSocket();
      const session = makeSession(LoggedOnSubState.READ_COMMAND);

      const handled = await handleUserEditInput(socket, session, 'x');

      expect(handled).toBe(false);
    });
  });
});
