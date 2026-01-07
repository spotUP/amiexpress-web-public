/**
 * Time Tracking Utility Unit Tests
 *
 * Tests session time tracking, daily time limit enforcement, and time calculations.
 * Based on express.e:525-566 time tracking logic.
 */

import {
  updateTimeUsed,
  checkTimeUsed,
  getTimeRemainingMinutes,
} from '../../src/utils/time-tracking.util';
import { BBSSession } from '../../src/index';

describe('Time Tracking Utility Functions', () => {
  let mockSocket: any;
  let mockSession: BBSSession;
  let emittedEvents: Array<{ event: string; data: any }>;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    // Mock socket
    emittedEvents = [];
    mockSocket = {
      emit: jest.fn((event: string, data: any) => {
        emittedEvents.push({ event, data });
      }),
    };

    // Mock session with user
    mockSession = {
      user: {
        username: 'testuser',
        secLevel: 10,
        timeLimit: 3600, // 60 minutes in seconds
        timeTotal: 3600,
        timeUsed: 0,
      },
      logonTime: 0,
      lastTimeUpdate: 0,
    } as any;

    // Save original Date.now
    originalDateNow = Date.now;
  });

  afterEach(() => {
    // Restore Date.now
    Date.now = originalDateNow;
  });

  describe('updateTimeUsed', () => {
    it('should initialize logonTime and lastTimeUpdate on first call', () => {
      const mockNow = 1640000000000; // Fixed timestamp
      Date.now = jest.fn(() => mockNow);

      updateTimeUsed(mockSocket, mockSession);

      expect(mockSession.logonTime).toBe(Math.floor(mockNow / 1000));
      expect(mockSession.lastTimeUpdate).toBe(Math.floor(mockNow / 1000));
    });

    it('should initialize timeTotal from timeLimit when timeTotal is 0', () => {
      mockSession.user!.timeTotal = 0;
      mockSession.user!.timeLimit = 7200;

      updateTimeUsed(mockSocket, mockSession);

      expect(mockSession.user!.timeTotal).toBe(7200);
    });

    it('should initialize timeTotal when timeTotal < timeUsed', () => {
      mockSession.user!.timeTotal = 100;
      mockSession.user!.timeUsed = 200;
      mockSession.user!.timeLimit = 3600;

      updateTimeUsed(mockSocket, mockSession);

      expect(mockSession.user!.timeTotal).toBe(3600);
    });

    it('should update timeUsed based on elapsed time', () => {
      const startTime = 1640000000000;
      const laterTime = startTime + 300000; // 300 seconds later

      Date.now = jest.fn(() => startTime);
      updateTimeUsed(mockSocket, mockSession);

      Date.now = jest.fn(() => laterTime);
      updateTimeUsed(mockSocket, mockSession);

      expect(mockSession.user!.timeUsed).toBe(300);
      expect(mockSession.lastTimeUpdate).toBe(Math.floor(laterTime / 1000));
    });

    it('should handle multiple updates accumulating time', () => {
      let currentTime = 1640000000000;
      Date.now = jest.fn(() => currentTime);

      // First update - initialize
      updateTimeUsed(mockSocket, mockSession);
      expect(mockSession.user!.timeUsed).toBe(0);

      // Second update - 60 seconds elapsed
      currentTime += 60000;
      Date.now = jest.fn(() => currentTime);
      updateTimeUsed(mockSocket, mockSession);
      expect(mockSession.user!.timeUsed).toBe(60);

      // Third update - another 120 seconds elapsed
      currentTime += 120000;
      Date.now = jest.fn(() => currentTime);
      updateTimeUsed(mockSocket, mockSession);
      expect(mockSession.user!.timeUsed).toBe(180);
    });

    it('should reset time on new day', () => {
      // Day 1
      const day1 = new Date('2024-01-01T10:00:00Z').getTime();
      Date.now = jest.fn(() => day1);
      updateTimeUsed(mockSocket, mockSession);

      // Use 1800 seconds (30 minutes)
      const day1Later = day1 + 1800000;
      Date.now = jest.fn(() => day1Later);
      updateTimeUsed(mockSocket, mockSession);
      expect(mockSession.user!.timeUsed).toBe(1800);

      // Day 2 - new day should reset
      const day2 = new Date('2024-01-02T10:00:00Z').getTime();
      Date.now = jest.fn(() => day2);
      updateTimeUsed(mockSocket, mockSession);

      expect(mockSession.user!.timeUsed).toBe(0);
      expect(mockSession.user!.timeTotal).toBe(mockSession.user!.timeLimit);
      expect(mockSession.logonTime).toBe(Math.floor(day2 / 1000));
    });

    it('should handle same day correctly', () => {
      // 10:00 AM
      const morning = new Date('2024-01-01T10:00:00Z').getTime();
      Date.now = jest.fn(() => morning);
      updateTimeUsed(mockSocket, mockSession);

      // 11:00 AM same day - should NOT reset
      const laterMorning = new Date('2024-01-01T11:00:00Z').getTime();
      Date.now = jest.fn(() => laterMorning);
      updateTimeUsed(mockSocket, mockSession);

      expect(mockSession.user!.timeUsed).toBe(3600); // 1 hour elapsed
    });

    it('should handle no elapsed time gracefully', () => {
      const startTime = 1640000000000;
      Date.now = jest.fn(() => startTime);

      updateTimeUsed(mockSocket, mockSession);
      const initialTimeUsed = mockSession.user!.timeUsed;

      // Call again with same time
      updateTimeUsed(mockSocket, mockSession);

      expect(mockSession.user!.timeUsed).toBe(initialTimeUsed);
    });

    it('should handle session without user', () => {
      mockSession.user = null as any;

      expect(() => updateTimeUsed(mockSocket, mockSession)).not.toThrow();
    });

    it('should preserve timeTotal if already set correctly', () => {
      mockSession.user!.timeTotal = 5000;
      mockSession.user!.timeUsed = 1000;
      mockSession.user!.timeLimit = 3600;

      updateTimeUsed(mockSocket, mockSession);

      // timeTotal should remain 5000 since it's >= timeUsed
      expect(mockSession.user!.timeTotal).toBe(5000);
    });
  });

  describe('checkTimeUsed', () => {
    it('should return false when time limit not exceeded', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 1000;

      const result = checkTimeUsed(mockSocket, mockSession);

      expect(result).toBe(false);
      expect(emittedEvents).toHaveLength(0);
    });

    it('should return false when time remaining is exactly 0', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 3600;

      const result = checkTimeUsed(mockSocket, mockSession);

      expect(result).toBe(false);
    });

    it('should return true when time limit exceeded', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 3601;

      const result = checkTimeUsed(mockSocket, mockSession);

      expect(result).toBe(true);
    });

    it('should emit time exceeded message when limit exceeded', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 4000;

      checkTimeUsed(mockSocket, mockSession);

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('exceeded your time limit'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Goodbye'))).toBe(true);
    });

    it('should emit two messages when time exceeded', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 3700;

      checkTimeUsed(mockSocket, mockSession);

      const ansiOutputs = emittedEvents.filter(e => e.event === 'ansi-output');
      expect(ansiOutputs.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle session without user', () => {
      mockSession.user = null as any;

      const result = checkTimeUsed(mockSocket, mockSession);

      expect(result).toBe(false);
    });

    it('should handle negative time remaining correctly', () => {
      mockSession.user!.timeTotal = 1000;
      mockSession.user!.timeUsed = 2000;

      const result = checkTimeUsed(mockSocket, mockSession);

      expect(result).toBe(true);
    });

    it('should handle large time differences', () => {
      mockSession.user!.timeTotal = 100;
      mockSession.user!.timeUsed = 100000;

      const result = checkTimeUsed(mockSocket, mockSession);

      expect(result).toBe(true);
    });
  });

  describe('getTimeRemainingMinutes', () => {
    it('should calculate time remaining in minutes', () => {
      mockSession.user!.timeTotal = 3600; // 60 minutes
      mockSession.user!.timeUsed = 0;

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(60);
    });

    it('should handle partial minutes correctly', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 1800; // 30 minutes used

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(30);
    });

    it('should floor fractional minutes', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 1890; // 28.5 minutes remaining

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(28); // Floor to 28
    });

    it('should return 0 when time exactly used up', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 3600;

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(0);
    });

    it('should return negative when time exceeded', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 4200; // 10 minutes over

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(-10);
    });

    it('should handle zero time total', () => {
      mockSession.user!.timeTotal = 0;
      mockSession.user!.timeUsed = 0;

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(0);
    });

    it('should handle large time values', () => {
      mockSession.user!.timeTotal = 86400; // 24 hours
      mockSession.user!.timeUsed = 43200; // 12 hours used

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(720); // 12 hours remaining
    });

    it('should return default 60 when no user', () => {
      mockSession.user = null as any;

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(60);
    });

    it('should handle 1 second remaining correctly', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 3599;

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(0); // Floor(1/60) = 0
    });

    it('should handle 59 seconds remaining correctly', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 3541;

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(0); // Floor(59/60) = 0
    });

    it('should handle 61 seconds remaining correctly', () => {
      mockSession.user!.timeTotal = 3600;
      mockSession.user!.timeUsed = 3539;

      const result = getTimeRemainingMinutes(mockSession);

      expect(result).toBe(1); // Floor(61/60) = 1
    });
  });

  describe('integration tests', () => {
    it('should track time correctly through full session lifecycle', () => {
      let currentTime = new Date('2024-01-01T10:00:00Z').getTime();
      Date.now = jest.fn(() => currentTime);

      // Initialize session
      updateTimeUsed(mockSocket, mockSession);
      expect(getTimeRemainingMinutes(mockSession)).toBe(60);
      expect(checkTimeUsed(mockSocket, mockSession)).toBe(false);

      // 15 minutes later
      currentTime += 900000;
      Date.now = jest.fn(() => currentTime);
      updateTimeUsed(mockSocket, mockSession);
      expect(getTimeRemainingMinutes(mockSession)).toBe(45);
      expect(checkTimeUsed(mockSocket, mockSession)).toBe(false);

      // Another 30 minutes
      currentTime += 1800000;
      Date.now = jest.fn(() => currentTime);
      updateTimeUsed(mockSocket, mockSession);
      expect(getTimeRemainingMinutes(mockSession)).toBe(15);
      expect(checkTimeUsed(mockSocket, mockSession)).toBe(false);

      // Final 15 minutes
      currentTime += 900000;
      Date.now = jest.fn(() => currentTime);
      updateTimeUsed(mockSocket, mockSession);
      expect(getTimeRemainingMinutes(mockSession)).toBe(0);
      expect(checkTimeUsed(mockSocket, mockSession)).toBe(false);

      // 1 second over
      currentTime += 1000;
      Date.now = jest.fn(() => currentTime);
      updateTimeUsed(mockSocket, mockSession);
      expect(getTimeRemainingMinutes(mockSession)).toBe(-1); // Floor(-1/60) = -1
      expect(checkTimeUsed(mockSocket, mockSession)).toBe(true);
    });

    it('should handle day boundary correctly', () => {
      // Day 1 - noon local time
      let currentTime = new Date('2024-01-01T12:00:00').getTime();
      Date.now = jest.fn(() => currentTime);
      updateTimeUsed(mockSocket, mockSession);
      expect(mockSession.user!.timeUsed).toBe(0);

      // Use 30 minutes, still Day 1
      currentTime += 1800000; // 30 minutes
      Date.now = jest.fn(() => currentTime);
      updateTimeUsed(mockSocket, mockSession);
      expect(mockSession.user!.timeUsed).toBe(1800);

      // Day 2 - noon local time next day
      currentTime = new Date('2024-01-02T12:00:00').getTime();
      Date.now = jest.fn(() => currentTime);
      updateTimeUsed(mockSocket, mockSession);

      // Should have reset to 0 on new day
      expect(mockSession.user!.timeUsed).toBe(0);
      expect(getTimeRemainingMinutes(mockSession)).toBe(60);
    });

    it('should handle continuous updates correctly', () => {
      let currentTime = 1640000000000;
      Date.now = jest.fn(() => currentTime);

      updateTimeUsed(mockSocket, mockSession);

      // Simulate 10 updates of 6 minutes each
      for (let i = 0; i < 10; i++) {
        currentTime += 360000; // 6 minutes
        Date.now = jest.fn(() => currentTime);
        updateTimeUsed(mockSocket, mockSession);
        expect(checkTimeUsed(mockSocket, mockSession)).toBe(false);
      }

      expect(mockSession.user!.timeUsed).toBe(3600);
      expect(getTimeRemainingMinutes(mockSession)).toBe(0);
    });
  });
});
