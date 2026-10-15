/**
 * Command Response Utility Unit Tests
 *
 * Tests command completion handling with colorized messages,
 * menu pause, and state transitions.
 */

import { finalizeCommand } from '../../src/utils/command-response.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

// Mock AnsiUtil
jest.mock('../../src/utils/ansi.util', () => ({
  AnsiUtil: {
    colorize: jest.fn((text: string, color: string) => `[${color}]${text}[/]`),
  },
}));

import { AnsiUtil } from '../../src/utils/ansi.util';

describe('Command Response Utility Functions', () => {
  let mockSocket: any;
  let mockSession: any;
  let emittedEvents: Array<{ event: string; data: any }>;

  beforeEach(() => {
    emittedEvents = [];
    mockSocket = {
      emit: jest.fn((event: string, data: any) => {
        emittedEvents.push({ event, data });
      }),
    };

    mockSession = {
      menuPause: false,
      subState: LoggedOnSubState.READ_COMMAND,
    };

    // Clear mock call history
    (AnsiUtil.colorize as jest.Mock).mockClear();
  });

  describe('finalizeCommand', () => {
    it('should emit newline before message', () => {
      finalizeCommand(mockSocket, mockSession, 'Command completed');

      expect(mockSocket.emit).toHaveBeenCalledWith('ansi-output', '\r\n');
    });

    it('should colorize message with cyan', () => {
      finalizeCommand(mockSocket, mockSession, 'Test message');

      expect(AnsiUtil.colorize).toHaveBeenCalledWith('Test message', 'cyan');
    });

    it('should emit colorized message with newline', () => {
      finalizeCommand(mockSocket, mockSession, 'Success');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs).toContain('[cyan]Success[/]\r\n');
    });

    it('should set menuPause to true', () => {
      mockSession.menuPause = false;

      finalizeCommand(mockSocket, mockSession, 'Done');

      expect(mockSession.menuPause).toBe(true);
    });

    it('should preserve menuPause if already true', () => {
      mockSession.menuPause = true;

      finalizeCommand(mockSocket, mockSession, 'Done');

      expect(mockSession.menuPause).toBe(true);
    });

    it('should set subState to DISPLAY_MENU', () => {
      mockSession.subState = LoggedOnSubState.READ_COMMAND;

      finalizeCommand(mockSocket, mockSession, 'Done');

      expect(mockSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    });

    it('should emit exactly 2 events', () => {
      finalizeCommand(mockSocket, mockSession, 'Message');

      expect(mockSocket.emit).toHaveBeenCalledTimes(2);
    });

    it('should emit events in correct order', () => {
      finalizeCommand(mockSocket, mockSession, 'Test');

      expect(emittedEvents[0]).toEqual({ event: 'ansi-output', data: '\r\n' });
      expect(emittedEvents[1].event).toBe('ansi-output');
      expect(emittedEvents[1].data).toContain('Test');
    });

    it('should handle empty message', () => {
      finalizeCommand(mockSocket, mockSession, '');

      expect(AnsiUtil.colorize).toHaveBeenCalledWith('', 'cyan');
      expect(mockSession.menuPause).toBe(true);
      expect(mockSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    });

    it('should handle special characters in message', () => {
      const message = 'File: test.txt (100%)';

      finalizeCommand(mockSocket, mockSession, message);

      expect(AnsiUtil.colorize).toHaveBeenCalledWith(message, 'cyan');
    });

    it('should handle newlines in message', () => {
      const message = 'Line 1\nLine 2';

      finalizeCommand(mockSocket, mockSession, message);

      expect(AnsiUtil.colorize).toHaveBeenCalledWith(message, 'cyan');
    });

    it('should handle long messages', () => {
      const message = 'A'.repeat(1000);

      finalizeCommand(mockSocket, mockSession, message);

      expect(AnsiUtil.colorize).toHaveBeenCalledWith(message, 'cyan');
      expect(mockSession.menuPause).toBe(true);
    });

    it('should handle messages with ANSI codes', () => {
      const message = '\x1b[31mRed text\x1b[0m';

      finalizeCommand(mockSocket, mockSession, message);

      expect(AnsiUtil.colorize).toHaveBeenCalledWith(message, 'cyan');
    });

    it('should handle different initial subStates', () => {
      const states = [
        LoggedOnSubState.READ_COMMAND,
        LoggedOnSubState.DISPLAY_CONF_BULL,
        LoggedOnSubState.DISPLAY_MENU,
      ];

      states.forEach(state => {
        mockSession.subState = state;
        finalizeCommand(mockSocket, mockSession, 'Test');
        expect(mockSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
      });
    });

    it('should work with session having no initial menuPause property', () => {
      delete mockSession.menuPause;

      finalizeCommand(mockSocket, mockSession, 'Test');

      expect(mockSession.menuPause).toBe(true);
    });

    it('should work with session having no initial subState property', () => {
      delete mockSession.subState;

      finalizeCommand(mockSocket, mockSession, 'Test');

      expect(mockSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    });
  });

  describe('integration tests', () => {
    it('should properly finalize command with all effects', () => {
      const initialPause = mockSession.menuPause;
      const initialState = mockSession.subState;

      finalizeCommand(mockSocket, mockSession, 'Operation completed');

      // Verify all state changes
      expect(mockSession.menuPause).toBe(true);
      expect(mockSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);

      // Verify emissions
      expect(mockSocket.emit).toHaveBeenCalledTimes(2);

      // Verify colorization
      expect(AnsiUtil.colorize).toHaveBeenCalledWith('Operation completed', 'cyan');

      // State changes occurred
      expect(mockSession.menuPause !== initialPause || mockSession.subState !== initialState).toBe(true);
    });

    it('should handle rapid multiple calls correctly', () => {
      finalizeCommand(mockSocket, mockSession, 'First');
      finalizeCommand(mockSocket, mockSession, 'Second');
      finalizeCommand(mockSocket, mockSession, 'Third');

      expect(mockSocket.emit).toHaveBeenCalledTimes(6); // 2 per call
      expect(mockSession.menuPause).toBe(true);
      expect(mockSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    });

    it('should maintain consistent state across multiple calls', () => {
      for (let i = 0; i < 5; i++) {
        finalizeCommand(mockSocket, mockSession, `Message ${i}`);
        expect(mockSession.menuPause).toBe(true);
        expect(mockSession.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
      }
    });
  });
});
