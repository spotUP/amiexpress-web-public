/**
 * ANSI Output Utility Unit Tests
 *
 * Tests ANSI output utilities with cursor hiding and double buffering
 * for preventing screen tearing and flickering during redraws.
 */

import {
  HIDE_CURSOR,
  SHOW_CURSOR,
  CLEAR_SCREEN,
  moveCursor,
  setColors,
  emitAnsi,
  ScreenBuffer,
  createScreenBuffer,
} from '../../src/utils/ansi-output.util';

describe('ANSI Output Utility Functions', () => {
  let mockSocket: any;
  let emittedEvents: Array<{ event: string; data: any }>;

  beforeEach(() => {
    emittedEvents = [];
    mockSocket = {
      emit: jest.fn((event: string, data: any) => {
        emittedEvents.push({ event, data });
      }),
    };
  });

  describe('constants', () => {
    it('should export HIDE_CURSOR', () => {
      expect(HIDE_CURSOR).toBeDefined();
      expect(typeof HIDE_CURSOR).toBe('string');
      expect(HIDE_CURSOR).toContain('\x1b');
    });

    it('should export SHOW_CURSOR', () => {
      expect(SHOW_CURSOR).toBeDefined();
      expect(typeof SHOW_CURSOR).toBe('string');
      expect(SHOW_CURSOR).toContain('\x1b');
    });

    it('should export CLEAR_SCREEN', () => {
      expect(CLEAR_SCREEN).toBeDefined();
      expect(typeof CLEAR_SCREEN).toBe('string');
      expect(CLEAR_SCREEN).toContain('\x1b');
    });
  });

  describe('moveCursor', () => {
    it('should generate cursor position escape code', () => {
      const result = moveCursor(10, 5);
      expect(result).toContain('\x1b[');
      expect(result).toBeDefined();
    });

    it('should handle position (1,1)', () => {
      const result = moveCursor(1, 1);
      expect(result).toBeDefined();
    });

    it('should handle position (80,24)', () => {
      const result = moveCursor(80, 24);
      expect(result).toBeDefined();
    });

    it('should handle different positions differently', () => {
      const pos1 = moveCursor(1, 1);
      const pos2 = moveCursor(10, 20);
      expect(pos1).not.toBe(pos2);
    });
  });

  describe('setColors', () => {
    it('should generate color escape code', () => {
      const result = setColors(7, 0);
      expect(result).toContain('\x1b[');
      expect(result).toBeDefined();
    });

    it('should handle foreground color 0 (black)', () => {
      const result = setColors(0, 0);
      expect(result).toBeDefined();
    });

    it('should handle foreground color 7 (white)', () => {
      const result = setColors(7, 0);
      expect(result).toBeDefined();
    });

    it('should handle background color', () => {
      const result = setColors(7, 1);
      expect(result).toBeDefined();
    });

    it('should generate different codes for different colors', () => {
      const code1 = setColors(0, 0);
      const code2 = setColors(7, 7);
      expect(code1).not.toBe(code2);
    });
  });

  describe('emitAnsi', () => {
    describe('basic emission', () => {
      it('should emit string data', () => {
        emitAnsi(mockSocket, 'test data');

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
        expect(mockSocket.emit).toHaveBeenCalledWith('ansi-output', 'test data');
      });

      it('should emit array without double buffering', () => {
        emitAnsi(mockSocket, ['line1', 'line2', 'line3']);

        expect(mockSocket.emit).toHaveBeenCalledTimes(3);
        expect(emittedEvents[0].data).toBe('line1');
        expect(emittedEvents[1].data).toBe('line2');
        expect(emittedEvents[2].data).toBe('line3');
      });

      it('should emit array with double buffering', () => {
        emitAnsi(mockSocket, ['line1', 'line2', 'line3'], { doubleBuffer: true });

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
        expect(emittedEvents[0].data).toBe('line1line2line3');
      });

      it('should emit empty string', () => {
        emitAnsi(mockSocket, '');

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
        expect(emittedEvents[0].data).toBe('');
      });

      it('should emit empty array', () => {
        emitAnsi(mockSocket, []);

        expect(mockSocket.emit).toHaveBeenCalledTimes(0);
      });
    });

    describe('cursor hiding', () => {
      it('should hide and show cursor with string data', () => {
        emitAnsi(mockSocket, 'content', { hideCursor: true });

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
        const output = emittedEvents[0].data;
        expect(output).toContain(HIDE_CURSOR);
        expect(output).toContain('content');
        expect(output).toContain(SHOW_CURSOR);
      });

      it('should hide and show cursor with array and doubleBuffer', () => {
        emitAnsi(mockSocket, ['a', 'b', 'c'], { hideCursor: true, doubleBuffer: true });

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
        const output = emittedEvents[0].data;
        expect(output).toContain(HIDE_CURSOR);
        expect(output).toContain('abc');
        expect(output).toContain(SHOW_CURSOR);
      });

      it('should emit cursor codes separately for array without doubleBuffer', () => {
        emitAnsi(mockSocket, ['a', 'b'], { hideCursor: true, doubleBuffer: false });

        expect(mockSocket.emit).toHaveBeenCalledTimes(4);
        expect(emittedEvents[0].data).toBe(HIDE_CURSOR);
        expect(emittedEvents[1].data).toBe('a');
        expect(emittedEvents[2].data).toBe('b');
        expect(emittedEvents[3].data).toBe(SHOW_CURSOR);
      });

      it('should not hide cursor when hideCursor is false', () => {
        emitAnsi(mockSocket, 'content', { hideCursor: false });

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
        const output = emittedEvents[0].data;
        expect(output).not.toContain(HIDE_CURSOR);
        expect(output).not.toContain(SHOW_CURSOR);
      });
    });

    describe('option combinations', () => {
      it('should handle empty options object', () => {
        emitAnsi(mockSocket, 'test', {});

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      });

      it('should handle no options', () => {
        emitAnsi(mockSocket, 'test');

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      });

      it('should handle only hideCursor option', () => {
        emitAnsi(mockSocket, 'test', { hideCursor: true });

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
        const output = emittedEvents[0].data;
        expect(output).toContain(HIDE_CURSOR);
      });

      it('should handle only doubleBuffer option', () => {
        emitAnsi(mockSocket, ['a', 'b'], { doubleBuffer: true });

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
        expect(emittedEvents[0].data).toBe('ab');
      });
    });

    describe('edge cases', () => {
      it('should handle ANSI escape codes in data', () => {
        const ansiData = '\x1b[31mRed Text\x1b[0m';
        emitAnsi(mockSocket, ansiData);

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
        expect(emittedEvents[0].data).toContain(ansiData);
      });

      it('should handle newlines in data', () => {
        const data = 'Line 1\r\nLine 2\r\n';
        emitAnsi(mockSocket, data);

        expect(emittedEvents[0].data).toBe(data);
      });

      it('should handle special characters', () => {
        const data = 'Tab\tBackspace\bNull\0';
        emitAnsi(mockSocket, data);

        expect(emittedEvents[0].data).toBe(data);
      });
    });
  });

  describe('ScreenBuffer', () => {
    let buffer: ScreenBuffer;

    beforeEach(() => {
      buffer = new ScreenBuffer(mockSocket);
    });

    describe('constructor', () => {
      it('should create empty buffer', () => {
        expect(buffer.toString()).toBe('');
      });

      it('should store socket reference', () => {
        // Buffer should work without errors
        buffer.write('test');
        expect(buffer.toString()).toBe('test');
      });
    });

    describe('write', () => {
      it('should append data to buffer', () => {
        buffer.write('test');
        expect(buffer.toString()).toBe('test');
      });

      it('should return this for chaining', () => {
        const result = buffer.write('test');
        expect(result).toBe(buffer);
      });

      it('should append multiple writes', () => {
        buffer.write('a').write('b').write('c');
        expect(buffer.toString()).toBe('abc');
      });

      it('should handle empty string', () => {
        buffer.write('');
        expect(buffer.toString()).toBe('');
      });
    });

    describe('writeAt', () => {
      it('should write text at position', () => {
        buffer.writeAt(10, 5, 'Hello');
        const output = buffer.toString();
        expect(output).toContain('Hello');
      });

      it('should include cursor position', () => {
        buffer.writeAt(1, 1, 'Test');
        expect(buffer.toString()).toContain('\x1b[');
      });

      it('should include color codes', () => {
        buffer.writeAt(1, 1, 'Test', 7, 0);
        expect(buffer.toString()).toContain('\x1b[');
      });

      it('should use default colors when not specified', () => {
        buffer.writeAt(1, 1, 'Test');
        expect(buffer.toString()).toBeDefined();
      });

      it('should return this for chaining', () => {
        const result = buffer.writeAt(1, 1, 'Test');
        expect(result).toBe(buffer);
      });

      it('should handle multiple writeAt calls', () => {
        buffer
          .writeAt(1, 1, 'Line1')
          .writeAt(1, 2, 'Line2')
          .writeAt(1, 3, 'Line3');

        const output = buffer.toString();
        expect(output).toContain('Line1');
        expect(output).toContain('Line2');
        expect(output).toContain('Line3');
      });
    });

    describe('clear', () => {
      it('should add clear screen code', () => {
        buffer.clear();
        expect(buffer.toString()).toContain(CLEAR_SCREEN);
      });

      it('should return this for chaining', () => {
        const result = buffer.clear();
        expect(result).toBe(buffer);
      });

      it('should work with other operations', () => {
        buffer.clear().write('After clear');
        const output = buffer.toString();
        expect(output).toContain(CLEAR_SCREEN);
        expect(output).toContain('After clear');
      });
    });

    describe('move', () => {
      it('should add cursor move code', () => {
        buffer.move(10, 5);
        expect(buffer.toString()).toContain('\x1b[');
      });

      it('should return this for chaining', () => {
        const result = buffer.move(1, 1);
        expect(result).toBe(buffer);
      });

      it('should handle multiple moves', () => {
        buffer.move(1, 1).move(10, 10).move(20, 20);
        expect(buffer.toString().length).toBeGreaterThan(0);
      });
    });

    describe('colors', () => {
      it('should add color code', () => {
        buffer.colors(7, 0);
        expect(buffer.toString()).toContain('\x1b[');
      });

      it('should return this for chaining', () => {
        const result = buffer.colors(7, 0);
        expect(result).toBe(buffer);
      });

      it('should handle multiple color changes', () => {
        buffer.colors(1, 0).colors(2, 0).colors(3, 0);
        expect(buffer.toString().length).toBeGreaterThan(0);
      });
    });

    describe('flush', () => {
      it('should emit buffer to socket', () => {
        buffer.write('test data');
        buffer.flush();

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
        expect(emittedEvents[0].event).toBe('ansi-output');
        expect(emittedEvents[0].data).toContain('test data');
      });

      it('should clear buffer after flush', () => {
        buffer.write('test');
        buffer.flush();

        expect(buffer.toString()).toBe('');
      });

      it('should hide cursor by default', () => {
        buffer.write('test');
        buffer.flush();

        const output = emittedEvents[0].data;
        expect(output).toContain(HIDE_CURSOR);
        expect(output).toContain(SHOW_CURSOR);
      });

      it('should not hide cursor when hideCursor is false', () => {
        buffer.write('test');
        buffer.flush({ hideCursor: false });

        const output = emittedEvents[0].data;
        expect(output).not.toContain(HIDE_CURSOR);
        expect(output).not.toContain(SHOW_CURSOR);
      });

      it('should use double buffering', () => {
        buffer.write('a').write('b').write('c');
        buffer.flush();

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      });

      it('should handle empty buffer', () => {
        buffer.flush();

        expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      });

      it('should allow multiple flushes', () => {
        buffer.write('first');
        buffer.flush();

        buffer.write('second');
        buffer.flush();

        expect(mockSocket.emit).toHaveBeenCalledTimes(2);
        expect(emittedEvents[0].data).toContain('first');
        expect(emittedEvents[1].data).toContain('second');
      });
    });

    describe('reset', () => {
      it('should clear buffer without flushing', () => {
        buffer.write('test data');
        buffer.reset();

        expect(buffer.toString()).toBe('');
        expect(mockSocket.emit).not.toHaveBeenCalled();
      });

      it('should return this for chaining', () => {
        const result = buffer.reset();
        expect(result).toBe(buffer);
      });

      it('should allow writes after reset', () => {
        buffer.write('first');
        buffer.reset();
        buffer.write('second');

        expect(buffer.toString()).toBe('second');
      });
    });

    describe('toString', () => {
      it('should return empty string for new buffer', () => {
        expect(buffer.toString()).toBe('');
      });

      it('should return current buffer contents', () => {
        buffer.write('test');
        expect(buffer.toString()).toBe('test');
      });

      it('should not modify buffer', () => {
        buffer.write('test');
        buffer.toString();
        expect(buffer.toString()).toBe('test');
      });
    });

    describe('method chaining', () => {
      it('should support full chaining workflow', () => {
        const result = buffer
          .clear()
          .move(1, 1)
          .colors(7, 0)
          .write('Header')
          .move(1, 2)
          .writeAt(10, 10, 'Content', 2, 0)
          .write('Footer');

        expect(result).toBe(buffer);
        const output = buffer.toString();
        expect(output).toContain('Header');
        expect(output).toContain('Content');
        expect(output).toContain('Footer');
      });

      it('should support reset and continue', () => {
        buffer
          .write('discard')
          .reset()
          .write('keep');

        expect(buffer.toString()).toBe('keep');
      });
    });
  });

  describe('createScreenBuffer', () => {
    it('should create ScreenBuffer instance', () => {
      const buffer = createScreenBuffer(mockSocket);
      expect(buffer).toBeInstanceOf(ScreenBuffer);
    });

    it('should pass socket to buffer', () => {
      const buffer = createScreenBuffer(mockSocket);
      buffer.write('test').flush();

      expect(mockSocket.emit).toHaveBeenCalled();
    });

    it('should create independent buffers', () => {
      const buffer1 = createScreenBuffer(mockSocket);
      const buffer2 = createScreenBuffer(mockSocket);

      buffer1.write('a');
      buffer2.write('b');

      expect(buffer1.toString()).toBe('a');
      expect(buffer2.toString()).toBe('b');
    });
  });

  describe('integration tests', () => {
    it('should handle complete screen redraw workflow', () => {
      const buffer = createScreenBuffer(mockSocket);

      buffer
        .clear()
        .move(1, 1)
        .colors(7, 1)
        .write('Title Bar')
        .move(1, 3)
        .colors(7, 0)
        .writeAt(5, 5, 'Content Line 1')
        .writeAt(5, 6, 'Content Line 2')
        .move(1, 24)
        .colors(0, 7)
        .write('Status Bar')
        .flush();

      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
      const output = emittedEvents[0].data;
      expect(output).toContain('Title Bar');
      expect(output).toContain('Content Line 1');
      expect(output).toContain('Status Bar');
      expect(output).toContain(HIDE_CURSOR);
      expect(output).toContain(SHOW_CURSOR);
    });

    it('should handle progressive rendering', () => {
      const buffer = createScreenBuffer(mockSocket);

      // Draw header
      buffer.writeAt(1, 1, 'Header').flush();
      expect(mockSocket.emit).toHaveBeenCalledTimes(1);

      // Draw content
      buffer.writeAt(1, 5, 'Content').flush();
      expect(mockSocket.emit).toHaveBeenCalledTimes(2);

      // Draw footer
      buffer.writeAt(1, 24, 'Footer').flush();
      expect(mockSocket.emit).toHaveBeenCalledTimes(3);
    });

    it('should handle array emission with cursor hiding', () => {
      const lines = ['Line 1', 'Line 2', 'Line 3'];

      // Without double buffering - should emit hide, lines, show
      emitAnsi(mockSocket, lines, { hideCursor: true, doubleBuffer: false });
      expect(mockSocket.emit).toHaveBeenCalledTimes(5);

      mockSocket.emit.mockClear();
      emittedEvents = [];

      // With double buffering - should emit single combined output
      emitAnsi(mockSocket, lines, { hideCursor: true, doubleBuffer: true });
      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    });

    it('should handle complex ANSI sequences', () => {
      const buffer = createScreenBuffer(mockSocket);

      buffer
        .write(CLEAR_SCREEN)
        .write(moveCursor(1, 1))
        .write(setColors(7, 0))
        .write('Explicit ANSI')
        .writeAt(1, 2, 'Helper method', 2, 0)
        .flush();

      const output = emittedEvents[0].data;
      expect(output).toContain('Explicit ANSI');
      expect(output).toContain('Helper method');
    });

    it('should handle buffer reuse', () => {
      const buffer = createScreenBuffer(mockSocket);

      // First screen
      buffer.writeAt(1, 1, 'Screen 1').flush();
      expect(emittedEvents[0].data).toContain('Screen 1');

      // Second screen
      buffer.writeAt(1, 1, 'Screen 2').flush();
      expect(emittedEvents[1].data).toContain('Screen 2');
      expect(emittedEvents[1].data).not.toContain('Screen 1');
    });

    it('should handle empty emissions', () => {
      emitAnsi(mockSocket, '');
      emitAnsi(mockSocket, []);

      const buffer = createScreenBuffer(mockSocket);
      buffer.flush();

      expect(mockSocket.emit).toHaveBeenCalled();
    });
  });
});
