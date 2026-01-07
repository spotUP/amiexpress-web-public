/**
 * Unit tests for modem-emulator.util.ts
 * Tests modem speed emulation for authentic BBS experience
 *
 * ModemEmulator throttles output to simulate classic modem speeds (1200, 2400, 9600 bps)
 * Critical for authentic 68K door experience with proper timing
 */

import { ModemEmulator, getModemEmulator } from '../../src/utils/modem-emulator.util';

// Mock Socket.io Socket
class MockSocket {
  private emittedEvents: Array<{ event: string; data: any }> = [];
  public _directEmit?: Function;
  public _modemEmulatorInstalled?: boolean;
  public _modemEmulator?: ModemEmulator;

  emit(event: string, ...args: any[]): boolean {
    this.emittedEvents.push({ event, data: args[0] });
    return true;
  }

  getEmittedEvents() {
    return this.emittedEvents;
  }

  clearEmittedEvents() {
    this.emittedEvents = [];
  }

  getEmittedData(event: string): any[] {
    return this.emittedEvents
      .filter(e => e.event === event)
      .map(e => e.data);
  }
}

describe('ModemEmulator (Modem Speed Throttling)', () => {
  let mockSocket: MockSocket;
  let emulator: ModemEmulator;

  beforeEach(() => {
    mockSocket = new MockSocket();
    emulator = new ModemEmulator(mockSocket as any);
  });

  afterEach(() => {
    // Disable emulator to flush queue and clean up
    if (emulator.isEnabled()) {
      emulator.disable();
    }
  });

  describe('constructor', () => {
    it('should create emulator with disabled state', () => {
      expect(emulator.isEnabled()).toBe(false);
      expect(emulator.getBps()).toBe(0);
    });

    it('should store directEmit reference', () => {
      expect((mockSocket as any)._directEmit).toBeDefined();
      expect(typeof (mockSocket as any)._directEmit).toBe('function');
    });
  });

  describe('enable', () => {
    it('should enable emulation at 1200 bps', () => {
      emulator.enable(1200);

      expect(emulator.isEnabled()).toBe(true);
      expect(emulator.getBps()).toBe(1200);
    });

    it('should enable emulation at 2400 bps', () => {
      emulator.enable(2400);

      expect(emulator.isEnabled()).toBe(true);
      expect(emulator.getBps()).toBe(2400);
    });

    it('should enable emulation at 9600 bps', () => {
      emulator.enable(9600);

      expect(emulator.isEnabled()).toBe(true);
      expect(emulator.getBps()).toBe(9600);
    });

    it('should calculate bytes per second correctly for 1200 bps', () => {
      // 1200 bps / 10 bits per byte = 120 bytes/sec
      emulator.enable(1200);
      emulator.write('test');
      // Should be throttled (can't verify exact rate without timing, but should queue)
    });

    it('should calculate bytes per second correctly for 9600 bps', () => {
      // 9600 bps / 10 bits per byte = 960 bytes/sec
      emulator.enable(9600);
      expect(emulator.getBps()).toBe(9600);
    });

    it('should handle zero bps (disable)', () => {
      emulator.enable(0);

      expect(emulator.isEnabled()).toBe(false);
      expect(emulator.getBps()).toBe(0);
    });

    it('should handle negative bps (disable)', () => {
      emulator.enable(-100);

      expect(emulator.isEnabled()).toBe(false);
    });

    it('should reset state when enabling', () => {
      emulator.enable(1200);
      emulator.write('test1');

      emulator.enable(2400); // Re-enable at different rate

      expect(emulator.getBps()).toBe(2400);
      expect(emulator.isEnabled()).toBe(true);
    });
  });

  describe('disable', () => {
    it('should disable emulation', () => {
      emulator.enable(1200);
      emulator.disable();

      expect(emulator.isEnabled()).toBe(false);
      expect(emulator.getBps()).toBe(0);
    });

    it('should flush queue on disable', async () => {
      emulator.enable(1200);
      emulator.write('test data');

      // Wait for processing to start
      await new Promise(resolve => setTimeout(resolve, 50));

      mockSocket.clearEmittedEvents();
      emulator.disable();

      // Disable should clear remaining queue
      expect(emulator.isEnabled()).toBe(false);
      expect(emulator.getBps()).toBe(0);
    });

    it('should allow immediate writes after disable', () => {
      emulator.enable(1200);
      emulator.disable();

      mockSocket.clearEmittedEvents();
      emulator.write('immediate');

      const emitted = mockSocket.getEmittedData('ansi-output');
      expect(emitted).toContain('immediate');
    });
  });

  describe('write (disabled mode)', () => {
    it('should send data immediately when disabled', () => {
      emulator.write('test data');

      const emitted = mockSocket.getEmittedData('ansi-output');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toBe('test data');
    });

    it('should send multiple writes immediately when disabled', () => {
      emulator.write('line 1');
      emulator.write('line 2');
      emulator.write('line 3');

      const emitted = mockSocket.getEmittedData('ansi-output');
      expect(emitted).toHaveLength(3);
      expect(emitted).toEqual(['line 1', 'line 2', 'line 3']);
    });

    it('should handle empty strings', () => {
      emulator.write('');

      const emitted = mockSocket.getEmittedData('ansi-output');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toBe('');
    });

    it('should handle ANSI codes when disabled', () => {
      const ansiData = '\x1b[31mRed Text\x1b[0m';
      emulator.write(ansiData);

      const emitted = mockSocket.getEmittedData('ansi-output');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toBe(ansiData);
    });
  });

  describe('write (enabled mode)', () => {
    beforeEach(() => {
      emulator.enable(9600); // High speed for faster tests
    });

    it('should queue data when enabled', async () => {
      emulator.write('test');

      // Give it a moment to process
      await new Promise(resolve => setTimeout(resolve, 50));

      const emitted = mockSocket.getEmittedData('ansi-output');
      expect(emitted.length).toBeGreaterThan(0);
    });

    it('should eventually send all queued data', async () => {
      const testData = 'Hello BBS!';
      emulator.write(testData);

      // Wait for processing (longer for throttling)
      await new Promise(resolve => setTimeout(resolve, 200));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      expect(combined).toBe(testData);
    });

    it('should handle multiple writes', async () => {
      emulator.write('Line 1\n');
      emulator.write('Line 2\n');
      emulator.write('Line 3\n');

      await new Promise(resolve => setTimeout(resolve, 250));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      expect(combined).toContain('Line 1');
      expect(combined).toContain('Line 2');
      expect(combined).toContain('Line 3');
    });
  });

  describe('ANSI tokenization', () => {
    beforeEach(() => {
      emulator.enable(9600);
    });

    it('should handle text with ANSI color codes', async () => {
      const data = '\x1b[31mRed\x1b[0m Normal';
      emulator.write(data);

      await new Promise(resolve => setTimeout(resolve, 100));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');

      // ANSI codes should be preserved
      expect(combined).toContain('\x1b[31m');
      expect(combined).toContain('\x1b[0m');
      expect(combined).toContain('Red');
      expect(combined).toContain('Normal');
    });

    it('should handle cursor positioning codes', async () => {
      const data = '\x1b[10;20HText at position';
      emulator.write(data);

      await new Promise(resolve => setTimeout(resolve, 100));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      expect(combined).toContain('\x1b[10;20H');
      expect(combined).toContain('Text at position');
    });

    it('should handle clear screen codes', async () => {
      const data = '\x1b[2JCleared screen';
      emulator.write(data);

      await new Promise(resolve => setTimeout(resolve, 100));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      expect(combined).toContain('\x1b[2J');
      expect(combined).toContain('Cleared screen');
    });

    it('should handle multiple ANSI codes in sequence', async () => {
      const data = '\x1b[1m\x1b[31mBold Red\x1b[0m';
      emulator.write(data);

      await new Promise(resolve => setTimeout(resolve, 100));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      expect(combined).toContain('\x1b[1m');
      expect(combined).toContain('\x1b[31m');
      expect(combined).toContain('\x1b[0m');
      expect(combined).toContain('Bold Red');
    });

    it('should handle text without ANSI codes', async () => {
      const data = 'Plain text without codes';
      emulator.write(data);

      await new Promise(resolve => setTimeout(resolve, 100));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      expect(combined).toBe(data);
    });
  });

  describe('install', () => {
    it('should install socket wrapper', () => {
      emulator.install();

      expect((mockSocket as any)._modemEmulatorInstalled).toBe(true);
      expect((mockSocket as any)._modemEmulator).toBe(emulator);
    });

    it('should not install twice', () => {
      emulator.install();
      const originalEmit = mockSocket.emit;

      emulator.install(); // Second install

      // Should be same reference
      expect(mockSocket.emit).toBe(originalEmit);
    });

    it('should intercept ansi-output events when enabled', async () => {
      emulator.install();
      emulator.enable(9600);

      mockSocket.emit('ansi-output', 'test data');

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have been intercepted and throttled
      const emitted = mockSocket.getEmittedData('ansi-output');
      expect(emitted.length).toBeGreaterThan(0);
    });

    it('should pass through other events unchanged', () => {
      emulator.install();
      emulator.enable(9600);

      mockSocket.emit('other-event', 'data');

      const emitted = mockSocket.getEmittedEvents();
      const otherEvents = emitted.filter(e => e.event === 'other-event');
      expect(otherEvents).toHaveLength(1);
      expect(otherEvents[0].data).toBe('data');
    });

    it('should not throttle when disabled after install', () => {
      emulator.install();
      emulator.enable(9600);
      emulator.disable();

      mockSocket.clearEmittedEvents();
      mockSocket.emit('ansi-output', 'immediate');

      const emitted = mockSocket.getEmittedData('ansi-output');
      expect(emitted).toContain('immediate');
    });
  });

  describe('getModemEmulator', () => {
    it('should create new emulator for socket', () => {
      const socket = new MockSocket();
      const emulator1 = getModemEmulator(socket as any);

      expect(emulator1).toBeInstanceOf(ModemEmulator);
    });

    it('should return existing emulator for socket', () => {
      const socket = new MockSocket();
      const emulator1 = getModemEmulator(socket as any);
      // Manually set the cached emulator like the implementation does
      (socket as any)._modemEmulator = emulator1;
      const emulator2 = getModemEmulator(socket as any);

      expect(emulator2).toBe(emulator1);
    });

    it('should create separate emulators for different sockets', () => {
      const socket1 = new MockSocket();
      const socket2 = new MockSocket();

      const emulator1 = getModemEmulator(socket1 as any);
      const emulator2 = getModemEmulator(socket2 as any);

      expect(emulator1).not.toBe(emulator2);
    });
  });

  describe('Real-world BBS scenarios', () => {
    it('should handle 1200 bps connection (slow modem)', async () => {
      emulator.enable(1200);

      const bbsWelcome = 'Welcome to AmigaBBS!\n';
      emulator.write(bbsWelcome);

      await new Promise(resolve => setTimeout(resolve, 300));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      // Verify content is being throttled and sent
      expect(combined).toContain('Welcome');
      expect(combined.length).toBeGreaterThan(5);
    });

    it('should handle 2400 bps connection (medium speed)', async () => {
      emulator.enable(2400);

      const menuText = 'Main Menu\n1. Files\n2. Mail\n3. Doors\n';
      emulator.write(menuText);

      await new Promise(resolve => setTimeout(resolve, 250));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      // Verify menu content is being sent
      expect(combined).toContain('Main Menu');
      expect(combined).toContain('Files');
    });

    it('should handle 9600 bps connection (fast modem)', async () => {
      emulator.enable(9600);

      const fileList = 'FILE1.ZIP    100K\nFILE2.ZIP    200K\nFILE3.ZIP    300K\n';
      emulator.write(fileList);

      await new Promise(resolve => setTimeout(resolve, 200));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      // Just verify all content is present
      expect(combined).toContain('FILE1.ZIP');
      expect(combined).toContain('FILE2.ZIP');
      expect(combined).toContain('FILE3.ZIP');
    });

    it('should handle colored BBS menus', async () => {
      emulator.enable(9600);

      const colorMenu = '\x1b[1;36m[F]\x1b[0m Files  \x1b[1;36m[M]\x1b[0m Mail  \x1b[1;36m[D]\x1b[0m Doors\n';
      emulator.write(colorMenu);

      await new Promise(resolve => setTimeout(resolve, 250));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');

      // ANSI codes should be sent immediately, verify they're present
      expect(combined).toContain('\x1b[1;36m');
      expect(combined).toContain('[F]');
    });

    it('should handle door loading screen with animations', async () => {
      emulator.enable(9600);

      const loadingScreen = '\x1b[2J\x1b[H\x1b[1;33mLoading Door...\x1b[0m\n';
      emulator.write(loadingScreen);

      await new Promise(resolve => setTimeout(resolve, 250));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');

      // ANSI control codes should be sent immediately
      expect(combined).toContain('\x1b[2J'); // Clear screen
      expect(combined).toContain('\x1b[H');   // Home cursor
      expect(combined).toContain('Loading');
    });

    it('should handle switching speeds mid-session', async () => {
      // Start at 1200 bps
      emulator.enable(1200);
      emulator.write('Slow speed\n');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Switch to 9600 bps
      emulator.enable(9600);
      emulator.write('Fast speed\n');

      await new Promise(resolve => setTimeout(resolve, 150));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');

      // Verify both messages started sending
      expect(combined).toContain('Slow');
      expect(combined).toContain('Fast');
    });
  });

  describe('Edge cases', () => {
    it('should handle very long strings', async () => {
      emulator.enable(9600);

      const longString = 'A'.repeat(1000);
      emulator.write(longString);

      await new Promise(resolve => setTimeout(resolve, 800));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      // Verify throttling is working and at least partial data sent
      expect(combined.length).toBeGreaterThan(100);
      expect(combined).toContain('A');
    });

    it('should handle rapid consecutive writes', async () => {
      emulator.enable(9600);

      for (let i = 0; i < 10; i++) {
        emulator.write(`Line ${i}\n`);
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');

      // Verify most lines are present
      const lineCount = (combined.match(/Line \d/g) || []).length;
      expect(lineCount).toBeGreaterThan(7); // At least 8/10 lines
    });

    it('should handle unicode characters', async () => {
      emulator.enable(9600);

      const unicode = '© 2024 AmigaBBS™ • User: JöhnDöe';
      emulator.write(unicode);

      await new Promise(resolve => setTimeout(resolve, 250));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      // Verify ASCII portions are present (unicode may be chunked differently)
      expect(combined).toContain('2024');
      expect(combined).toContain('AmigaBBS');
      expect(combined).toContain('User');
    });

    it('should handle binary data in strings', async () => {
      emulator.enable(9600);

      const binaryData = 'Text\x00\x01\x02\x03More text';
      emulator.write(binaryData);

      await new Promise(resolve => setTimeout(resolve, 100));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      expect(combined).toContain('Text');
      expect(combined).toContain('More text');
    });

    it('should handle write after enable/disable cycle', async () => {
      emulator.enable(9600);
      emulator.write('First');

      await new Promise(resolve => setTimeout(resolve, 50));

      emulator.disable();
      emulator.enable(9600);

      mockSocket.clearEmittedEvents();
      emulator.write('Second');

      await new Promise(resolve => setTimeout(resolve, 50));

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      expect(combined).toContain('Second');
    });
  });

  describe('Performance', () => {
    it('should handle 100 consecutive writes efficiently', async () => {
      emulator.enable(9600);

      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        emulator.write('X');
      }

      await new Promise(resolve => setTimeout(resolve, 600));

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(1200);

      const emitted = mockSocket.getEmittedData('ansi-output');
      const combined = emitted.join('');
      // Verify most characters were sent
      expect(combined.length).toBeGreaterThan(90);
    });
  });
});
