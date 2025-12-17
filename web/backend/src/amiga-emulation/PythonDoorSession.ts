import { Socket } from 'socket.io';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import * as path from 'path';
import { doorDropFileManager } from '../services/DoorDropFileManager';
import { User } from '../database';

/**
 * PythonDoorSession - Manages Python door execution
 *
 * Python doors receive BBS context via:
 * 1. Environment variables (BBS_*, see below)
 * 2. Drop files (DOOR.SYS, DORINFOx.DEF)
 *
 * I/O Protocol:
 * - Python door writes to stdout → displayed to user
 * - User input → written to Python door's stdin
 * - Supports ANSI escape codes
 *
 * Environment Variables:
 * - BBS_NODE_ID: Node number (1-4)
 * - BBS_USER_NAME: Username
 * - BBS_USER_ID: User ID
 * - BBS_SECURITY_LEVEL: Security level (0-255)
 * - BBS_TIME_REMAINING: Seconds remaining in session
 * - BBS_ANSI_ENABLED: '1' if ANSI, '0' if ASCII
 * - BBS_EXPERT_MODE: '1' if expert, '0' if novice
 * - BBS_ROOT_PATH: Path to BBS root directory
 * - BBS_NODE_PATH: Path to Node{n} directory
 * - BBS_DOOR_SYS_PATH: Path to DOOR.SYS file
 * - BBS_DORINFO_PATH: Path to DORINFOx.DEF file
 */

export interface PythonDoorConfig {
  executablePath: string;  // Path to .py file
  timeout?: number;        // Max execution time in seconds (default: 300)
  bbsSession?: any;        // BBS session data
  nodeId?: number;         // Node ID
  user?: User;             // User object
  timeRemaining?: number;  // Seconds remaining
}

export class PythonDoorSession {
  private socket: Socket;
  private config: PythonDoorConfig;
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;
  private executionTimer: NodeJS.Timeout | null = null;
  private inputQueue: string[] = [];
  private bbsRoot: string;

  constructor(socket: Socket, config: PythonDoorConfig) {
    this.socket = socket;
    this.config = {
      timeout: 300,  // 5 minutes default
      nodeId: 1,
      timeRemaining: 300,
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
    console.log('[PythonDoorSession] Setting up socket handlers');

    // Handle user input
    this.socket.on('door:input', (data: string) => {
      if (this.isRunning && this.process && this.process.stdin) {
        console.log(`[PythonDoorSession] Received input: "${data}"`);

        // Write to Python process stdin
        try {
          this.process.stdin.write(data);
        } catch (error) {
          console.error('[PythonDoorSession] Error writing to stdin:', error);
        }
      }
    });

    // Handle disconnection
    this.socket.on('disconnect', () => {
      console.log('[PythonDoorSession] Socket disconnected, terminating door');
      this.terminate();
    });
  }

  /**
   * Start the Python door
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[PythonDoorSession] Door already running');
      return;
    }

    const executablePath = this.config.executablePath;

    // Verify Python file exists
    if (!amigafs.existsSync(executablePath)) {
      throw new Error(`Python door not found: ${executablePath}`);
    }

    console.log('[PythonDoorSession] Starting Python door:', executablePath);

    // Create drop files if user provided
    if (this.config.user && this.config.nodeId) {
      doorDropFileManager.createAllDropFiles(
        this.config.nodeId,
        this.config.user,
        this.config.timeRemaining || 300
      );
    }

    // Build environment variables
    const env = this.buildEnvironment();

    // Spawn Python process
    try {
      this.process = spawn('python3', [executablePath], {
        env,
        cwd: path.dirname(executablePath),
        stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr
      });

      this.isRunning = true;

      // Handle stdout (door output → user)
      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString('utf8');
        console.log('[PythonDoorSession] Door output:', output.length, 'bytes');
        this.socket.emit('door:output', output);
      });

      // Handle stderr (errors)
      this.process.stderr?.on('data', (data: Buffer) => {
        const error = data.toString('utf8');
        console.error('[PythonDoorSession] Door stderr:', error);
        // Optionally emit to user
        this.socket.emit('door:output', `\r\n\x1b[31mError: ${error}\x1b[0m\r\n`);
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log('[PythonDoorSession] Door exited:', { code, signal });
        this.cleanup();
        this.socket.emit('door:exit', { code, signal });
      });

      // Handle process errors
      this.process.on('error', (error) => {
        console.error('[PythonDoorSession] Process error:', error);
        this.socket.emit('door:error', { message: error.message });
        this.cleanup();
      });

      // Set execution timeout
      if (this.config.timeout) {
        this.executionTimer = setTimeout(() => {
          console.log('[PythonDoorSession] Door timeout, terminating');
          this.terminate();
        }, this.config.timeout * 1000);
      }

      // Emit ready event
      this.socket.emit('door:ready');
      console.log('[PythonDoorSession] Door started successfully');

    } catch (error) {
      console.error('[PythonDoorSession] Failed to start door:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Build environment variables for Python door
   */
  private buildEnvironment(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    const nodeId = this.config.nodeId || 1;
    const user = this.config.user;
    const nodePath = path.join(this.bbsRoot, `Node${nodeId}`);

    // BBS context
    env.BBS_NODE_ID = String(nodeId);
    env.BBS_ROOT_PATH = this.bbsRoot;
    env.BBS_NODE_PATH = nodePath;
    env.BBS_DOOR_SYS_PATH = path.join(nodePath, 'DOOR.SYS');
    env.BBS_DORINFO_PATH = path.join(nodePath, `DORINFO${nodeId}.DEF`);
    env.BBS_TIME_REMAINING = String(this.config.timeRemaining || 300);

    // User context (if available)
    if (user) {
      env.BBS_USER_NAME = user.username;
      env.BBS_USER_ID = String(user.id || 1);
      env.BBS_SECURITY_LEVEL = String(user.secLevel);
      env.BBS_ANSI_ENABLED = user.ansi ? '1' : '0';
      env.BBS_EXPERT_MODE = user.expert ? '1' : '0';
      env.BBS_REAL_NAME = user.realname || user.username;
      env.BBS_LOCATION = user.location || '';
      env.BBS_CALLS = String(user.calls);
      env.BBS_UPLOADS = String(user.uploads);
      env.BBS_DOWNLOADS = String(user.downloads);
    }

    return env;
  }

  /**
   * Terminate the Python door process
   */
  terminate(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[PythonDoorSession] Terminating door');

    if (this.process) {
      try {
        // Try graceful shutdown first
        this.process.kill('SIGTERM');

        // Force kill after 2 seconds
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            console.log('[PythonDoorSession] Force killing door process');
            this.process.kill('SIGKILL');
          }
        }, 2000);
      } catch (error) {
        console.error('[PythonDoorSession] Error terminating process:', error);
      }
    }

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
        console.error('[PythonDoorSession] Error cleaning up drop files:', error);
      }
    }

    // Null out process reference
    this.process = null;

    console.log('[PythonDoorSession] Cleanup complete');
  }

  /**
   * Check if door is running
   */
  public get running(): boolean {
    return this.isRunning;
  }
}
