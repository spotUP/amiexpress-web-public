/**
 * State Router Tests
 * Tests the central router that delegates LoggedOnSubState input to specialized modules.
 */

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState };
});

// Mock sub-state modules to avoid pulling in their full dependency trees
jest.mock('../../src/handlers/command-handler/user-edit-states', () => ({
  isUserEditState: jest.fn().mockReturnValue(false),
  handleUserEditInput: jest.fn().mockResolvedValue(true),
  getUserEditStates: jest.fn().mockReturnValue([]),
}));
jest.mock('../../src/handlers/command-handler/file-maintenance-states', () => ({
  isFileMaintState: jest.fn().mockReturnValue(false),
  handleFileMaintInput: jest.fn().mockResolvedValue(true),
  getFileMaintStates: jest.fn().mockReturnValue([]),
}));
jest.mock('../../src/handlers/command-handler/conference-maint-states', () => ({
  isConfMaintState: jest.fn().mockReturnValue(false),
  handleConfMaintInput: jest.fn().mockResolvedValue(true),
  getConfMaintStates: jest.fn().mockReturnValue([]),
}));
jest.mock('../../src/handlers/command-handler/voting-states', () => ({
  isVotingState: jest.fn().mockReturnValue(false),
  handleVotingInput: jest.fn().mockResolvedValue(true),
  getVotingStates: jest.fn().mockReturnValue([]),
}));

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import {
  routeStateInput,
  isRoutedState,
  getRoutedStates,
  isUserEditState,
  handleUserEditInput,
  isFileMaintState,
  handleFileMaintInput,
  isConfMaintState,
  handleConfMaintInput,
  isVotingState,
  handleVotingInput,
} from '../../src/handlers/command-handler/state-router';

function makeSocket() {
  return { emit: jest.fn() };
}

function makeSession(subState?: LoggedOnSubState) {
  return { subState, user: { username: 'tester' }, inputBuffer: '' } as any;
}

describe('State Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isUserEditState as jest.Mock).mockReturnValue(false);
    (isFileMaintState as jest.Mock).mockReturnValue(false);
    (isConfMaintState as jest.Mock).mockReturnValue(false);
    (isVotingState as jest.Mock).mockReturnValue(false);
  });

  describe('routeStateInput', () => {
    it('returns not-handled when no module claims the state', async () => {
      const result = await routeStateInput(makeSocket(), makeSession(), 'input');
      expect(result.handled).toBe(false);
      expect(result.continueProcessing).toBe(true);
    });

    it('delegates to user-edit handler when isUserEditState returns true', async () => {
      (isUserEditState as jest.Mock).mockReturnValue(true);
      const socket = makeSocket();
      const session = makeSession(LoggedOnSubState.W_EDIT_NAME);

      const result = await routeStateInput(socket, session, 'input');

      expect(handleUserEditInput).toHaveBeenCalledWith(socket, session, 'input');
      expect(result.handled).toBe(true);
      expect(result.continueProcessing).toBe(false);
    });

    it('delegates to file-maint handler when isFileMaintState returns true', async () => {
      (isFileMaintState as jest.Mock).mockReturnValue(true);
      const socket = makeSocket();
      const session = makeSession();

      const result = await routeStateInput(socket, session, 'cmd');

      expect(handleFileMaintInput).toHaveBeenCalledWith(socket, session, 'cmd');
      expect(result.handled).toBe(true);
      expect(result.continueProcessing).toBe(false);
    });

    it('delegates to conf-maint handler when isConfMaintState returns true', async () => {
      (isConfMaintState as jest.Mock).mockReturnValue(true);
      const socket = makeSocket();
      const session = makeSession();

      const result = await routeStateInput(socket, session, 'cmd');

      expect(handleConfMaintInput).toHaveBeenCalledWith(socket, session, 'cmd');
      expect(result.handled).toBe(true);
    });

    it('delegates to voting handler when isVotingState returns true', async () => {
      (isVotingState as jest.Mock).mockReturnValue(true);
      const socket = makeSocket();
      const session = makeSession();

      const result = await routeStateInput(socket, session, 'v');

      expect(handleVotingInput).toHaveBeenCalledWith(socket, session, 'v');
      expect(result.handled).toBe(true);
    });

    it('user-edit takes priority over other modules', async () => {
      (isUserEditState as jest.Mock).mockReturnValue(true);
      (isFileMaintState as jest.Mock).mockReturnValue(true); // both claim the state
      const socket = makeSocket();
      const session = makeSession();

      await routeStateInput(socket, session, 'x');

      // user-edit should win; file-maint should not be called
      expect(handleUserEditInput).toHaveBeenCalled();
      expect(handleFileMaintInput).not.toHaveBeenCalled();
    });
  });

  describe('isRoutedState', () => {
    it('returns false for undefined', () => {
      expect(isRoutedState(undefined)).toBe(false);
    });

    it('returns true when any module claims the state', () => {
      (isUserEditState as jest.Mock).mockReturnValue(true);
      expect(isRoutedState(LoggedOnSubState.W_EDIT_NAME)).toBe(true);
    });

    it('returns false when no module claims the state', () => {
      expect(isRoutedState(LoggedOnSubState.READ_COMMAND)).toBe(false);
    });
  });

  describe('getRoutedStates', () => {
    it('returns an array', () => {
      const states = getRoutedStates();
      expect(Array.isArray(states)).toBe(true);
    });
  });
});
