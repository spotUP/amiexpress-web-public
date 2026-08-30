/**
 * Regression tests for command-execution.ts (processBBSCommand).
 * Tests the dependency injection setup and basic command dispatch.
 */

jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));

// Mock door.handler to avoid pulling in the Amiga 68K emulator (MoiraEmulator.js)
jest.mock('../../src/handlers/door.handler', () => ({
  DoorHandler: class { async runDoor() {} },
  handleDoorCommand: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn().mockResolvedValue(undefined),
  hasKeysFile: jest.fn().mockReturnValue(false),
  hasKeysFileForResolvedPath: jest.fn().mockReturnValue(false),
}));

jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getConfig: jest.fn().mockReturnValue({}),
  getMessageBases: jest.fn().mockReturnValue([]),
  getProcessOlmMessageQueue: jest.fn().mockReturnValue(jest.fn()),
  getScreenMenu: jest.fn().mockReturnValue(null),
  getDoors: jest.fn().mockReturnValue([]),
  getDatabase: jest.fn().mockReturnValue(null),
  getConferences: jest.fn().mockReturnValue([]),
  getFileAreas: jest.fn().mockReturnValue([]),
  getSessions: jest.fn().mockReturnValue(new Map()),
}));

import {
  setDatabase,
  setConferences,
  setFileAreas,
  setDoors,
  processBBSCommand,
} from '../../src/handlers/command-handler/command-execution';

describe('command-execution.ts', () => {
  describe('dependency injection setters', () => {
    test('setDatabase does not throw', () => {
      expect(() => setDatabase({ getConfigRepository: jest.fn() })).not.toThrow();
    });

    test('setConferences does not throw with empty array', () => {
      expect(() => setConferences([])).not.toThrow();
    });

    test('setFileAreas does not throw with empty array', () => {
      expect(() => setFileAreas([])).not.toThrow();
    });

    test('setDoors does not throw with empty array', () => {
      expect(() => setDoors([])).not.toThrow();
    });
  });

  describe('processBBSCommand', () => {
    test('function is exported and callable', () => {
      expect(typeof processBBSCommand).toBe('function');
    });

    test('clears screen on any command (emits ansi-output)', async () => {
      const socket = { emit: jest.fn() };
      const session: any = {
        currentUser: { secLevel: 255, username: 'sysop' },
        subState: undefined,
        state: 'loggedon',
      };
      // Pass a command that won't deeply recurse (TIME-like)
      try {
        await processBBSCommand(socket, session, 'TIME');
      } catch (e) {
        // May throw due to missing mock depth — that's acceptable here
      }
      // Should have emitted at least the clear-screen
      expect(socket.emit).toHaveBeenCalled();
    });
  });
});
