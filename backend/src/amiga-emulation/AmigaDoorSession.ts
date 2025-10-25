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
  private iterationCount: number = 0;
  private lastPCs: number[] = []; // Track recent PCs to detect loops
  private pcSamples: Map<number, number> = new Map(); // PC -> count

  // Virtual time tracking (8MHz 68000 = 0.125 microseconds per cycle)
  private totalCycles: number = 0;
  private virtualTimeMicros: number = 0;
  private readonly CYCLES_PER_MICROSECOND = 8; // 8MHz CPU

  // DBRA loop detection
  private lastPC: number = 0;
  private samePCCount: number = 0;
  private readonly DBRA_THRESHOLD = 50; // If same PC 50 times, it's a delay loop

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
      // Address 0-3: Initial stack pointer
      // Address 4-7: Initial program counter
      const initialSP = 0xFE000; // Stack near top of memory
      this.emulator.writeMemory(0x0, (initialSP >> 24) & 0xFF);
      this.emulator.writeMemory(0x1, (initialSP >> 16) & 0xFF);
      this.emulator.writeMemory(0x2, (initialSP >> 8) & 0xFF);
      this.emulator.writeMemory(0x3, initialSP & 0xFF);

      this.emulator.writeMemory(0x4, (hunkFile.entryPoint >> 24) & 0xFF);
      this.emulator.writeMemory(0x5, (hunkFile.entryPoint >> 16) & 0xFF);
      this.emulator.writeMemory(0x6, (hunkFile.entryPoint >> 8) & 0xFF);
      this.emulator.writeMemory(0x7, hunkFile.entryPoint & 0xFF);

      console.log(`[AmigaDoorSession] Reset vectors: SP=0x${initialSP.toString(16)}, PC=0x${hunkFile.entryPoint.toString(16)}`);

      // Reset CPU (reads vectors from addresses 0 and 4)
      this.emulator.reset();

      // NOW set up ExecBase at address 4 (AFTER reset has read the PC vector)
      // Use 0xFF8000 instead of 0xFF0000 so that negative offsets stay >= 0xFF0000
      // (Moira's trap handler only intercepts reads >= 0xFF0000)
      // With ExecBase=0xFF8000, function at -6000 would be 0xFF6000 (still >= 0xFF0000)
      const execBaseAddr = 0xFF8000;
      this.emulator.writeMemory(0x4, (execBaseAddr >> 24) & 0xFF);
      this.emulator.writeMemory(0x5, (execBaseAddr >> 16) & 0xFF);
      this.emulator.writeMemory(0x6, (execBaseAddr >> 8) & 0xFF);
      this.emulator.writeMemory(0x7, execBaseAddr & 0xFF);

      console.log(`[AmigaDoorSession] ExecBase set at address 4: 0x${execBaseAddr.toString(16)} (after reset)`);
      console.log(`[AmigaDoorSession] Library trap mechanism ready (Moira intercepts 0xFF0000+ reads)`);
      console.log(`[AmigaDoorSession] Expected: Door will JSR -552(A6) -> 0xFEFDD8`);

      const actualSP = this.emulator.getRegister(15);
      const actualPC = this.emulator.getRegister(16);
      console.log(`[AmigaDoorSession] Stack pointer after reset: 0x${actualSP.toString(16)}`);
      console.log(`[AmigaDoorSession] Program counter after reset: 0x${actualPC.toString(16)}`);

      if (actualSP !== initialSP) {
        console.error(`[AmigaDoorSession] WARNING: SP mismatch! Expected 0x${initialSP.toString(16)}, got 0x${actualSP.toString(16)}`);
      }
      if (actualPC !== hunkFile.entryPoint) {
        console.error(`[AmigaDoorSession] WARNING: PC mismatch! Expected 0x${hunkFile.entryPoint.toString(16)}, got 0x${actualPC.toString(16)}`);
      }

      // CRITICAL: Push a return address to stack for when door does RTS to exit
      // On real Amiga, the OS calls the door with JSR, which pushes a return address
      // We simulate this by pushing a sentinel address that we can detect
      const exitSentinel = 0xDEADBEEF; // Unique address to detect door exit
      const newSP = actualSP - 4; // Push 4 bytes
      this.emulator.writeMemory(newSP, (exitSentinel >> 24) & 0xFF);
      this.emulator.writeMemory(newSP + 1, (exitSentinel >> 16) & 0xFF);
      this.emulator.writeMemory(newSP + 2, (exitSentinel >> 8) & 0xFF);
      this.emulator.writeMemory(newSP + 3, exitSentinel & 0xFF);
      this.emulator.setRegister(15, newSP); // Update SP

      console.log(`[AmigaDoorSession] Pushed exit sentinel 0x${exitSentinel.toString(16)} to stack`);
      console.log(`[AmigaDoorSession] When door executes RTS to exit, PC will become 0x${exitSentinel.toString(16)}`);

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

      // Check what's at address 4 (should be ExecBase on real Amiga)
      const addr4_0 = this.emulator.readMemory(4);
      const addr4_1 = this.emulator.readMemory(5);
      const addr4_2 = this.emulator.readMemory(6);
      const addr4_3 = this.emulator.readMemory(7);
      const addr4Val = (addr4_0 << 24) | (addr4_1 << 16) | (addr4_2 << 8) | addr4_3;
      console.log(`[AmigaDoorSession] ExecBase at address 4: 0x${addr4Val.toString(16)}`);
      if (addr4Val === 0) {
        console.log(`  ⚠️ WARNING: ExecBase is NULL! Door won't be able to call libraries!`);
      }

      // Log first few instructions to see what door is doing
      console.log('[AmigaDoorSession] First 10 instructions at entry point:');
      for (let i = 0; i < 10; i++) {
        const addr = hunkFile.entryPoint + (i * 2);
        const b0 = this.emulator.readMemory(addr);
        const b1 = this.emulator.readMemory(addr + 1);
        const b2 = this.emulator.readMemory(addr + 2);
        const b3 = this.emulator.readMemory(addr + 3);
        console.log(`  0x${addr.toString(16)}: ${b0.toString(16).padStart(2, '0')} ${b1.toString(16).padStart(2, '0')} ${b2.toString(16).padStart(2, '0')} ${b3.toString(16).padStart(2, '0')}`);
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
    if (!this.emulator || !this.isRunning) {
      console.log('[AmigaDoorSession] Execution loop stopped - early exit');
      return;
    }

    try {
      // Sample PC before execution to track where we are
      const pcBefore = this.emulator.getRegister(16);

      // Check for DBRA delay loop (same PC repeatedly)
      if (pcBefore === this.lastPC) {
        this.samePCCount++;

        // If we've been at the same PC for DBRA_THRESHOLD iterations, it's a delay loop
        if (this.samePCCount >= this.DBRA_THRESHOLD) {
          // Read instruction bytes to confirm it's a DBRA loop
          const instr0 = this.emulator.readMemory(pcBefore);
          const instr1 = this.emulator.readMemory(pcBefore + 1);

          // DBRA instruction: 51 c8 (or 51 cx where x is register)
          const isDBRA = (instr0 === 0x51 && (instr1 & 0xF8) === 0xC8);

          if (isDBRA) {
            // This is a delay loop! Skip it by advancing virtual time
            const d0 = this.emulator.getRegister(0);
            const estimatedCycles = d0 * 10; // DBRA loop ≈ 10 cycles per iteration

            console.log(`[DBRA Skip] Detected delay loop at PC=0x${pcBefore.toString(16)}, D0=${d0}`);
            console.log(`  Skipping ~${estimatedCycles} cycles (${(estimatedCycles / this.CYCLES_PER_MICROSECOND / 1000).toFixed(2)}ms)`);

            // Advance virtual time without executing cycles
            this.totalCycles += estimatedCycles;
            this.virtualTimeMicros = this.totalCycles / this.CYCLES_PER_MICROSECOND;

            // Force loop to exit by setting D0 to -1 (0xFFFFFFFF)
            this.emulator.setRegister(0, 0xFFFFFFFF);

            // Execute just 1 cycle to let DBRA complete
            this.emulator.execute(1);

            // Reset detection counter
            this.samePCCount = 0;
            this.lastPC = this.emulator.getRegister(16);

            // Continue immediately to next iteration
            setImmediate(() => this.runExecutionLoop());
            return;
          }
        }
      } else {
        this.samePCCount = 0;
      }

      this.lastPC = pcBefore;

      // Execute a small number of cycles (allows I/O to be processed)
      // Use 1 cycle for first 20 iterations to see exact execution flow
      // Then 1000 cycles for normal operation
      const cyclesToExecute = this.iterationCount <= 20 ? 1 : 1000;
      const cyclesExecuted = this.emulator.execute(cyclesToExecute);

      if (cyclesExecuted === 0) {
        console.warn('[AmigaDoorSession] CPU executed 0 cycles - door completed or hit invalid instruction');
        const pc = this.emulator.getRegister(16);
        const sp = this.emulator.getRegister(15);
        console.warn(`[AmigaDoorSession] Final PC=0x${pc.toString(16)}, SP=0x${sp.toString(16)}`);
        this.socket.emit('door:status', { status: 'completed' });
        this.terminate();
        return;
      }

      // Update virtual time
      this.totalCycles += cyclesExecuted;
      this.virtualTimeMicros = this.totalCycles / this.CYCLES_PER_MICROSECOND;

      // Track PC to detect infinite loops
      this.iterationCount++;
      const pcAfter = this.emulator.getRegister(16);

      // Check for exit sentinel - door executed RTS to exit
      if (pcAfter === 0xDEADBEEF) {
        console.log('[AmigaDoorSession] Door executed RTS to exit sentinel - door completed successfully!');
        this.socket.emit('door:status', { status: 'completed' });
        this.socket.emit('ansi-output', '\r\n\r\n[Door completed]\r\n');
        this.terminate();
        return;
      }

      // Sample PC every 100 iterations
      if (this.iterationCount % 100 === 0) {
        this.lastPCs.push(pcAfter);
        const count = this.pcSamples.get(pcAfter) || 0;
        this.pcSamples.set(pcAfter, count + 1);

        // Keep only last 10 samples
        if (this.lastPCs.length > 10) {
          this.lastPCs.shift();
        }
      }

      // Check for JSR instructions (detect all function calls)
      const instr0 = this.emulator.readMemory(pcAfter);
      const instr1 = this.emulator.readMemory(pcAfter + 1);
      const instr2 = this.emulator.readMemory(pcAfter + 2);
      const instr3 = this.emulator.readMemory(pcAfter + 3);

      // JSR instruction has multiple forms:
      // 1. JSR absolute.L: 0x4E B9 xx xx xx xx
      // 2. JSR (An) with displacement: 0x4E AE/AF xx xx (standard library calls!)
      // 3. BSR (Branch to Subroutine): 0x61 xx

      if (instr0 === 0x4E) {
        // JSR absolute.L: 0x4E B9
        if (instr1 === 0xB9) {
          const addr0 = this.emulator.readMemory(pcAfter + 2);
          const addr1 = this.emulator.readMemory(pcAfter + 3);
          const addr2 = this.emulator.readMemory(pcAfter + 4);
          const addr3 = this.emulator.readMemory(pcAfter + 5);
          const targetAddr = (addr0 << 24) | (addr1 << 16) | (addr2 << 8) | addr3;

          if (this.iterationCount % 100 === 0) {
            console.log(`[JSR absolute] PC=0x${pcAfter.toString(16)} calling 0x${targetAddr.toString(16)}`);
          }

          if (targetAddr >= 0xff0000 && targetAddr <= 0xffffff) {
            console.log(`[*** LIBRARY CALL ***] JSR absolute to 0x${targetAddr.toString(16)} at PC=0x${pcAfter.toString(16)}`);
          }
        }
        // JSR (An) with displacement: 0x4E AE/AF (standard Amiga library call convention!)
        // 0x4E AE = JSR (A6) with 16-bit displacement
        // This is THE way Amiga programs call library functions!
        else if (instr1 === 0xAE || instr1 === 0xAF) {
          const offset = (instr2 << 8) | instr3;
          // Convert to signed 16-bit
          const signedOffset = offset > 0x7FFF ? offset - 0x10000 : offset;
          const a6 = this.emulator.getRegister(14); // A6 register
          const targetAddr = (a6 + signedOffset) >>> 0; // Ensure unsigned 32-bit

          // Log library calls in first 20 iterations only
          if (this.iterationCount <= 20) {
            console.log(`  [Lib Call] JSR -${Math.abs(signedOffset)}(A6) → 0x${targetAddr.toString(16)} from PC=0x${pcBefore.toString(16)}`);
          }
        }
      }

      // Log first 20 iterations in detail (1 cycle each for tracing)
      if (this.iterationCount <= 20) {
        const sp = this.emulator.getRegister(15);
        const d0 = this.emulator.getRegister(0);
        const a6 = this.emulator.getRegister(14);

        console.log(`[Door Iteration ${this.iterationCount}] PC=0x${pcAfter.toString(16)}, SP=0x${sp.toString(16)}, A6=0x${a6.toString(16)}, D0=0x${d0.toString(16)}`);
        console.log(`  Instruction: ${instr0.toString(16).padStart(2, '0')} ${instr1.toString(16).padStart(2, '0')} ${instr2.toString(16).padStart(2, '0')} ${instr3.toString(16).padStart(2, '0')}`);
      }

      // Every 500 iterations (~5 seconds), log status
      if (this.iterationCount % 500 === 0) {
        const sp = this.emulator.getRegister(15);
        const d0 = this.emulator.getRegister(0);

        const virtualTimeMs = this.virtualTimeMicros / 1000;

        console.log(`[Door Trace] Iteration ${this.iterationCount} (Virtual time: ${virtualTimeMs.toFixed(2)}ms):`);
        console.log(`  Total cycles: ${this.totalCycles}, PC=0x${pcAfter.toString(16)}, SP=0x${sp.toString(16)}, D0=0x${d0.toString(16)}`);
        console.log(`  Instruction bytes: ${instr0.toString(16).padStart(2, '0')} ${instr1.toString(16).padStart(2, '0')} ${instr2.toString(16).padStart(2, '0')} ${instr3.toString(16).padStart(2, '0')}`);

        // Show PC distribution
        console.log(`  Last 10 PC samples: [${this.lastPCs.map(pc => '0x' + pc.toString(16)).join(', ')}]`);

        // Detect tight loop (same PC appearing frequently)
        const maxCount = Math.max(...Array.from(this.pcSamples.values()));
        if (maxCount > 5) {
          const loopPC = Array.from(this.pcSamples.entries()).find(([pc, count]) => count === maxCount);
          if (loopPC) {
            console.warn(`  ⚠️ POSSIBLE INFINITE LOOP: PC 0x${loopPC[0].toString(16)} seen ${loopPC[1]} times`);
          }
        }
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
