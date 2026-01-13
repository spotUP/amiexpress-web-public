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
  public readonly config: DoorConfig;
  private startHandlers: StartHandler[] = [];
  private inputHandlers: InputHandler[] = [];
  private closeHandlers: CloseHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  
  /** Tracks active session IDs (node IDs) to allow concurrent execution while preventing same-node reentry */
  private runningSessions = new Set<number>();

  constructor(config: DoorConfig) {
    this.config = config;
  }

  /**
   * Start the door (backward compatibility with legacy SDK)
   */
  public start(): void {
    // This is a no-op in the modern SDK as the BBS calls execute()
    // but we keep it for backward compatibility with code that calls door.start()
    console.log(`[Door] ${this.config.name} initialized and ready.`);
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
   * Alias for onStart (for backward compatibility)
   */
  onConnect(handler: (user: any) => void | Promise<void>): this {
    this.onStart(async (ctx) => {
      await handler(ctx.user);
    });
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
    const nodeId = rawSession.bbsSession?.nodeId || 1;

    if (this.runningSessions.has(nodeId)) {
      throw new Error(`Door is already running on node ${nodeId}`);
    }

    this.runningSessions.add(nodeId);

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
      this.runningSessions.delete(nodeId);
    }
  }

  /**
   * Exit the door
   *
   * Can be called from within handlers to immediately close the door
   */
  async exit(ctx?: DoorContext): Promise<void> {
    if (ctx) {
      this.runningSessions.delete(ctx.nodeId);
    } else {
      // If no context, we can only clear all or hope the caller only had one session
      this.runningSessions.clear();
    }
  }

  // ===== Internal Methods =====

  private createContext(
    socket: Socket,
    bbsSession: any,
    user: User | undefined,
    params: string[],
    bbs?: any
  ): DoorContext {
    const nodeId = bbsSession?.nodeId || 1;
    const output = new Output(socket);
    const input = new Input(bbsSession, output);
    const storage = new Storage({
      doorName: this.config.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      userId: user?.id,
      global: !user,
    });

    return {
      user: user || { id: '0', username: 'Guest', accessLevel: 0, timesCalled: 0, uploads: 0, downloads: 0 },
      nodeId,
      output,
      input,
      storage,
      params,
      bbs,
      socket,
      bbsSession,
      close: async () => {
        this.runningSessions.delete(nodeId);
      },
    };
  }

  private async runInputLoop(
    socket: Socket,
    bbsSession: any,
    context: DoorContext
  ): Promise<void> {
    const nodeId = context.nodeId;

    return new Promise<void>((resolve) => {
      const handler = async (data: string) => {
        if (!this.runningSessions.has(nodeId)) {
          bbsSession.doorInputHandler = null;
          resolve();
          return;
        }

        try {
          // Parse key press
          const keyPress: KeyPress = {
            key: data,
            raw: data,
            ctrl: data.charCodeAt(0) < 32,
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
        this.runningSessions.delete(nodeId);
        resolve();
      });

      // Handle door:close event
      socket.once('door:close', () => {
        bbsSession.doorInputHandler = null;
        this.runningSessions.delete(nodeId);
        resolve();
      });
    });
  }

  // ===== Getters =====

  getConfig(): DoorConfig {
    return { ...this.config };
  }

  isActive(nodeId?: number): boolean {
    if (nodeId !== undefined) {
      return this.runningSessions.has(nodeId);
    }
    return this.runningSessions.size > 0;
  }
}
