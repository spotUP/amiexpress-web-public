import { Server, Socket } from 'socket.io';
import { MoiraEmulator } from './cpu/MoiraEmulator';
import { HunkLoader } from './loader/HunkLoader';
import { ExecLibrary } from './api/ExecLibrary';
import { AEDoorLibrary } from './api/AEDoorLibrary';
import { DosLibrary } from './api/DOSLibrary';
import { LibraryTraps } from './api/LibraryTraps';
import { XIMProtocol } from './XIMProtocol';
import { KickstartRom } from './KickstartRom';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AmigaDoorSession - Manages a single user's door execution session
 * Uses library API emulation (Option C Hybrid) instead of ROM boot
 * Version: 2025-10-30 - Phase 3: AEDoor.library implementation
 */

export interface DoorConfig {
  executablePath: string;  // Path to Amiga door binary
  timeout?: number;        // Max execution time in seconds (default: 300)
  bbsSession?: any;        // BBS session data (user, system, node info)
}

export class AmigaDoorSession {
  private emulator: MoiraEmulator | null = null;
  private execLibrary: ExecLibrary | null = null;
  private aedoorLibrary: AEDoorLibrary | null = null;
  private dosLibrary: DosLibrary | null = null;
  private libraryTraps: LibraryTraps | null = null;
  private ximProtocol: XIMProtocol | null = null;
  private socket: Socket;
  private config: DoorConfig;
  private isRunning: boolean = false;
  private executionTimer: NodeJS.Timeout | null = null;
  private iterationCount: number = 0;
  private doorPortAddress: number = 0; // AEDoorPort message port address

  // Virtual time tracking (8MHz 68000 = 0.125 microseconds per cycle)
  private totalCycles: number = 0;
  private readonly CYCLES_PER_MICROSECOND = 8; // 8MHz CPU

  // I/O loop detection
  private lastPC: number = 0;
  private samePCCount: number = 0;
  private inIOLoop: boolean = false;
  private inSecondLoop: boolean = false;
  private skipNextExecute: boolean = false;
  private startupMessageSent: boolean = false; // Flag to send startup message only once

  // Memory change detection (for investigating what door expects)
  private lastMemoryValue: number = 0; // Last value at 0x2001
  private memoryChangeCount: number = 0; // How many times memory changed

  // Library call monitoring
  private libraryCallsInLoop: number = 0; // Count of library calls during polling loop

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
    console.log('[AmigaDoorSession] Setting up socket handlers for door:input');

    // Handle user input (keystrokes)
    this.socket.on('door:input', (data: string) => {
      console.log(`[AmigaDoorSession] 🎹 door:input event received: "${data}" isRunning=${this.isRunning} hasXIM=${!!this.ximProtocol}`);

      if (this.isRunning && this.ximProtocol) {
        console.log(`[AmigaDoorSession] Received input from user: "${data}"`);

        // Queue input for door to read via XIM GETKEY command
        this.ximProtocol.queueInput(data);
      } else {
        console.log(`[AmigaDoorSession] ❌ Input ignored: isRunning=${this.isRunning} hasXIM=${!!this.ximProtocol}`);
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

      // Load Kickstart ROM to provide real library code at trap addresses
      console.log('[AmigaDoorSession] Loading Kickstart ROM at 0xF80000...');
      const kickstart = new KickstartRom();
      const romData = kickstart.getRomData();
      this.emulator.loadROM(romData);
      console.log(`[AmigaDoorSession] Kickstart ROM loaded (${romData.length} bytes)`);

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
      console.log('[AmigaDoorSession] 🚪 Emitting door:status = running');
      this.socket.emit('door:status', { status: 'running' });

      console.log('[AmigaDoorSession] Starting door execution...');

    // VERIFY registers one more time before starting execution loop
    console.log('[AmigaDoorSession] === PRE-EXECUTION REGISTER CHECK ===');
    console.log(`  PC: 0x${this.emulator.getRegister(16).toString(16)}`);
    console.log(`  SP: 0x${this.emulator.getRegister(15).toString(16)}`);
    console.log(`  A6: 0x${this.emulator.getRegister(14).toString(16)}`);
    console.log(`  SR: 0x${this.emulator.getRegister(17).toString(16)}`);

      // CRITICAL: Door polls address 0x2001 in a loop at PC=0x1156
      // The instruction is: MOVE.B ($2000,A1),D0 where A1=0x1
      // Effective address = 0x1 + 0x2000 = 0x2001
      //
      // The door reads byte at 0x2001 and uses DBRA to loop
      // We set this to 0 initially - door should change it or we should signal completion
      this.emulator.writeMemory(0x2001, 0);
      console.log('[AmigaDoorSession] Set memory[0x2001] = 0 (polling flag)');

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
   * Initialize Exec system with Kickstart ROM
   * Loads Kickstart ROM for proper exception handling and system initialization
   */
  private async initializeExec(): Promise<void> {
    if (!this.emulator) throw new Error('Emulator not initialized');

    console.log('[AmigaDoorSession] Loading Kickstart ROM...');

    // Load Kickstart 3.1 ROM (most compatible)
    // Path: web/backend/data/amiga-roms/
    const romPath = path.join(__dirname, '../../data/amiga-roms/Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom');
    const romData = fs.readFileSync(romPath);
    this.emulator.loadROM(new Uint8Array(romData));

    console.log('[AmigaDoorSession] Kickstart ROM loaded - provides ROM routines');

    console.log('[AmigaDoorSession] Creating ExecBase structure...');

    this.execLibrary = new ExecLibrary(this.emulator);
    this.execLibrary.initialize();

    // CORRECT IMPLEMENTATION per express.e lines 4322-4324:
    // BBS checks if port exists (FindPort), creates it if not (CreatePort)
    // This handles both fresh start (port doesn't exist) and door already running (port exists)
    console.log('[AmigaDoorSession] Creating AEDoorPort for door communication...');

    const nodeId = this.config.bbsSession?.nodeId || 0;
    const portName = `AEDoorPort${nodeId}`;

    // Create the port that door will use to communicate with BBS
    const portAddr = this.execLibrary.createPublicPort(portName);
    console.log(`[AmigaDoorSession] Created ${portName} at 0x${portAddr.toString(16)}`);

    // Store for message handling
    this.doorPortAddress = portAddr;

    console.log('[AmigaDoorSession] Creating XIM Protocol handler...');

    // Create XIM protocol handler for door communication
    this.ximProtocol = new XIMProtocol(this.emulator, this.execLibrary, this.socket, portAddr);

    console.log('[AmigaDoorSession] Creating DOS.library...');

    // Create DosLibrary for file I/O and console operations
    this.dosLibrary = new DosLibrary(this.emulator);

    console.log('[AmigaDoorSession] Creating AEDoor.library...');

    // Create AEDoorLibrary with socket and session data
    this.aedoorLibrary = new AEDoorLibrary(
      this.socket,
      this.emulator,
      this.config.bbsSession || {}
    );

    console.log('[AmigaDoorSession] Installing library call traps...');

    this.libraryTraps = new LibraryTraps(this.emulator, this.execLibrary);
    this.libraryTraps.installExecVectors();

    // Set DOS.library reference
    this.libraryTraps.setDOSLibrary(this.dosLibrary);

    // Set AEDoorLibrary reference
    this.libraryTraps.setAEDoorLibrary(this.aedoorLibrary);

    // Set up callback to install library vectors when libraries are opened
    this.execLibrary.setLibraryOpenedCallback((name: string, addr: number) => {
      if (name.toLowerCase() === 'dos.library') {
        console.log('[AmigaDoorSession] dos.library opened, installing vectors...');
        this.libraryTraps!.installDOSVectors();
      }
      if (name.toLowerCase() === 'aedoor.library') {
        console.log('[AmigaDoorSession] AEDoor.library opened, installing vectors...');
        this.libraryTraps!.installAEDoorVectors();
      }
    });

    // Set up callback for when door sends messages to AEDoorPort
    // This replaces polling GetMsg() with trap-based interception
    this.execLibrary.setDoorMessageCallback((portAddr: number, msgAddr: number) => {
      this.handleDoorMessage(portAddr, msgAddr);
    });

    // Set up library call monitoring to track what door is doing during polling loop
    this.libraryTraps.setLibraryCallMonitor((functionName: string, pc: number) => {
      // Track library calls during polling loop
      if (this.startupMessageSent && this.iterationCount >= 1000) {
        this.libraryCallsInLoop++;
        console.log(`[AmigaDoorSession] *** LIBRARY CALL IN POLLING LOOP ***`);
        console.log(`[AmigaDoorSession]   Function: ${functionName}`);
        console.log(`[AmigaDoorSession]   PC: 0x${pc.toString(16)}`);
        console.log(`[AmigaDoorSession]   Iteration: ${this.iterationCount}`);
        console.log(`[AmigaDoorSession]   Total calls in loop: ${this.libraryCallsInLoop}`);
      }
    });

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
    // CRITICAL: Set SR FIRST before other registers, as setSR might affect CPU state
    console.log('[AmigaDoorSession] Setting up CPU registers...');

    // Set CPU to SUPERVISOR MODE (bit 13 of SR) to allow privileged instructions
    // SR = 0x2700 = supervisor mode with interrupts disabled
    this.emulator.setRegister(17, 0x2700);  // SR (Status Register)
    console.log(`  SR: 0x2700 (supervisor mode)`);

    // Set up A6 register with ExecBase (standard Amiga convention)
    const execBaseAddr = this.execLibrary.getExecBaseAddress();
    this.emulator.setRegister(14, execBaseAddr);  // A6 = ExecBase
    console.log(`  A6 (ExecBase): 0x${execBaseAddr.toString(16)}`);

    // Set up command-line arguments (argc/argv)
    // Doors need to know which node they're running on via argv[1]
    const ARGV_BASE = 0x0F0000;
    const ARGV_ARRAY = ARGV_BASE;         // Array of pointers
    const ARG0_STRING = ARGV_BASE + 0x100; // "GetAnswer" string
    const ARG1_STRING = ARGV_BASE + 0x200; // "0" string (node number)

    // Write argv[0] = "GetAnswer"
    const progName = "GetAnswer";
    for (let i = 0; i < progName.length; i++) {
      this.emulator.writeMemory(ARG0_STRING + i, progName.charCodeAt(i));
    }
    this.emulator.writeMemory(ARG0_STRING + progName.length, 0); // Null terminator
    this.emulator.writeMemory32(ARGV_ARRAY + 0, ARG0_STRING);

    // Write argv[1] = "0" (node number)
    // Get node ID from bbsSession or default to "0"
    const nodeId = this.config.bbsSession?.nodeId || 0;
    const nodeStr = nodeId.toString();
    for (let i = 0; i < nodeStr.length; i++) {
      this.emulator.writeMemory(ARG1_STRING + i, nodeStr.charCodeAt(i));
    }
    this.emulator.writeMemory(ARG1_STRING + nodeStr.length, 0); // Null terminator
    this.emulator.writeMemory32(ARGV_ARRAY + 4, ARG1_STRING);

    // Write argv[2] = NULL (end of array)
    this.emulator.writeMemory32(ARGV_ARRAY + 8, 0);

    // Set argc=2, argv in registers (SAS C calling convention)
    this.emulator.setRegister(0, 2);           // D0 = argc
    this.emulator.setRegister(8, ARGV_ARRAY);  // A0 = argv
    console.log(`  D0 (argc): 2`);
    console.log(`  A0 (argv): 0x${ARGV_ARRAY.toString(16)}`);
    console.log(`    argv[0]: "${progName}" at 0x${ARG0_STRING.toString(16)}`);
    console.log(`    argv[1]: "${nodeStr}" at 0x${ARG1_STRING.toString(16)}`);

    // Now set PC
    this.emulator.setRegister(16, hunkFile.entryPoint);  // PC
    console.log(`  PC: 0x${hunkFile.entryPoint.toString(16)}`);

    // Set SP and push exit sentinel LAST
    const initialSP = 0xFE000;  // Stack near top of first MB
    const exitSentinel = 0xDEADBEEF;
    const finalSP = initialSP - 4;

    // Push exit sentinel to stack (for when door does RTS)
    this.emulator.writeMemory32(finalSP, exitSentinel);
    console.log(`  Exit sentinel: 0x${exitSentinel.toString(16)} at 0x${finalSP.toString(16)}`);

    // CRITICAL: Initialize stack-based code that door expects
    // Door executes JSR (3682,A7) at PC=0x1248 (instruction 198)
    // At that time, SP=0xFDFF8, so it jumps to: 0xFDFF8 + 0xE62 = 0xFEE5A
    // JSR (d16,An) jumps TO that address, doesn't load FROM it!
    // So we need EXECUTABLE CODE at 0xFEE5A, not a pointer!
    const STACK_FN_OFFSET = 0xE62;

    // Write RTS instruction at multiple locations to cover SP variations
    // Door might have SP anywhere from finalSP-16 to finalSP+16
    for (let offset = -16; offset <= 16; offset += 2) {
      const stubAddr = finalSP + STACK_FN_OFFSET + offset;
      this.emulator.writeMemory16(stubAddr, 0x4E75);  // RTS
    }
    console.log(`  Stack function stubs (RTS): 0x${(finalSP + STACK_FN_OFFSET - 16).toString(16)} to 0x${(finalSP + STACK_FN_OFFSET + 16).toString(16)}`);

    // Set SP LAST
    this.emulator.setRegister(15, finalSP);  // A7 (SP)
    console.log(`  SP: 0x${finalSP.toString(16)}`);

    // CRITICAL FIX: Set A0 to AEDoorPort0 address
    // Door expects this in A0 and doesn't call FindPort()!
    // Discovery: Door uses A0 value directly for GetMsg/WaitPort calls
    console.log(`[AmigaDoorSession] ===============================================`);
    console.log(`[AmigaDoorSession] CRITICAL FIX: Setting A0 to AEDoorPort0 address`);
    console.log(`[AmigaDoorSession] ===============================================`);
    this.emulator.setRegister(8, this.doorPortAddress);  // A0 = AEDoorPort0
    console.log(`  A0: 0x${this.doorPortAddress.toString(16)} (AEDoorPort0)`);
    console.log(`[AmigaDoorSession] Door will now use correct port address!`);

    console.log(`[AmigaDoorSession] CPU configured for door execution`);

    console.log('[AmigaDoorSession] Door ready to execute!');

    // READ BACK REGISTERS ONE MORE TIME AT END OF loadDoor()
    const verifyFinalSP = this.emulator.getRegister(15);
    const verifyFinalPC = this.emulator.getRegister(16);
    const verifyFinalA0 = this.emulator.getRegister(8);
    console.log(`[AmigaDoorSession] END OF loadDoor(): SP=0x${verifyFinalSP.toString(16)}, PC=0x${verifyFinalPC.toString(16)}, A0=0x${verifyFinalA0.toString(16)}`);

    // CRITICAL FIX: Write AEDoorPort0 address to memory location 0xac
    // Discovery from A0 monitoring: Door reads port address from 0xac at iteration 168
    // The door loads A0 from this memory location instead of using FindPort()
    console.log(`[AmigaDoorSession] ===============================================`);
    console.log(`[AmigaDoorSession] CRITICAL FIX: Writing port address to memory[0xac]`);
    console.log(`[AmigaDoorSession] ===============================================`);
    this.emulator.writeMemory32(0xac, this.doorPortAddress);
    const verifyMemory = this.emulator.readMemory32(0xac);
    console.log(`  Memory[0xac] = 0x${verifyMemory.toString(16)} (AEDoorPort0 address)`);
    console.log(`[AmigaDoorSession] Door will now read correct port address from memory!`);
    console.log(`[AmigaDoorSession] ===============================================\n`);

    // Initialize A0 monitoring to track when it gets overwritten
    this.lastA0Value = verifyFinalA0;
    console.log(`[AmigaDoorSession] Starting A0 monitoring - will detect when door overwrites 0x${verifyFinalA0.toString(16)}`);
  }

  /**
   * Monitor A0 register changes during door execution to find where port address gets overwritten
   * This helps us identify where the door reads the garbage 0x7500002f value
   */
  private lastA0Value: number = 0;
  private a0ChangeDetected: boolean = false;

  private checkA0RegisterChange(): void {
    if (this.a0ChangeDetected || !this.emulator) return;

    const currentA0 = this.emulator.getRegister(8);

    // Check if A0 changed from our initialized value (0xa0000)
    if (this.lastA0Value === 0xa0000 && currentA0 !== 0xa0000) {
      this.a0ChangeDetected = true;

      console.log('\n[AmigaDoorSession] ===============================================');
      console.log('[AmigaDoorSession] *** A0 REGISTER CHANGED! ***');
      console.log('[AmigaDoorSession] ===============================================');
      console.log(`[AmigaDoorSession] Old A0: 0x${this.lastA0Value.toString(16)}`);
      console.log(`[AmigaDoorSession] New A0: 0x${currentA0.toString(16)}`);
      console.log(`[AmigaDoorSession] PC: 0x${this.emulator.getRegister(16).toString(16)}`);
      console.log(`[AmigaDoorSession] SP: 0x${this.emulator.getRegister(15).toString(16)}`);
      console.log(`[AmigaDoorSession] Iteration: ${this.iterationCount}`);
      console.log('[AmigaDoorSession]');
      console.log('[AmigaDoorSession] Reading memory around current PC:');

      const pc = this.emulator.getRegister(16);
      const bytes: string[] = [];
      for (let i = -8; i <= 16; i++) {
        bytes.push(this.emulator.readMemory(pc + i).toString(16).padStart(2, '0'));
      }
      console.log(`[AmigaDoorSession] Memory at PC-8 to PC+16: ${bytes.join(' ')}`);

      console.log('[AmigaDoorSession]');
      console.log('[AmigaDoorSession] Checking if A0 value was loaded from memory:');

      // Check common patterns:
      // 1. Direct load from absolute address
      // 2. Load from offset off A4, A5, A6 (base registers)
      // 3. Load from stack

      // Try to find memory location containing the new A0 value
      const searchValue = currentA0;
      const foundLocations: number[] = [];

      // Search in common areas
      const searchAreas = [
        { start: 0x0, end: 0x1000, name: 'Low memory (vectors/globals)' },
        { start: 0x8000, end: 0x9000, name: 'AllocMem area' },
        { start: 0xfdf00, end: 0xfe100, name: 'Stack area' }
      ];

      for (const area of searchAreas) {
        for (let addr = area.start; addr <= area.end - 4; addr += 2) {
          const value = this.emulator.readMemory32(addr);
          if (value === searchValue) {
            foundLocations.push(addr);
          }
        }
      }

      if (foundLocations.length > 0) {
        console.log(`[AmigaDoorSession] Found A0 value (0x${searchValue.toString(16)}) in memory at:`);
        foundLocations.forEach(addr => {
          console.log(`[AmigaDoorSession]   - 0x${addr.toString(16)}`);
        });
      } else {
        console.log(`[AmigaDoorSession] Value 0x${searchValue.toString(16)} not found in searched memory areas`);
        console.log(`[AmigaDoorSession] Might be computed or loaded from unmapped area`);
      }

      console.log('[AmigaDoorSession] ===============================================\n');
    }

    this.lastA0Value = currentA0;
  }

  /**
   * Main execution loop - run door code until completion
   */
  private async runExecutionLoop(): Promise<void> {
    if (!this.emulator || !this.isRunning) return;

    // CHECK REGISTERS AT START OF runExecutionLoop()
    const loopStartSP = this.emulator.getRegister(15);
    const loopStartPC = this.emulator.getRegister(16);
    console.log(`[AmigaDoorSession] START OF runExecutionLoop(): SP=0x${loopStartSP.toString(16)}, PC=0x${loopStartPC.toString(16)}`);

    try {
      const CYCLES_PER_ITERATION = 1;  // Execute 1 cycle per iteration for detailed debugging
      const exitSentinel = 0xDEADBEEF;

      // Log initial state BEFORE any execution
      console.log('[AmigaDoorSession] === EXECUTION LOOP STARTING ===');
      console.log(`[AmigaDoorSession] Initial PC: 0x${this.emulator.getRegister(16).toString(16)}`);
      console.log(`[AmigaDoorSession] Initial SP: 0x${this.emulator.getRegister(15).toString(16)}`);
      console.log(`[AmigaDoorSession] Initial A6: 0x${this.emulator.getRegister(14).toString(16)}`);
      console.log(`[AmigaDoorSession] Initial SR: 0x${this.emulator.getRegister(17).toString(16)}`);

      // Read first 16 bytes at entry point to verify code is loaded
      const entryPoint = 0x1000;
      const bytes: string[] = [];
      for (let i = 0; i < 16; i++) {
        const byte = this.emulator.readMemory(entryPoint + i);
        bytes.push(byte.toString(16).padStart(2, '0'));
      }
      console.log(`[AmigaDoorSession] Code at 0x1000: ${bytes.join(' ')}`);

      // Check exception vectors at 0x0000-0x0007 (initial SP and PC from ROM)
      const vec0 = this.emulator.readMemory32(0x0000);  // Initial SP
      const vec1 = this.emulator.readMemory32(0x0004);  // Initial PC
      console.log(`[AmigaDoorSession] ROM vectors: SP=0x${vec0.toString(16)}, PC=0x${vec1.toString(16)}`);

      // Track total instructions executed for detailed logging
      let totalInstructions = 0;

      while (this.isRunning) {
        // DEBUG: UNCONDITIONAL log to verify code changes
        if (this.iterationCount === 1010 || this.iterationCount === 1015 || this.iterationCount === 1020) {
          const pcTopOfLoop = this.emulator.getRegister(16);
          console.log(`[AmigaDoorSession] *** UNCONDITIONAL LOG [${this.iterationCount}] PC=0x${pcTopOfLoop.toString(16)} ***`);
        }

        // Check for library trap BEFORE execution
        const pc = this.emulator.getRegister(16);

        // ULTRA DEBUG: Log every 10000th iteration to trace control flow
        if (this.iterationCount % 10000 === 0 && this.iterationCount >= 1000) {
          console.log(`[AmigaDoorSession] *** WHILE LOOP START - Iteration ${this.iterationCount}, PC=0x${pc.toString(16)}`);
        }

        // Log first 10 iterations to see what happens
        if (this.iterationCount < 10) {
          console.log(`[AmigaDoorSession] Iteration ${this.iterationCount}: PC=0x${pc.toString(16)}`);
        }

        // For first iterations, execute ONE instruction at a time to trace
        if (this.iterationCount < 1000) {
          const tracePc = this.emulator.getRegister(16);
          const traceSp = this.emulator.getRegister(15);
          const traceA6 = this.emulator.getRegister(14);

          // Check for exit conditions FIRST (low memory PC = door trying to exit)
          if (tracePc < 0x100 && this.iterationCount > 100) {
            console.log(`[AmigaDoorSession] Door PC in low memory (0x${tracePc.toString(16)}) - treating as exit`);
            console.log(`[AmigaDoorSession] Total instructions executed: ${this.iterationCount}`);
            this.terminate();
            return;
          }

          // Detect delay loop - door stuck in DBRA countdown at PC=0x113c-0x1144
          // BETTER APPROACH: Let the loop run but limit iterations by reducing D0
          if (tracePc >= 0x113c && tracePc <= 0x1144 && !this.inIOLoop) {
            const d0 = this.emulator.getRegister(0);

            // If D0 is huge (delay loop with 3.7 billion iterations), reduce it
            if (d0 > 1000) {
              console.log(`[AmigaDoorSession] ===============================================`);
              console.log(`[AmigaDoorSession] *** DETECTED FIRST DELAY LOOP ***`);
              console.log(`[AmigaDoorSession] ===============================================`);
              console.log(`[AmigaDoorSession]   Door at PC: 0x${tracePc.toString(16)}, iteration ${this.iterationCount}`);
              console.log(`[AmigaDoorSession]   D0 (loop counter): 0x${d0.toString(16)} (${d0} iterations)`);
              console.log(`[AmigaDoorSession]   This is the DBRA delay loop!`);
              console.log(`[AmigaDoorSession]   *** REDUCING LOOP ITERATIONS ***`);

              // Reduce loop counter to something reasonable (100 iterations)
              // This lets the loop run naturally (preserving any initialization)
              // but completes quickly instead of running billions of times
              this.emulator.setRegister(0, 100);
              console.log(`[AmigaDoorSession]   Reduced D0 to 100 iterations`);
              console.log(`[AmigaDoorSession]   Loop will complete naturally, preserving all state`);

              this.inIOLoop = true;
              console.log(`[AmigaDoorSession] ===============================================`);
            }
          }

          // NOTE: Removed second loop detection at PC=0x1156
          // This was NOT a delay loop but rather a polling/retry loop
          // The door needs to run this naturally to complete initialization

          // Check for library trap BEFORE executing
          // CRITICAL FIX: Check based on OFFSET from A6, not absolute address
          // This handles cases where A6 is corrupted (e.g., A6=0x0)

          if (this.libraryTraps) {
            const traceA6 = this.emulator.getRegister(14);

            // Calculate offset - library vectors are 16-bit signed offsets
            // When A6 is very small (e.g., 0) and PC is in ROM/upper memory,
            // extract low 16 bits and sign-extend
            let offset = tracePc - traceA6;

            // If result looks like it might be a 16-bit signed offset in upper address space
            // (0xFFE2 = -30 as 16-bit, but 16777186 as 24-bit address)
            if (traceA6 < 0x10000 && offset > 0x8000 && offset < 0x1000000) {
              // Extract low 16 bits and sign-extend
              const low16 = offset & 0xFFFF;
              if (low16 >= 0x8000) {
                // Sign-extend from 16-bit to 32-bit
                offset = low16 - 0x10000;
              } else {
                offset = low16;
              }
            } else if (offset > 0x7FFFFFFF) {
              // Normal 32-bit sign extension
              offset = offset - 0x100000000;
            }

            // Check if this PC could be a library call (offset matches a known vector)
            if (this.libraryTraps.isTrapAddress(tracePc) ||
                (offset < 0 && offset >= -2000 && this.libraryTraps.isTrapOffset(offset))) {
              console.log(`[AmigaDoorSession] *** LIBRARY TRAP at PC=0x${tracePc.toString(16)} (A6=0x${traceA6.toString(16)}, offset=${offset}) ***`);

              // CRITICAL: Prefer address-based handler if PC is in trapMap (normal case)
              // Only use offset-based handler as fallback for corrupted A6 cases
              const handled = this.libraryTraps.isTrapAddress(tracePc)
                ? this.libraryTraps.handleTrap(tracePc)
                : this.libraryTraps.handleTrapByOffset(offset, traceA6);

              if (handled) {
                console.log(`[AmigaDoorSession] *** Trap handled successfully ***`);
              } else {
                console.error(`[AmigaDoorSession] *** Trap handler FAILED ***`);
              }
              // Trap handler set new PC, continue to next iteration
              this.iterationCount++;

              // DEBUG: Log iteration number for traps in range 1010-1020
              if (this.iterationCount >= 1010 && this.iterationCount <= 1020) {
                const newPc = this.emulator.getRegister(16);
                console.log(`[AmigaDoorSession] [${this.iterationCount}] After trap: PC=0x${newPc.toString(16)}`);
              }

              await new Promise(resolve => setImmediate(resolve));
              continue;
            }
          }

          // Read instruction bytes
          const op0 = this.emulator.readMemory(tracePc);
          const op1 = this.emulator.readMemory(tracePc + 1);
          const opcode = (op0 << 8) | op1;

          // DEBUG: Check memory vs file at critical address
          if (this.iterationCount === 418) {
            console.log(`[AmigaDoorSession] *** MEMORY CHECK at PC=0x${tracePc.toString(16)} ***`);
            console.log(`[AmigaDoorSession]   Memory word: 0x${opcode.toString(16).padStart(4, '0')}`);
            console.log(`[AmigaDoorSession]   File should have: 0x670c (BEQ.S +12)`);
            console.log(`[AmigaDoorSession]   Memory has:       0x${opcode.toString(16).padStart(4, '0')}`);
            if (opcode === 0x670c) {
              console.log(`[AmigaDoorSession]   ✓ MATCH - Memory matches file`);
            } else {
              console.log(`[AmigaDoorSession]   ✗ MISMATCH - Memory corrupted or wrong loading!`);
            }
          }

          // OPTION 2: DEEP TRACE - Log EVERY instruction from 408-436 (DoorStart complete window)
          const isDoorStartWindow = this.iterationCount >= 408 && this.iterationCount <= 436;

          if (this.iterationCount % 10 === 0 || isDoorStartWindow) {
            console.log(`[AmigaDoorSession] Inst ${this.iterationCount}: PC=0x${tracePc.toString(16)}, SP=0x${traceSp.toString(16)}, A6=0x${traceA6.toString(16)}, opcode=0x${opcode.toString(16).padStart(4, '0')}`);

            // During DoorStart window, log EVERYTHING
            if (isDoorStartWindow) {
              const d0 = this.emulator.getRegister(0);
              const d1 = this.emulator.getRegister(1);
              const a0 = this.emulator.getRegister(8);
              const a1 = this.emulator.getRegister(9);
              const sr = this.emulator.getRegister(17);  // Status Register

              // Decode instruction
              let instruction = 'UNKNOWN';

              // MOVEQ #imm,Dn (0x7000-0x7FFF)
              if ((opcode & 0xFF00) === 0x7000) {
                const dn = (opcode >> 9) & 0x07;
                const imm = opcode & 0xFF;
                instruction = `MOVEQ #${imm > 127 ? imm - 256 : imm},D${dn}`;
              }
              // BRA (0x6000-0x60FF for short, 0x6000 for word)
              else if ((opcode & 0xFF00) === 0x6000) {
                let displacement = opcode & 0xFF;
                if (displacement === 0) {
                  const word = this.emulator.readMemory16(tracePc + 2);
                  displacement = word > 0x7FFF ? word - 0x10000 : word;
                  const target = tracePc + 2 + displacement;
                  instruction = `BRA 0x${target.toString(16)} (displacement ${displacement})`;
                } else {
                  displacement = displacement > 127 ? displacement - 256 : displacement;
                  const target = tracePc + 2 + displacement;
                  instruction = `BRA.S 0x${target.toString(16)} (displacement ${displacement})`;
                }
              }
              // BNE (0x6600-0x66FF)
              else if ((opcode & 0xFF00) === 0x6600) {
                let displacement = opcode & 0xFF;
                if (displacement === 0) {
                  const word = this.emulator.readMemory16(tracePc + 2);
                  displacement = word > 0x7FFF ? word - 0x10000 : word;
                  const target = tracePc + 2 + displacement;
                  instruction = `BNE 0x${target.toString(16)} (displacement ${displacement})`;
                } else {
                  displacement = displacement > 127 ? displacement - 256 : displacement;
                  const target = tracePc + 2 + displacement;
                  instruction = `BNE.S 0x${target.toString(16)}`;
                }
              }
              // JSR
              else if ((opcode & 0xFFC0) === 0x4E80) {
                instruction = 'JSR (see detailed JSR logging below)';
              }
              // LEA
              else if ((opcode & 0xF1C0) === 0x41C0) {
                const an = (opcode >> 9) & 0x07;
                instruction = `LEA (xxx),A${an}`;
              }
              // MOVE.L
              else if ((opcode & 0xF000) === 0x2000) {
                // Decode MOVE.L more precisely to understand what's happening
                // MOVE.L has format: 00SSDDDEEEAAAAAA
                // SS = size (10 = long), DDD = dest reg, EEE = dest mode, AAAAAA = source
                const destReg = (opcode >> 9) & 0x07;
                const destMode = (opcode >> 6) & 0x07;
                const srcMode = (opcode >> 3) & 0x07;
                const srcReg = opcode & 0x07;

                let srcStr = 'unknown';
                let destStr = 'unknown';

                // Source: Dn register
                if (srcMode === 0) {
                  srcStr = `D${srcReg}`;
                }

                // Destination: (d16,An) addressing mode
                if (destMode === 5) {
                  const displacement = this.emulator.readMemory16(tracePc + 2);
                  const signedDisp = displacement > 0x7FFF ? displacement - 0x10000 : displacement;
                  destStr = `(0x${displacement.toString(16)},A${destReg})`;

                  // Calculate the actual destination address
                  const anReg = this.emulator.getRegister(8 + destReg);  // A0-A7 are registers 8-15
                  const destAddr = (anReg + signedDisp) >>> 0;  // Ensure 32-bit unsigned

                  instruction = `MOVE.L ${srcStr},${destStr} [dest_addr=0x${destAddr.toString(16)}]`;
                } else {
                  instruction = 'MOVE.L (complex)';
                }
              }

              // Decode SR flags (M68K Status Register format)
              // Bits: 15-8 = System byte, 7-0 = CCR (Condition Code Register)
              // CCR bits: X(4) N(3) Z(2) V(1) C(0)
              const zFlag = (sr >> 2) & 1;  // Zero flag
              const nFlag = (sr >> 3) & 1;  // Negative flag
              const vFlag = (sr >> 1) & 1;  // Overflow flag
              const cFlag = sr & 1;          // Carry flag

              console.log(`[AmigaDoorSession]   D0=0x${d0.toString(16)}, D1=0x${d1.toString(16)}, A0=0x${a0.toString(16)}, A1=0x${a1.toString(16)}`);
              console.log(`[AmigaDoorSession]   SR=0x${sr.toString(16).padStart(4, '0')} (Z=${zFlag} N=${nFlag} V=${vFlag} C=${cFlag})`);
              console.log(`[AmigaDoorSession]   Decoded: ${instruction}`);

              // CRITICAL: Before the MOVE.L at instruction 417, check all registers
              if (this.iterationCount === 417) {
                console.log(`[AmigaDoorSession] *** PRE-MOVE.L REGISTER DUMP ***`);
                console.log(`[AmigaDoorSession]   About to execute: MOVE.L D0,(0x8ac,A4)`);

                // Read ALL address registers
                for (let i = 0; i < 8; i++) {
                  const aReg = this.emulator.getRegister(8 + i);
                  console.log(`[AmigaDoorSession]   A${i} = 0x${aReg.toString(16)}`);
                }

                // Read ALL data registers
                for (let i = 0; i < 8; i++) {
                  const dReg = this.emulator.getRegister(i);
                  console.log(`[AmigaDoorSession]   D${i} = 0x${dReg.toString(16)}`);
                }

                // Calculate where it SHOULD write
                const a4 = this.emulator.getRegister(8 + 4);  // A4 is register 12
                const destAddr = (a4 + 0x08ac) >>> 0;
                console.log(`[AmigaDoorSession]   Destination: A4 + 0x8ac = 0x${a4.toString(16)} + 0x8ac = 0x${destAddr.toString(16)}`);
                console.log(`[AmigaDoorSession]   Will write D0 (0x${d0.toString(16)}) to address 0x${destAddr.toString(16)}`);

                // DOUBLE CHECK: What's already at the destination address?
                const currentValue = this.emulator.readMemory32(destAddr);
                console.log(`[AmigaDoorSession]   Current value at destination: 0x${currentValue.toString(16)}`);

                // TRIPLE CHECK: Read D0 again directly from CPU
                const d0Direct = this.emulator.getRegister(0);
                console.log(`[AmigaDoorSession]   D0 direct from CPU: 0x${d0Direct.toString(16)}`);
                if (d0Direct !== d0) {
                  console.log(`[AmigaDoorSession]   *** WARNING: D0 mismatch! Local var: 0x${d0.toString(16)}, Direct read: 0x${d0Direct.toString(16)} ***`);
                }
              }

              // CRITICAL: After the MOVE.L at instruction 417, check what was written to memory
              if (this.iterationCount === 418) {
                console.log(`[AmigaDoorSession] *** POST-MOVE.L MEMORY CHECK ***`);
                console.log(`[AmigaDoorSession]   Previous instruction was: MOVE.L D0,(0x8ac,A4)`);

                const a4 = this.emulator.getRegister(8 + 4);  // A4 is register 12
                const destAddr = (a4 + 0x08ac) >>> 0;
                console.log(`[AmigaDoorSession]   D0 value: 0x${d0.toString(16)} (should be 0x20000 from OpenLibrary)`);
                console.log(`[AmigaDoorSession]   A4 value: 0x${a4.toString(16)}`);
                console.log(`[AmigaDoorSession]   Destination address: 0x${a4.toString(16)} + 0x8ac = 0x${destAddr.toString(16)}`);

                // Read what was written to memory
                const written = this.emulator.readMemory32(destAddr);
                console.log(`[AmigaDoorSession]   Value at destination: 0x${written.toString(16)}`);

                if (written === d0) {
                  console.log(`[AmigaDoorSession]   ✓ MATCH - D0 value was correctly written to memory`);
                } else {
                  console.log(`[AmigaDoorSession]   ✗ MISMATCH - Memory has 0x${written.toString(16)} but D0 is 0x${d0.toString(16)}!`);
                  console.log(`[AmigaDoorSession]   *** THIS IS THE ROOT CAUSE - MOVE.L WROTE WRONG VALUE! ***`);
                }

                console.log(`[AmigaDoorSession]   SR after MOVE.L: 0x${sr.toString(16).padStart(4, '0')} (Z=${zFlag})`);
                if (zFlag === 1) {
                  console.log(`[AmigaDoorSession]   Z=1 because ${written === 0 ? 'ZERO was written (CCR is correct!)' : 'of unknown reason'}`);
                  console.log(`[AmigaDoorSession]   This prevents BNE from branching!`);
                }
              }
            }
          }

          // Check if this is a JSR instruction (0x4E80-0x4EBF range)
          if ((opcode & 0xFFC0) === 0x4E80) {
            const mode = (opcode >> 3) & 0x07;
            const reg = opcode & 0x07;
            let details = '';

            if (opcode === 0x4EAE || opcode === 0x4EAF) {  // JSR (d16,An)
              const offset = this.emulator.readMemory16(tracePc + 2);
              const signedOffset = offset > 0x7FFF ? offset - 0x10000 : offset;
              details = `JSR (${signedOffset},A${reg})`;
            } else if (opcode === 0x4EB9) {  // JSR (xxx).L
              const addr = this.emulator.readMemory32(tracePc + 2);
              details = `JSR (0x${addr.toString(16)}).L`;
            } else if (opcode === 0x4EBA) {  // JSR (d16,PC)
              const offset = this.emulator.readMemory16(tracePc + 2);
              details = `JSR (${offset},PC)`;
            } else {
              details = `JSR opcode=0x${opcode.toString(16)}`;
            }

            console.log(`[AmigaDoorSession] *** ${details} at PC=0x${tracePc.toString(16)}, SP=0x${traceSp.toString(16)} ***`);
          }

          // CRITICAL: Log IMMEDIATELY after execute for instruction 417 (MOVE.L)
          if (this.iterationCount === 417) {
            console.log(`[AmigaDoorSession] *** ABOUT TO EXECUTE INSTRUCTION 417 (MOVE.L D0,(0x8ac,A4)) ***`);
            const d0Before = this.emulator.getRegister(0);
            const a4Before = this.emulator.getRegister(8 + 4);
            const destAddrBefore = (a4Before + 0x8ac) >>> 0;
            const memBefore = this.emulator.readMemory32(destAddrBefore);
            console.log(`[AmigaDoorSession]   BEFORE: D0=0x${d0Before.toString(16)}, mem[0x${destAddrBefore.toString(16)}]=0x${memBefore.toString(16)}`);

            // TEST: Try writing directly via TypeScript wrapper to verify write path works
            console.log(`[AmigaDoorSession]   TEST: Writing 0xDEADBEEF to 0x${destAddrBefore.toString(16)} via TypeScript...`);
            this.emulator.writeMemory32(destAddrBefore, 0xDEADBEEF);
            const testRead = this.emulator.readMemory32(destAddrBefore);
            console.log(`[AmigaDoorSession]   TEST: Read back 0x${testRead.toString(16)} (should be 0xdeadbeef)`);
            if (testRead === 0xDEADBEEF) {
              console.log(`[AmigaDoorSession]   ✓ TypeScript write path works!`);
            } else {
              console.log(`[AmigaDoorSession]   ✗ TypeScript write path BROKEN!`);
            }

            // Restore to 0 for the test
            this.emulator.writeMemory32(destAddrBefore, 0);
          }

          // CRITICAL DEBUG: Check PC before and after execute
          if (this.iterationCount === 417) {
            const pcBefore = this.emulator.getRegister(16);
            console.log(`[AmigaDoorSession]   PC BEFORE execute: 0x${pcBefore.toString(16)}`);
          }

          const cyclesExecuted = this.emulator.execute(4);

          if (this.iterationCount === 417) {
            const pcAfter = this.emulator.getRegister(16);
            console.log(`[AmigaDoorSession]   PC AFTER execute: 0x${pcAfter.toString(16)}`);
            console.log(`[AmigaDoorSession]   execute(4) returned: ${cyclesExecuted} cycles`);
            if (cyclesExecuted === 0) {
              console.log(`[AmigaDoorSession]   *** MOIRA DIDN'T EXECUTE ANYTHING! CPU might be stopped or in exception ***`);
            }
          }

          // CRITICAL: Check IMMEDIATELY after execute for instruction 417
          if (this.iterationCount === 417) {
            const d0After = this.emulator.getRegister(0);
            const a4After = this.emulator.getRegister(8 + 4);
            const destAddrAfter = (a4After + 0x8ac) >>> 0;
            const memAfter = this.emulator.readMemory32(destAddrAfter);
            console.log(`[AmigaDoorSession]   AFTER:  D0=0x${d0After.toString(16)}, mem[0x${destAddrAfter.toString(16)}]=0x${memAfter.toString(16)}`);

            if (memAfter === d0After) {
              console.log(`[AmigaDoorSession]   ✓ MOVE.L executed correctly - D0 value written to memory!`);
            } else {
              console.log(`[AmigaDoorSession]   ✗ MOVE.L BUG - Memory has 0x${memAfter.toString(16)} but D0 is 0x${d0After.toString(16)}!`);
            }
          }

          // Check if A0 register changed (to detect port address overwrite)
          this.checkA0RegisterChange();

          this.iterationCount++;
          totalInstructions++;
          this.totalCycles += 4;
          await new Promise(resolve => setImmediate(resolve));
          continue;
        }

        // ULTRA DEBUG: If we reach here, we're at iteration >= 1000
        if (this.iterationCount % 10000 === 0 && this.iterationCount >= 1000) {
          console.log(`[AmigaDoorSession] *** AFTER < 1000 BLOCK - Iteration ${this.iterationCount}, PC=0x${pc.toString(16)}`);
        }

        // DEBUG: ALWAYS log at certain iterations
        if (this.iterationCount === 1000) {
          const pc1000 = this.emulator.getRegister(16);
          const sp1000 = this.emulator.getRegister(15);
          const a0 = this.emulator.getRegister(8);
          const a5 = this.emulator.getRegister(13);
          const a6 = this.emulator.getRegister(14);
          const op0 = this.emulator.readMemory(pc1000);
          const op1 = this.emulator.readMemory(pc1000 + 1);
          const opcode = (op0 << 8) | op1;
          console.log(`[AmigaDoorSession] *** DEBUG 1000: PC=0x${pc1000.toString(16)}, SP=0x${sp1000.toString(16)}, A0=0x${a0.toString(16)}, A5=0x${a5.toString(16)}, A6=0x${a6.toString(16)}, opcode=0x${opcode.toString(16)}`);
        }
        if (this.iterationCount === 1001) {
          const pc1001 = this.emulator.getRegister(16);
          const op0 = this.emulator.readMemory(pc1001);
          const op1 = this.emulator.readMemory(pc1001 + 1);
          const opcode = (op0 << 8) | op1;
          console.log(`[AmigaDoorSession] *** DEBUG 1001: PC=0x${pc1001.toString(16)}, opcode=0x${opcode.toString(16)}`);

          // Check a few more addresses to see the pattern
          for (let i = 0; i < 10; i++) {
            const addr = pc1001 + (i * 2);
            const b0 = this.emulator.readMemory(addr);
            const b1 = this.emulator.readMemory(addr + 1);
            const opc = (b0 << 8) | b1;
            console.log(`[AmigaDoorSession]   0x${addr.toString(16)}: 0x${opc.toString(16)}`);
          }
        }
        if (this.iterationCount === 10001) {
          console.log(`[AmigaDoorSession] *** DEBUG 10001: PC=0x${pc.toString(16)}`);
        }

        // CRITICAL: Unconditional logging for iterations 1008-1025 to debug the jump to 0xf00160
        const forceLog = (this.iterationCount >= 1008 && this.iterationCount <= 1025);

        // Minimal logging to avoid timing issues for other iterations
        const tracePc = this.emulator.getRegister(16);
        const isLowPC = (tracePc < 0x1000);
        const isHighPC = (tracePc >= 0xfe000);
        const needsLogging = forceLog || isLowPC || isHighPC;

        if (needsLogging) {
          const tracePc = this.emulator.getRegister(16);
          const traceSp = this.emulator.getRegister(15);
          const traceA6 = this.emulator.getRegister(14);
          const d0 = this.emulator.getRegister(0);
          const d1 = this.emulator.getRegister(1);
          const d2 = this.emulator.getRegister(2);
          const a0 = this.emulator.getRegister(8);
          const a1 = this.emulator.getRegister(9);

          // Read opcode
          const op0 = this.emulator.readMemory(tracePc);
          const op1 = this.emulator.readMemory(tracePc + 1);
          const opcode = (op0 << 8) | op1;

          // Show opcode for low PC (crash detection) and high PC (supervisor space)
          const isLowPC = (tracePc < 0x1000);
          const isHighPC = (tracePc >= 0xfe000);
          const showOpcode = forceLog || isLowPC || isHighPC || (this.iterationCount >= 1730 && this.iterationCount <= 1750);

          if (showOpcode) {
            console.log(`[AmigaDoorSession] [${this.iterationCount}] PC=0x${tracePc.toString(16)}, ` +
                        `SP=0x${traceSp.toString(16)}, A6=0x${traceA6.toString(16)}, ` +
                        `D0=0x${d0.toString(16)}, D1=0x${d1.toString(16)}, D2=0x${d2.toString(16)}, ` +
                        `A0=0x${a0.toString(16)}, A1=0x${a1.toString(16)}, ` +
                        `opcode=0x${opcode.toString(16).padStart(4, '0')}`);
            if (isLowPC) {
              console.log(`[AmigaDoorSession] *** WARNING: PC in low memory (0x${tracePc.toString(16)}) - likely crash! ***`);
            }
          } else {
            console.log(`[AmigaDoorSession] [${this.iterationCount}] PC=0x${tracePc.toString(16)}, ` +
                        `SP=0x${traceSp.toString(16)}, A6=0x${traceA6.toString(16)}`);
          }

          // At PC=0x1156, opcode 0x11b1 is MOVE.B (A1),D0
          // This is a polling loop where door reads memory[0x1] and uses DBRA
          // Door expects memory[0x1]=0xFF initially, loops until it becomes 0
          if (!this.startupMessageSent && tracePc === 0x1156 && this.iterationCount >= 1000 && this.iterationCount <= 1010) {
            console.log(`[AmigaDoorSession] ===============================================`);
            console.log(`[AmigaDoorSession] *** POLLING LOOP DETECTED ***`);
            console.log(`[AmigaDoorSession]   Door polling for startup message at PC=0x1156`);
            console.log(`[AmigaDoorSession]   D0=0x${d0.toString(16)} (loop counter)`);
            console.log(`[AmigaDoorSession]   Door is calling GetMsg() waiting for initial message`);
            console.log(`[AmigaDoorSession] ===============================================`);

            // Send startup message to unblock door from polling loop
            console.log(`[AmigaDoorSession]   Sending startup message to unblock door...`);
            this.sendStartupMessage();

            // INVESTIGATION: Let the timeout loop run naturally
            // Monitor what changes during the loop to understand what door expects
            // The loop reads memory[0x2001] but immediately overwrites the value
            // We need to find what event should trigger natural exit
            //
            // Possible triggers:
            // 1. Memory[0x2001] change (even though it gets overwritten)
            // 2. Library call response setting a flag
            // 3. Signal delivery changing task state
            // 4. Message port check succeeding

            this.startupMessageSent = true;
          }

          // Monitor memory changes and periodic logging
          if (tracePc === 0x1156) {
            // The instruction is: MOVE.B ($2000,A1),D0
            // Effective address = A1 + 0x2000
            const effectiveAddr = a1 + 0x2000;
            const byteRead = this.emulator.readMemory(effectiveAddr);

            // Detect memory changes at 0x2001
            if (byteRead !== this.lastMemoryValue) {
              this.memoryChangeCount++;
              console.log(`[AmigaDoorSession] *** MEMORY CHANGE DETECTED ***`);
              console.log(`[AmigaDoorSession]   Address: 0x${effectiveAddr.toString(16)}`);
              console.log(`[AmigaDoorSession]   Old value: 0x${this.lastMemoryValue.toString(16)}`);
              console.log(`[AmigaDoorSession]   New value: 0x${byteRead.toString(16)}`);
              console.log(`[AmigaDoorSession]   Change count: ${this.memoryChangeCount}`);
              console.log(`[AmigaDoorSession]   Iteration: ${this.iterationCount}`);
              this.lastMemoryValue = byteRead;
            }

            // Periodic status
            if (this.iterationCount % 50 === 0) {
              console.log(`[AmigaDoorSession]   Polling: A1=0x${a1.toString(16)}, EA=0x${effectiveAddr.toString(16)}, ` +
                          `byte=0x${byteRead.toString(16)}, D2=0x${d2.toString(16)}`);
            }
          }

          // If PC is outside code range, log error
          // Segment 0: 0x1000-0x2ba4 (CODE)
          // Segment 1: 0x2c00-0x2e54 (DATA)
          // Also allow ROM/library space: 0xf00000-0xffffff
          // Also allow high memory: 0xfe000-0xfffff (supervisor functions, stack)
          const inCodeSeg = (tracePc >= 0x1000 && tracePc <= 0x2ba4);
          const inDataSeg = (tracePc >= 0x2c00 && tracePc <= 0x2e54);
          const inRomSpace = (tracePc >= 0xf00000 && tracePc <= 0xffffff);
          const inLibSpace = (tracePc >= 0x10000 && tracePc <= 0xa0000); // ExecBase, libraries, ports
          const inHighMem = (tracePc >= 0xfe000 && tracePc <= 0xfffff); // Supervisor functions

          if (!inCodeSeg && !inDataSeg && !inRomSpace && !inLibSpace && !inHighMem) {
            console.log(`[AmigaDoorSession] *** INVALID PC DETECTED! ***`);
            console.log(`[AmigaDoorSession]   PC=0x${tracePc.toString(16)} is outside code range (0x1000-0x3000)`);
            console.log(`[AmigaDoorSession]   This likely indicates a crash or bad jump`);

            // Log stack contents to see return addresses
            console.log(`[AmigaDoorSession]   Stack dump (top 8 longwords):`);
            for (let i = 0; i < 8; i++) {
              const addr = traceSp + (i * 4);
              const value = this.emulator.readMemory32(addr);
              console.log(`[AmigaDoorSession]     SP+${i*4}: 0x${addr.toString(16)} = 0x${value.toString(16)}`);
            }

            // Stop execution
            console.log(`[AmigaDoorSession] Terminating due to invalid PC`);
            this.terminate();
            return;
          }
        }

        // Handle library trap if PC is at a vector address OR offset matches
        // CRITICAL: Also check offset-based traps for corrupted A6 cases
        if (this.libraryTraps) {
          const traceA6 = this.emulator.getRegister(14);

          // Calculate offset - library vectors are 16-bit signed offsets
          // When A6 is very small (e.g., 0) and PC is in ROM/upper memory,
          // extract low 16 bits and sign-extend
          let offset = pc - traceA6;

          // If result looks like it might be a 16-bit signed offset in upper address space
          // (0xFFE2 = -30 as 16-bit, but 16777186 as 24-bit address)
          if (traceA6 < 0x10000 && offset > 0x8000 && offset < 0x1000000) {
            // Extract low 16 bits and sign-extend
            const low16 = offset & 0xFFFF;
            if (low16 >= 0x8000) {
              // Sign-extend from 16-bit to 32-bit
              offset = low16 - 0x10000;
            } else {
              offset = low16;
            }
          } else if (offset > 0x7FFFFFFF) {
            // Normal 32-bit sign extension
            offset = offset - 0x100000000;
          }

          if (this.libraryTraps.isTrapAddress(pc) ||
              (offset < 0 && offset >= -2000 && this.libraryTraps.isTrapOffset(offset))) {
            console.log(`[AmigaDoorSession] Library trap detected at PC=0x${pc.toString(16)} (offset=${offset}, A6=0x${traceA6.toString(16)})`);

            // CRITICAL: Prefer address-based handler if PC is in trapMap (normal case)
            // Only use offset-based handler as fallback for corrupted A6 cases
            const handled = this.libraryTraps.isTrapAddress(pc)
              ? this.libraryTraps.handleTrap(pc)
              : this.libraryTraps.handleTrapByOffset(offset, traceA6);

            if (!handled) {
              console.error(`[AmigaDoorSession] Failed to handle trap at 0x${pc.toString(16)}`);
            }

            // Check PC immediately after trap handler
            const pcAfterTrap = this.emulator.getRegister(16);
            const spAfterTrap = this.emulator.getRegister(15);
            console.log(`[AmigaDoorSession] *** AFTER TRAP HANDLER: PC=0x${pcAfterTrap.toString(16)}, SP=0x${spAfterTrap.toString(16)}`);
            // Don't execute cycles this iteration - trap handler set new PC
            // INSTEAD of continue, skip execute by jumping to iteration increment
            // This prevents the WASM module from executing instructions during async control flow
            this.iterationCount++;

            // DEBUG: Log iteration number for traps in range 1010-1020
            if (this.iterationCount >= 1010 && this.iterationCount <= 1020) {
              console.log(`[AmigaDoorSession] [${this.iterationCount}] Post-1000 trap: PC=0x${pcAfterTrap.toString(16)}`);
            }

            await new Promise(resolve => setImmediate(resolve));
            continue;
          }
        }

        // Check if door has exited (PC == exit sentinel)
        if (pc === exitSentinel) {
          console.log('[AmigaDoorSession] Door executed RTS to exit sentinel - door completed');
          this.terminate();
          return;
        }

        // Check if PC is in dangerous low memory (exception vectors 0x0-0xFF)
        // This happens when stack corruption causes RTS to return to 0x0
        if (pc < 0x100 && this.iterationCount > 100) {
          console.log(`[AmigaDoorSession] Door PC in low memory (0x${pc.toString(16)}) - likely stack corruption, treating as exit`);
          console.log(`[AmigaDoorSession] This suggests the door tried to return but stack had invalid return address`);
          console.log(`[AmigaDoorSession] Total instructions executed: ${this.iterationCount}`);
          this.terminate();
          return;
        }

        // Detect I/O loop - door stuck in a small loop waiting for WaitPort to return
        // This happens when door is cycling through a few instructions (like 0x113c -> 0x1142 -> 0x1144)
        // If we've been in single-step mode for > 100 iterations, door is likely waiting
        if (this.iterationCount >= 100 && this.iterationCount <= 110) {
          console.log(`[AmigaDoorSession] DEBUG: Iteration ${this.iterationCount}, inIOLoop=${this.inIOLoop}`);
        }

        if (this.iterationCount === 101 && !this.inIOLoop) {
          console.log(`[AmigaDoorSession] ===============================================`);
          console.log(`[AmigaDoorSession] *** DETECTED I/O LOOP ***`);
          console.log(`[AmigaDoorSession] ===============================================`);
          console.log(`[AmigaDoorSession]   Door has executed ${this.iterationCount} single-step iterations`);
          console.log(`[AmigaDoorSession]   PC cycling in small loop (current: 0x${pc.toString(16)})`);
          console.log(`[AmigaDoorSession]   Door is likely waiting for message port I/O (WaitPort)`);
          console.log(`[AmigaDoorSession]   Sending test message to door...`);
          this.inIOLoop = true;

          // Send a test message to the door
          this.sendTestMessage();

          console.log('[AmigaDoorSession] Message sent! WaitPort trap will return it when door calls again.');
          console.log(`[AmigaDoorSession] ===============================================`);
        }

        // Execute some cycles
        // DEBUG: Check PC right before and after execute
        const pcBeforeExecute = this.emulator.getRegister(16);
        if (this.iterationCount >= 1008 && this.iterationCount <= 1025) {
          console.log(`[AmigaDoorSession] [${this.iterationCount}] BEFORE execute(): PC=0x${pcBeforeExecute.toString(16)}`);
        }
        this.emulator.execute(CYCLES_PER_ITERATION);
        this.totalCycles += CYCLES_PER_ITERATION;
        const pcAfterExecute = this.emulator.getRegister(16);
        if (this.iterationCount >= 1008 && this.iterationCount <= 1025) {
          console.log(`[AmigaDoorSession] [${this.iterationCount}] AFTER execute(): PC=0x${pcAfterExecute.toString(16)}`);
        }
        // Check if A0 register changed (to detect port address overwrite)
        this.checkA0RegisterChange();

        this.iterationCount++;

        // DISABLED: Don't poll for messages - this steals messages the door is sending!
        // XIM protocol: Door sends FIRST to AEDoorPort, BBS receives via PutMsg trap
        // We should process messages when PutMsg() trap fires, not by polling GetMsg()
        // if (this.iterationCount % 10 === 0) {
        //   this.processDoorMessages();
        // }

        // Log progress every 10k iterations (100M cycles)
        if (this.iterationCount % 10000 === 0) {
          const totalSeconds = this.totalCycles / (this.CYCLES_PER_MICROSECOND * 1000000);
          console.log(`[AmigaDoorSession] Iteration ${this.iterationCount}: ${(this.totalCycles / 1000000).toFixed(1)}M cycles, ${totalSeconds.toFixed(2)}s virtual time, PC=0x${pc.toString(16)}`);

          // Allow long execution but not infinite (for testing, keep it reasonable)
          if (this.iterationCount > 100000) {
            console.log(`[AmigaDoorSession] Door running for 100k iterations - likely stuck in polling loop`);
            console.log(`[AmigaDoorSession] PC=0x${pc.toString(16)}`);
            console.log(`[AmigaDoorSession] Terminating for testing purposes`);
            this.terminate();
            return;
          }
        }

        // Yield to event loop FREQUENTLY to allow input events to be processed
        // Following vAmiga pattern: sleep between execution chunks to match real Amiga timing
        // When waiting for line input, yield VERY frequently (every 10 iterations)
        // Otherwise yield less often (every 1000 iterations) but with timing delay

        const isWaitingForInput = (this.ximProtocol && this.ximProtocol.isWaitingForLineInput());

        if (isWaitingForInput) {
          // When waiting for input, yield every 10 iterations for responsiveness
          if (this.iterationCount % 10 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        } else {
          // Normal execution: yield every 10000 iterations
          // TEMPORARILY removed delay for faster testing - doors were running too slow
          if (this.iterationCount % 10000 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
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
   * Send a test message to the door to verify message port communication
   */
  private sendTestMessage(): void {
    if (!this.execLibrary || !this.emulator) {
      console.error('[AmigaDoorSession] Cannot send message: libraries not initialized');
      return;
    }

    console.log('[AmigaDoorSession] === SENDING TEST MESSAGE TO DOOR ===');

    // Find the AEDoorPort that we created during initialization
    const nodeId = this.config.bbsSession?.nodeId || 0;
    const portName = `AEDoorPort${nodeId}`;

    // Allocate memory for port name string
    const portNameSize = portName.length + 1; // +1 for null terminator
    const portNameAddr = this.execLibrary.allocMem(portNameSize, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR

    // Write port name to memory
    for (let i = 0; i < portName.length; i++) {
      this.emulator.writeMemory(portNameAddr + i, portName.charCodeAt(i));
    }
    this.emulator.writeMemory(portNameAddr + portName.length, 0); // Null terminator

    console.log(`[AmigaDoorSession] Looking for port "${portName}" (addr 0x${portNameAddr.toString(16)})`);

    // Call FindPort with memory address
    const portAddr = this.execLibrary.findPort(portNameAddr);

    // Free the port name memory
    this.execLibrary.freeMem(portNameAddr, portNameSize);

    if (portAddr === 0) {
      console.error(`[AmigaDoorSession] AEDoorPort${nodeId} not found!`);
      return;
    }

    console.log(`[AmigaDoorSession] Found ${portName} at 0x${portAddr.toString(16)}`);

    // Allocate memory for a test message
    // struct Message (20 bytes) + AEDoor extension (variable)
    const msgSize = 128; // Enough for struct Message + data
    const msgAddr = this.execLibrary.allocMem(msgSize, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR

    if (msgAddr === 0) {
      console.error('[AmigaDoorSession] Failed to allocate message memory');
      return;
    }

    console.log(`[AmigaDoorSession] Allocated message at 0x${msgAddr.toString(16)} (${msgSize} bytes)`);

    // Create a reply port for the door to send responses
    const replyPortAddr = this.execLibrary.createMsgPort();
    console.log(`[AmigaDoorSession] Created reply port at 0x${replyPortAddr.toString(16)}`);

    // Fill in struct Message (20 bytes)
    // struct Message {
    //   struct Node mn_Node;         // 14 bytes (offset 0)
    //   struct MsgPort *mn_ReplyPort; // 4 bytes (offset 14)
    //   UWORD mn_Length;             // 2 bytes (offset 18)
    // }

    // mn_Node (14 bytes)
    this.emulator.writeMemory32(msgAddr + 0, 0);  // ln_Succ
    this.emulator.writeMemory32(msgAddr + 4, 0);  // ln_Pred
    this.emulator.writeMemory(msgAddr + 8, 5);    // ln_Type (NT_MESSAGE=5)
    this.emulator.writeMemory(msgAddr + 9, 0);    // ln_Pri
    this.emulator.writeMemory32(msgAddr + 10, 0); // ln_Name

    // mn_ReplyPort
    this.emulator.writeMemory32(msgAddr + 14, replyPortAddr);

    // mn_Length
    this.emulator.writeMemory16(msgAddr + 18, msgSize);

    // AEDoor message extension (starts at offset 20)
    // For now, just send a simple test command
    const TEST_COMMAND = 1; // Some test command
    const testData = 0x12345678;

    this.emulator.writeMemory32(msgAddr + 20, TEST_COMMAND); // command
    this.emulator.writeMemory32(msgAddr + 24, testData);      // data

    // Write test string
    const testString = "Hello from BBS!\n";
    for (let i = 0; i < testString.length; i++) {
      this.emulator.writeMemory(msgAddr + 28 + i, testString.charCodeAt(i));
    }
    this.emulator.writeMemory(msgAddr + 28 + testString.length, 0); // Null terminator

    console.log('[AmigaDoorSession] Message structure:');
    console.log(`  mn_ReplyPort: 0x${replyPortAddr.toString(16)}`);
    console.log(`  mn_Length: ${msgSize}`);
    console.log(`  command: ${TEST_COMMAND}`);
    console.log(`  data: 0x${testData.toString(16)}`);
    console.log(`  string: "${testString.trim()}"`);

    // Send the message using PutMsg()
    console.log(`[AmigaDoorSession] Calling PutMsg(port=0x${portAddr.toString(16)}, msg=0x${msgAddr.toString(16)})`);
    this.execLibrary.putMsg(portAddr, msgAddr);

    console.log('[AmigaDoorSession] === TEST MESSAGE SENT ===');
    console.log('[AmigaDoorSession] Door should now receive this message via WaitPort()/GetMsg()');
  }

  /**
   * Send startup/initialization message to door
   *
   * This is sent when the door enters its GetMsg() polling loop.
   * The door expects the BBS to send an initial message to trigger
   * the door to start its main request/reply communication loop.
   */
  private sendStartupMessage(): void {
    if (!this.execLibrary || !this.emulator) {
      console.error('[AmigaDoorSession] Cannot send startup message: libraries not initialized');
      return;
    }

    console.log('[AmigaDoorSession] === SENDING STARTUP MESSAGE TO DOOR ===');

    // The door is polling AEDoorPort0 (created at 0xa0000 during init)
    const portAddr = this.doorPortAddress || 0xa0000;
    console.log(`[AmigaDoorSession] Target port: AEDoorPort0 at 0x${portAddr.toString(16)}`);

    // Allocate memory for startup message
    const msgSize = 128;
    const msgAddr = this.execLibrary.allocMem(msgSize, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR

    if (msgAddr === 0) {
      console.error('[AmigaDoorSession] Failed to allocate startup message memory');
      return;
    }

    console.log(`[AmigaDoorSession] Allocated startup message at 0x${msgAddr.toString(16)} (${msgSize} bytes)`);

    // Create reply port (door will reply to this)
    const replyPortAddr = this.execLibrary.createMsgPort();
    console.log(`[AmigaDoorSession] Created reply port at 0x${replyPortAddr.toString(16)}`);

    // Fill in struct Message (20 bytes)
    // mn_Node (14 bytes)
    this.emulator.writeMemory32(msgAddr + 0, 0);  // ln_Succ
    this.emulator.writeMemory32(msgAddr + 4, 0);  // ln_Pred
    this.emulator.writeMemory(msgAddr + 8, 5);    // ln_Type (NT_MESSAGE=5)
    this.emulator.writeMemory(msgAddr + 9, 0);    // ln_Pri
    this.emulator.writeMemory32(msgAddr + 10, 0); // ln_Name

    // mn_ReplyPort
    this.emulator.writeMemory32(msgAddr + 14, replyPortAddr);

    // mn_Length
    this.emulator.writeMemory16(msgAddr + 18, msgSize);

    // AEDoor message extension (starts at offset 20)
    // command = 0 (startup/init)
    // data = node ID
    const STARTUP_COMMAND = 0;
    const nodeId = this.config.bbsSession?.nodeId || 0;

    this.emulator.writeMemory32(msgAddr + 20, STARTUP_COMMAND); // command
    this.emulator.writeMemory32(msgAddr + 24, nodeId);          // data

    // Empty string for startup
    this.emulator.writeMemory(msgAddr + 28, 0); // Null terminator

    console.log('[AmigaDoorSession] Startup message structure:');
    console.log(`  mn_ReplyPort: 0x${replyPortAddr.toString(16)}`);
    console.log(`  mn_Length: ${msgSize}`);
    console.log(`  command: ${STARTUP_COMMAND} (STARTUP/INIT)`);
    console.log(`  data: ${nodeId} (node ID)`);
    console.log(`  string: "" (empty)`);

    // Send the message using PutMsg()
    console.log(`[AmigaDoorSession] Calling PutMsg(port=0x${portAddr.toString(16)}, msg=0x${msgAddr.toString(16)})`);
    this.execLibrary.putMsg(portAddr, msgAddr);

    console.log('[AmigaDoorSession] === STARTUP MESSAGE SENT ===');
    console.log('[AmigaDoorSession] Door should receive this via GetMsg() and exit polling loop');
  }

  /**
   * Force door to return from ROM WaitPort loop
   *
   * When the door calls WaitPort() and the queue is empty, WaitPort returns 0.
   * The door then loops waiting. If it jumped into ROM code to do this waiting,
   * it gets stuck there.
   *
   * This method forces the door to return from WaitPort by:
   * 1. Setting D0 to the message address (or 0 if still no messages)
   * 2. Popping the return address from stack
   * 3. Setting PC to that return address
   * 4. Refilling the prefetch queue
   */
  private forceROMReturn(): void {
    if (!this.emulator || !this.execLibrary) {
      console.error('[AmigaDoorSession] Cannot force ROM return: not initialized');
      return;
    }

    console.log('[AmigaDoorSession] Attempting to return door from ROM...');

    // Check if there's a return address on stack
    const sp = this.emulator.getRegister(15); // A7 = Stack Pointer
    console.log(`[AmigaDoorSession]   Current SP: 0x${sp.toString(16)}`);

    // Read return address from stack
    const returnAddr = this.emulator.readMemory32(sp);
    console.log(`[AmigaDoorSession]   Return address on stack: 0x${returnAddr.toString(16)}`);

    // Validate return address (should be in door code range)
    if (returnAddr < 0x1000 || returnAddr > 0x100000) {
      console.error(`[AmigaDoorSession]   Invalid return address: 0x${returnAddr.toString(16)}`);
      return;
    }

    // Check for messages in AEDoorPort0
    const nodeId = this.config.bbsSession?.nodeId || 0;
    const portName = `AEDoorPort${nodeId}`;

    // Allocate memory for port name
    const portNameSize = portName.length + 1;
    const portNameAddr = this.execLibrary.allocMem(portNameSize, 0x10001);
    for (let i = 0; i < portName.length; i++) {
      this.emulator.writeMemory(portNameAddr + i, portName.charCodeAt(i));
    }
    this.emulator.writeMemory(portNameAddr + portName.length, 0);

    // Find port
    const portAddr = this.execLibrary.findPort(portNameAddr);
    this.execLibrary.freeMem(portNameAddr, portNameSize);

    if (portAddr === 0) {
      console.error('[AmigaDoorSession]   Port not found!');
      return;
    }

    // Call WaitPort to get message (if any)
    const msgAddr = this.execLibrary.waitPort(portAddr);
    console.log(`[AmigaDoorSession]   WaitPort returned: 0x${msgAddr.toString(16)}`);

    // Set D0 to message address (WaitPort return value)
    this.emulator.setRegister(0, msgAddr);
    console.log(`[AmigaDoorSession]   Set D0 = 0x${msgAddr.toString(16)}`);

    // Pop return address from stack (RTS behavior)
    this.emulator.setRegister(15, sp + 4); // SP += 4
    console.log(`[AmigaDoorSession]   Adjusted SP to 0x${(sp + 4).toString(16)}`);

    // Set PC to return address
    this.emulator.setRegister(16, returnAddr);
    console.log(`[AmigaDoorSession]   Set PC = 0x${returnAddr.toString(16)}`);

    // Refill prefetch queue (critical!)
    this.emulator.refillPrefetch();
    console.log(`[AmigaDoorSession]   Refilled prefetch queue`);

    console.log('[AmigaDoorSession] *** DOOR RETURNED FROM ROM ***');
    console.log(`[AmigaDoorSession]   Door should now process message at 0x${msgAddr.toString(16)}`);
  }

  /**
   * Handle door message (trap-based, not polling)
   *
   * Called by ExecLibrary when door calls PutMsg() to send to AEDoorPort.
   * This is the CORRECT XIM protocol implementation.
   */
  private handleDoorMessage(portAddr: number, msgAddr: number): void {
    if (!this.emulator || !this.execLibrary) return;

    console.log(`[AmigaDoorSession] ===============================================`);
    console.log(`[AmigaDoorSession] *** DOOR MESSAGE RECEIVED (via PutMsg trap) ***`);
    console.log(`[AmigaDoorSession] ===============================================`);
    console.log(`[AmigaDoorSession]   Port: 0x${portAddr.toString(16)}`);
    console.log(`[AmigaDoorSession]   Message: 0x${msgAddr.toString(16)}`);

    // Parse message structure (same as processDoorMessages)
    const mn_ReplyPort = this.emulator.readMemory32(msgAddr + 14);
    const mn_Length = this.emulator.readMemory16(msgAddr + 18);

    // AEDoor message extension (after struct Message)
    const command = this.emulator.readMemory32(msgAddr + 20);
    const data = this.emulator.readMemory32(msgAddr + 24);

    // Read string (first 128 bytes max)
    let str = '';
    for (let i = 0; i < 128; i++) {
      const ch = this.emulator.readMemory(msgAddr + 28 + i);
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }

    console.log(`[AmigaDoorSession]   Command: ${command}`);
    console.log(`[AmigaDoorSession]   Data: ${data}`);
    console.log(`[AmigaDoorSession]   String: "${str}"`);
    console.log(`[AmigaDoorSession]   Reply port: 0x${mn_ReplyPort.toString(16)}`);

    // Use XIM Protocol handler to process and respond
    if (this.ximProtocol) {
      const ximMessage = this.ximProtocol.parseMessage(msgAddr);
      this.ximProtocol.handleMessage(ximMessage);
    } else {
      console.log(`[AmigaDoorSession] WARNING: XIM Protocol not initialized!`);
      // Fall back to old handler
      this.processCommand(command, data, str, msgAddr, mn_ReplyPort);
    }

    console.log(`[AmigaDoorSession] ===============================================`);
  }

  /**
   * Process messages from the door (OLD POLLING VERSION - DISABLED)
   *
   * The door sends messages TO the AEDoorPort requesting actions.
   * Based on express.e lines 4350-4400 (processXimMsg).
   *
   * NOTE: This is now replaced by handleDoorMessage() which is trap-based.
   */
  private processDoorMessages(): void {
    if (!this.emulator || !this.execLibrary) return;

    // Find the AEDoorPort if we haven't already (door creates it, we find it)
    if (this.doorPortAddress === 0) {
      const nodeId = this.config.bbsSession?.nodeId || 0;
      const portName = `AEDoorPort${nodeId}`;

      // Allocate memory for port name
      const portNameSize = portName.length + 1;
      const portNameAddr = this.execLibrary.allocMem(portNameSize, 0x10001);
      for (let i = 0; i < portName.length; i++) {
        this.emulator!.writeMemory(portNameAddr + i, portName.charCodeAt(i));
      }
      this.emulator!.writeMemory(portNameAddr + portName.length, 0);

      // Find port
      this.doorPortAddress = this.execLibrary.findPort(portNameAddr);
      this.execLibrary.freeMem(portNameAddr, portNameSize);

      if (this.doorPortAddress === 0) {
        // Port not created yet, door hasn't started
        return;
      }

      console.log(`[AmigaDoorSession] Found ${portName} at 0x${this.doorPortAddress.toString(16)} (door created it!)`);
    }

    // Poll the AEDoorPort for messages
    const msgAddr = this.execLibrary.getMsg(this.doorPortAddress);

    if (msgAddr === 0) {
      // No message
      return;
    }

    console.log(`[AmigaDoorSession] ===============================================`);
    console.log(`[AmigaDoorSession] *** DOOR MESSAGE RECEIVED! ***`);
    console.log(`[AmigaDoorSession] ===============================================`);
    console.log(`[AmigaDoorSession]   Message address: 0x${msgAddr.toString(16)}`);

    // Parse message structure
    const mn_ReplyPort = this.emulator.readMemory32(msgAddr + 14);
    const mn_Length = this.emulator.readMemory16(msgAddr + 18);

    // AEDoor message extension (after struct Message)
    const command = this.emulator.readMemory32(msgAddr + 20);
    const data = this.emulator.readMemory32(msgAddr + 24);

    // Read string (first 128 bytes max)
    let str = '';
    for (let i = 0; i < 128; i++) {
      const ch = this.emulator.readMemory(msgAddr + 28 + i);
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }

    console.log(`[AmigaDoorSession]   Command: ${command}`);
    console.log(`[AmigaDoorSession]   Data: ${data}`);
    console.log(`[AmigaDoorSession]   String: "${str}"`);
    console.log(`[AmigaDoorSession]   Reply port: 0x${mn_ReplyPort.toString(16)}`);

    // Process command based on type
    // Command constants from aedoor.h:
    // JH_WRITE = 3 (write text to terminal)
    // DT_NAME = 100 (get user name)
    // GETKEY = 500 (get user input)
    this.processCommand(command, data, str, msgAddr, mn_ReplyPort);

    console.log(`[AmigaDoorSession] ===============================================`);
  }

  /**
   * Process a specific door command
   *
   * Based on express.e processXimMsg() and aedoor.h command constants
   */
  private processCommand(command: number, data: number, str: string, msgAddr: number, replyPortAddr: number): void {
    console.log(`[AmigaDoorSession] Processing command ${command}...`);

    // Command constants from aedoor.h
    const JH_LI = 0;           // Line Input
    const JH_REGISTER = 1;     // Register door with BBS
    const JH_SHUTDOWN = 2;     // Shutdown door
    const JH_WRITE = 3;        // Write text to terminal
    const JH_SM = 4;           // Send Message
    const JH_PM = 5;           // Post Message
    const JH_HK = 6;           // HotKey
    const JH_SG = 7;           // Show GFile
    const JH_SF = 8;           // Show File
    const DT_NAME = 100;
    const DT_LOCATION = 102;
    const DT_PHONENUMBER = 103;
    const DT_SECLEVEL = 105;
    const GETKEY = 500;

    switch (command) {
      case JH_LI:
        // Line Input - door is requesting line input from user
        console.log(`[AmigaDoorSession]   JH_LI: Door requesting line input`);
        console.log(`[AmigaDoorSession]   Max length: ${data}`);
        // TODO: Pause door execution and wait for user input
        // For now, return empty string (user pressed Enter)
        this.writeStringToMessage(msgAddr, '');
        console.log(`[AmigaDoorSession]   Returned empty string (simulated Enter key)`);
        break;

      case JH_REGISTER:
        // Register door with BBS
        console.log(`[AmigaDoorSession]   JH_REGISTER: Door registering with BBS`);
        console.log(`[AmigaDoorSession]   Door is now active and ready`);
        // No response data needed, just reply
        break;

      case JH_SHUTDOWN:
        // Door is shutting down
        console.log(`[AmigaDoorSession]   JH_SHUTDOWN: Door shutting down`);
        console.log(`[AmigaDoorSession]   Terminating door session`);
        // Reply and then terminate
        this.execLibrary!.putMsg(replyPortAddr, msgAddr);
        this.terminate();
        return; // Don't send reply again

      case JH_WRITE:
        // Write text to terminal
        console.log(`[AmigaDoorSession]   JH_WRITE: "${str}"`);
        console.log(`[AmigaDoorSession]   Data (LF flag): ${data}`);

        // Send text to user's terminal
        let output = str;
        if (data === 1) {
          // LF flag set - add line feed
          output += '\r\n';
        }
        this.socket.emit('ansi-output', output);
        console.log(`[AmigaDoorSession]   Sent to terminal: "${output}"`);
        break;

      case DT_NAME:
        // Get user name - write to message string field
        console.log(`[AmigaDoorSession]   DT_NAME: Request for user name`);
        const userName = this.config.bbsSession?.user?.username || 'Sysop';
        this.writeStringToMessage(msgAddr, userName);
        console.log(`[AmigaDoorSession]   Replied with name: "${userName}"`);
        break;

      case DT_LOCATION:
        // Get user location
        console.log(`[AmigaDoorSession]   DT_LOCATION: Request for user location`);
        const location = this.config.bbsSession?.user?.location || 'Unknown';
        this.writeStringToMessage(msgAddr, location);
        console.log(`[AmigaDoorSession]   Replied with location: "${location}"`);
        break;

      case DT_SECLEVEL:
        // Get security level
        console.log(`[AmigaDoorSession]   DT_SECLEVEL: Request for security level`);
        const secLevel = this.config.bbsSession?.user?.secLevel || 100;
        // Write to data field (offset 24)
        this.emulator!.writeMemory32(msgAddr + 24, secLevel);
        console.log(`[AmigaDoorSession]   Replied with sec level: ${secLevel}`);
        break;

      case GETKEY:
        // Get user input - this requires pausing execution
        console.log(`[AmigaDoorSession]   GETKEY: Request for user input`);
        console.log(`[AmigaDoorSession]   TODO: Implement input handling (pause execution, wait for key)`);
        // For now, just reply with Enter key (0x0D)
        this.emulator!.writeMemory32(msgAddr + 24, 0x0D);
        break;

      default:
        console.log(`[AmigaDoorSession]   Unknown command: ${command}`);
        console.log(`[AmigaDoorSession]   TODO: Implement handler for this command`);
        break;
    }

    // Reply to the door by sending message back to its reply port
    this.execLibrary!.putMsg(replyPortAddr, msgAddr);
    console.log(`[AmigaDoorSession]   Sent reply to door at port 0x${replyPortAddr.toString(16)}`);
  }

  /**
   * Write a string to the message string field (offset 28)
   */
  private writeStringToMessage(msgAddr: number, str: string): void {
    if (!this.emulator) return;

    // Write string to offset 28 (after Message header + command + data)
    for (let i = 0; i < str.length && i < 200; i++) {
      this.emulator.writeMemory(msgAddr + 28 + i, str.charCodeAt(i));
    }
    // Null terminate
    this.emulator.writeMemory(msgAddr + 28 + str.length, 0);
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

    console.log('[AmigaDoorSession] 🚪 Emitting door:status = terminated');
    this.socket.emit('door:status', { status: 'terminated' });
    console.log('[AmigaDoorSession] Door session terminated');
  }
}
