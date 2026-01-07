/**
 * Unit tests for flag-pause.util.ts
 * Tests pagination pause handling (express.e:28025+, 5181+)
 */

import { flagPause, checkForPause, initPauseState, resetLineCount, setNonStopMode } from '../../src/utils/flag-pause.util';
import { FileFlagManager } from '../../src/utils/file-flag.util';

// Mock dependencies
jest.mock('../../src/utils/file-flag.util');

describe('flag-pause.util', () => {
  let mockSocket: any;
  let mockSession: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock socket
    mockSocket = {
      emit: jest.fn()
    };

    // Mock session
    mockSession = {
      user: {
        linesPerScreen: 23,
        lineLength: 80,
        pageLength: 23
      },
      screenHeight: 24,
      nodeId: 1,
      currentConf: 1,
      tempData: {
        lineCount: 0,
        nonStopDisplayFlag: false
      }
    };

    // Mock FileFlagManager
    (FileFlagManager as jest.Mock).mockImplementation(() => ({
      addFlag: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined)
    }));
  });

  describe('initPauseState', () => {
    it('should initialize pause state with default values', () => {
      const session: any = {};
      initPauseState(session);

      expect(session.tempData).toBeDefined();
      expect(session.tempData.lineCount).toBe(0);
      expect(session.tempData.nonStopDisplayFlag).toBe(false);
    });

    it('should initialize tempData if it does not exist', () => {
      const session: any = {};
      initPauseState(session);

      expect(session.tempData).toBeDefined();
    });

    it('should reset existing tempData', () => {
      const session: any = {
        tempData: {
          lineCount: 50,
          nonStopDisplayFlag: true
        }
      };
      initPauseState(session);

      expect(session.tempData.lineCount).toBe(0);
      expect(session.tempData.nonStopDisplayFlag).toBe(false);
    });
  });

  describe('resetLineCount', () => {
    it('should reset line count to 0', () => {
      const session: any = {
        tempData: {
          lineCount: 25,
          nonStopDisplayFlag: true
        }
      };
      resetLineCount(session);

      expect(session.tempData.lineCount).toBe(0);
      expect(session.tempData.nonStopDisplayFlag).toBe(true);
    });

    it('should create tempData if it does not exist', () => {
      const session: any = {};
      resetLineCount(session);

      expect(session.tempData).toBeDefined();
      expect(session.tempData.lineCount).toBe(0);
    });

    it('should preserve other tempData properties', () => {
      const session: any = {
        tempData: {
          lineCount: 10,
          customProp: 'value'
        }
      };
      resetLineCount(session);

      expect(session.tempData.lineCount).toBe(0);
      expect(session.tempData.customProp).toBe('value');
    });
  });

  describe('setNonStopMode', () => {
    it('should enable non-stop mode', () => {
      const session: any = {
        tempData: {
          nonStopDisplayFlag: false
        }
      };
      setNonStopMode(session, true);

      expect(session.tempData.nonStopDisplayFlag).toBe(true);
    });

    it('should disable non-stop mode', () => {
      const session: any = {
        tempData: {
          nonStopDisplayFlag: true
        }
      };
      setNonStopMode(session, false);

      expect(session.tempData.nonStopDisplayFlag).toBe(false);
    });

    it('should create tempData if it does not exist', () => {
      const session: any = {};
      setNonStopMode(session, true);

      expect(session.tempData).toBeDefined();
      expect(session.tempData.nonStopDisplayFlag).toBe(true);
    });
  });

  describe('flagPause - line counting', () => {
    it('should increment line count when not in non-stop mode', async () => {
      mockSession.tempData.lineCount = 5;

      const result = await flagPause(mockSocket, mockSession, 3);

      expect(mockSession.tempData.lineCount).toBe(8);
      expect(result).toBe(true);
    });

    it('should not increment line count in non-stop mode', async () => {
      mockSession.tempData.lineCount = 5;
      mockSession.tempData.nonStopDisplayFlag = true;

      await flagPause(mockSocket, mockSession, 3);

      expect(mockSession.tempData.lineCount).toBe(5);
    });

    it('should use default count of 1 if not specified', async () => {
      mockSession.tempData.lineCount = 10;

      await flagPause(mockSocket, mockSession);

      expect(mockSession.tempData.lineCount).toBe(11);
    });

    it('should not pause if line count below threshold', async () => {
      mockSession.tempData.lineCount = 10;
      mockSession.user.linesPerScreen = 23;

      const result = await flagPause(mockSocket, mockSession, 1);

      expect(result).toBe(true);
      expect(mockSocket.emit).not.toHaveBeenCalledWith('ansi-output', expect.stringContaining('Pause'));
    });

    it('should create tempData if it does not exist', async () => {
      const session: any = { user: { linesPerScreen: 23 } };

      await flagPause(mockSocket, session, 1);

      expect(session.tempData).toBeDefined();
      expect(session.tempData.lineCount).toBe(1);
    });
  });

  describe('flagPause - screen height calculation', () => {
    it('should use termHeight if available', () => {
      mockSession.tempData.termHeight = 30;
      mockSession.tempData.lineCount = 29;

      // Don't await - just trigger pause
      flagPause(mockSocket, mockSession, 1);

      expect(mockSocket.emit).toHaveBeenCalledWith('ansi-output', expect.stringContaining('Pause'));
    });

    it('should use screenHeight if termHeight not available', () => {
      mockSession.tempData.termHeight = undefined;
      mockSession.screenHeight = 25;
      mockSession.tempData.lineCount = 24;

      flagPause(mockSocket, mockSession, 1);

      expect(mockSocket.emit).toHaveBeenCalledWith('ansi-output', expect.stringContaining('Pause'));
    });

    it('should use user.linesPerScreen as fallback', () => {
      mockSession.tempData.termHeight = undefined;
      mockSession.screenHeight = undefined;
      mockSession.user.linesPerScreen = 20;
      mockSession.tempData.lineCount = 19;

      flagPause(mockSocket, mockSession, 1);

      expect(mockSocket.emit).toHaveBeenCalledWith('ansi-output', expect.stringContaining('Pause'));
    });

    it('should clamp screen height to min 10', () => {
      const session: any = {
        user: { linesPerScreen: 5 },
        tempData: { lineCount: 9, nonStopDisplayFlag: false }
      };

      // Don't await - just verify pause is triggered
      flagPause(mockSocket, session, 1);

      // Should pause at line 10 (clamped min), so lineCount 9 + 1 = 10 triggers pause
      expect(mockSocket.emit).toHaveBeenCalledWith('ansi-output', expect.stringContaining('Pause'));
    });

    it('should clamp screen height to max 40', () => {
      mockSession.user.linesPerScreen = 100;
      mockSession.tempData.lineCount = 39;

      flagPause(mockSocket, mockSession, 1);

      expect(mockSocket.emit).toHaveBeenCalledWith('ansi-output', expect.stringContaining('Pause'));
    });

    it('should use default 23 if no height specified', () => {
      const session: any = {
        user: {},
        tempData: { lineCount: 22, nonStopDisplayFlag: false }
      };

      // Don't await - just verify pause is triggered
      flagPause(mockSocket, session, 1);

      // Should pause at 23 (default), so lineCount 22 + 1 = 23 triggers pause
      expect(mockSocket.emit).toHaveBeenCalledWith('ansi-output', expect.stringContaining('Pause'));
    });
  });

  describe('flagPause - pause prevention', () => {
    it('should return existing promise if pause already active', async () => {
      mockSession.tempData.lineCount = 50;
      const existingPromise = Promise.resolve(true);
      mockSession.tempData.flagPausePromise = existingPromise;

      const result = await flagPause(mockSocket, mockSession, 1);

      expect(result).toBe(true);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should skip pause in non-stop mode even if line count high', async () => {
      mockSession.tempData.lineCount = 50;
      mockSession.tempData.nonStopDisplayFlag = true;

      const result = await flagPause(mockSocket, mockSession, 1);

      expect(result).toBe(true);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('flagPause - prompt display', () => {
    it('should display pause prompt with ANSI colors', () => {
      mockSession.tempData.lineCount = 50;

      // Don't await - just trigger the prompt
      const promise = flagPause(mockSocket, mockSession, 1);

      const emittedText = mockSocket.emit.mock.calls[0][1];
      expect(emittedText).toContain('Pause');
      expect(emittedText).toContain('lags');
      expect(emittedText).toContain('Y');
      expect(emittedText).toContain('n');
      expect(emittedText).toContain('ns');
    });

    it('should reset line count to 0 when pausing', () => {
      mockSession.tempData.lineCount = 50;

      const promise = flagPause(mockSocket, mockSession, 1);

      expect(mockSession.tempData.lineCount).toBe(0);
    });

    it('should store pause promise on session', () => {
      mockSession.tempData.lineCount = 50;

      const promise = flagPause(mockSocket, mockSession, 1);

      expect(mockSession.tempData.flagPausePromise).toBeDefined();
      expect(mockSession.tempData.flagPausePromise).toStrictEqual(promise);
    });

    it('should register flagPauseHandler on session', () => {
      mockSession.tempData.lineCount = 50;

      const promise = flagPause(mockSocket, mockSession, 1);

      expect(mockSession.flagPauseHandler).toBeDefined();
      expect(typeof mockSession.flagPauseHandler).toBe('function');
    });
  });

  describe('checkForPause - line counting', () => {
    it('should increment line count by 1', async () => {
      mockSession.tempData.lineCount = 5;

      const result = await checkForPause(mockSocket, mockSession);

      expect(mockSession.tempData.lineCount).toBe(6);
      expect(result).toBe(true);
    });

    it('should not increment in non-stop mode', async () => {
      mockSession.tempData.lineCount = 5;
      mockSession.tempData.nonStopDisplayFlag = true;

      await checkForPause(mockSocket, mockSession);

      expect(mockSession.tempData.lineCount).toBe(5);
    });

    it('should create tempData if not exists', async () => {
      const session: any = { user: { linesPerScreen: 23 } };

      await checkForPause(mockSocket, session);

      expect(session.tempData).toBeDefined();
    });
  });

  describe('checkForPause - prompt display', () => {
    it('should display simpler pause prompt', () => {
      mockSession.tempData.lineCount = 50;

      const promise = checkForPause(mockSocket, mockSession);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'ansi-output',
        '(Pause)...More(y/n/ns)? '
      );
    });

    it('should not include flag option in prompt', () => {
      mockSession.tempData.lineCount = 50;

      const promise = checkForPause(mockSocket, mockSession);

      const emitCalls = mockSocket.emit.mock.calls;
      const prompts = emitCalls.filter((call: any[]) => call[0] === 'ansi-output');

      prompts.forEach((call: any[]) => {
        expect(call[1]).not.toContain('flag');
      });
    });

    it('should reset line count when pausing', () => {
      mockSession.tempData.lineCount = 50;

      const promise = checkForPause(mockSocket, mockSession);

      expect(mockSession.tempData.lineCount).toBe(0);
    });

    it('should store pause promise on session', () => {
      mockSession.tempData.lineCount = 50;

      const promise = checkForPause(mockSocket, mockSession);

      expect(mockSession.tempData.checkPausePromise).toBeDefined();
      expect(mockSession.tempData.checkPausePromise).toStrictEqual(promise);
    });

    it('should return existing promise if pause active', async () => {
      mockSession.tempData.lineCount = 50;
      const existingPromise = Promise.resolve(false);
      mockSession.tempData.checkPausePromise = existingPromise;

      const result = await checkForPause(mockSocket, mockSession);

      expect(result).toBe(false);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('checkForPause - screen height', () => {
    it('should use same height calculation as flagPause', () => {
      mockSession.tempData.termHeight = 30;
      mockSession.tempData.lineCount = 29;

      checkForPause(mockSocket, mockSession);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'ansi-output',
        expect.stringContaining('Pause')
      );
    });

    it('should clamp height between 10 and 40', () => {
      const session: any = {
        user: { linesPerScreen: 5 },
        tempData: { lineCount: 9, nonStopDisplayFlag: false }
      };

      // Don't await - just verify pause is triggered
      checkForPause(mockSocket, session);

      expect(mockSocket.emit).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle session without user object', async () => {
      const session: any = {
        tempData: {
          lineCount: 5  // Low enough not to trigger pause
        }
      };

      const result = await flagPause(mockSocket, session, 1);

      expect(result).toBe(true);
    });

    it('should handle undefined lineCount', async () => {
      mockSession.tempData.lineCount = undefined;

      await flagPause(mockSocket, mockSession, 1);

      expect(mockSession.tempData.lineCount).toBe(1);
    });

    it('should handle zero line count', async () => {
      mockSession.tempData.lineCount = 0;

      await flagPause(mockSocket, mockSession, 5);

      expect(mockSession.tempData.lineCount).toBe(5);
    });

    it('should handle negative count values', async () => {
      mockSession.tempData.lineCount = 10;

      await flagPause(mockSocket, mockSession, -5);

      expect(mockSession.tempData.lineCount).toBe(5);
    });

    it('should handle very large count values', async () => {
      mockSession.tempData.lineCount = 0;

      const promise = flagPause(mockSocket, mockSession, 1000);

      expect(mockSession.tempData.lineCount).toBe(0); // Reset when pause triggered
      expect(mockSocket.emit).toHaveBeenCalled();
    });

    it('should handle missing nodeId', async () => {
      mockSession.nodeId = undefined;
      mockSession.tempData.lineCount = 50;

      const promise = flagPause(mockSocket, mockSession, 1);

      expect(mockSession.flagPauseHandler).toBeDefined();
    });

    it('should handle missing currentConf', async () => {
      mockSession.currentConf = undefined;
      mockSession.tempData.lineCount = 50;

      const promise = flagPause(mockSocket, mockSession, 1);

      expect(mockSession.flagPauseHandler).toBeDefined();
    });
  });

  describe('Multiple sessions', () => {
    it('should maintain separate state for different sessions', async () => {
      const session1: any = { tempData: { lineCount: 10 }, user: { linesPerScreen: 23 } };
      const session2: any = { tempData: { lineCount: 20 }, user: { linesPerScreen: 23 } };

      await flagPause(mockSocket, session1, 1);
      await flagPause(mockSocket, session2, 1);

      expect(session1.tempData.lineCount).toBe(11);
      expect(session2.tempData.lineCount).toBe(21);
    });

    it('should handle concurrent pause states', async () => {
      const session1: any = { tempData: { lineCount: 50 }, user: { linesPerScreen: 23 } };
      const session2: any = { tempData: { lineCount: 50 }, user: { linesPerScreen: 23 } };

      const promise1 = flagPause(mockSocket, session1, 1);
      const promise2 = flagPause(mockSocket, session2, 1);

      expect(session1.tempData.flagPausePromise).toBeDefined();
      expect(session2.tempData.flagPausePromise).toBeDefined();
      expect(session1.tempData.flagPausePromise).not.toBe(session2.tempData.flagPausePromise);
    });
  });

  describe('State transitions', () => {
    it('should transition from normal to non-stop via NS command (simulated)', async () => {
      mockSession.tempData.nonStopDisplayFlag = false;
      mockSession.tempData.lineCount = 50;

      // Trigger pause
      const promise = flagPause(mockSocket, mockSession, 1);

      // Simulate NS response
      setNonStopMode(mockSession, true);

      expect(mockSession.tempData.nonStopDisplayFlag).toBe(true);
    });

    it('should maintain non-stop mode across multiple calls', async () => {
      setNonStopMode(mockSession, true);

      await flagPause(mockSocket, mockSession, 10);
      await flagPause(mockSocket, mockSession, 10);
      await flagPause(mockSocket, mockSession, 10);

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should reset line count on init even if non-stop active', () => {
      mockSession.tempData.lineCount = 100;
      mockSession.tempData.nonStopDisplayFlag = true;

      initPauseState(mockSession);

      expect(mockSession.tempData.lineCount).toBe(0);
      expect(mockSession.tempData.nonStopDisplayFlag).toBe(false);
    });
  });
});
