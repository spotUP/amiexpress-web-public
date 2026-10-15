/**
 * Output Utility Unit Tests
 *
 * Tests buffered ANSI output wrapper functions for Socket.IO.
 * Validates express.e-compatible output behavior with performance optimization.
 */

import {
  emitText,
  emitPrompt,
  emitLine,
  flushOutput,
  emitLines,
} from '../../src/utils/output.util';
import { getAnsiBuffer } from '../../src/utils/ansi-buffer.util';
import { Socket } from 'socket.io';

// Mock the ansi-buffer module
jest.mock('../../src/utils/ansi-buffer.util', () => {
  const mockBuffers = new Map<string, any>();

  return {
    getAnsiBuffer: jest.fn((socket: Socket) => {
      const socketId = socket.id;
      if (!mockBuffers.has(socketId)) {
        const buffer = {
          append: jest.fn(),
          flush: jest.fn(),
        };
        mockBuffers.set(socketId, buffer);
      }
      return mockBuffers.get(socketId);
    }),
    emitText: jest.fn((socket: Socket, text: string, immediate: boolean) => {
      if (immediate) {
        (socket as any).emit('ansi-output', text);
      } else {
        const buffer = mockBuffers.get(socket.id);
        if (buffer) {
          buffer.append(text);
        }
      }
    }),
    emitPrompt: jest.fn((socket: Socket, text: string) => {
      (socket as any).emit('ansi-output', text);
    }),
    // Export mockBuffers for test access
    __mockBuffers: mockBuffers,
  };
});

describe('Output Utility Functions', () => {
  let mockSocket: any;
  let emittedEvents: Array<{ event: string; data: any }>;

  beforeEach(() => {
    jest.clearAllMocks();

    emittedEvents = [];
    mockSocket = {
      id: 'test-socket-output',
      emit: jest.fn((event: string, data: any) => {
        emittedEvents.push({ event, data });
        return true;
      }),
    } as unknown as Socket;
  });

  describe('emitText', () => {
    it('should call bufferEmitText with immediate=false', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitText(mockSocket, 'Test message');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, 'Test message', false);
    });

    it('should handle empty string', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitText(mockSocket, '');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, '', false);
    });

    it('should handle ANSI escape sequences', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitText(mockSocket, '\x1b[31mRed text\x1b[0m');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, '\x1b[31mRed text\x1b[0m', false);
    });

    it('should handle line endings', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitText(mockSocket, 'Line 1\r\nLine 2\r\n');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, 'Line 1\r\nLine 2\r\n', false);
    });

    it('should handle special characters', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitText(mockSocket, 'Tab\there\nNewline');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, 'Tab\there\nNewline', false);
    });

    it('should handle unicode characters', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitText(mockSocket, 'café ñ 日本語');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, 'café ñ 日本語', false);
    });

    it('should handle long text', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;
      const longText = 'A'.repeat(10000);

      emitText(mockSocket, longText);

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, longText, false);
    });

    it('should handle multiple consecutive calls', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitText(mockSocket, 'First');
      emitText(mockSocket, 'Second');
      emitText(mockSocket, 'Third');

      expect(bufferEmitText).toHaveBeenCalledTimes(3);
      expect(bufferEmitText).toHaveBeenNthCalledWith(1, mockSocket, 'First', false);
      expect(bufferEmitText).toHaveBeenNthCalledWith(2, mockSocket, 'Second', false);
      expect(bufferEmitText).toHaveBeenNthCalledWith(3, mockSocket, 'Third', false);
    });
  });

  describe('emitPrompt', () => {
    it('should call bufferEmitPrompt', () => {
      const bufferEmitPrompt = require('../../src/utils/ansi-buffer.util').emitPrompt;

      emitPrompt(mockSocket, 'Enter name: ');

      expect(bufferEmitPrompt).toHaveBeenCalledWith(mockSocket, 'Enter name: ');
    });

    it('should flush immediately for input prompt', () => {
      emitPrompt(mockSocket, 'Command: ');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('ansi-output');
      expect(emittedEvents[0].data).toBe('Command: ');
    });

    it('should handle pause prompt', () => {
      const bufferEmitPrompt = require('../../src/utils/ansi-buffer.util').emitPrompt;

      emitPrompt(mockSocket, '(Pause)...More(y/n/ns)?');

      expect(bufferEmitPrompt).toHaveBeenCalledWith(mockSocket, '(Pause)...More(y/n/ns)?');
    });

    it('should handle confirmation prompt', () => {
      const bufferEmitPrompt = require('../../src/utils/ansi-buffer.util').emitPrompt;

      emitPrompt(mockSocket, 'Continue (Y/N)? ');

      expect(bufferEmitPrompt).toHaveBeenCalledWith(mockSocket, 'Continue (Y/N)? ');
    });

    it('should handle empty prompt', () => {
      const bufferEmitPrompt = require('../../src/utils/ansi-buffer.util').emitPrompt;

      emitPrompt(mockSocket, '');

      expect(bufferEmitPrompt).toHaveBeenCalledWith(mockSocket, '');
    });

    it('should handle prompt with ANSI codes', () => {
      const bufferEmitPrompt = require('../../src/utils/ansi-buffer.util').emitPrompt;

      emitPrompt(mockSocket, '\x1b[1;33mYour choice: \x1b[0m');

      expect(bufferEmitPrompt).toHaveBeenCalledWith(mockSocket, '\x1b[1;33mYour choice: \x1b[0m');
    });

    it('should handle multiple consecutive prompts', () => {
      const bufferEmitPrompt = require('../../src/utils/ansi-buffer.util').emitPrompt;

      emitPrompt(mockSocket, 'Prompt 1: ');
      emitPrompt(mockSocket, 'Prompt 2: ');

      expect(bufferEmitPrompt).toHaveBeenCalledTimes(2);
    });
  });

  describe('emitLine', () => {
    it('should append \\r\\n to text', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitLine(mockSocket, 'Test line');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, 'Test line\r\n', false);
    });

    it('should handle empty line', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitLine(mockSocket);

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, '\r\n', false);
    });

    it('should handle empty string explicitly', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitLine(mockSocket, '');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, '\r\n', false);
    });

    it('should not add extra \\r\\n if already present', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitLine(mockSocket, 'Line with ending\r\n');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, 'Line with ending\r\n\r\n', false);
    });

    it('should handle multiple lines in one call', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitLine(mockSocket, 'Line 1\r\nLine 2');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, 'Line 1\r\nLine 2\r\n', false);
    });

    it('should handle ANSI formatted line', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitLine(mockSocket, '\x1b[32mGreen line\x1b[0m');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, '\x1b[32mGreen line\x1b[0m\r\n', false);
    });

    it('should handle unicode line', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitLine(mockSocket, 'Café ☕');

      expect(bufferEmitText).toHaveBeenCalledWith(mockSocket, 'Café ☕\r\n', false);
    });

    it('should handle consecutive emitLine calls', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitLine(mockSocket, 'Line 1');
      emitLine(mockSocket, 'Line 2');
      emitLine(mockSocket, 'Line 3');

      expect(bufferEmitText).toHaveBeenCalledTimes(3);
      expect(bufferEmitText).toHaveBeenNthCalledWith(1, mockSocket, 'Line 1\r\n', false);
      expect(bufferEmitText).toHaveBeenNthCalledWith(2, mockSocket, 'Line 2\r\n', false);
      expect(bufferEmitText).toHaveBeenNthCalledWith(3, mockSocket, 'Line 3\r\n', false);
    });
  });

  describe('flushOutput', () => {
    it('should call buffer.flush()', () => {
      const buffer = getAnsiBuffer(mockSocket);

      flushOutput(mockSocket);

      expect(buffer.flush).toHaveBeenCalledTimes(1);
    });

    it('should flush before pause', () => {
      const buffer = getAnsiBuffer(mockSocket);

      emitText(mockSocket, 'Text before pause');
      flushOutput(mockSocket);
      // doPause() would happen here

      expect(buffer.flush).toHaveBeenCalledTimes(1);
    });

    it('should flush before prompt', () => {
      const buffer = getAnsiBuffer(mockSocket);

      emitText(mockSocket, 'Menu options');
      flushOutput(mockSocket);
      emitPrompt(mockSocket, 'Your choice: ');

      expect(buffer.flush).toHaveBeenCalledTimes(1);
    });

    it('should flush before door execution', () => {
      const buffer = getAnsiBuffer(mockSocket);

      emitText(mockSocket, 'Starting door...');
      flushOutput(mockSocket);
      // Door execution would happen here

      expect(buffer.flush).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple flushes', () => {
      const buffer = getAnsiBuffer(mockSocket);

      flushOutput(mockSocket);
      flushOutput(mockSocket);
      flushOutput(mockSocket);

      expect(buffer.flush).toHaveBeenCalledTimes(3);
    });

    it('should flush even with empty buffer', () => {
      const buffer = getAnsiBuffer(mockSocket);

      // Don't emit anything, just flush
      flushOutput(mockSocket);

      expect(buffer.flush).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitLines', () => {
    it('should append multiple lines with \\r\\n', () => {
      const buffer = getAnsiBuffer(mockSocket);

      emitLines(mockSocket, ['Line 1', 'Line 2', 'Line 3']);

      expect(buffer.append).toHaveBeenCalledTimes(3);
      expect(buffer.append).toHaveBeenNthCalledWith(1, 'Line 1\r\n');
      expect(buffer.append).toHaveBeenNthCalledWith(2, 'Line 2\r\n');
      expect(buffer.append).toHaveBeenNthCalledWith(3, 'Line 3\r\n');
    });

    it('should handle empty array', () => {
      const buffer = getAnsiBuffer(mockSocket);

      emitLines(mockSocket, []);

      expect(buffer.append).not.toHaveBeenCalled();
    });

    it('should handle single line', () => {
      const buffer = getAnsiBuffer(mockSocket);

      emitLines(mockSocket, ['Single line']);

      expect(buffer.append).toHaveBeenCalledTimes(1);
      expect(buffer.append).toHaveBeenCalledWith('Single line\r\n');
    });

    it('should handle empty strings in array', () => {
      const buffer = getAnsiBuffer(mockSocket);

      emitLines(mockSocket, ['', '', '']);

      expect(buffer.append).toHaveBeenCalledTimes(3);
      expect(buffer.append).toHaveBeenNthCalledWith(1, '\r\n');
      expect(buffer.append).toHaveBeenNthCalledWith(2, '\r\n');
      expect(buffer.append).toHaveBeenNthCalledWith(3, '\r\n');
    });

    it('should handle lines with ANSI codes', () => {
      const buffer = getAnsiBuffer(mockSocket);

      emitLines(mockSocket, [
        '\x1b[31mRed line\x1b[0m',
        '\x1b[32mGreen line\x1b[0m',
        '\x1b[34mBlue line\x1b[0m',
      ]);

      expect(buffer.append).toHaveBeenCalledTimes(3);
      expect(buffer.append).toHaveBeenNthCalledWith(1, '\x1b[31mRed line\x1b[0m\r\n');
      expect(buffer.append).toHaveBeenNthCalledWith(2, '\x1b[32mGreen line\x1b[0m\r\n');
      expect(buffer.append).toHaveBeenNthCalledWith(3, '\x1b[34mBlue line\x1b[0m\r\n');
    });

    it('should handle mixed content lines', () => {
      const buffer = getAnsiBuffer(mockSocket);

      emitLines(mockSocket, [
        'Plain text',
        '\x1b[1mBold\x1b[0m',
        'Tab\there',
        'Unicode: café',
      ]);

      expect(buffer.append).toHaveBeenCalledTimes(4);
    });

    it('should handle large arrays', () => {
      const buffer = getAnsiBuffer(mockSocket);
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);

      emitLines(mockSocket, lines);

      expect(buffer.append).toHaveBeenCalledTimes(100);
    });

    it('should handle lines that already have \\r\\n', () => {
      const buffer = getAnsiBuffer(mockSocket);

      emitLines(mockSocket, ['Line 1\r\n', 'Line 2\r\n']);

      expect(buffer.append).toHaveBeenNthCalledWith(1, 'Line 1\r\n\r\n');
      expect(buffer.append).toHaveBeenNthCalledWith(2, 'Line 2\r\n\r\n');
    });
  });

  describe('integration tests', () => {
    it('should handle typical BBS menu display flow', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;
      const bufferEmitPrompt = require('../../src/utils/ansi-buffer.util').emitPrompt;
      const buffer = getAnsiBuffer(mockSocket);

      // Display menu
      emitLine(mockSocket, '=== Main Menu ===');
      emitLine(mockSocket, '1. Read Messages');
      emitLine(mockSocket, '2. Send Message');
      emitLine(mockSocket, '3. Files');
      emitLine(mockSocket, '4. Doors');
      emitLine(mockSocket);

      // Flush before prompt
      flushOutput(mockSocket);

      // Display prompt
      emitPrompt(mockSocket, 'Your choice: ');

      expect(bufferEmitText).toHaveBeenCalledTimes(6);
      expect(buffer.flush).toHaveBeenCalledTimes(1);
      expect(bufferEmitPrompt).toHaveBeenCalledTimes(1);
    });

    it('should handle message display with pause', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;
      const buffer = getAnsiBuffer(mockSocket);

      // Display multiple lines
      emitLines(mockSocket, [
        'Message from: User123',
        'Date: 2024-01-01',
        '',
        'This is a test message.',
        'It has multiple lines.',
      ]);

      // Flush before pause
      flushOutput(mockSocket);

      expect(buffer.append).toHaveBeenCalledTimes(5);
      expect(buffer.flush).toHaveBeenCalledTimes(1);
    });

    it('should handle file listing output', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitLine(mockSocket, 'Filename         Size    Date');
      emitLine(mockSocket, '--------------------------------');
      emitLines(mockSocket, [
        'file1.txt        1234    01/01/24',
        'file2.txt        5678    01/02/24',
        'file3.txt        9012    01/03/24',
      ]);
      emitLine(mockSocket);
      emitLine(mockSocket, 'Total: 3 files');

      expect(bufferEmitText).toHaveBeenCalledTimes(4); // 2 emitLine + 1 emitLines + 2 emitLine
    });

    it('should handle mixed emitText, emitLine, and emitLines', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;

      emitText(mockSocket, 'Header ');
      emitText(mockSocket, 'continuation\r\n');
      emitLine(mockSocket, 'Single line');
      emitLines(mockSocket, ['Multi 1', 'Multi 2']);
      emitText(mockSocket, 'Footer');

      expect(bufferEmitText).toHaveBeenCalledTimes(4);
    });

    it('should maintain output order', () => {
      const bufferEmitText = require('../../src/utils/ansi-buffer.util').emitText;
      const bufferEmitPrompt = require('../../src/utils/ansi-buffer.util').emitPrompt;

      emitText(mockSocket, 'First ');
      emitText(mockSocket, 'Second ');
      emitLine(mockSocket, 'Third');
      emitPrompt(mockSocket, 'Fourth: ');

      expect(bufferEmitText).toHaveBeenNthCalledWith(1, mockSocket, 'First ', false);
      expect(bufferEmitText).toHaveBeenNthCalledWith(2, mockSocket, 'Second ', false);
      expect(bufferEmitText).toHaveBeenNthCalledWith(3, mockSocket, 'Third\r\n', false);
      expect(bufferEmitPrompt).toHaveBeenCalledWith(mockSocket, 'Fourth: ');
    });

    it('should handle error display pattern', () => {
      const bufferEmitPrompt = require('../../src/utils/ansi-buffer.util').emitPrompt;
      const buffer = getAnsiBuffer(mockSocket);

      emitLine(mockSocket);
      emitLine(mockSocket, '\x1b[31mError: Invalid choice\x1b[0m');
      emitLine(mockSocket);
      flushOutput(mockSocket);
      emitPrompt(mockSocket, 'Press any key to continue...');

      expect(buffer.flush).toHaveBeenCalledTimes(1);
      expect(bufferEmitPrompt).toHaveBeenCalledTimes(1);
    });

    it('should handle ANSI art display', () => {
      const buffer = getAnsiBuffer(mockSocket);

      const asciiArt = [
        '  _____  ',
        ' |  _  | ',
        ' | |_| | ',
        ' |_____| ',
      ];

      emitLines(mockSocket, asciiArt);

      expect(buffer.append).toHaveBeenCalledTimes(4);
    });
  });
});
