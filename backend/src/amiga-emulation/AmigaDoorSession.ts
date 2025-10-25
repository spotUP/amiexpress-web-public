import { Server, Socket } from 'socket.io';
import { MoiraEmulator } from './cpu/MoiraEmulator';
import { AmigaDosEnvironment } from './api/AmigaDosEnvironment';
import { HunkLoader } from './loader/HunkLoader';
import * as fs from 'fs';

/**
 * AmigaDoorSession - Manages a single user's door execution session
 * Connects emulated Amiga door to Socket.io for real-time I/O
 */

export interface DoorConfig {
  executablePath: string;  // Path to Amiga door binary
  timeout?: number;        // Max execution time in seconds (default: 300)
  memorySize?: number;     // Memory size in bytes (default: 1MB)
}

export class AmigaDoorSession {
  private emulator: MoiraEmulator | null = null;
  private environment: AmigaDosEnvironment | null = null;
  private socket: Socket;
  private config: DoorConfig;
  private isRunning: boolean = false;
  private executionTimer: NodeJS.Timeout | null = null;

  constructor(socket: Socket, config: DoorConfig) {
    this.socket = socket;
    this.config = {
      timeout: 300,      // 5 minutes default
      memorySize: 1024 * 1024,  // 1MB default
      ...config
    };

    // Set up socket event handlers
    this.setupSocketHandlers();
  }

  /**
   * Set up Socket.io event handlers for user input
   */
  private setupSocketHandlers(): void {
    // Handle user input (keystrokes)
    this.socket.on('door:input', (data: string) => {
      if (this.environment && this.isRunning) {
        console.log(`[AmigaDoorSession] Received input from user: "${data}"`);
        this.environment.queueInput(data);
      }
    });

    // Handle disconnection
    this.socket.on('disconnect', () => {
      console.log('[AmigaDoorSession] Socket disconnected, terminating door');
      this.terminate();
    });

    // Handle explicit termination request
    this.socket.on('door:terminate', () => {
      console.log('[AmigaDoorSession] Termination requested by user');
      this.terminate();
    });
  }

  /**
   * Initialize and start the door
   */
  async start(): Promise<void> {
    try {
      console.log(`[AmigaDoorSession] Starting door: ${this.config.executablePath}`);

      // Emit status
      this.socket.emit('door:status', { status: 'initializing' });

      // Initialize emulator
      this.emulator = new MoiraEmulator(this.config.memorySize);
      await this.emulator.initialize();

      // Create AmigaDOS environment
      this.environment = new AmigaDosEnvironment(this.emulator);

      // Set up output callback to send data to socket
      this.environment.setOutputCallback((data: string) => {
        console.log(`[AmigaDoorSession] Sending output to client: "${data}"`);
        this.socket.emit('door:output', data);
      });

      // Load the door executable
      const binary = fs.readFileSync(this.config.executablePath);
      const hunkLoader = new HunkLoader();
      const hunkFile = hunkLoader.parse(Buffer.from(binary));

      // Load into emulator
      hunkLoader.load(this.emulator, hunkFile);

      // Set up reset vectors
      this.emulator.writeMemory(0x0, 0x00);
      this.emulator.writeMemory(0x1, 0x00);
      this.emulator.writeMemory(0x2, 0x80);
      this.emulator.writeMemory(0x3, 0x00); // Stack at 0x8000

      this.emulator.writeMemory(0x4, (hunkFile.entryPoint >> 24) & 0xFF);
      this.emulator.writeMemory(0x5, (hunkFile.entryPoint >> 16) & 0xFF);
      this.emulator.writeMemory(0x6, (hunkFile.entryPoint >> 8) & 0xFF);
      this.emulator.writeMemory(0x7, hunkFile.entryPoint & 0xFF);

      // Reset CPU
      this.emulator.reset();

      this.isRunning = true;

      // Set up timeout
      if (this.config.timeout) {
        this.executionTimer = setTimeout(() => {
          console.log('[AmigaDoorSession] Execution timeout');
          this.socket.emit('door:error', { message: 'Execution timeout' });
          this.terminate();
        }, this.config.timeout * 1000);
      }

      // Emit ready status
      this.socket.emit('door:status', { status: 'running' });

      // Start execution loop
      this.runExecutionLoop();

    } catch (error) {
      console.error('[AmigaDoorSession] Error starting door:', error);
      this.socket.emit('door:error', {
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      this.terminate();
    }
  }

  /**
   * Main execution loop - runs the CPU in small chunks
   * This allows for responsive I/O handling
   */
  private runExecutionLoop(): void {
    if (!this.emulator || !this.isRunning) return;

    try {
      // Execute a small number of cycles (allows I/O to be processed)
      // 10000 cycles ≈ 1.25ms on original 8MHz 68000
      this.emulator.execute(10000);

      // Schedule next iteration
      setImmediate(() => this.runExecutionLoop());

    } catch (error) {
      // STOP instruction or error
      console.log('[AmigaDoorSession] Execution stopped:', error);
      this.socket.emit('door:status', { status: 'completed' });
      this.terminate();
    }
  }

  /**
   * Terminate the door session and clean up
   */
  terminate(): void {
    if (!this.isRunning) return;

    console.log('[AmigaDoorSession] Terminating session');
    this.isRunning = false;

    // Clear timeout
    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
      this.executionTimer = null;
    }

    // Cleanup emulator
    if (this.emulator) {
      this.emulator.cleanup();
      this.emulator = null;
    }

    this.environment = null;

    // Emit terminated status
    this.socket.emit('door:status', { status: 'terminated' });

    // Remove socket listeners
    this.socket.removeAllListeners('door:input');
    this.socket.removeAllListeners('door:terminate');
  }

  /**
   * Check if session is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
