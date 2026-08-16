/**
 * Door Logging Utility Unit Tests
 *
 * Tests 68K door message logging functionality
 */

// jest.mock('fs') below auto-mocks the WHOLE 'fs' module for this test
// file's module registry, including the copy 'bindings'/'better-sqlite3'
// use internally to locate their native binary. tests/setup.ts's global
// beforeAll unconditionally opens a REAL sqlite database unless
// SKIP_DB_INIT=1 is set — with 'fs' mocked out from under it, that open
// fails with "Could not locate the bindings file" (unrelated to this
// file's own tests, none of which touch the database). Skip real DB init
// here; this suite is pure fs-mocked unit tests with no DB dependency.
//
// Saved/restored (not just set) because Jest workers run multiple test
// FILES in the same process — process.env is NOT reset between files, so
// an unconditional `process.env.SKIP_DB_INIT = '1'` would leak into
// whichever test file happens to run next in this worker and silently
// skip ITS real-DB init too.
const __savedSkipDbInit = process.env.SKIP_DB_INIT;
process.env.SKIP_DB_INIT = '1';
afterAll(() => {
  if (__savedSkipDbInit === undefined) delete process.env.SKIP_DB_INIT;
  else process.env.SKIP_DB_INIT = __savedSkipDbInit;
});

// Mock dependencies BEFORE imports
jest.mock('fs');
jest.mock('../../src/utils/date-time.util', () => ({
  getSystemTime: jest.fn(),
}));

import * as fs from 'fs';
import * as doorLogging from '../../src/utils/door-logging.util';
import { XIMCommand, XIMMessage } from '../../src/amiga-emulation/xim/types';
import { getSystemTime } from '../../src/utils/date-time.util';

describe('Door Logging Utility', () => {
  const mockAppendFileSync = fs.appendFileSync as jest.MockedFunction<typeof fs.appendFileSync>;
  const mockGetSystemTime = getSystemTime as jest.MockedFunction<typeof getSystemTime>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSystemTime.mockReturnValue(new Date('2025-01-07T12:34:56.789Z'));
  });

  describe('logDoorMessage', () => {
    it('should log basic message with command number', () => {
      const msg = {
        command: 100,
        data: 42,
        string: 'test',
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledTimes(3);
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('door-68k.log'),
        expect.stringContaining('msg request: 100'),
        expect.any(Object)
      );
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('door-68k.log'),
        expect.stringContaining('data: 42'),
        expect.any(Object)
      );
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('door-68k.log'),
        expect.stringContaining('string: test'),
        expect.any(Object)
      );
    });

    it('should include timestamp in log', () => {
      const msg = {
        command: 100,
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      // Check that a valid ISO timestamp is included
      const firstCall = mockAppendFileSync.mock.calls[0][1] as string;
      expect(firstCall).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should include node ID when provided', () => {
      const msg = {
        command: 100,
        data: 0,
        nodeId: 5,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('node=5'),
        expect.any(Object)
      );
    });

    it('should omit node ID when not provided', () => {
      const msg = {
        command: 100,
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      const firstCall = mockAppendFileSync.mock.calls[0][1];
      expect(firstCall).not.toContain('node=');
    });

    it('should use command name from XIMCommand enum when available', () => {
      const msg = {
        command: XIMCommand.JH_REGISTER,
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('JH_REGISTER'),
        expect.any(Object)
      );
    });

    it('should use provided command name when given', () => {
      const msg = {
        command: 999,
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg, 'CUSTOM_COMMAND');

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('CUSTOM_COMMAND'),
        expect.any(Object)
      );
    });

    it('should format unknown command as hex', () => {
      const msg = {
        command: 255,
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/CMD_[0-9a-f]{2}/),
        expect.any(Object)
      );
    });

    it('should pad hex command with zeros', () => {
      const msg = {
        command: 255, // 0xFF - not in XIMCommand enum
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('CMD_ff'),
        expect.any(Object)
      );
    });

    it('should sanitize carriage returns in string', () => {
      const msg = {
        command: 100,
        data: 0,
        string: 'line1\rline2',
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('line1\\rline2'),
        expect.any(Object)
      );
    });

    it('should sanitize newlines in string', () => {
      const msg = {
        command: 100,
        data: 0,
        string: 'line1\nline2',
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('line1\\nline2'),
        expect.any(Object)
      );
    });

    it('should sanitize ANSI escape codes in string', () => {
      const msg = {
        command: 100,
        data: 0,
        string: '\x1b[31mRed\x1b[0m',
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('\\x1b[31mRed\\x1b[0m'),
        expect.any(Object)
      );
    });

    it('should handle undefined string', () => {
      const msg = {
        command: 100,
        data: 0,
        string: undefined,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('string: '),
        expect.any(Object)
      );
    });

    it('should handle null string', () => {
      const msg = {
        command: 100,
        data: 0,
        string: null as any,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('string: '),
        expect.any(Object)
      );
    });

    it('should handle empty string', () => {
      const msg = {
        command: 100,
        data: 0,
        string: '',
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/string: ?\n/),
        expect.any(Object)
      );
    });

    it('should handle zero data value', () => {
      const msg = {
        command: 100,
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('data: 0'),
        expect.any(Object)
      );
    });

    it('should handle negative data value', () => {
      const msg = {
        command: 100,
        data: -42,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('data: -42'),
        expect.any(Object)
      );
    });

    it('should handle large data value', () => {
      const msg = {
        command: 100,
        data: 999999,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('data: 999999'),
        expect.any(Object)
      );
    });

    it('should write to correct log file path', () => {
      const msg = {
        command: 100,
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/logs[/\\]door-68k\.log$/),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should use UTF-8 encoding', () => {
      const msg = {
        command: 100,
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { encoding: 'utf8' }
      );
    });

    it('should append newline to each log line', () => {
      const msg = {
        command: 100,
        data: 0,
        string: 'test',
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      mockAppendFileSync.mock.calls.forEach((call) => {
        expect(call[1]).toMatch(/\n$/);
      });
    });

    it('should handle file write error gracefully', () => {
      mockAppendFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      const msg = {
        command: 100,
        data: 0,
      } as XIMMessage;

      // Should not throw
      expect(() => {
        doorLogging.logDoorMessage(msg);
      }).not.toThrow();
    });

    it('should log all three components for complete message', () => {
      const msg = {
        command: 100,
        data: 42,
        string: 'test string',
        nodeId: 3,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledTimes(3);

      // First call: msg request
      expect(mockAppendFileSync).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.stringContaining('msg request: 100'),
        expect.any(Object)
      );

      // Second call: data
      expect(mockAppendFileSync).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.stringContaining('data: 42'),
        expect.any(Object)
      );

      // Third call: string
      expect(mockAppendFileSync).toHaveBeenNthCalledWith(
        3,
        expect.any(String),
        expect.stringContaining('string: test string'),
        expect.any(Object)
      );
    });

    it('should sanitize multiple special characters in one string', () => {
      const msg = {
        command: 100,
        data: 0,
        string: 'line1\r\nline2\x1b[31m',
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('line1\\r\\nline2\\x1b[31m'),
        expect.any(Object)
      );
    });

    it('should handle very long strings', () => {
      const msg = {
        command: 100,
        data: 0,
        string: 'x'.repeat(10000),
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('x'.repeat(10000)),
        expect.any(Object)
      );
    });

    it('should handle unicode characters in string', () => {
      const msg = {
        command: 100,
        data: 0,
        string: '你好世界 🚀',
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('你好世界 🚀'),
        expect.any(Object)
      );
    });

    it('should format prefix consistently', () => {
      const msg = {
        command: 100,
        data: 0,
        nodeId: 2,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      const calls = mockAppendFileSync.mock.calls;
      const prefixes = calls.map((call) => {
        const line = call[1] as string;
        // Extract prefix by splitting on the content part
        if (line.includes('msg request:')) return line.split('msg request:')[0];
        if (line.includes('data:')) return line.split('data:')[0];
        if (line.includes('string:')) return line.split('string:')[0];
        return line;
      });

      // All three lines should have the same prefix
      expect(prefixes[0]).toBe(prefixes[1]);
      expect(prefixes[1]).toBe(prefixes[2]);
    });

    it('should handle command 0', () => {
      const msg = {
        command: 0,
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('msg request: 0'),
        expect.any(Object)
      );
    });

    it('should handle maximum command number', () => {
      const msg = {
        command: 65535, // Max uint16
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      expect(mockAppendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('msg request: 65535'),
        expect.any(Object)
      );
    });

    it('should write to logs directory', () => {
      const msg = {
        command: 100,
        data: 0,
      } as XIMMessage;

      doorLogging.logDoorMessage(msg);

      // Check that all calls write to the door-68k.log file in logs directory
      mockAppendFileSync.mock.calls.forEach((call) => {
        expect(call[0]).toMatch(/logs[/\\]door-68k\.log$/);
      });
    });
  });
});
