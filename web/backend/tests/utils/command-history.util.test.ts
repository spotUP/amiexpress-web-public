/**
 * Command History Utility Unit Tests
 *
 * Tests command history management with circular buffer, navigation,
 * and database persistence. Based on express.e:2158-2168, 2669-2713.
 */

import {
  addToHistory,
  getPreviousCommand,
  getNextCommand,
  clearHistory,
  loadHistory,
  saveHistory,
} from '../../src/utils/command-history.util';
import { BBSSession } from '../../src/index';

// Mock the dependency injection module
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getDatabase: jest.fn(),
}));

import { getDatabase } from '../../src/handlers/command-handler/dependency-injection';

describe('Command History Utility Functions', () => {
  let mockSession: BBSSession;
  let mockDb: any;

  beforeEach(() => {
    // Reset session
    mockSession = {
      commandHistory: [],
      historyIndex: 0,
      historyCycle: 0,
      user: { id: 1, username: 'testuser' },
    } as any;

    // Reset database mock
    mockDb = {
      query: jest.fn(),
      run: jest.fn(),
    };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);

    // Suppress console logs during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('addToHistory', () => {
    it('should add command to empty history', () => {
      addToHistory(mockSession, 'WHO');

      expect(mockSession.commandHistory).toEqual(['WHO']);
      expect(mockSession.historyIndex).toBe(0); // Index of first item
      expect(mockSession.historyCycle).toBe(0);
    });

    it('should not add empty commands', () => {
      addToHistory(mockSession, '');

      expect(mockSession.commandHistory).toEqual([]);
    });

    it('should not add whitespace-only commands', () => {
      addToHistory(mockSession, '   ');

      expect(mockSession.commandHistory).toEqual([]);
    });

    it('should add multiple commands sequentially', () => {
      addToHistory(mockSession, 'WHO');
      addToHistory(mockSession, 'HELP');
      addToHistory(mockSession, 'QUIT');

      expect(mockSession.commandHistory).toEqual(['WHO', 'HELP', 'QUIT']);
      expect(mockSession.historyIndex).toBe(2); // Index of last item
      expect(mockSession.historyCycle).toBe(2);
    });

    it('should handle max history size (20 items)', () => {
      // Add 20 commands
      for (let i = 0; i < 20; i++) {
        addToHistory(mockSession, `CMD${i}`);
      }

      expect(mockSession.commandHistory.length).toBe(20);
      expect(mockSession.commandHistory[0]).toBe('CMD0');
      expect(mockSession.commandHistory[19]).toBe('CMD19');
    });

    it('should use circular buffer when exceeding 20 items', () => {
      // Fill buffer with 20 items
      for (let i = 0; i < 20; i++) {
        addToHistory(mockSession, `CMD${i}`);
      }

      // Add 21st item - replaces last slot first, then wraps
      addToHistory(mockSession, 'CMD20');

      expect(mockSession.commandHistory.length).toBe(20);
      expect(mockSession.commandHistory[19]).toBe('CMD20'); // Replaced CMD19 at last position
      expect(mockSession.commandHistory[0]).toBe('CMD0'); // Not yet replaced
      expect(mockSession.historyIndex).toBe(0); // Wrapped to start
    });

    it('should continue circular replacement correctly', () => {
      // Fill buffer
      for (let i = 0; i < 20; i++) {
        addToHistory(mockSession, `CMD${i}`);
      }

      // Add 5 more items - circular replacement
      // After CMD19, historyIndex=19
      // CMD20 replaces slot 19, wraps to 0
      // CMD21 replaces slot 0, increments to 1
      // CMD22 replaces slot 1, increments to 2
      // CMD23 replaces slot 2, increments to 3
      // CMD24 replaces slot 3, increments to 4
      for (let i = 20; i < 25; i++) {
        addToHistory(mockSession, `CMD${i}`);
      }

      expect(mockSession.commandHistory.length).toBe(20);
      expect(mockSession.commandHistory[19]).toBe('CMD20'); // First replacement
      expect(mockSession.commandHistory[0]).toBe('CMD21');
      expect(mockSession.commandHistory[3]).toBe('CMD24');
      expect(mockSession.commandHistory[4]).toBe('CMD4'); // Not replaced yet
      expect(mockSession.historyIndex).toBe(4);
    });

    it('should handle session without user gracefully', () => {
      mockSession.user = null as any;

      expect(() => addToHistory(mockSession, 'TEST')).not.toThrow();
      expect(mockSession.commandHistory).toEqual(['TEST']);
    });

    it('should trigger save when user exists', async () => {
      mockDb.run.mockResolvedValue({});

      addToHistory(mockSession, 'WHO');

      // Wait for async save to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('getPreviousCommand', () => {
    it('should return null for empty history', () => {
      const result = getPreviousCommand(mockSession);

      expect(result).toBeNull();
    });

    it('should return last command added', () => {
      mockSession.commandHistory = ['WHO', 'HELP', 'QUIT'];
      mockSession.historyCycle = 2; // Last valid index

      const result = getPreviousCommand(mockSession);

      expect(result).toBe('QUIT');
      expect(mockSession.historyCycle).toBe(1);
    });

    it('should navigate backward through history', () => {
      mockSession.commandHistory = ['CMD1', 'CMD2', 'CMD3'];
      mockSession.historyCycle = 2; // Last valid index

      const cmd1 = getPreviousCommand(mockSession);
      expect(cmd1).toBe('CMD3');
      expect(mockSession.historyCycle).toBe(1);

      const cmd2 = getPreviousCommand(mockSession);
      expect(cmd2).toBe('CMD2');
      expect(mockSession.historyCycle).toBe(0);

      const cmd3 = getPreviousCommand(mockSession);
      expect(cmd3).toBe('CMD1');
      expect(mockSession.historyCycle).toBe(2); // Wrapped to end
    });

    it('should wrap to end when reaching beginning', () => {
      mockSession.commandHistory = ['CMD1', 'CMD2', 'CMD3'];
      mockSession.historyCycle = 0;

      const result = getPreviousCommand(mockSession);

      expect(result).toBe('CMD1');
      expect(mockSession.historyCycle).toBe(2); // Wrapped to end
    });

    it('should handle single command history', () => {
      mockSession.commandHistory = ['ONLY'];
      mockSession.historyCycle = 0;

      const result = getPreviousCommand(mockSession);

      expect(result).toBe('ONLY');
      expect(mockSession.historyCycle).toBe(0); // Wraps to 0 (only one item)
    });
  });

  describe('getNextCommand', () => {
    it('should return null for empty history', () => {
      const result = getNextCommand(mockSession);

      expect(result).toBeNull();
    });

    it('should return command at current position', () => {
      mockSession.commandHistory = ['WHO', 'HELP', 'QUIT'];
      mockSession.historyCycle = 0;

      const result = getNextCommand(mockSession);

      expect(result).toBe('WHO');
      expect(mockSession.historyCycle).toBe(1);
    });

    it('should navigate forward through history', () => {
      mockSession.commandHistory = ['CMD1', 'CMD2', 'CMD3'];
      mockSession.historyCycle = 0;

      const cmd1 = getNextCommand(mockSession);
      expect(cmd1).toBe('CMD1');
      expect(mockSession.historyCycle).toBe(1);

      const cmd2 = getNextCommand(mockSession);
      expect(cmd2).toBe('CMD2');
      expect(mockSession.historyCycle).toBe(2);

      const cmd3 = getNextCommand(mockSession);
      expect(cmd3).toBe('CMD3');
      expect(mockSession.historyCycle).toBe(0); // Wrapped
    });

    it('should wrap to beginning when reaching end', () => {
      mockSession.commandHistory = ['CMD1', 'CMD2', 'CMD3'];
      mockSession.historyCycle = 2;

      const result = getNextCommand(mockSession);

      expect(result).toBe('CMD3');
      expect(mockSession.historyCycle).toBe(0); // Wrapped to start
    });

    it('should handle single command history', () => {
      mockSession.commandHistory = ['ONLY'];
      mockSession.historyCycle = 0;

      const result = getNextCommand(mockSession);

      expect(result).toBe('ONLY');
      expect(mockSession.historyCycle).toBe(0); // Wrapped immediately
    });
  });

  describe('clearHistory', () => {
    it('should clear empty history', () => {
      clearHistory(mockSession);

      expect(mockSession.commandHistory).toEqual([]);
      expect(mockSession.historyIndex).toBe(0);
      expect(mockSession.historyCycle).toBe(0);
    });

    it('should clear populated history', () => {
      mockSession.commandHistory = ['WHO', 'HELP', 'QUIT'];
      mockSession.historyIndex = 3;
      mockSession.historyCycle = 2;

      clearHistory(mockSession);

      expect(mockSession.commandHistory).toEqual([]);
      expect(mockSession.historyIndex).toBe(0);
      expect(mockSession.historyCycle).toBe(0);
    });

    it('should clear full history buffer', () => {
      mockSession.commandHistory = new Array(20).fill(0).map((_, i) => `CMD${i}`);
      mockSession.historyIndex = 15;
      mockSession.historyCycle = 10;

      clearHistory(mockSession);

      expect(mockSession.commandHistory).toEqual([]);
      expect(mockSession.historyIndex).toBe(0);
      expect(mockSession.historyCycle).toBe(0);
    });
  });

  describe('loadHistory', () => {
    it('should clear existing history before loading', async () => {
      mockSession.commandHistory = ['OLD1', 'OLD2'];
      mockSession.historyIndex = 2;
      mockSession.historyCycle = 1;

      mockDb.query.mockResolvedValue({ rows: [] });

      await loadHistory(mockSession, 1);

      expect(mockSession.commandHistory).toEqual([]);
      expect(mockSession.historyIndex).toBe(0);
      expect(mockSession.historyCycle).toBe(0);
    });

    it('should load history from database', async () => {
      const commands = ['WHO', 'HELP', 'QUIT'];
      mockDb.query.mockResolvedValue({
        rows: [
          {
            history_num: 2,
            history_cycle: 2,
            commands: JSON.stringify(commands),
          },
        ],
      });

      await loadHistory(mockSession, 1);

      expect(mockSession.commandHistory).toEqual(commands);
      expect(mockSession.historyIndex).toBe(2);
      expect(mockSession.historyCycle).toBe(2);
    });

    it('should handle no history for user', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await loadHistory(mockSession, 1);

      expect(mockSession.commandHistory).toEqual([]);
      expect(mockSession.historyIndex).toBe(0);
      expect(mockSession.historyCycle).toBe(0);
    });

    it('should handle invalid JSON gracefully', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            history_num: 5,
            history_cycle: 3,
            commands: 'INVALID JSON{{{',
          },
        ],
      });

      await loadHistory(mockSession, 1);

      expect(mockSession.commandHistory).toEqual([]);
      expect(mockSession.historyIndex).toBe(0);
      expect(mockSession.historyCycle).toBe(0);
    });

    it('should handle null commands field', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            history_num: 0,
            history_cycle: 0,
            commands: null,
          },
        ],
      });

      await loadHistory(mockSession, 1);

      expect(mockSession.commandHistory).toEqual([]);
    });

    it('should handle database error gracefully', async () => {
      mockDb.query.mockRejectedValue(new Error('Database connection failed'));

      await expect(loadHistory(mockSession, 1)).resolves.not.toThrow();

      expect(mockSession.commandHistory).toEqual([]);
    });

    it('should handle missing database', async () => {
      (getDatabase as jest.Mock).mockReturnValue(null);

      await loadHistory(mockSession, 1);

      expect(mockSession.commandHistory).toEqual([]);
    });

    it('should trim history to max 20 items', async () => {
      const commands = new Array(30).fill(0).map((_, i) => `CMD${i}`);
      mockDb.query.mockResolvedValue({
        rows: [
          {
            history_num: 29,
            history_cycle: 25,
            commands: JSON.stringify(commands),
          },
        ],
      });

      await loadHistory(mockSession, 1);

      expect(mockSession.commandHistory.length).toBe(20);
      expect(mockSession.commandHistory[0]).toBe('CMD10'); // Last 20
      expect(mockSession.commandHistory[19]).toBe('CMD29');
    });

    it('should clamp indices to valid range', async () => {
      const commands = ['CMD1', 'CMD2', 'CMD3'];
      mockDb.query.mockResolvedValue({
        rows: [
          {
            history_num: 100, // Out of bounds
            history_cycle: -5, // Negative
            commands: JSON.stringify(commands),
          },
        ],
      });

      await loadHistory(mockSession, 1);

      expect(mockSession.historyIndex).toBe(2); // Clamped to length-1
      expect(mockSession.historyCycle).toBe(0); // Clamped to 0
    });

    it('should handle non-array commands', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            history_num: 0,
            history_cycle: 0,
            commands: JSON.stringify({ not: 'array' }),
          },
        ],
      });

      await loadHistory(mockSession, 1);

      // Non-array should be ignored, history remains empty
      expect(mockSession.commandHistory).toEqual([]);
    });

    it('should handle empty commands array', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          {
            history_num: 5,
            history_cycle: 3,
            commands: JSON.stringify([]),
          },
        ],
      });

      await loadHistory(mockSession, 1);

      expect(mockSession.commandHistory).toEqual([]);
      expect(mockSession.historyIndex).toBe(0);
      expect(mockSession.historyCycle).toBe(0);
    });

    it('should convert numeric userId to string', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await loadHistory(mockSession, 123);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        ['123']
      );
    });

    it('should handle string userId', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await loadHistory(mockSession, '456');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        ['456']
      );
    });
  });

  describe('saveHistory', () => {
    it('should save history to database', async () => {
      mockSession.commandHistory = ['WHO', 'HELP', 'QUIT'];
      mockSession.historyIndex = 2;
      mockSession.historyCycle = 2;

      mockDb.run.mockResolvedValue({});

      await saveHistory(mockSession, 1);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO command_history'),
        expect.arrayContaining([
          '1',
          2,
          2,
          JSON.stringify(['WHO', 'HELP', 'QUIT']),
          expect.any(Number),
        ])
      );
    });

    it('should save empty history', async () => {
      mockDb.run.mockResolvedValue({});

      await saveHistory(mockSession, 1);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          '1',
          0,
          0,
          '[]',
          expect.any(Number),
        ])
      );
    });

    it('should trim history to 20 items before saving', async () => {
      mockSession.commandHistory = new Array(30).fill(0).map((_, i) => `CMD${i}`);
      mockDb.run.mockResolvedValue({});

      await saveHistory(mockSession, 1);

      const savedCommands = JSON.parse(
        (mockDb.run as jest.Mock).mock.calls[0][1][3]
      );
      expect(savedCommands.length).toBe(20);
      expect(savedCommands[0]).toBe('CMD10'); // Last 20
      expect(savedCommands[19]).toBe('CMD29');
    });

    it('should clamp indices after trimming', async () => {
      mockSession.commandHistory = new Array(30).fill(0).map((_, i) => `CMD${i}`);
      mockSession.historyIndex = 25;
      mockSession.historyCycle = 28;
      mockDb.run.mockResolvedValue({});

      await saveHistory(mockSession, 1);

      expect(mockSession.commandHistory.length).toBe(20);
      expect(mockSession.historyIndex).toBe(19); // Clamped to max
      expect(mockSession.historyCycle).toBe(19); // Clamped to max
    });

    it('should handle database error gracefully', async () => {
      mockSession.commandHistory = ['WHO'];
      mockDb.run.mockRejectedValue(new Error('Database write failed'));

      await expect(saveHistory(mockSession, 1)).resolves.not.toThrow();

      expect(console.error).toHaveBeenCalled();
    });

    it('should handle missing database', async () => {
      (getDatabase as jest.Mock).mockReturnValue(null);
      mockSession.commandHistory = ['WHO'];

      await saveHistory(mockSession, 1);

      // Should not throw
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Database not available')
      );
    });

    it('should convert numeric userId to string', async () => {
      mockSession.commandHistory = ['WHO'];
      mockDb.run.mockResolvedValue({});

      await saveHistory(mockSession, 123);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['123', expect.any(Number), expect.any(Number), expect.any(String), expect.any(Number)])
      );
    });

    it('should handle string userId', async () => {
      mockSession.commandHistory = ['WHO'];
      mockDb.run.mockResolvedValue({});

      await saveHistory(mockSession, '456');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['456', expect.any(Number), expect.any(Number), expect.any(String), expect.any(Number)])
      );
    });

    it('should include timestamp in save', async () => {
      mockSession.commandHistory = ['WHO'];
      const beforeTimestamp = Math.floor(Date.now() / 1000);
      mockDb.run.mockResolvedValue({});

      await saveHistory(mockSession, 1);

      const savedTimestamp = (mockDb.run as jest.Mock).mock.calls[0][1][4];
      expect(savedTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(savedTimestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
    });
  });

  describe('integration tests', () => {
    it('should handle full lifecycle: add, navigate, clear', () => {
      // Add commands
      addToHistory(mockSession, 'WHO');
      addToHistory(mockSession, 'HELP');
      addToHistory(mockSession, 'QUIT');

      expect(mockSession.commandHistory.length).toBe(3);

      // Navigate backward (historyCycle is already at 2 from last add)
      const prev1 = getPreviousCommand(mockSession);
      const prev2 = getPreviousCommand(mockSession);
      expect(prev1).toBe('QUIT');
      expect(prev2).toBe('HELP');

      // Navigate forward
      const next1 = getNextCommand(mockSession);
      expect(next1).toBe('WHO');

      // Clear
      clearHistory(mockSession);
      expect(mockSession.commandHistory).toEqual([]);
    });

    it('should handle full lifecycle with persistence', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      mockDb.run.mockResolvedValue({});

      // Load empty history
      await loadHistory(mockSession, 1);
      expect(mockSession.commandHistory).toEqual([]);

      // Add commands
      addToHistory(mockSession, 'WHO');
      addToHistory(mockSession, 'HELP');

      // Wait for auto-save
      await new Promise(resolve => setTimeout(resolve, 10));

      // Save should have been called
      expect(mockDb.run).toHaveBeenCalled();

      // Simulate loading in new session
      mockDb.query.mockResolvedValue({
        rows: [
          {
            history_num: 2,
            history_cycle: 2,
            commands: JSON.stringify(['WHO', 'HELP']),
          },
        ],
      });

      const newSession = {
        commandHistory: [],
        historyIndex: 0,
        historyCycle: 0,
      } as any;

      await loadHistory(newSession, 1);
      expect(newSession.commandHistory).toEqual(['WHO', 'HELP']);
    });

    it('should handle circular buffer edge cases', () => {
      // Fill exactly to capacity
      for (let i = 0; i < 20; i++) {
        addToHistory(mockSession, `CMD${i}`);
      }

      expect(mockSession.commandHistory.length).toBe(20);
      expect(mockSession.historyIndex).toBe(19); // Last index written

      // Add one more - triggers circular replacement
      addToHistory(mockSession, 'CMD20');

      expect(mockSession.commandHistory.length).toBe(20);
      expect(mockSession.commandHistory[19]).toBe('CMD20'); // Replaces last slot first
      expect(mockSession.historyIndex).toBe(0); // Wrapped to start

      // Keep adding - now replaces from beginning
      addToHistory(mockSession, 'CMD21');
      expect(mockSession.commandHistory[0]).toBe('CMD21');
      expect(mockSession.historyIndex).toBe(1);
    });

    it('should handle navigation wrapping in both directions', () => {
      mockSession.commandHistory = ['A', 'B', 'C'];
      mockSession.historyCycle = 1;

      // Forward: B -> C -> A (wrap)
      const f1 = getNextCommand(mockSession);
      const f2 = getNextCommand(mockSession);
      const f3 = getNextCommand(mockSession);
      expect(f1).toBe('B');
      expect(f2).toBe('C');
      expect(f3).toBe('A');

      // After forward navigation, historyCycle is back at 1
      // Backward: B -> A -> C (wrap)
      const b1 = getPreviousCommand(mockSession);
      const b2 = getPreviousCommand(mockSession);
      const b3 = getPreviousCommand(mockSession);
      expect(b1).toBe('B');
      expect(b2).toBe('A');
      expect(b3).toBe('C');
    });
  });
});
