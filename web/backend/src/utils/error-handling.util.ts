/**
 * Standardized Error Handling Utilities
 */

import { Socket } from 'socket.io';
import { AnsiUtil } from './ansi.util';
import { LoggedOnSubState } from '../constants/bbs-states';

/**
 * express.e:3037-3039 higherAccess()
 *
 *   PROC higherAccess()
 *     aePuts('\b\nCommand requires higher access.\b\n')
 *   ENDPROC
 *
 * Byte for byte: one leading newline, the sentence, one trailing newline.
 * No colour, no separator line, no "press any key". `\b\n` is this source's
 * CR+LF idiom - every other aePuts in the port renders it as `\r\n`.
 *
 * This is the ONLY place the string lives. express.e calls higherAccess()
 * from exactly two sites and so does this port:
 *
 *   - express.e:4705 - `runCommand`'s ACCESS tooltype gate, for the
 *     SYSCMD/BBSCMD door tiers (`command-execution.handler.ts`).
 *   - express.e:28400 - `processInternalCommand`'s tail, for the internal
 *     command tier (`command.handler.ts` processBBSCommand).
 *
 * Both are suppressed when `privcmd` is true, i.e. when the user did not type
 * the command. Never call this from a command handler: a handler that refuses
 * returns RESULT_NOT_ALLOWED and lets its dispatcher speak, or the caller
 * hears the same refusal once per tier.
 */
export function higherAccess(socket: Socket | any): void {
  socket.emit('ansi-output', '\r\nCommand requires higher access.\r\n');
}

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
    _action: string,
    options: ErrorHandlingOptions = {}
  ): void {
    // express.e:3037-3039 higherAccess() — no separator, no press-key, just the message
    higherAccess(socket);
    const { nextState, clearMenuPause, clearTempData } = options;
    const session = (socket as any).session;
    if (session) {
      if (clearMenuPause) session.menuPause = false;
      if (clearTempData) session.tempData = undefined;
      if (nextState) session.subState = nextState;
    }
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
