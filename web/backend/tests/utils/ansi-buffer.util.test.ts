/**
 * ANSI Buffer Utility Unit Tests
 *
 * Tests ANSI output buffering for performance optimization.
 * Validates batching, flushing, auto-cleanup, and socket management.
 */

import {
  AnsiBuffer,
  getAnsiBuffer,
  emitText,
  emitPrompt,
  flushAllBuffers,
} from '../../src/utils/ansi-buffer.util';
import { Socket } from 'socket.io';

describe('ANSI Buffer Utility', () => {
  let mockSocket: any;
  let emittedEvents: Array<{ event: string; data: any }>;
  let disconnectHandler: Function | null;

  beforeEach(() => {
    jest.useFakeTimers();
    emittedEvents = [];
    disconnectHandler = null;

    mockSocket = {
      id: 'test-socket-123',
      emit: jest.fn((event: string, data: any) => {
        emittedEvents.push({ event, data });
        return true;
      }),
      on: jest.fn((event: string, handler: Function) => {
        if (event === 'disconnect') {
          disconnectHandler = handler;
        }
        return mockSocket;
      }),
    } as unknown as Socket;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('AnsiBuffer class', () => {
    describe('constructor', () => {
      it('should create buffer with default settings', () => {
        const buffer = new AnsiBuffer(mockSocket);
        expect(buffer).toBeDefined();
        expect(buffer.getBufferSize()).toBe(0);
        expect(buffer.hasPendingData()).toBe(false);
      });

      it('should accept custom flush delay', () => {
        const buffer = new AnsiBuffer(mockSocket, 100);
        expect(buffer).toBeDefined();
      });

      it('should accept custom max buffer size', () => {
        const buffer = new AnsiBuffer(mockSocket, 16, 4096);
        expect(buffer).toBeDefined();
      });
    });

    describe('append', () => {
      it('should add text to buffer', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Hello');

        expect(buffer.getBufferSize()).toBe(5);
        expect(buffer.hasPendingData()).toBe(true);
      });

      it('should accumulate multiple appends', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Hello');
        buffer.append(' ');
        buffer.append('World');

        expect(buffer.getBufferSize()).toBe(11);
        expect(buffer.hasPendingData()).toBe(true);
      });

      it('should ignore empty text', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('');

        expect(buffer.getBufferSize()).toBe(0);
        expect(buffer.hasPendingData()).toBe(false);
      });

      it('should schedule automatic flush', () => {
        const buffer = new AnsiBuffer(mockSocket, 16);
        buffer.append('Test');

        expect(emittedEvents).toHaveLength(0);

        // Fast-forward timer
        jest.advanceTimersByTime(20);

        expect(emittedEvents).toHaveLength(1);
        expect(emittedEvents[0].event).toBe('ansi-output');
        expect(emittedEvents[0].data).toBe('Test');
      });

      it('should force immediate flush when buffer exceeds max size', () => {
        const buffer = new AnsiBuffer(mockSocket, 16, 10); // 10 byte max
        buffer.append('12345678901'); // 11 bytes

        // Should flush immediately without waiting for timer
        expect(emittedEvents).toHaveLength(1);
        expect(emittedEvents[0].data).toBe('12345678901');
        expect(buffer.hasPendingData()).toBe(false);
      });

      it('should force immediate flush when flushDelay is 0', () => {
        const buffer = new AnsiBuffer(mockSocket, 0); // No delay
        buffer.append('Test');

        // Should flush immediately
        expect(emittedEvents).toHaveLength(1);
        expect(emittedEvents[0].data).toBe('Test');
      });

      it('should not schedule multiple timers', () => {
        const buffer = new AnsiBuffer(mockSocket, 50);
        buffer.append('First');
        buffer.append('Second');
        buffer.append('Third');

        // Only one flush should happen
        jest.advanceTimersByTime(60);

        expect(emittedEvents).toHaveLength(1);
        expect(emittedEvents[0].data).toBe('FirstSecondThird');
      });

      it('should handle ANSI escape sequences', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('\x1b[31mRed\x1b[0m');

        expect(buffer.getBufferSize()).toBe(12);
      });
    });

    describe('flush', () => {
      it('should emit buffered content', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Hello');
        buffer.append(' World');
        buffer.flush();

        expect(emittedEvents).toHaveLength(1);
        expect(emittedEvents[0].event).toBe('ansi-output');
        expect(emittedEvents[0].data).toBe('Hello World');
      });

      it('should clear buffer after flush', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Test');
        buffer.flush();

        expect(buffer.getBufferSize()).toBe(0);
        expect(buffer.hasPendingData()).toBe(false);
      });

      it('should do nothing when buffer is empty', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.flush();

        expect(emittedEvents).toHaveLength(0);
      });

      it('should cancel pending timer', () => {
        const buffer = new AnsiBuffer(mockSocket, 50);
        buffer.append('Test');
        buffer.flush();

        // Timer should be cancelled
        jest.advanceTimersByTime(100);

        // Should only have one emit from manual flush
        expect(emittedEvents).toHaveLength(1);
      });

      it('should combine multiple appends into single emit', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Line 1\r\n');
        buffer.append('Line 2\r\n');
        buffer.append('Line 3\r\n');
        buffer.flush();

        expect(emittedEvents).toHaveLength(1);
        expect(emittedEvents[0].data).toBe('Line 1\r\nLine 2\r\nLine 3\r\n');
      });
    });

    describe('flushImmediate', () => {
      it('should flush immediately', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Prompt: ');
        buffer.flushImmediate();

        expect(emittedEvents).toHaveLength(1);
        expect(emittedEvents[0].data).toBe('Prompt: ');
        expect(buffer.hasPendingData()).toBe(false);
      });

      it('should be alias for flush', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Test');

        buffer.flushImmediate();
        expect(emittedEvents).toHaveLength(1);

        buffer.append('Again');
        buffer.flush();
        expect(emittedEvents).toHaveLength(2);

        // Both should behave identically
        expect(emittedEvents[0].data).toBe('Test');
        expect(emittedEvents[1].data).toBe('Again');
      });
    });

    describe('getBufferSize', () => {
      it('should return 0 for empty buffer', () => {
        const buffer = new AnsiBuffer(mockSocket);
        expect(buffer.getBufferSize()).toBe(0);
      });

      it('should return correct size after append', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Hello World'); // 11 bytes
        expect(buffer.getBufferSize()).toBe(11);
      });

      it('should return cumulative size', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Hello'); // 5 bytes
        buffer.append(' '); // 1 byte
        buffer.append('World'); // 5 bytes
        expect(buffer.getBufferSize()).toBe(11);
      });

      it('should return 0 after flush', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Test');
        buffer.flush();
        expect(buffer.getBufferSize()).toBe(0);
      });
    });

    describe('clear', () => {
      it('should clear buffer without emitting', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Test');
        buffer.clear();

        expect(buffer.getBufferSize()).toBe(0);
        expect(buffer.hasPendingData()).toBe(false);
        expect(emittedEvents).toHaveLength(0);
      });

      it('should cancel pending timer', () => {
        const buffer = new AnsiBuffer(mockSocket, 50);
        buffer.append('Test');
        buffer.clear();

        jest.advanceTimersByTime(100);

        expect(emittedEvents).toHaveLength(0);
      });
    });

    describe('hasPendingData', () => {
      it('should return false for empty buffer', () => {
        const buffer = new AnsiBuffer(mockSocket);
        expect(buffer.hasPendingData()).toBe(false);
      });

      it('should return true after append', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Test');
        expect(buffer.hasPendingData()).toBe(true);
      });

      it('should return false after flush', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Test');
        buffer.flush();
        expect(buffer.hasPendingData()).toBe(false);
      });

      it('should return false after clear', () => {
        const buffer = new AnsiBuffer(mockSocket);
        buffer.append('Test');
        buffer.clear();
        expect(buffer.hasPendingData()).toBe(false);
      });
    });

    describe('setFlushDelay', () => {
      it('should change flush delay', () => {
        const buffer = new AnsiBuffer(mockSocket, 50);
        buffer.setFlushDelay(100);

        buffer.append('Test');
        jest.advanceTimersByTime(60);

        // Should not flush yet (100ms delay)
        expect(emittedEvents).toHaveLength(0);

        jest.advanceTimersByTime(50);

        // Should flush now
        expect(emittedEvents).toHaveLength(1);
      });

      it('should enable immediate mode when set to 0', () => {
        const buffer = new AnsiBuffer(mockSocket, 50);
        buffer.setFlushDelay(0);

        buffer.append('Test');

        // Should flush immediately
        expect(emittedEvents).toHaveLength(1);
      });
    });
  });

  describe('getAnsiBuffer', () => {
    it('should create new buffer for new socket', () => {
      const buffer = getAnsiBuffer(mockSocket);

      expect(buffer).toBeInstanceOf(AnsiBuffer);
      expect(buffer.hasPendingData()).toBe(false);
    });

    it('should return same buffer for same socket', () => {
      const buffer1 = getAnsiBuffer(mockSocket);
      const buffer2 = getAnsiBuffer(mockSocket);

      expect(buffer1).toBe(buffer2);
    });

    it('should create different buffers for different sockets', () => {
      const mockSocket2 = {
        id: 'test-socket-456',
        emit: jest.fn(() => true),
        on: jest.fn(),
      } as unknown as Socket;

      const buffer1 = getAnsiBuffer(mockSocket);
      const buffer2 = getAnsiBuffer(mockSocket2);

      expect(buffer1).not.toBe(buffer2);
    });

    it('should register disconnect handler', () => {
      const freshSocket = {
        id: 'fresh-socket-for-disconnect-test',
        emit: jest.fn(() => true),
        on: jest.fn((event: string, handler: Function) => {
          return freshSocket;
        }),
      } as unknown as Socket;

      getAnsiBuffer(freshSocket);

      expect(freshSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should flush and cleanup on disconnect', () => {
      let localDisconnectHandler: Function | null = null;
      const localEvents: Array<{ event: string; data: any }> = [];

      const freshSocket = {
        id: 'fresh-socket-for-cleanup-test',
        emit: jest.fn((event: string, data: any) => {
          localEvents.push({ event, data });
          return true;
        }),
        on: jest.fn((event: string, handler: Function) => {
          if (event === 'disconnect') {
            localDisconnectHandler = handler;
          }
          return freshSocket;
        }),
      } as unknown as Socket;

      const buffer = getAnsiBuffer(freshSocket);
      buffer.append('Pending data');

      // Trigger disconnect
      expect(localDisconnectHandler).not.toBeNull();
      localDisconnectHandler!();

      // Should have flushed pending data
      expect(localEvents).toHaveLength(1);
      expect(localEvents[0].data).toBe('Pending data');

      // New call should create new buffer
      const newBuffer = getAnsiBuffer(freshSocket);
      expect(newBuffer).not.toBe(buffer);
    });
  });

  describe('emitText', () => {
    it('should append text to buffer', () => {
      const freshSocket = {
        id: 'socket-for-append-test',
        emit: jest.fn(() => true),
        on: jest.fn(),
      } as unknown as Socket;

      emitText(freshSocket, 'Hello');

      const buffer = getAnsiBuffer(freshSocket);
      expect(buffer.hasPendingData()).toBe(true);
      expect(buffer.getBufferSize()).toBe(5);
    });

    it('should not flush immediately by default', () => {
      const freshSocket = {
        id: 'socket-for-no-flush-test',
        emit: jest.fn(() => true),
        on: jest.fn(),
      } as unknown as Socket;

      const freshEvents: Array<{ event: string; data: any }> = [];
      freshSocket.emit = jest.fn((event: string, data: any) => {
        freshEvents.push({ event, data });
        return true;
      });

      emitText(freshSocket, 'Test');

      expect(freshEvents).toHaveLength(0);
    });

    it('should flush immediately when immediate=true', () => {
      const freshSocket = {
        id: 'socket-for-immediate-test',
        emit: jest.fn(() => true),
        on: jest.fn(),
      } as unknown as Socket;

      const freshEvents: Array<{ event: string; data: any }> = [];
      freshSocket.emit = jest.fn((event: string, data: any) => {
        freshEvents.push({ event, data });
        return true;
      });

      emitText(freshSocket, 'Test', true);

      expect(freshEvents).toHaveLength(1);
      expect(freshEvents[0].data).toBe('Test');
    });

    it('should batch multiple emits', () => {
      const freshSocket = {
        id: 'socket-for-batch-test',
        emit: jest.fn(() => true),
        on: jest.fn(),
      } as unknown as Socket;

      const freshEvents: Array<{ event: string; data: any }> = [];
      freshSocket.emit = jest.fn((event: string, data: any) => {
        freshEvents.push({ event, data });
        return true;
      });

      emitText(freshSocket, 'Line 1\r\n');
      emitText(freshSocket, 'Line 2\r\n');
      emitText(freshSocket, 'Line 3\r\n');

      jest.advanceTimersByTime(20);

      expect(freshEvents).toHaveLength(1);
      expect(freshEvents[0].data).toBe('Line 1\r\nLine 2\r\nLine 3\r\n');
    });

    it('should handle multiple sockets independently', () => {
      const freshSocket1 = {
        id: 'socket-multi-1',
        emit: jest.fn(() => true),
        on: jest.fn(),
      } as unknown as Socket;

      const freshSocket2 = {
        id: 'socket-multi-2',
        emit: jest.fn(() => true),
        on: jest.fn(),
      } as unknown as Socket;

      const events1: Array<{ event: string; data: any }> = [];
      const events2: Array<{ event: string; data: any }> = [];

      freshSocket1.emit = jest.fn((event: string, data: any) => {
        events1.push({ event, data });
        return true;
      });

      freshSocket2.emit = jest.fn((event: string, data: any) => {
        events2.push({ event, data });
        return true;
      });

      emitText(freshSocket1, 'Socket 1', true);
      emitText(freshSocket2, 'Socket 2', true);

      expect(events1).toHaveLength(1);
      expect(events1[0].data).toBe('Socket 1');
      expect(events2).toHaveLength(1);
      expect(events2[0].data).toBe('Socket 2');
    });
  });

  describe('emitPrompt', () => {
    it('should emit text immediately', () => {
      emitPrompt(mockSocket, 'Enter choice: ');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].data).toBe('Enter choice: ');
    });

    it('should be equivalent to emitText with immediate=true', () => {
      emitPrompt(mockSocket, 'Prompt 1');
      emittedEvents = [];
      emitText(mockSocket, 'Prompt 2', true);

      expect(emittedEvents[0].event).toBe('ansi-output');
      expect(emittedEvents[0].data).toBe('Prompt 2');
    });

    it('should flush any pending data before prompt', () => {
      emitText(mockSocket, 'Some text\r\n');
      emitPrompt(mockSocket, 'Enter name: ');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].data).toBe('Some text\r\nEnter name: ');
    });
  });

  describe('flushAllBuffers', () => {
    it('should flush all active buffers', () => {
      const freshSocket1 = {
        id: 'socket-flush-all-1',
        emit: jest.fn(() => true),
        on: jest.fn(),
      } as unknown as Socket;

      const freshSocket2 = {
        id: 'socket-flush-all-2',
        emit: jest.fn(() => true),
        on: jest.fn(),
      } as unknown as Socket;

      const events1: Array<{ event: string; data: any }> = [];
      const events2: Array<{ event: string; data: any }> = [];

      freshSocket1.emit = jest.fn((event: string, data: any) => {
        events1.push({ event, data });
        return true;
      });

      freshSocket2.emit = jest.fn((event: string, data: any) => {
        events2.push({ event, data });
        return true;
      });

      emitText(freshSocket1, 'Buffer 1');
      emitText(freshSocket2, 'Buffer 2');

      flushAllBuffers();

      expect(events1).toHaveLength(1);
      expect(events1[0].data).toBe('Buffer 1');
      expect(events2).toHaveLength(1);
      expect(events2[0].data).toBe('Buffer 2');
    });

    it('should handle empty buffers', () => {
      getAnsiBuffer(mockSocket);
      flushAllBuffers();

      expect(emittedEvents).toHaveLength(0);
    });

    it('should work with no active buffers', () => {
      expect(() => flushAllBuffers()).not.toThrow();
    });
  });

  describe('integration tests', () => {
    it('should handle typical BBS output flow', () => {
      // Header
      emitText(mockSocket, '\x1b[32m=== BBS Menu ===\x1b[0m\r\n');
      // Options
      emitText(mockSocket, '1. Read Messages\r\n');
      emitText(mockSocket, '2. File Areas\r\n');
      emitText(mockSocket, '3. Logout\r\n');
      // Prompt
      emitPrompt(mockSocket, '\x1b[33mChoice: \x1b[0m');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].data).toContain('=== BBS Menu ===');
      expect(emittedEvents[0].data).toContain('Choice: ');
    });

    it('should auto-flush after delay', () => {
      emitText(mockSocket, 'Loading...');

      expect(emittedEvents).toHaveLength(0);

      jest.advanceTimersByTime(16); // Default delay

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].data).toBe('Loading...');
    });

    it('should handle large output efficiently', () => {
      const largeText = 'X'.repeat(10000);

      emitText(mockSocket, largeText);

      // Should force immediate flush due to size
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].data).toBe(largeText);
    });

    it('should maintain output order', () => {
      emitText(mockSocket, 'First\r\n');
      emitText(mockSocket, 'Second\r\n');
      emitText(mockSocket, 'Third\r\n');

      jest.advanceTimersByTime(20);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].data).toBe('First\r\nSecond\r\nThird\r\n');
    });

    it('should handle modem emulation mode (no batching)', () => {
      const buffer = getAnsiBuffer(mockSocket);
      buffer.setFlushDelay(0); // Modem mode

      emitText(mockSocket, 'Char 1');
      emitText(mockSocket, 'Char 2');
      emitText(mockSocket, 'Char 3');

      // Each should emit immediately
      expect(emittedEvents).toHaveLength(3);
    });

    it('should cleanup properly on disconnect', () => {
      emitText(mockSocket, 'Active data');

      if (disconnectHandler) {
        disconnectHandler();
      }

      // Should flush on disconnect
      expect(emittedEvents).toHaveLength(1);

      // New buffer should be independent
      emittedEvents = [];
      emitText(mockSocket, 'New session', true);
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].data).toBe('New session');
    });
  });
});
