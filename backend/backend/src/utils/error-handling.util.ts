/**
 * Standardized Error Handling Utilities
 */

import { Socket } from 'socket.io';
import { AnsiUtil } from './ansi.util';
import { LoggedOnSubState } from '../constants/bbs-states';

export interface ErrorHandlingOptions {
  /** Show "Press any key to continue..." prompt */
  showPrompt?: boolean;
  /** Next substate to transition to */
  nextState?: LoggedOnSubState;
  /** Clear menuPause flag */
  clearMenuPause?: boolean;
  /** Clear tempData */
  clearTempData?: boolean;
}

export class ErrorHandler {
  /**
   * Send an error message to the client
   */
  static sendError(
    socket: Socket,
    message: string,
    options: ErrorHandlingOptions = {}
  ): void {
    const {
      showPrompt = true,
      nextState,
      clearMenuPause = false,
      clearTempData = false
    } = options;

    // Send error message
    socket.emit('ansi-output', AnsiUtil.line());
    socket.emit('ansi-output', AnsiUtil.errorLine(message));

    // Show prompt if requested
    if (showPrompt) {
      socket.emit('ansi-output', AnsiUtil.line());
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    }

    // Update session state if provided
    const session = (socket as any).session;
    if (session) {
      if (clearMenuPause) {
        session.menuPause = false;
      }
      if (clearTempData) {
        session.tempData = undefined;
      }
      if (nextState) {
        session.subState = nextState;
      }
    }
  }

  /**
   * Send a success message to the client
   */
  static sendSuccess(
    socket: Socket,
    message: string,
    options: ErrorHandlingOptions = {}
  ): void {
    const {
      showPrompt = true,
      nextState,
      clearMenuPause = false,
      clearTempData = false
    } = options;

    // Send success message
    socket.emit('ansi-output', AnsiUtil.line());
    socket.emit('ansi-output', AnsiUtil.successLine(message));

    // Show prompt if requested
    if (showPrompt) {
      socket.emit('ansi-output', AnsiUtil.line());
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    }

    // Update session state if provided
    const session = (socket as any).session;
    if (session) {
      if (clearMenuPause) {
        session.menuPause = false;
      }
      if (clearTempData) {
        session.tempData = undefined;
      }
      if (nextState) {
        session.subState = nextState;
      }
    }
  }

  /**
   * Send a warning message to the client
   */
  static sendWarning(
    socket: Socket,
    message: string,
    options: ErrorHandlingOptions = {}
  ): void {
    const {
      showPrompt = false,
      nextState,
      clearMenuPause = false,
      clearTempData = false
    } = options;

    // Send warning message
    socket.emit('ansi-output', AnsiUtil.line());
    socket.emit('ansi-output', AnsiUtil.warningLine(message));

    // Show prompt if requested
    if (showPrompt) {
      socket.emit('ansi-output', AnsiUtil.line());
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    }

    // Update session state if provided
    const session = (socket as any).session;
    if (session) {
      if (clearMenuPause) {
        session.menuPause = false;
      }
      if (clearTempData) {
        session.tempData = undefined;
      }
      if (nextState) {
        session.subState = nextState;
      }
    }
  }

  /**
   * Handle permission denied errors
   */
  static permissionDenied(
    socket: Socket,
    action: string,
    options: ErrorHandlingOptions = {}
  ): void {
    this.sendError(socket, `You do not have permission to ${action}.`, {
      showPrompt: true,
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL,
      ...options
    });
  }

  /**
   * Handle invalid input errors
   */
  static invalidInput(
    socket: Socket,
    field: string,
    options: ErrorHandlingOptions = {}
  ): void {
    this.sendError(socket, `Invalid ${field}.`, {
      showPrompt: true,
      ...options
    });
  }

  /**
   * Handle not found errors
   */
  static notFound(
    socket: Socket,
    item: string,
    options: ErrorHandlingOptions = {}
  ): void {
    this.sendError(socket, `${item} not found.`, {
      showPrompt: true,
      ...options
    });
  }
}
