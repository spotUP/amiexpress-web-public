/**
 * Debug Logger Utility Unit Tests
 *
 * Tests structured debug logging with ANSI colors
 */

// Mock dependencies BEFORE imports
jest.mock('../../src/services/SessionLogManager', () => ({
  sessionLogManager: {
    captureOutput: jest.fn(),
  },
}));
jest.mock('../../src/utils/date-time.util', () => ({
  getSystemTime: jest.fn(),
}));

import { DebugLogger, DebugCategory, DebugLevel } from '../../src/utils/debug-logger.util';
import { sessionLogManager } from '../../src/services/SessionLogManager';
import { getSystemTime } from '../../src/utils/date-time.util';

describe('Debug Logger Utility', () => {
  const mockSessionLogManager = sessionLogManager as jest.Mocked<typeof sessionLogManager>;
  const mockGetSystemTime = getSystemTime as jest.MockedFunction<typeof getSystemTime>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset logger to enabled state
    DebugLogger.setEnabled(true);
    // Mock current time
    mockGetSystemTime.mockReturnValue(new Date('2025-01-07T12:34:56.789Z'));
  });

  describe('Enums', () => {
    it('should define all debug categories', () => {
      expect(DebugCategory.DOOR).toBe('DOOR');
      expect(DebugCategory.SCREEN).toBe('SCREEN');
      expect(DebugCategory.MCI).toBe('MCI');
      expect(DebugCategory.COMMAND).toBe('COMMAND');
      expect(DebugCategory.AUTH).toBe('AUTH');
      expect(DebugCategory.FILE).toBe('FILE');
      expect(DebugCategory.CONFERENCE).toBe('CONF');
      expect(DebugCategory.MESSAGE).toBe('MSG');
      expect(DebugCategory.MENU).toBe('MENU');
      expect(DebugCategory.DATABASE).toBe('DB');
      expect(DebugCategory.TRANSFER).toBe('XFER');
      expect(DebugCategory.CHAT).toBe('CHAT');
      expect(DebugCategory.SYSTEM).toBe('SYS');
      expect(DebugCategory.ERROR).toBe('ERROR');
    });

    it('should define all debug levels', () => {
      expect(DebugLevel.INFO).toBe('INFO');
      expect(DebugLevel.DEBUG).toBe('DEBUG');
      expect(DebugLevel.SUCCESS).toBe('OK');
      expect(DebugLevel.WARNING).toBe('WARN');
      expect(DebugLevel.ERROR).toBe('ERROR');
      expect(DebugLevel.TRACE).toBe('TRACE');
    });
  });

  describe('log', () => {
    it('should log a basic message with timestamp', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test message',
      });

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[DOOR]')
      );
      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[INFO]')
      );
      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('Test message')
      );
    });

    it('should include ANSI color codes', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
      });

      const capturedMessage = mockSessionLogManager.captureOutput.mock.calls[0][1];
      expect(capturedMessage).toContain('\x1b['); // ANSI escape code
    });

    it('should include data object when provided', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
        data: { key: 'value' },
      });

      const capturedMessage = mockSessionLogManager.captureOutput.mock.calls[0][1];
      expect(capturedMessage).toContain('"key"');
      expect(capturedMessage).toContain('"value"');
    });

    it('should include string data when provided', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
        data: 'additional info',
      });

      const capturedMessage = mockSessionLogManager.captureOutput.mock.calls[0][1];
      expect(capturedMessage).toContain('additional info');
    });

    it('should format timestamp when includeTimestamp is true', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
        includeTimestamp: true,
      });

      const capturedMessage = mockSessionLogManager.captureOutput.mock.calls[0][1];
      expect(capturedMessage).toMatch(/\[.*:.*:.*\]/); // Time format
    });

    it('should omit timestamp when includeTimestamp is false', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
        includeTimestamp: false,
      });

      const capturedMessage = mockSessionLogManager.captureOutput.mock.calls[0][1];
      // Should not have the gray color timestamp
      expect(capturedMessage).not.toMatch(/\x1b\[0;90m\[.*:.*:.*\]/);
    });

    it('should not log when disabled', () => {
      DebugLogger.setEnabled(false);

      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
      });

      expect(mockSessionLogManager.captureOutput).not.toHaveBeenCalled();
    });

    it('should log with all categories', () => {
      const categories = Object.values(DebugCategory);
      categories.forEach((category) => {
        mockSessionLogManager.captureOutput.mockClear();
        DebugLogger.log({
          sessionId: 'session-1',
          category: category as DebugCategory,
          level: DebugLevel.INFO,
          message: `Test ${category}`,
        });

        expect(mockSessionLogManager.captureOutput).toHaveBeenCalled();
      });
    });

    it('should log with all levels', () => {
      const levels = Object.values(DebugLevel);
      levels.forEach((level) => {
        mockSessionLogManager.captureOutput.mockClear();
        DebugLogger.log({
          sessionId: 'session-1',
          category: DebugCategory.DOOR,
          level: level as DebugLevel,
          message: `Test ${level}`,
        });

        expect(mockSessionLogManager.captureOutput).toHaveBeenCalled();
      });
    });
  });

  describe('Convenience methods', () => {
    describe('door methods', () => {
      it('should log door info', () => {
        DebugLogger.door('session-1', 'Door starting', { name: 'test-door' });

        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[DOOR]')
        );
        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[INFO]')
        );
      });

      it('should log door success', () => {
        DebugLogger.doorSuccess('session-1', 'Door completed');

        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[DOOR]')
        );
        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[OK]')
        );
      });

      it('should log door error', () => {
        DebugLogger.doorError('session-1', 'Door failed', { error: 'test' });

        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[DOOR]')
        );
        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[ERROR]')
        );
      });
    });

    describe('mci methods', () => {
      it('should log mci debug', () => {
        DebugLogger.mci('session-1', 'MCI processing');

        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[MCI]')
        );
        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[DEBUG]')
        );
      });

      it('should log mci success', () => {
        DebugLogger.mciSuccess('session-1', 'MCI completed');

        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[MCI]')
        );
        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[OK]')
        );
      });

      it('should log mci error', () => {
        DebugLogger.mciError('session-1', 'MCI failed');

        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[MCI]')
        );
        expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
          'session-1',
          expect.stringContaining('[ERROR]')
        );
      });
    });

    it('should log screen', () => {
      DebugLogger.screen('session-1', 'Screen displayed');

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[SCREEN]')
      );
    });

    it('should log command', () => {
      DebugLogger.command('session-1', 'Command executed');

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[COMMAND]')
      );
    });

    it('should log auth', () => {
      DebugLogger.auth('session-1', 'User authenticated');

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[AUTH]')
      );
    });

    it('should log file', () => {
      DebugLogger.file('session-1', 'File accessed');

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[FILE]')
      );
    });

    it('should log conference', () => {
      DebugLogger.conference('session-1', 'Conference switched');

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[CONF]')
      );
    });

    it('should log message', () => {
      DebugLogger.message('session-1', 'Message posted');

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[MSG]')
      );
    });

    it('should log menu', () => {
      DebugLogger.menu('session-1', 'Menu displayed');

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[MENU]')
      );
    });

    it('should log error', () => {
      DebugLogger.error('session-1', 'Error occurred');

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[ERROR]')
      );
      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[ERROR]')
      ); // Both category and level are ERROR
    });

    it('should log warning', () => {
      DebugLogger.warning('session-1', 'Warning issued');

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[SYS]')
      );
      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[WARN]')
      );
    });

    it('should log system', () => {
      DebugLogger.system('session-1', 'System event');

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('[SYS]')
      );
    });
  });

  describe('setEnabled / isEnabled', () => {
    it('should enable logging', () => {
      DebugLogger.setEnabled(true);

      expect(DebugLogger.isEnabled()).toBe(true);

      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
      });

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalled();
    });

    it('should disable logging', () => {
      DebugLogger.setEnabled(false);

      expect(DebugLogger.isEnabled()).toBe(false);

      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
      });

      expect(mockSessionLogManager.captureOutput).not.toHaveBeenCalled();
    });

    it('should disable all convenience methods', () => {
      DebugLogger.setEnabled(false);

      DebugLogger.door('session-1', 'Test');
      DebugLogger.screen('session-1', 'Test');
      DebugLogger.command('session-1', 'Test');
      DebugLogger.error('session-1', 'Test');

      expect(mockSessionLogManager.captureOutput).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty message', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: '',
      });

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalled();
    });

    it('should handle undefined data', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
        data: undefined,
      });

      const capturedMessage = mockSessionLogManager.captureOutput.mock.calls[0][1];
      expect(capturedMessage).not.toContain('undefined');
    });

    it('should handle null data', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
        data: null,
      });

      const capturedMessage = mockSessionLogManager.captureOutput.mock.calls[0][1];
      expect(capturedMessage).toContain('null');
    });

    it('should handle complex nested objects', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test',
        data: {
          nested: {
            deep: {
              value: 123,
            },
          },
        },
      });

      const capturedMessage = mockSessionLogManager.captureOutput.mock.calls[0][1];
      expect(capturedMessage).toContain('"nested"');
      expect(capturedMessage).toContain('"deep"');
      expect(capturedMessage).toContain('123');
    });

    it('should handle circular references in data', () => {
      const circular: any = { a: 1 };
      circular.self = circular;

      expect(() => {
        DebugLogger.log({
          sessionId: 'session-1',
          category: DebugCategory.DOOR,
          level: DebugLevel.INFO,
          message: 'Test',
          data: circular,
        });
      }).toThrow(); // JSON.stringify will throw on circular
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(10000);

      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: longMessage,
      });

      expect(mockSessionLogManager.captureOutput).toHaveBeenCalled();
    });

    it('should handle special characters in message', () => {
      DebugLogger.log({
        sessionId: 'session-1',
        category: DebugCategory.DOOR,
        level: DebugLevel.INFO,
        message: 'Test\nwith\nnewlines\tand\ttabs',
      });

      const capturedMessage = mockSessionLogManager.captureOutput.mock.calls[0][1];
      expect(capturedMessage).toContain('Test\nwith\nnewlines\tand\ttabs');
    });
  });
});
