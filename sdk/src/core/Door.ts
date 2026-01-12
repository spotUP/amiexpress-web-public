/**
 * Door - Base Class for BBS Doors
 *
 * Professional door framework with lifecycle hooks and type safety
 */

import type { Socket } from 'socket.io';
import type {
  DoorConfig,
  DoorContext,
  RawDoorSession,
  User,
  StartHandler,
  InputHandler,
  CloseHandler,
  ErrorHandler,
  KeyPress,
} from './types';
import { Output } from './Output';
import { Input } from './Input';
import { Storage } from './Storage';

export class Door {
  private config: DoorConfig;
  private startHandlers: StartHandler[] = [];
  private inputHandlers: InputHandler[] = [];
  private closeHandlers: CloseHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private isRunning: boolean = false;

  constructor(config: DoorConfig) {
    this.config = config;
  }

  // ===== Lifecycle Registration =====

  /**
   * Register a handler to run when the door starts
   */
  onStart(handler: StartHandler): this {
    this.startHandlers.push(handler);
    return this;
  }

  /**
   * Register a handler to run on user input
   */
  onInput(handler: InputHandler): this {
    this.inputHandlers.push(handler);
    return this;
  }

  /**
   * Register a handler to run when the door closes
   */
  onClose(handler: CloseHandler): this {
    this.closeHandlers.push(handler);
    return this;
  }

  /**
   * Register an error handler
   */
  onError(handler: ErrorHandler): this {
    this.errorHandlers.push(handler);
    return this;
  }

  // ===== Door Execution =====

  /**
   * Execute the door
   *
   * This is called by the BBS backend when a user runs the door
   */
  async execute(rawSession: RawDoorSession): Promise<void> {
    if (this.isRunning) {
      throw new Error('Door is already running');
    }

    this.isRunning = true;

    const { socket, bbsSession, user, params = [], bbs } = rawSession;

    // Create context
    const context = this.createContext(socket, bbsSession, user, params, bbs);

    try {
      // Call start handlers
      for (const handler of this.startHandlers) {
        await handler(context);
      }

      // Set up input loop
      if (this.inputHandlers.length > 0) {
        await this.runInputLoop(socket, bbsSession, context);
      }

      // Call close handlers
      for (const handler of this.closeHandlers) {
        await handler(context);
      }
    } catch (error) {
      // Call error handlers
      for (const handler of this.errorHandlers) {
        await handler(context, error as Error);
      }

      // Re-throw if no error handlers
      if (this.errorHandlers.length === 0) {
        throw error;
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Exit the door
   *
   * Can be called from within handlers to immediately close the door
   */
  async exit(): Promise<void> {
    this.isRunning = false;
  }

  // ===== Internal Methods =====

  private createContext(
    socket: Socket,
    bbsSession: any,
    user: User,
    params: string[],
    bbs?: any
  ): DoorContext {
    const output = new Output(socket);
    const input = new Input(bbsSession, output);
    const storage = new Storage({
      doorName: this.config.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      userId: user.id,
    });

    return {
      user,
      nodeId: bbsSession.nodeId || 1,
      output,
      input,
      storage,
      params,
      bbs,
      close: async () => {
        this.isRunning = false;
      },
    };
  }

  private async runInputLoop(
    socket: Socket,
    bbsSession: any,
    context: DoorContext
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const handler = async (data: string) => {
        if (!this.isRunning) {
          bbsSession.doorInputHandler = null;
          resolve();
          return;
        }

        try {
          // Parse key press
          const keyPress: KeyPress = {
            key: data,
            raw: data,
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
          };

          // Call input handlers
          for (const inputHandler of this.inputHandlers) {
            await inputHandler(context, keyPress);
          }
        } catch (error) {
          // Call error handlers
          for (const errorHandler of this.errorHandlers) {
            await errorHandler(context, error as Error);
          }

          // Re-throw if no error handlers
          if (this.errorHandlers.length === 0) {
            throw error;
          }
        }
      };

      bbsSession.doorInputHandler = handler;

      // Handle disconnection
      socket.once('disconnect', () => {
        bbsSession.doorInputHandler = null;
        this.isRunning = false;
        resolve();
      });

      // Handle door:close event
      socket.once('door:close', () => {
        bbsSession.doorInputHandler = null;
        this.isRunning = false;
        resolve();
      });
    });
  }

  // ===== Getters =====

  getConfig(): DoorConfig {
    return { ...this.config };
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
