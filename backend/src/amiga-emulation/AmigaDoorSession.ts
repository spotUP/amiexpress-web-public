import { Server, Socket } from 'socket.io';
import { MoiraEmulator } from './cpu/MoiraEmulator';
import { AmigaDosEnvironment } from './api/AmigaDosEnvironment';
import { HunkLoader } from './loader/HunkLoader';
import * as fs from 'fs';

/**
 * AmigaDoorSession - Manages a single user's door execution session
 * Connects emulated Amiga door to Socket.io for real-time I/O
 * Version: 2025-10-25 - Reduced logging spam
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
        this.socket.emit('ansi-output', data); // Send to standard BBS terminal event
      });

      // Load the door executable
      const binary = fs.readFileSync(this.config.executablePath);
      console.log(`[AmigaDoorSession] Binary size: ${binary.length} bytes`);

      const hunkLoader = new HunkLoader();
      const hunkFile = hunkLoader.parse(Buffer.from(binary));

      console.log(`[AmigaDoorSession] Parsed ${hunkFile.segments.length} segments:`);
      for (let i = 0; i < hunkFile.segments.length; i++) {
        const seg = hunkFile.segments[i];
        console.log(`[AmigaDoorSession]   Segment ${i}: ${seg.type.toUpperCase()} at 0x${seg.address.toString(16)}, size=${seg.size} bytes`);

        // DEBUG: Show first 32 bytes of each segment
        const preview = seg.data.slice(0, Math.min(32, seg.size));
        console.log(`[AmigaDoorSession]   First bytes: [${Array.from(preview).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);

        if (seg.type === 'data') {
          // Show as ASCII too for data segment
          const ascii = Array.from(preview).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
          console.log(`[AmigaDoorSession]   As ASCII: "${ascii}"`);
        }
      }

      // Load into emulator
      hunkLoader.load(this.emulator, hunkFile);

      // DEBUG: Verify data was loaded - read back from memory
      console.log('[AmigaDoorSession] Verifying segments loaded into memory:');
      for (let i = 0; i < hunkFile.segments.length; i++) {
        const seg = hunkFile.segments[i];
        const memBytes: number[] = [];
        for (let j = 0; j < Math.min(32, seg.size); j++) {
          memBytes.push(this.emulator.readMemory(seg.address + j));
        }
        console.log(`[AmigaDoorSession]   Segment ${i} at 0x${seg.address.toString(16)}: [${memBytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);
      }

      // Set up reset vectors
      // Stack pointer: Must be HIGH in memory and far above all loaded segments
      // CODE: 0x1000-0x38E8, DATA: 0x3900-0x3A78
      // Set stack to near top of 1MB memory (0x100000 - 0x1000 = 0xFF000)
      // This gives ~1MB of stack space growing downward
      const initialSP = 0xFE000; // 1,040,384 - leaves room at top for safety
      this.emulator.writeMemory(0x0, (initialSP >> 24) & 0xFF);
      this.emulator.writeMemory(0x1, (initialSP >> 16) & 0xFF);
      this.emulator.writeMemory(0x2, (initialSP >> 8) & 0xFF);
      this.emulator.writeMemory(0x3, initialSP & 0xFF);

      console.log(`[AmigaDoorSession] Initial stack pointer set to: 0x${initialSP.toString(16)}`);

      this.emulator.writeMemory(0x4, (hunkFile.entryPoint >> 24) & 0xFF);
      this.emulator.writeMemory(0x5, (hunkFile.entryPoint >> 16) & 0xFF);
      this.emulator.writeMemory(0x6, (hunkFile.entryPoint >> 8) & 0xFF);
      this.emulator.writeMemory(0x7, hunkFile.entryPoint & 0xFF);

      // Reset CPU
      this.emulator.reset();

      // CRITICAL: Manually set stack pointer AFTER reset
      // The reset vectors don't seem to be working, so force it directly
      this.emulator.setRegister(15, initialSP); // A7/SP = register 15

      const actualSP = this.emulator.getRegister(15);
      console.log(`[AmigaDoorSession] Stack pointer after reset: 0x${actualSP.toString(16)}`);

      if (actualSP !== initialSP) {
        console.error(`[AmigaDoorSession] WARNING: SP mismatch! Expected 0x${initialSP.toString(16)}, got 0x${actualSP.toString(16)}`);
      }

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

      // Verify PC is at entry point
      const pc = this.emulator.getRegister(16); // PC = register 16
      console.log(`[AmigaDoorSession] Program counter at start: 0x${pc.toString(16)} (expected: 0x${hunkFile.entryPoint.toString(16)})`);

      if (pc !== hunkFile.entryPoint) {
        console.error(`[AmigaDoorSession] WARNING: PC not at entry point!`);
      }

      // Start execution loop
      console.log('[AmigaDoorSession] About to call runExecutionLoop()...');
      console.log(`[AmigaDoorSession] isRunning=${this.isRunning}, emulator=${!!this.emulator}`);
      this.runExecutionLoop();
      console.log('[AmigaDoorSession] runExecutionLoop() called (async - will continue in background)');

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
    console.log(`[AmigaDoorSession] runExecutionLoop() START - isRunning=${this.isRunning}, emulator=${!!this.emulator}`);

    if (!this.emulator || !this.isRunning) {
      console.log('[AmigaDoorSession] Execution loop stopped - early exit');
      return;
    }

    try {
      // Execute a small number of cycles (allows I/O to be processed)
      // 10000 cycles ≈ 1.25ms on original 8MHz 68000
      console.log('[AmigaDoorSession] About to execute 10000 cycles...');
      const cyclesExecuted = this.emulator.execute(10000);
      console.log(`[AmigaDoorSession] Executed ${cyclesExecuted} cycles`);

      if (cyclesExecuted === 0) {
        console.warn('[AmigaDoorSession] CPU executed 0 cycles - door completed or hit invalid instruction');
        const pc = this.emulator.getRegister(16);
        const sp = this.emulator.getRegister(15);
        console.warn(`[AmigaDoorSession] Final PC=0x${pc.toString(16)}, SP=0x${sp.toString(16)}`);
        this.socket.emit('door:status', { status: 'completed' });
        this.terminate();
        return;
      }

      // Schedule next iteration (no logging - happens hundreds of times/sec)
      setImmediate(() => this.runExecutionLoop());

    } catch (error) {
      // STOP instruction or error
      console.error('[AmigaDoorSession] Execution stopped with error:', error);
      console.error('[AmigaDoorSession] Error stack:', (error as Error).stack);
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
