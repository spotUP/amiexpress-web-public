/**
 * Error Handling Utility Unit Tests
 *
 * Tests standardized error, success, and warning message handling.
 * Validates socket emissions and session state updates.
 */

import { ErrorHandler } from '../../src/utils/error-handling.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { Socket } from 'socket.io';

describe('ErrorHandler', () => {
  let mockSocket: any;
  let emittedEvents: Array<{ event: string; data: any }>;

  beforeEach(() => {
    emittedEvents = [];
    mockSocket = {
      emit: jest.fn((event: string, data: any) => {
        emittedEvents.push({ event, data });
      }),
      session: {
        menuPause: false,
        tempData: { test: 'value' },
        subState: LoggedOnSubState.DISPLAY_CONF_BULL,
      },
    } as unknown as Socket;
  });

  describe('sendError', () => {
    it('should emit error message with default options', () => {
      ErrorHandler.sendError(mockSocket, 'Test error');

      expect(mockSocket.emit).toHaveBeenCalled();
      const events = emittedEvents.map(e => e.event);
      expect(events.filter(e => e === 'ansi-output').length).toBeGreaterThan(0);
    });

    it('should show prompt by default', () => {
      ErrorHandler.sendError(mockSocket, 'Test error');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      // Should include prompt
      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(true);
    });

    it('should not show prompt when showPrompt is false', () => {
      ErrorHandler.sendError(mockSocket, 'Test error', { showPrompt: false });

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(false);
    });

    it('should update session state when nextState is provided', () => {
      ErrorHandler.sendError(mockSocket, 'Test error', {
        nextState: LoggedOnSubState.DISPLAY_MENU,
      });

      expect(mockSocket.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    });

    it('should clear menuPause when clearMenuPause is true', () => {
      mockSocket.session.menuPause = true;
      ErrorHandler.sendError(mockSocket, 'Test error', { clearMenuPause: true });

      expect(mockSocket.session.menuPause).toBe(false);
    });

    it('should clear tempData when clearTempData is true', () => {
      ErrorHandler.sendError(mockSocket, 'Test error', { clearTempData: true });

      expect(mockSocket.session.tempData).toBeUndefined();
    });

    it('should handle socket without session', () => {
      const socketWithoutSession = {
        emit: jest.fn(),
      } as unknown as Socket;

      expect(() => {
        ErrorHandler.sendError(socketWithoutSession, 'Test error');
      }).not.toThrow();
    });

    it('should emit correct message structure', () => {
      ErrorHandler.sendError(mockSocket, 'Custom error message');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Custom error message'))).toBe(true);
    });
  });

  describe('sendSuccess', () => {
    it('should emit success message with default options', () => {
      ErrorHandler.sendSuccess(mockSocket, 'Test success');

      expect(mockSocket.emit).toHaveBeenCalled();
      const events = emittedEvents.map(e => e.event);
      expect(events.filter(e => e === 'ansi-output').length).toBeGreaterThan(0);
    });

    it('should show prompt by default', () => {
      ErrorHandler.sendSuccess(mockSocket, 'Test success');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(true);
    });

    it('should not show prompt when showPrompt is false', () => {
      ErrorHandler.sendSuccess(mockSocket, 'Test success', { showPrompt: false });

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(false);
    });

    it('should update session state when nextState is provided', () => {
      ErrorHandler.sendSuccess(mockSocket, 'Test success', {
        nextState: LoggedOnSubState.DISPLAY_MENU,
      });

      expect(mockSocket.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    });

    it('should clear menuPause when clearMenuPause is true', () => {
      mockSocket.session.menuPause = true;
      ErrorHandler.sendSuccess(mockSocket, 'Test success', { clearMenuPause: true });

      expect(mockSocket.session.menuPause).toBe(false);
    });

    it('should clear tempData when clearTempData is true', () => {
      ErrorHandler.sendSuccess(mockSocket, 'Test success', { clearTempData: true });

      expect(mockSocket.session.tempData).toBeUndefined();
    });

    it('should emit correct message structure', () => {
      ErrorHandler.sendSuccess(mockSocket, 'Operation successful');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Operation successful'))).toBe(true);
    });
  });

  describe('sendWarning', () => {
    it('should emit warning message with default options', () => {
      ErrorHandler.sendWarning(mockSocket, 'Test warning');

      expect(mockSocket.emit).toHaveBeenCalled();
      const events = emittedEvents.map(e => e.event);
      expect(events.filter(e => e === 'ansi-output').length).toBeGreaterThan(0);
    });

    it('should not show prompt by default (different from error/success)', () => {
      ErrorHandler.sendWarning(mockSocket, 'Test warning');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(false);
    });

    it('should show prompt when showPrompt is true', () => {
      ErrorHandler.sendWarning(mockSocket, 'Test warning', { showPrompt: true });

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(true);
    });

    it('should update session state when nextState is provided', () => {
      ErrorHandler.sendWarning(mockSocket, 'Test warning', {
        nextState: LoggedOnSubState.DISPLAY_MENU,
      });

      expect(mockSocket.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    });

    it('should clear menuPause when clearMenuPause is true', () => {
      mockSocket.session.menuPause = true;
      ErrorHandler.sendWarning(mockSocket, 'Test warning', { clearMenuPause: true });

      expect(mockSocket.session.menuPause).toBe(false);
    });

    it('should clear tempData when clearTempData is true', () => {
      ErrorHandler.sendWarning(mockSocket, 'Test warning', { clearTempData: true });

      expect(mockSocket.session.tempData).toBeUndefined();
    });

    it('should emit correct message structure', () => {
      ErrorHandler.sendWarning(mockSocket, 'Warning message');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Warning message'))).toBe(true);
    });
  });

  describe('permissionDenied', () => {
    it('should send permission denied error with action', () => {
      ErrorHandler.permissionDenied(mockSocket, 'delete files');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('delete files'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('permission'))).toBe(true);
    });

    it('should show prompt by default', () => {
      ErrorHandler.permissionDenied(mockSocket, 'edit settings');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(true);
    });

    it('should set default nextState to DISPLAY_CONF_BULL', () => {
      mockSocket.session.subState = LoggedOnSubState.DISPLAY_MENU;
      ErrorHandler.permissionDenied(mockSocket, 'access admin');

      expect(mockSocket.session.subState).toBe(LoggedOnSubState.DISPLAY_CONF_BULL);
    });

    it('should allow overriding nextState', () => {
      ErrorHandler.permissionDenied(mockSocket, 'access admin', {
        nextState: LoggedOnSubState.DISPLAY_MENU,
      });

      expect(mockSocket.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    });

    it('should respect custom options', () => {
      mockSocket.session.menuPause = true;
      ErrorHandler.permissionDenied(mockSocket, 'delete', {
        clearMenuPause: true,
        showPrompt: false,
      });

      expect(mockSocket.session.menuPause).toBe(false);
      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);
      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(false);
    });
  });

  describe('invalidInput', () => {
    it('should send invalid input error with field name', () => {
      ErrorHandler.invalidInput(mockSocket, 'username');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('username'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Invalid'))).toBe(true);
    });

    it('should show prompt by default', () => {
      ErrorHandler.invalidInput(mockSocket, 'password');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(true);
    });

    it('should respect custom options', () => {
      ErrorHandler.invalidInput(mockSocket, 'email', {
        showPrompt: false,
        nextState: LoggedOnSubState.DISPLAY_MENU,
      });

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);
      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(false);
      expect(mockSocket.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    });
  });

  describe('notFound', () => {
    it('should send not found error with item name', () => {
      ErrorHandler.notFound(mockSocket, 'File');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('File'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('not found'))).toBe(true);
    });

    it('should show prompt by default', () => {
      ErrorHandler.notFound(mockSocket, 'Message');

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);

      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(true);
    });

    it('should respect custom options', () => {
      ErrorHandler.notFound(mockSocket, 'User', {
        showPrompt: false,
        clearTempData: true,
      });

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);
      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(false);
      expect(mockSocket.session.tempData).toBeUndefined();
    });
  });

  describe('integration tests', () => {
    it('should handle multiple option combinations', () => {
      mockSocket.session.menuPause = true;

      ErrorHandler.sendError(mockSocket, 'Test', {
        showPrompt: false,
        nextState: LoggedOnSubState.DISPLAY_MENU,
        clearMenuPause: true,
        clearTempData: true,
      });

      expect(mockSocket.session.menuPause).toBe(false);
      expect(mockSocket.session.tempData).toBeUndefined();
      expect(mockSocket.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);

      const outputs = emittedEvents
        .filter(e => e.event === 'ansi-output')
        .map(e => e.data);
      expect(outputs.some((o: string) => o.includes('Press any key'))).toBe(false);
    });

    it('should preserve session state when no options set', () => {
      const originalPause = mockSocket.session.menuPause;
      const originalData = mockSocket.session.tempData;
      const originalState = mockSocket.session.subState;

      ErrorHandler.sendError(mockSocket, 'Test');

      expect(mockSocket.session.menuPause).toBe(originalPause);
      expect(mockSocket.session.tempData).toBe(originalData);
      expect(mockSocket.session.subState).toBe(originalState);
    });
  });
});
