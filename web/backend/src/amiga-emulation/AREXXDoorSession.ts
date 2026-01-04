import { Socket } from 'socket.io';
import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import * as path from 'path';
import { User } from '../database';
import { AREXXInterpreter } from '../services/arexx.service';
import { doorDropFileManager } from '../services/DoorDropFileManager';

/**
 * AREXXDoorSession - Manages AREXX door execution
 *
 * AREXX doors receive BBS context via:
 * 1. Context object passed to interpreter
 * 2. Drop files (DOOR.SYS, DORINFOx.DEF)
 * 3. BBSFunctions API (SendString, GetUser, etc.)
 *
 * I/O Protocol:
 * - AREXX door uses BBSFunctions.BBSWRITE() → socket emit
 * - User input → queued for BBSREAD()
 * - Supports ANSI escape codes
 *
 * Context Variables:
 * - user: User object with all user data
 * - session: Session data (node, conf, time remaining)
 * - socket: Socket.io connection for real-time I/O
 * - output: Array collecting output strings
 */

export interface AREXXDoorConfig {
  executablePath: string;  // Path to .rexx file
  timeout?: number;        // Max execution time in seconds (default: 300)
  bbsSession?: any;        // BBS session data
  nodeId?: number;         // Node ID
  user?: User;             // User object
  timeRemaining?: number;  // Seconds remaining
  args?: string[];         // Command-line arguments for door
}

export class AREXXDoorSession {
  private socket: Socket;
  private config: AREXXDoorConfig;
  private interpreter: AREXXInterpreter | null = null;
  private isRunning: boolean = false;
  private executionTimer: NodeJS.Timeout | null = null;
  private bbsRoot: string;

  constructor(socket: Socket, config: AREXXDoorConfig) {
    this.socket = socket;
    this.config = {
      timeout: 300,  // 5 minutes default
      nodeId: 1,
      timeRemaining: 300,
      args: [],
      ...config
    };

    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../backend/data/bbs/BBS');

    // Set up socket event handlers
    this.setupSocketHandlers();
  }

  /**
   * Set up Socket.io event handlers for user input
   */
  private setupSocketHandlers(): void {
console.log('[AREXXDoorSession] Setting up socket handlers');

    // Handle user input
    this.socket.on('door:input', (data: string) => {
      if (this.isRunning && this.interpreter) {
console.log(`[AREXXDoorSession] Received input: "${data}"`);

        // Store input for BBSREAD() to retrieve
        if (this.interpreter['context']) {
          this.interpreter['context'].lastInput = data;
        }
      }
    });

    // Handle disconnection
    this.socket.on('disconnect', () => {
console.log('[AREXXDoorSession] Socket disconnected, terminating door');
      this.terminate();
    });
  }

  /**
   * Start the AREXX door
   */
  async start(): Promise<void> {
    if (this.isRunning) {
console.warn('[AREXXDoorSession] Door already running');
      return;
    }

    const executablePath = this.config.executablePath;

    // Verify AREXX file exists
    if (!amigafs.existsSync(executablePath)) {
      throw new Error(`AREXX door not found: ${executablePath}`);
    }

console.log('[AREXXDoorSession] Starting AREXX door:', executablePath);

    // Create drop files if user provided
    if (this.config.user && this.config.nodeId) {
      doorDropFileManager.createAllDropFiles(
        this.config.nodeId,
        this.config.user,
        this.config.timeRemaining || 300
      );
    }

    // Read AREXX script
    const scriptContent = amigafs.readFileSync(executablePath, 'utf-8') as string;

    // Build context for AREXX interpreter
    const context = this.buildContext();

    // Create interpreter
    this.interpreter = new AREXXInterpreter(context, this.config.args || []);

    this.isRunning = true;

    // Set execution timeout
    if (this.config.timeout) {
      this.executionTimer = setTimeout(() => {
console.log('[AREXXDoorSession] Door timeout, terminating');
        this.terminate();
      }, this.config.timeout * 1000);
    }

    // Execute script
    try {
console.log('[AREXXDoorSession] Executing AREXX script');
      const result = await this.interpreter.execute(scriptContent);

      // Send output to user
      if (result.output && result.output.length > 0) {
        for (const line of result.output) {
          this.socket.emit('door:output', line);
        }
      }

console.log('[AREXXDoorSession] AREXX door completed successfully');
      this.socket.emit('door:exit', { code: 0 });

    } catch (error) {
console.error('[AREXXDoorSession] AREXX execution error:', error);
      this.socket.emit('door:error', {
        message: error instanceof Error ? error.message : 'AREXX execution failed'
      });
      this.socket.emit('door:exit', { code: 1 });

    } finally {
      this.cleanup();
    }
  }

  /**
   * Build context for AREXX interpreter
   */
  private buildContext(): any {
    const nodeId = this.config.nodeId || 1;
    const user = this.config.user;
    const nodePath = path.join(this.bbsRoot, `Node${nodeId}`);

    const context: any = {
      user: user || {},
      session: {
        nodeId: nodeId,
        currentConf: this.config.bbsSession?.currentConf || 1,
        timeRemaining: this.config.timeRemaining || 300,
        lastInput: '',
        doorShutdown: false,
      },
      socket: this.socket,
      output: [],
      bbsRoot: this.bbsRoot,
      nodePath: nodePath,
      dropFiles: {
        doorSys: path.join(nodePath, 'DOOR.SYS'),
        dorinfo: path.join(nodePath, `DORINFO${nodeId}.DEF`),
      }
    };

    // Set environment variables for compatibility
    if (user) {
      context.username = user.username;
      context.secLevel = user.secLevel;
      context.location = user.location || '';
      context.realname = user.realname || user.username;
    }

    return context;
  }

  /**
   * Terminate the AREXX door
   */
  terminate(): void {
    if (!this.isRunning) {
      return;
    }

console.log('[AREXXDoorSession] Terminating door');
    this.cleanup();
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.isRunning = false;

    // Clear timeout
    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
      this.executionTimer = null;
    }

    // Remove socket listeners
    this.socket.removeAllListeners('door:input');

    // Clean up drop files
    if (this.config.nodeId) {
      try {
        doorDropFileManager.cleanupDropFiles(this.config.nodeId);
      } catch (error) {
console.error('[AREXXDoorSession] Error cleaning up drop files:', error);
      }
    }

    // Null out interpreter reference
    this.interpreter = null;

console.log('[AREXXDoorSession] Cleanup complete');
  }

  /**
   * Check if door is running
   */
  public get running(): boolean {
    return this.isRunning;
  }
}
