import { Server, Socket } from 'socket.io';
import { MoiraEmulator } from './cpu/MoiraEmulator';
import { HunkLoader } from './loader/HunkLoader';
import { ExecLibrary } from './api/ExecLibrary';
import { LibraryTraps } from './api/LibraryTraps';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AmigaDoorSession - Manages a single user's door execution session
 * Uses library API emulation (Option C Hybrid) instead of ROM boot
 * Version: 2025-10-30 - Phase 2: Library call trapping
 */

export interface DoorConfig {
  executablePath: string;  // Path to Amiga door binary
  timeout?: number;        // Max execution time in seconds (default: 300)
  bbsSession?: any;        // BBS session data (user, system, node info)
}

export class AmigaDoorSession {
  private emulator: MoiraEmulator | null = null;
  private execLibrary: ExecLibrary | null = null;
  private libraryTraps: LibraryTraps | null = null;
  private socket: Socket;
  private config: DoorConfig;
  private isRunning: boolean = false;
  private executionTimer: NodeJS.Timeout | null = null;
  private iterationCount: number = 0;

  // Virtual time tracking (8MHz 68000 = 0.125 microseconds per cycle)
  private totalCycles: number = 0;
  private readonly CYCLES_PER_MICROSECOND = 8; // 8MHz CPU

  constructor(socket: Socket, config: DoorConfig) {
    this.socket = socket;
    this.config = {
      timeout: 300,      // 5 minutes default
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
      if (this.isRunning) {
        console.log(`[AmigaDoorSession] Received input from user: "${data}"`);
        // TODO: Queue input for door to read via aeGetCh()
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
      this.socket.emit('door:status', { status: 'initializing' });

      // Initialize emulator (16MB for full 24-bit address space)
      this.emulator = new MoiraEmulator(16 * 1024 * 1024);
      await this.emulator.initialize();

      // Initialize Exec system (NO ROM BOOT - Option C Hybrid)
      console.log('[AmigaDoorSession] Initializing Exec system (Option C Hybrid - no ROM boot)...');
      await this.initializeExec();

      console.log('[AmigaDoorSession] Exec system initialized!');
      console.log(`[AmigaDoorSession] ExecBase at 0x${this.execLibrary!.getExecBaseAddress().toString(16)}`);

      // Load the door executable
      console.log('[AmigaDoorSession] Loading door executable...');
      await this.loadDoor();

      // Set up timeout
      if (this.config.timeout) {
        this.executionTimer = setTimeout(() => {
          console.log('[AmigaDoorSession] Execution timeout');
          this.socket.emit('door:error', { message: 'Execution timeout' });
          this.terminate();
        }, this.config.timeout * 1000);
      }

      // Start door execution
      this.isRunning = true;
      this.socket.emit('door:status', { status: 'running' });

      console.log('[AmigaDoorSession] Starting door execution...');
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
   * Initialize Exec system (Option C Hybrid - no ROM boot)
   * Creates ExecBase and library structures directly
   */
  private async initializeExec(): Promise<void> {
    if (!this.emulator) throw new Error('Emulator not initialized');

    console.log('[AmigaDoorSession] Creating ExecBase structure...');

    this.execLibrary = new ExecLibrary(this.emulator);
    this.execLibrary.initialize();

    console.log('[AmigaDoorSession] Installing library call traps...');

    this.libraryTraps = new LibraryTraps(this.emulator, this.execLibrary);
    this.libraryTraps.installExecVectors();

    console.log('[AmigaDoorSession] Exec system ready');
  }

  /**
   * Load door executable
   */
  private async loadDoor(): Promise<void> {
    if (!this.emulator) throw new Error('Emulator not initialized');
    if (!this.execLibrary) throw new Error('Exec system not initialized');

    // Read door binary
    const binary = fs.readFileSync(this.config.executablePath);
    console.log(`[AmigaDoorSession] Door binary size: ${binary.length} bytes`);

    // Parse Amiga HUNK format
    const hunkLoader = new HunkLoader();
    const hunkFile = hunkLoader.parse(Buffer.from(binary));

    console.log(`[AmigaDoorSession] Parsed ${hunkFile.segments.length} segments:`);
    for (let i = 0; i < hunkFile.segments.length; i++) {
      const seg = hunkFile.segments[i];
      console.log(`  Segment ${i}: ${seg.type.toUpperCase()} at 0x${seg.address.toString(16)}, size=${seg.size} bytes`);
    }

    // Load segments into memory
    hunkLoader.load(this.emulator, hunkFile);

    console.log(`[AmigaDoorSession] Door loaded at entry point: 0x${hunkFile.entryPoint.toString(16)}`);

    // Set up CPU for door execution
    const initialSP = 0xFE000;  // Stack near top of first MB
    this.emulator.setRegister(15, initialSP);  // A7 (SP)
    this.emulator.setRegister(16, hunkFile.entryPoint);  // PC

    // Push exit sentinel to stack (for when door does RTS)
    const exitSentinel = 0xDEADBEEF;
    const newSP = initialSP - 4;
    this.emulator.writeMemory32(newSP, exitSentinel);
    this.emulator.setRegister(15, newSP);

    console.log(`[AmigaDoorSession] CPU configured for door execution:`);
    console.log(`  SP: 0x${newSP.toString(16)}`);
    console.log(`  PC: 0x${hunkFile.entryPoint.toString(16)}`);
    console.log(`  Exit sentinel: 0x${exitSentinel.toString(16)} (door will RTS to this)`);

    // Set up A6 register with ExecBase (standard Amiga convention)
    const execBaseAddr = this.execLibrary.getExecBaseAddress();
    this.emulator.setRegister(14, execBaseAddr);  // A6 = ExecBase
    console.log(`  A6 (ExecBase): 0x${execBaseAddr.toString(16)}`);

    console.log('[AmigaDoorSession] Door ready to execute!');
  }

  /**
   * Main execution loop - run door code until completion
   */
  private async runExecutionLoop(): Promise<void> {
    if (!this.emulator || !this.isRunning) return;

    try {
      const CYCLES_PER_ITERATION = 10000;  // Execute 10k cycles per iteration
      const exitSentinel = 0xDEADBEEF;

      while (this.isRunning) {
        // Check for library trap BEFORE execution
        const pc = this.emulator.getRegister(16);

        // Handle library trap if PC is at a vector address
        if (this.libraryTraps && this.libraryTraps.isTrapAddress(pc)) {
          console.log(`[AmigaDoorSession] Library trap detected at PC=0x${pc.toString(16)}`);
          if (!this.libraryTraps.handleTrap(pc)) {
            console.error(`[AmigaDoorSession] Failed to handle trap at 0x${pc.toString(16)}`);
          }
          // Don't execute cycles this iteration - trap handler set new PC
          continue;
        }

        // Check if door has exited (PC == exit sentinel)
        if (pc === exitSentinel) {
          console.log('[AmigaDoorSession] Door executed RTS to exit sentinel - door completed');
          this.terminate();
          return;
        }

        // Execute some cycles
        this.emulator.execute(CYCLES_PER_ITERATION);
        this.totalCycles += CYCLES_PER_ITERATION;
        this.iterationCount++;

        // Log progress every 10k iterations (100M cycles)
        if (this.iterationCount % 10000 === 0) {
          const totalSeconds = this.totalCycles / (this.CYCLES_PER_MICROSECOND * 1000000);
          console.log(`[AmigaDoorSession] Iteration ${this.iterationCount}: ${(this.totalCycles / 1000000).toFixed(1)}M cycles, ${totalSeconds.toFixed(2)}s virtual time, PC=0x${pc.toString(16)}`);
        }

        // Yield to event loop every 100 iterations
        if (this.iterationCount % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

    } catch (error) {
      console.error('[AmigaDoorSession] Error in execution loop:', error);
      this.socket.emit('door:error', {
        message: error instanceof Error ? error.message : 'Execution error'
      });
      this.terminate();
    }
  }

  /**
   * Terminate the door session
   */
  terminate(): void {
    if (!this.isRunning) return;

    console.log('[AmigaDoorSession] Terminating door session');

    this.isRunning = false;

    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
      this.executionTimer = null;
    }

    if (this.emulator) {
      this.emulator.cleanup();
      this.emulator = null;
    }

    this.socket.emit('door:status', { status: 'terminated' });
    console.log('[AmigaDoorSession] Door session terminated');
  }
}
