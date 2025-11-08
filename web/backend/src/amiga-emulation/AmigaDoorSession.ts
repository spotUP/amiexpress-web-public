import { Server, Socket } from 'socket.io';
import { MoiraEmulator } from './cpu/MoiraEmulator';
import { HunkLoader } from './loader/HunkLoader';
import { ExecLibrary } from './api/ExecLibrary';
import { AEDoorLibrary } from './api/AEDoorLibrary';
import { DosLibrary } from './api/DosLibrary';
import { IconLibrary } from './api/IconLibrary';
import { LibraryTraps } from './api/LibraryTraps';
import { XIMProtocol } from './XIMProtocol';
import { KickstartRom } from './KickstartRom';
import { nodeStatusManager, NodeStatus } from '../nodes/NodeStatusManager';
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
  private iconLibrary: IconLibrary | null = null;
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
  private lastPCs: number[] = []; // Track last 20 PC values for debugging
  private hitUnmapped: boolean = false; // Track if we've already logged unmapped PC

  // Memory change detection (for investigating what door expects)
  private lastMemoryValue: number = 0; // Last value at 0x2001
  private memoryChangeCount: number = 0; // How many times memory changed

  // Library call monitoring
  private libraryCallsInLoop: number = 0; // Count of library calls during polling loop

  // CRITICAL FIX: Track last intercepted trap to prevent double interception
  // When JSR handler intercepts a call, store the target address. If the next
  // iteration tries to intercept the same address, skip it (we already handled it).
  private lastInterceptedTrap: number = 0; // Last library trap address we intercepted
  private lastInterceptedIteration: number = 0; // Iteration when we intercepted it

  /**
   * UNIFIED TRAP DETECTION AND HANDLING
   *
   * This is the SINGLE canonical method for detecting and handling library traps.
   * It consolidates all the scattered trap detection logic into one place.
   *
   * Returns: true if trap was handled (caller should continue to next iteration)
   *          false if no trap detected (caller should execute instruction normally)
   */
  private checkAndHandleLibraryTrap(pc: number): Promise<boolean> {
    if (!this.libraryTraps) {
      return Promise.resolve(false);
    }

    // Null check for emulator
    if (!this.emulator) {
      return Promise.resolve(false);
    }

    // Read instruction at PC to check if it's JSR (d16,A6)
    const op0 = this.emulator.readMemory(pc);
    const op1 = this.emulator.readMemory(pc + 1);
    const opcode = (op0 << 8) | op1;
    const isJSR_A6 = (opcode === 0x4eae);

    const a6 = this.emulator.getRegister(14);

    // Calculate offset from A6
    let offset = pc - a6;

    // Handle 16-bit signed offset wrapping
    if (a6 < 0x10000 && offset > 0x8000 && offset < 0x1000000) {
      const low16 = offset & 0xFFFF;
      offset = (low16 >= 0x8000) ? (low16 - 0x10000) : low16;
    } else if (offset > 0x7FFFFFFF) {
      offset = offset - 0x100000000;
    }

    // Determine if this is a library trap
    const isTrapAddress = this.libraryTraps.isTrapAddress(pc);
    const isTrapOffset = (offset < 0 && offset >= -2000 && this.libraryTraps.isTrapOffset(offset));
    const isLibraryTrap = isTrapAddress || isTrapOffset;

    if (!isLibraryTrap) {
      return Promise.resolve(false);
    }

    // Check if we just handled this exact trap (prevent double interception)
    if (pc === this.lastInterceptedTrap &&
        this.iterationCount - this.lastInterceptedIteration <= 2) {
      console.log(`[AmigaDoorSession] *** SKIPPING DUPLICATE TRAP at PC=0x${pc.toString(16)} (already handled at iteration ${this.lastInterceptedIteration}) ***`);
      this.lastInterceptedTrap = 0;
      this.lastInterceptedIteration = 0;
      return Promise.resolve(true); // Skip but return true to continue iteration
    }

    // Handle JSR (d16,A6) specially - intercept BEFORE execution
    if (isJSR_A6) {
      const offset16 = this.emulator.readMemory16(pc + 2);
      const jsrOffset = (offset16 & 0x8000) ? (offset16 - 0x10000) : offset16;
      const targetAddr = (a6 + jsrOffset) & 0xFFFFFF;

      console.log(`[AmigaDoorSession] *** JSR (d16,A6) TRAP at PC=0x${pc.toString(16)} -> target=0x${targetAddr.toString(16)} ***`);

      // Manually push return address (JSR is 4 bytes)
      const returnAddr = pc + 4;
      const sp = this.emulator.getRegister(15);
      this.emulator.writeMemory32(sp - 4, returnAddr);
      this.emulator.setRegister(15, sp - 4);

      // Handle the trap
      const handled = this.libraryTraps.handleTrapByOffset(jsrOffset, a6);

      if (handled) {
        // Mark as intercepted to prevent duplicate handling
        this.lastInterceptedTrap = targetAddr;
        this.lastInterceptedIteration = this.iterationCount;
        return Promise.resolve(true);
      }

      return Promise.resolve(false);
    }

    // Handle trap at current PC (PC is already at library vector)
    console.log(`[AmigaDoorSession] *** DIRECT TRAP at PC=0x${pc.toString(16)} (offset=${offset}, A6=0x${a6.toString(16)}) ***`);

    const handled = isTrapAddress
      ? this.libraryTraps.handleTrap(pc)
      : this.libraryTraps.handleTrapByOffset(offset, a6);

    if (handled) {
      // Mark as intercepted
      this.lastInterceptedTrap = pc;
      this.lastInterceptedIteration = this.iterationCount;
      return Promise.resolve(true);
    }

    return Promise.resolve(false);
  }

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

      // Set door directory for PROGDIR: device
      const doorDir = path.dirname(this.config.executablePath);
      if (this.dosLibrary) {
        this.dosLibrary.setDoorDirectory(doorDir);
        console.log(`[AmigaDoorSession] Set door directory: ${doorDir}`);
      }

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

      // CRITICAL: Must await the execution loop so start() doesn't return until door completes
      await this.runExecutionLoop();

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

    // RTW and other doors search for "AEDoorPort%d" where %d is the node number
    // From RTW binary strings: "AEDoorPort%d", "Couldn't create reply port"
    // Each node needs its own numbered port
    const nodeId = this.config.bbsSession?.nodeId || 0;
    const portName = `AEDoorPort${nodeId}`;  // e.g., "AEDoorPort0"

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

    // CRITICAL FIX: Set output callback so DOS Write() sends to terminal
    // WHO door and other DOS-based doors use Write() instead of AEDoor WriteStr()
    this.dosLibrary.setOutputCallback((text: string) => {
      this.socket.emit('ansi-output', text);
    });
    console.log('[AmigaDoorSession] DOS.library output callback configured');

    console.log('[AmigaDoorSession] Initializing node status semaphores for WHO doors...');

    // Initialize multiPort/singlePort semaphore structures for WHO door access
    // WHO doors (like RTW) search for node information via FindSemaphore("AEServer.%d")
    nodeStatusManager.initializeInEmulator(this.emulator, this.execLibrary, 0xB0000);

    // Update current node status (reuse nodeId from above)
    const userName = this.config.bbsSession?.user?.username || 'Unknown';
    const userLocation = this.config.bbsSession?.user?.location || '';

    nodeStatusManager.updateNode(this.emulator, nodeId, {
      status: NodeStatus.ENV_DOORS,
      handle: userName,
      location: userLocation,
      misc1: path.basename(this.config.executablePath),  // Door name
      misc2: 1,  // Available for chat
      baud: '28800'  // Default baud rate
    });

    console.log(`[AmigaDoorSession] Node ${nodeId} status: ${userName} running ${path.basename(this.config.executablePath)}`);

    console.log('[AmigaDoorSession] Creating AEDoor.library...');

    // Create AEDoorLibrary with socket and session data
    this.aedoorLibrary = new AEDoorLibrary(
      this.socket,
      this.emulator,
      this.config.bbsSession || {}
    );

    console.log('[AmigaDoorSession] Creating icon.library...');

    // Create IconLibrary for .info file access
    // bbsRoot is project root (2 levels up from backend directory)
    const bbsRoot = path.resolve(process.cwd(), '../..');
    this.iconLibrary = new IconLibrary(this.emulator, bbsRoot);

    console.log('[AmigaDoorSession] Installing library call traps...');

    this.libraryTraps = new LibraryTraps(this.emulator, this.execLibrary);
    this.libraryTraps.installExecVectors();

    // Set DOS.library reference
    this.libraryTraps.setDOSLibrary(this.dosLibrary);

    // Set AEDoorLibrary reference
    this.libraryTraps.setAEDoorLibrary(this.aedoorLibrary);

    // Set icon.library reference
    this.libraryTraps.setIconLibrary(this.iconLibrary);

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
      if (name.toLowerCase() === 'icon.library') {
        console.log('[AmigaDoorSession] icon.library opened, installing vectors...');
        this.libraryTraps!.installIconVectors();
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

    // Set up command-line arguments for SAS/C startup
    // SAS/C c.o expects: D0 = length of argument string, A0 = pointer to argument string
    // AmigaDOS passes arguments WITH leading space: " 2" not "2"
    // The startup code will parse the string into argc/argv
    const nodeId = this.config.bbsSession?.nodeId || 0;
    const argString = " " + nodeId.toString();  // Leading space + node number (e.g., " 2")
    const ARG_STRING_ADDR = 0x0F0100;

    // Write argument string to memory
    for (let i = 0; i < argString.length; i++) {
      this.emulator.writeMemory(ARG_STRING_ADDR + i, argString.charCodeAt(i));
    }
    this.emulator.writeMemory(ARG_STRING_ADDR + argString.length, 0); // Null terminator

    // Set D0 = length of argument string (INCLUDING leading space), A0 = pointer to argument string
    // This is the AmigaDOS/SAS-C calling convention for CLI programs
    this.emulator.setRegister(0, argString.length);  // D0 = argument length
    this.emulator.setRegister(8, ARG_STRING_ADDR);   // A0 = argument string
    console.log(`  D0 (arg length): ${argString.length}`);
    console.log(`  A0 (arg string): 0x${ARG_STRING_ADDR.toString(16)} = "${argString}"`);

    // Now set PC
    this.emulator.setRegister(16, hunkFile.entryPoint);  // PC
    console.log(`  PC: 0x${hunkFile.entryPoint.toString(16)}`);

    // Set SP and push exit address LAST
    // CRITICAL: Stack must be where door's StackSwapStruct expects it
    // Doors have compiled-in stack addresses, typically around 0xFE000
    // This matches what the WHO door's StackSwapStruct contains (0xFD000-0xFE000)
    // Allocate at standard Amiga location used by CLI programs
    const initialSP = 0xFE000;   // Standard CLI stack location
    const finalSP = 0xFDFFC;     // 4-byte aligned (0xFDFFC % 4 = 0)

    // Push exit address to stack (for when door does RTS)
    // According to AmigaDOS docs: "Assembly programs should place a return code in D0,
    // and execute an RTS instruction with their original stack ptr."
    // We provide an address that will be detected as program exit
    const exitTrapAddress = 0xFFFF00;  // Special address to detect program exit

    // Push SINGLE exit address at top of stack for RTS
    // DO NOT fill entire stack with exit sentinels - this corrupts argc/argv saved by C startup code!
    // SAS/C startup: saves D0 (argc) and A0 (argv) to stack BEFORE calling main()
    // If we fill stack with 0xFFFF00, main() gets corrupted argc/argv
    this.emulator.writeMemory32(finalSP, exitTrapAddress);  // Single exit trap at SP
    console.log(`  Exit trap address: 0x${exitTrapAddress.toString(16)} at SP=0x${finalSP.toString(16)}`);

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
   * Count the number of set bits in a 16-bit value
   * Used for determining register count in MOVEM instructions
   */
  private countBits(value: number): number {
    let count = 0;
    for (let i = 0; i < 16; i++) {
      if (value & (1 << i)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Decode M68K instruction for debugging (basic decoder)
   */
  private decodeInstruction(pc: number, opcode: number): string {
    // Basic M68K instruction decoder for common opcodes
    const hi = (opcode >> 8) & 0xFF;
    const lo = opcode & 0xFF;

    // MOVE.L
    if ((hi & 0xC0) === 0x00 && (hi & 0x30) === 0x20) {
      return `MOVE.L (opcode: 0x${opcode.toString(16)})`;
    }
    // MOVEM
    if ((hi & 0xFB) === 0x48 && (lo & 0xC0) === 0xC0) {
      return `MOVEM (opcode: 0x${opcode.toString(16)})`;
    }
    // JSR
    if (opcode === 0x4EB9 || (hi === 0x4E && (lo & 0xC0) === 0x80)) {
      const target = this.emulator?.readMemory32(pc + 2) || 0;
      return `JSR 0x${target.toString(16)}`;
    }
    // RTS
    if (opcode === 0x4E75) {
      return 'RTS';
    }
    // RTE
    if (opcode === 0x4E73) {
      return 'RTE';
    }
    // TRAP
    if ((opcode & 0xFFF0) === 0x4E40) {
      const trapNum = opcode & 0x0F;
      return `TRAP #${trapNum}`;
    }
    // MOVE to/from SR
    if ((opcode & 0xFFC0) === 0x46C0) {
      return `MOVE to SR (opcode: 0x${opcode.toString(16)})`;
    }
    if ((opcode & 0xFFC0) === 0x40C0) {
      return `MOVE from SR (opcode: 0x${opcode.toString(16)})`;
    }
    // LEA
    if ((hi & 0xF1) === 0x41 && (lo & 0xC0) === 0xC0) {
      return `LEA (opcode: 0x${opcode.toString(16)})`;
    }
    // TST
    if ((hi & 0xFF) === 0x4A) {
      return `TST (opcode: 0x${opcode.toString(16)})`;
    }
    // BRA/Bcc
    if ((hi & 0xF0) === 0x60) {
      const cond = (hi & 0x0F);
      const condNames = ['BRA', 'BSR', 'BHI', 'BLS', 'BCC', 'BCS', 'BNE', 'BEQ',
                         'BVC', 'BVS', 'BPL', 'BMI', 'BGE', 'BLT', 'BGT', 'BLE'];
      return `${condNames[cond] || 'Bxx'} (opcode: 0x${opcode.toString(16)})`;
    }
    // DBcc
    if ((hi & 0xF0) === 0x50 && (lo & 0xC8) === 0xC8) {
      return `DBcc (opcode: 0x${opcode.toString(16)})`;
    }
    // ADD/SUB
    if ((hi & 0xF0) === 0xD0) {
      return `ADD (opcode: 0x${opcode.toString(16)})`;
    }
    if ((hi & 0xF0) === 0x90) {
      return `SUB (opcode: 0x${opcode.toString(16)})`;
    }
    // CMP
    if ((hi & 0xF0) === 0xB0) {
      return `CMP (opcode: 0x${opcode.toString(16)})`;
    }
    // AND/OR
    if ((hi & 0xF0) === 0xC0) {
      return `AND (opcode: 0x${opcode.toString(16)})`;
    }
    if ((hi & 0xF0) === 0x80) {
      return `OR (opcode: 0x${opcode.toString(16)})`;
    }

    return `Unknown (opcode: 0x${opcode.toString(16)})`;
  }

  /**
   * Main execution loop - CLEAN REWRITE (2025-11-02)
   *
   * Simple architecture:
   *   1. Check if paused (async input)
   *   2. Get current PC
   *   3. Check exit conditions
   *   4. UNIFIED trap detection (single check, no duplicates)
   *   5. Execute one instruction
   *   6. Yield to event loop
   *
   * This eliminates:
   *   - Multiple scattered trap detection blocks
   *   - Iteration-based conditional logic (< 1000 vs >= 1000)
   *   - Duplicate logging and complex nesting
   */
  private async runExecutionLoop(): Promise<void> {
    if (!this.emulator || !this.isRunning) return;

    try {
      // Log initial state
      console.log('[AmigaDoorSession] === EXECUTION LOOP STARTING ===');
      console.log(`[AmigaDoorSession] Initial PC: 0x${this.emulator.getRegister(16).toString(16)}`);
      console.log(`[AmigaDoorSession] Initial SP: 0x${this.emulator.getRegister(15).toString(16)}`);
      console.log(`[AmigaDoorSession] Initial A6: 0x${this.emulator.getRegister(14).toString(16)}`);

      // Verify code is loaded at entry point
      const entryPoint = 0x1000;
      const bytes: string[] = [];
      for (let i = 0; i < 16; i++) {
        bytes.push(this.emulator.readMemory(entryPoint + i).toString(16).padStart(2, '0'));
      }
      console.log(`[AmigaDoorSession] Code at 0x1000: ${bytes.join(' ')}`);

      // WHO requires pr_CLI with proper CLI structure containing command line
      // From emulator tests: WHO checks argc - if no args, prints banner and exits
      // WHO reads command line from CLI structure (cli_CommandName), not D0/A0
      const taskAddr = 0x70000;
      const prCliOffset = 0xAC;
      const cliStructAddr = 0x90000;
      const nodeId = this.config.bbsSession?.nodeId || 0;

      // Create minimal CLI structure at 0x90000
      // struct CommandLineInterface {
      //   BPTR cli_Result2;        // 0x00 - secondary result
      //   BSTR cli_SetName;        // 0x04 - current program name
      //   BPTR cli_CommandDir;     // 0x08 - lock on command directory
      //   LONG cli_ReturnCode;     // 0x0C - return code
      //   BSTR cli_CommandName;    // 0x10 - command line BSTR ← THIS!
      //   ...
      // }

      // Write command line BSTR: "WHO 3"
      // BSTR format: BPTR points to LENGTH BYTE (4-byte aligned), string data follows
      const cmdLineAddr = 0x90100;  // 4-byte aligned
      const cmdLine = `WHO ${nodeId}`;
      this.emulator.writeMemory(cmdLineAddr, cmdLine.length);  // BSTR length at 0x90100
      for (let i = 0; i < cmdLine.length; i++) {
        this.emulator.writeMemory(cmdLineAddr + 1 + i, cmdLine.charCodeAt(i));  // String data at 0x90101+
      }
      this.emulator.writeMemory(cmdLineAddr + 1 + cmdLine.length, 0); // Null terminate

      // Write CLI structure
      this.emulator.writeMemory32(cliStructAddr + 0x00, 0);  // cli_Result2
      this.emulator.writeMemory32(cliStructAddr + 0x04, 0);  // cli_SetName
      this.emulator.writeMemory32(cliStructAddr + 0x08, 0);  // cli_CommandDir
      this.emulator.writeMemory32(cliStructAddr + 0x0C, 0);  // cli_ReturnCode
      // BPTR points to LENGTH BYTE (4-byte aligned)
      this.emulator.writeMemory32(cliStructAddr + 0x10, cmdLineAddr >> 2); // cli_CommandName (BPTR)
      this.emulator.writeMemory32(cliStructAddr + 0x14, 0);  // cli_FailLevel
      this.emulator.writeMemory32(cliStructAddr + 0x18, 0);  // cli_Prompt
      this.emulator.writeMemory32(cliStructAddr + 0x1C, 0);  // cli_StandardInput
      this.emulator.writeMemory32(cliStructAddr + 0x20, 0);  // cli_CurrentInput
      this.emulator.writeMemory32(cliStructAddr + 0x24, 0);  // cli_CommandFile
      this.emulator.writeMemory32(cliStructAddr + 0x28, -1); // cli_Interactive = TRUE
      this.emulator.writeMemory32(cliStructAddr + 0x2C, 0);  // cli_Background = FALSE
      this.emulator.writeMemory32(cliStructAddr + 0x30, 0);  // cli_CurrentOutput
      this.emulator.writeMemory32(cliStructAddr + 0x34, 4096); // cli_DefaultStack
      this.emulator.writeMemory32(cliStructAddr + 0x38, 0);  // cli_StandardOutput
      this.emulator.writeMemory32(cliStructAddr + 0x3C, 0);  // cli_Module

      // Set pr_CLI to point to CLI structure
      this.emulator.writeMemory32(taskAddr + prCliOffset, cliStructAddr >> 2); // pr_CLI is BPTR!

      console.log(`[AmigaDoorSession] Created CLI structure at 0x${cliStructAddr.toString(16)}`);
      console.log(`[AmigaDoorSession]   cli_CommandName BSTR: length=${cmdLine.length} at 0x${cmdLineAddr.toString(16)}, data="${cmdLine}"`);
      console.log(`[AmigaDoorSession]   pr_CLI (BPTR): 0x${(cliStructAddr >> 2).toString(16)} -> 0x${cliStructAddr.toString(16)}`);

      // Set up CLI info for GetArgStr() and GetCliProgramName()
      // GetArgStr() should return just the arguments (node number), not the program name
      const argStringAddr = 0x90200;  // Separate from full command line
      const argString = nodeId.toString();
      for (let i = 0; i < argString.length; i++) {
        this.emulator.writeMemory(argStringAddr + i, argString.charCodeAt(i));
      }
      this.emulator.writeMemory(argStringAddr + argString.length, 0); // Null terminate

      // Extract program name from executable path
      const progName = path.basename(this.config.executablePath);

      // Tell DOS library about CLI info
      if (this.dosLibrary) {
        this.dosLibrary.setCliInfo(argStringAddr, progName);
        console.log(`[AmigaDoorSession] Set CLI info: argString="${argString}" at 0x${argStringAddr.toString(16)}, progName="${progName}"`);
      }

      // Don't send message - WHO runs as pure CLI command
      if (!this.startupMessageSent) {
        console.log('[AmigaDoorSession] Not sending message - WHO reads args from CLI structure');
        this.startupMessageSent = true;
      }

      while (this.isRunning) {
        // === STEP 1: Check if paused (async input) ===
        if (this.emulator.isPaused()) {
          await new Promise(resolve => setImmediate(resolve));
          continue;
        }

        // === STEP 2: Get current PC ===
        const pc = this.emulator.getRegister(16);

        // === STEP 3: Check exit conditions ===

        // Exit trap: Door returned to our sentinel address
        if (pc === 0xFFFF00) {
          const returnCode = this.emulator.getRegister(0);
          console.log(`[AmigaDoorSession] === DOOR EXITED CLEANLY ===`);
          console.log(`[AmigaDoorSession] Return code (D0): ${returnCode}`);
          console.log(`[AmigaDoorSession] Total iterations: ${this.iterationCount}`);
          this.terminate();
          return;
        }

        // Low memory PC (crash/corruption)
        if (pc < 0x100 && this.iterationCount > 100) {
          console.log(`[AmigaDoorSession] PC in low memory (0x${pc.toString(16)}) - likely stack corruption`);
          console.log(`[AmigaDoorSession] Total iterations: ${this.iterationCount}`);
          this.terminate();
          return;
        }

        // Unmapped memory region (bug in address calculation)
        if (pc >= 0xF00000 && pc < 0xF80000) {
          console.log(`[AmigaDoorSession] PC in unmapped memory (0x${pc.toString(16)}) - memory mapping bug`);
          this.terminate();
          return;
        }

        // === STEP 4: UNIFIED trap detection (single canonical check) ===
        const trapHandled = await this.checkAndHandleLibraryTrap(pc);
        if (trapHandled) {
          this.iterationCount++;
          await new Promise(resolve => setImmediate(resolve));
          continue;
        }

        // === STEP 5: Execute one instruction ===
        this.emulator.execute(1);
        this.totalCycles += 1;

        // === STEP 6: Track progress and yield ===
        this.iterationCount++;

        // Log progress every 10k iterations
        if (this.iterationCount % 10000 === 0) {
          const totalSeconds = this.totalCycles / (this.CYCLES_PER_MICROSECOND * 1000000);
          console.log(`[AmigaDoorSession] Iteration ${this.iterationCount}: ${(this.totalCycles / 1000000).toFixed(1)}M cycles, ${totalSeconds.toFixed(2)}s virtual time, PC=0x${pc.toString(16)}`);

          // Prevent infinite loops (safety limit)
          if (this.iterationCount > 100000) {
            console.log(`[AmigaDoorSession] Door running for 100k iterations - likely stuck in polling loop`);
            console.log(`[AmigaDoorSession] PC=0x${pc.toString(16)}`);
            console.log(`[AmigaDoorSession] Terminating for testing purposes`);
            this.terminate();
            return;
          }
        }

        // Yield to event loop frequently when waiting for input
        const isWaitingForInput = (this.ximProtocol && this.ximProtocol.isWaitingForLineInput());
        if (isWaitingForInput) {
          // Yield every 10 iterations for responsiveness
          if (this.iterationCount % 10 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        } else {
          // Normal execution: yield every 10000 iterations
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
   * Send simple startup message to WHO2 door
   * WHO2 expects a message on its Process port to start execution
   * This is NOT a WbStartup message - just a simple "go" message
   */
  private sendSimpleStartupMessage(): void {
    if (!this.emulator || !this.execLibrary) {
      console.log('[AmigaDoorSession] ERROR: Cannot send startup message - emulator not initialized');
      return;
    }

    console.log('[AmigaDoorSession] ===============================================');
    console.log('[AmigaDoorSession] *** SENDING SIMPLE STARTUP MESSAGE TO DOOR ***');
    console.log('[AmigaDoorSession] ===============================================');

    // WHO2's Process message port is at task address + 0x5C
    const doorPortAddr = 0x7005C;

    // Allocate simple message structure (just struct Message header, 20 bytes)
    const msgSize = 20;
    const msgAddr = this.execLibrary.allocMem(msgSize, 0x10001); // MEMF_PUBLIC|MEMF_CLEAR

    if (msgAddr === 0) {
      console.log('[AmigaDoorSession] ERROR: Failed to allocate startup message');
      return;
    }

    console.log(`[AmigaDoorSession] Allocated simple message at 0x${msgAddr.toString(16)} (${msgSize} bytes)`);

    // Write struct Message header (20 bytes)
    this.emulator.writeMemory32(msgAddr + 0, 0);      // mn_Succ
    this.emulator.writeMemory32(msgAddr + 4, 0);      // mn_Pred
    this.emulator.writeMemory(msgAddr + 8, 5);         // mn_Type = NT_MESSAGE
    this.emulator.writeMemory(msgAddr + 9, 0);         // mn_Pri
    this.emulator.writeMemory32(msgAddr + 10, 0);     // mn_ReplyPort (0 = no reply needed)
    this.emulator.writeMemory16(msgAddr + 18, msgSize); // mn_Length

    console.log(`[AmigaDoorSession] Simple message structure:`);
    console.log(`  Message address: 0x${msgAddr.toString(16)}`);
    console.log(`  mn_Length: ${msgSize}`);
    console.log(`  Sending to port: 0x${doorPortAddr.toString(16)}`);

    // Put the message in the door's message port queue
    this.execLibrary.putMsg(doorPortAddr, msgAddr);

    console.log('[AmigaDoorSession] *** SIMPLE STARTUP MESSAGE SENT! ***');
    console.log('[AmigaDoorSession] WHO2 should now wake up and start processing');
    console.log('[AmigaDoorSession] ===============================================');
  }

  /**
   * Send initial WbStartup message to WHO2 door (UNUSED - WHO2 is not a WB tool)
   * WHO2 expects a proper Workbench startup message with program arguments
   * This allows WHO2 to find its WHO.info file and read tooltypes
   */
  private sendInitialXimMessage(): void {
    if (!this.emulator || !this.execLibrary) {
      console.log('[AmigaDoorSession] ERROR: Cannot send startup message - emulator not initialized');
      return;
    }

    console.log('[AmigaDoorSession] ===============================================');
    console.log('[AmigaDoorSession] *** SENDING WBSTARTUP MESSAGE TO DOOR ***');
    console.log('[AmigaDoorSession] ===============================================');

    // WHO2's Process message port is at task address + 0x5C
    const doorPortAddr = 0x7005C;

    /**
     * Create WbStartup message structure:
     *
     * struct WBStartup {
     *   struct Message sm_Message;    // 20 bytes
     *   struct MsgPort *sm_Process;   // 4 bytes (offset 20)
     *   BPTR sm_Segment;              // 4 bytes (offset 24) - 0 for WB programs
     *   LONG sm_NumArgs;              // 4 bytes (offset 28) - number of args
     *   char *sm_ToolWindow;          // 4 bytes (offset 32) - 0 for none
     *   struct WBArg *sm_ArgList;     // 4 bytes (offset 36) - pointer to args
     * };  // Total: 40 bytes
     *
     * struct WBArg {
     *   BPTR wa_Lock;                 // 4 bytes - directory lock
     *   BPTR wa_Name;                 // 4 bytes - filename (BSTR format)
     * };  // 8 bytes per arg
     */

    // Allocate WbStartup message (40 bytes) + WBArg array + filename BSTR
    const wbStartupSize = 40;           // WbStartup struct
    const wbArgSize = 8;                // One WBArg entry
    const filenameSize = 8;             // "WHO" as BSTR (1 byte len + chars + null)
    const totalSize = wbStartupSize + wbArgSize + filenameSize;

    const msgAddr = this.execLibrary.allocMem(totalSize, 0x10001); // MEMF_PUBLIC|MEMF_CLEAR

    if (msgAddr === 0) {
      console.log('[AmigaDoorSession] ERROR: Failed to allocate WbStartup message');
      return;
    }

    console.log(`[AmigaDoorSession] Allocated WbStartup at 0x${msgAddr.toString(16)} (${totalSize} bytes)`);

    // Calculate addresses
    const wbArgAddr = msgAddr + wbStartupSize;        // WBArg array starts after WbStartup
    const filenameAddr = wbArgAddr + wbArgSize;       // Filename BSTR after WBArg

    // 1. Write struct Message header (20 bytes)
    this.emulator.writeMemory32(msgAddr + 0, 0);      // mn_Succ
    this.emulator.writeMemory32(msgAddr + 4, 0);      // mn_Pred
    this.emulator.writeMemory(msgAddr + 8, 5);         // mn_Type = NT_MESSAGE
    this.emulator.writeMemory(msgAddr + 9, 0);         // mn_Pri
    this.emulator.writeMemory32(msgAddr + 10, 0);     // mn_ReplyPort (0 = no reply needed)
    this.emulator.writeMemory16(msgAddr + 18, totalSize); // mn_Length

    // 2. Write WbStartup fields (20 bytes, from offset 20-39)
    this.emulator.writeMemory32(msgAddr + 20, doorPortAddr);  // sm_Process (door's message port)
    this.emulator.writeMemory32(msgAddr + 24, 0);             // sm_Segment (0 for WB programs)
    this.emulator.writeMemory32(msgAddr + 28, 1);             // sm_NumArgs (1 arg: the program itself)
    this.emulator.writeMemory32(msgAddr + 32, 0);             // sm_ToolWindow (0 = none)
    this.emulator.writeMemory32(msgAddr + 36, wbArgAddr);     // sm_ArgList (pointer to WBArg array)

    // 3. Write WBArg entry (8 bytes at wbArgAddr)
    // For WHO2, we need to point to its PROGDIR: (doors/who/) and filename "WHO"
    // IMPORTANT: wa_Lock and wa_Name are BPTR (BCPL pointers), not C pointers!
    // BPTR = pointer >> 2 (divided by 4)
    this.emulator.writeMemory32(wbArgAddr + 0, 0);            // wa_Lock (0 = NULL = use PROGDIR:)
    this.emulator.writeMemory32(wbArgAddr + 4, filenameAddr >> 2); // wa_Name (BPTR to BSTR)

    // 4. Write filename as BSTR (AmigaDOS BSTR = length byte + chars)
    const filename = "WHO";
    this.emulator.writeMemory(filenameAddr, filename.length);  // BSTR length byte
    for (let i = 0; i < filename.length; i++) {
      this.emulator.writeMemory(filenameAddr + 1 + i, filename.charCodeAt(i));
    }
    this.emulator.writeMemory(filenameAddr + 1 + filename.length, 0); // Null terminate

    console.log(`[AmigaDoorSession] WbStartup structure:`);
    console.log(`  Message address: 0x${msgAddr.toString(16)}`);
    console.log(`  sm_Process: 0x${doorPortAddr.toString(16)}`);
    console.log(`  sm_NumArgs: 1`);
    console.log(`  sm_ArgList: 0x${wbArgAddr.toString(16)}`);
    console.log(`  WBArg[0].wa_Lock: 0x0 (BPTR NULL = PROGDIR:)`);
    console.log(`  WBArg[0].wa_Name: 0x${(filenameAddr >> 2).toString(16)} (BPTR to BSTR at 0x${filenameAddr.toString(16)} = "${filename}")`);

    // Put the message in the door's message port queue
    this.execLibrary.putMsg(doorPortAddr, msgAddr);

    console.log('[AmigaDoorSession] *** WBSTARTUP MESSAGE SENT! ***');
    console.log('[AmigaDoorSession] WHO2 should now read WHO.info and node*.txt files');
    console.log('[AmigaDoorSession] ===============================================');
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
