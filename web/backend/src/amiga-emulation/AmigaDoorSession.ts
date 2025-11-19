import { Server, Socket } from "socket.io";
import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { HunkLoader } from "./loader/HunkLoader.js";
import { ExecLibrary } from "./api/ExecLibrary.js";
import { AEDoorLibrary } from "./api/AEDoorLibrary.js";
import { DosLibrary } from "./api/DosLibrary.js";
import { IconLibrary } from "./api/IconLibrary.js";
import { LibraryTraps } from "./api/LibraryTraps.js";
import { XIMProtocol, XIMCommand } from "./XIMProtocol.js";
import { KickstartRom } from "./KickstartRom.js";
// import { nodeStatusManager, NodeStatus } from "../nodes/NodeStatusManager";
import { SharedUserData } from "./structures/UserStructures.js";
import { SharedBBSData } from "./structures/GlobalStructures.js";
import * as fs from "fs";
import * as path from "path";
import { LibraryLoader } from "./loader/LibraryLoader.js";

/**
 * AmigaDoorSession - Manages a single user's door execution session
 * Uses library API emulation (Option C Hybrid) instead of ROM boot
 * Version: 2025-10-30 - Phase 3: AEDoor.library implementation
 */

export interface DoorConfig {
  executablePath: string; // Path to Amiga door binary
  doorType?: string; // Door type: XIM, AIM, SIM, TIM, IIM, MCI, AEM, SUP (default: SIM)
  timeout?: number; // Max execution time in seconds (default: 300)
  bbsSession?: any; // BBS session data (user, system, node info)
  args?: string[]; // Optional CLI arguments (without program name)
}

export class AmigaDoorSession {
  private emulator: MoiraEmulator | null = null;
  private execLibrary: ExecLibrary | null = null;
  private aedoorLibrary: AEDoorLibrary | null = null;
  private dosLibrary: DosLibrary | null = null;
  private iconLibrary: IconLibrary | null = null;
  private libraryTraps: LibraryTraps | null = null;
  private ximProtocol: XIMProtocol | null = null;
  private sharedUserData: SharedUserData | null = null;
  private sharedBBSData: SharedBBSData | null = null;
  private socket: Socket;
  private config: DoorConfig;
  private isRunning: boolean = false;
  private executionTimer: NodeJS.Timeout | null = null;
  private iterationCount: number = 0;
  private d0Was30: boolean = false; // Track if D0 has been set to 30 (for debugging)
  private sentInitialMessage: boolean = false; // Track if we've sent initial IPC message to RTW
  private bullsReplyPortInjected: boolean = false;
  private isBullsDoor: boolean = false;
  private rtwLoopCount: number = 0; // Track iterations in RTW loop at 0x1158-0x1160
  private rtwInitPCs?: number[]; // Track PCs between 0x11CE and 0x124C to find FindPort call
  private doorPortAddress: number = 0; // AEDoorPort message port address
  private aePortAddress: number = 0; // AEDoorPort2 message port address
  private trapVerified: boolean = false; // Track if we've verified trap instructions in memory
  private useXimProtocol: boolean = false; // True when door should run via XIM IPC
  private ximPortsInitialized: boolean = false; // Prevent duplicate XIM port injection
  private doorReplyPortAddr: number = 0; // Reply port created for door IPC

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
  private doorInfoAddr: number = 0;
  private nodeStatusAddr: number = 0;
  private doorSummaryPtr: number = 0;
  private nodeStatusMessageSent: boolean = false;
  private lastPCs: number[] = []; // Track last 20 PC values for debugging
  private hitUnmapped: boolean = false; // Track if we've already logged unmapped PC
  private romReturnAttempts: number = 0;
  private lastDoorPc: number = 0;
  private bullsInputScript: string[] = ["\r\n", "1\r\n", "Q\r\n"];
  private bullsScriptIndex: number = 0;
  private bullsControlBlockAddr: number = 0;
  private bullsInfoBufferAddr: number = 0;
  private pointerLog: string | null = null;
  private bullsHandshakeLog: string | null = null;
  private loggedInfoBufferPointer: boolean = false;
  private bullsPointerWatch: {
    info: number;
    control: number;
    handshake: number;
    nodeMirror: number;
  } = { info: 0, control: 0, handshake: 0, nodeMirror: 0 };
  private bullsPcLogCount: Record<number, number> = {};
  private bullsLastWaitPortReturnPc: number = 0;
  private bullsForceMessagePointer(): void {
    if (!this.isBullsDoor || !this.emulator) {
      return;
    }
    console.log("[BullsFix] bullsForceMessagePointer invoked");
    if (this.bullsInfoBufferAddr === 0) {
      const a4 = this.emulator.getRegister(12);
      this.ensureDoorInfoStructure();
      this.ensureBullsControlBlock(a4);
    }
    if (this.bullsInfoBufferAddr === 0) {
      return;
    }
    const d0 = this.emulator.getRegister(0);
    if (d0 !== 0 && d0 < 0xf00000) {
      console.log(
        `[BullsFix] Bulls pointer check: D0=0x${d0.toString(16)} (no force)`
      );
      return;
    }
    if (d0 >= 0xf00000) {
      console.log(
        `[BullsFix] Bulls forced pointer: D0=0x${d0.toString(
          16
        )} replaced with info buffer`
      );
      this.emulator.setRegister(0, this.bullsInfoBufferAddr);
      const d7 = this.emulator.getRegister(7);
      this.emulator.setRegister(7, this.bullsInfoBufferAddr);
      const a4 = this.emulator.getRegister(12);
      if (a4 !== 0) {
        this.emulator.writeMemory32(a4 + 0x6c28, this.bullsInfoBufferAddr);
        this.syncBullsHandshakeTarget(a4);
      }
      if (this.doorInfoAddr !== 0) {
        this.emulator.writeMemory32(
          this.doorInfoAddr + 0xf8,
          this.bullsInfoBufferAddr
        );
        this.emulator.writeMemory32(
          this.doorInfoAddr + 0xfc,
          this.bullsInfoBufferAddr
        );
      }
      console.log(
        `[BullsFix] Forced message pointer to 0x${this.bullsInfoBufferAddr.toString(
          16
        )}`
      );
    }
  }
  private bullsCreateCommPatched: boolean = false;

  private static readonly DOOR_INFO_SIZE = 0x146;
  private static readonly DOOR_INFO_MESSAGE_OFFSET = 0x46;
  private static readonly MESSAGE_STRING_OFFSET = 0x14;
  private static readonly MESSAGE_STRING_CAPACITY = 200;
  private static readonly MESSAGE_DATA_OFFSET = 0xdc;
  private static readonly MESSAGE_NODE_OFFSET = 0xe4;
  private static readonly MESSAGE_REPLY_PORT_OFFSET = 14;
  private static readonly MESSAGE_LENGTH_OFFSET = 18;
  private static readonly MESSAGE_TOTAL_LENGTH = 0x100;
  private static readonly MESSAGE_COMMAND_OFFSET = 0xe0;
  private static readonly DIF_DATA_PTR_OFFSET = 0x1c;
  private static readonly DIF_STRING_PTR_OFFSET = 0x20;
  private static readonly NODE_STATUS_SIZE = 0x100;
  private static readonly NODE_STATUS_USERNAME_OFFSET = 0x20;
  private static readonly NODE_STATUS_LOCATION_OFFSET = 0x60;
  private static readonly NODE_STATUS_SUMMARY_OFFSET = 0xa0;
  private static readonly NODE_STATUS_USERNAME_PTR_OFFSET = 0x10;
  private static readonly NODE_STATUS_LOCATION_PTR_OFFSET = 0x14;
  private static readonly NODE_STATUS_SUMMARY_PTR_OFFSET = 0x18;
  private static readonly MEMF_PUBLIC_CLEAR = 0x10001;
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
  private loggedMoveaStack: boolean = false; // Instrumentation flag for movea.l D0,A7 logging
  private startTime: number | null = null; // Track execution start time for debugging

  // 🚨 CRITICAL DEBUG: Track execution path and Write() calls
  private writeCallCount: number = 0; // Track DOS.Write() calls
  private aedoorCallCount: number = 0; // Track AEDoor.library calls
  private executionPath: string[] = []; // Log major execution milestones
  private stuckInLoop: boolean = false; // Track if door is stuck in polling loop
  private loopStartPC: number = 0; // PC where loop started
  private loopDetectionCount: number = 0; // Count iterations in same loop
  private lastSignificantPC: number = 0; // Last PC that made progress
  private progressCheckCount: number = 0; // Track progress over time
  private writeCallLog: Array<{ pc: number; iteration: number; args: any }> =
    []; // Log Write() calls
  private aedoorCallLog: Array<{
    pc: number;
    iteration: number;
    function: string;
  }> = []; // Log AEDoor calls
  private mainExecutionReached: boolean = false; // Track if we reached main door code
  private initializationComplete: boolean = false; // Track if door initialization finished

  private resolveNodeId(): number {
    const session = this.config.bbsSession;
    if (session) {
      if (typeof session.nodeId === "number") {
        return session.nodeId;
      }
      if (typeof session.nodeNumber === "number") {
        return session.nodeNumber;
      }
    }
    return 0;
  }
  private dumpInstruction(pc: number, count: number = 8): void {
    if (!this.emulator) {
      return;
    }
    const bytes: string[] = [];
    for (let offset = 0; offset < count; offset += 2) {
      const word = this.emulator.readMemory16(pc + offset);
      bytes.push(`0x${word.toString(16).padStart(4, "0")}`);
    }
    console.log(
      `[AmigaDoorSession] Instruction dump @0x${pc.toString(16)}: ${bytes.join(
        ", "
      )}`
    );
  }

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
    const a6 = this.emulator.getRegister(14);

    // DEBUG: Log Bulls initialization check (loaded at 0x1000, so 0x100 → 0x1100)
    if (pc >= 0x1100 && pc <= 0x1110) {
      const a3 = this.emulator.getRegister(11);
      console.log(
        `[BULLS-INIT] PC=0x${pc.toString(16)}, A3=0x${a3.toString(16)}`
      );
      if (pc === 0x1108) {
        const checkAddr = a3 + 0xac;
        const checkValue = this.emulator.readMemory32(checkAddr);
        console.log(
          `[BULLS-INIT] *** Testing value at A3+0xAC (0x${checkAddr.toString(
            16
          )}) = 0x${checkValue.toString(16)}`
        );
        console.log(
          `[BULLS-INIT] *** If ZERO, Bulls branches to 0x118C and skips CreatePort!`
        );
      }
    }

    // DEBUG: Log Bulls CreatePort call area (0x198 → 0x1198)
    if (pc >= 0x1190 && pc <= 0x11a0) {
      const a0 = this.emulator.getRegister(8);
      const d0 = this.emulator.getRegister(0);
      console.log(
        `[BULLS-DEBUG] PC=0x${pc.toString(16)}, A6=0x${a6.toString(
          16
        )}, A0=0x${a0.toString(16)}, D0=0x${d0.toString(16)}`
      );
      if (pc === 0x1198) {
        const targetAddr = a6 - 0x174;
        console.log(
          `[BULLS-DEBUG] *** CreatePort call! Target=0x${targetAddr.toString(
            16
          )} (A6-0x174)`
        );
      }
    }

    // === Handle library calls when PC is at trap address ===
    // JSR instructions execute normally and jump here
    // Calculate offset from A6
    let offset = pc - a6;

    // Handle 16-bit signed offset wrapping
    if (a6 < 0x10000 && offset > 0x8000 && offset < 0x1000000) {
      const low16 = offset & 0xffff;
      offset = low16 >= 0x8000 ? low16 - 0x10000 : low16;
    } else if (offset > 0x7fffffff) {
      offset = offset - 0x100000000;
    }

    // Determine if this is a library trap
    const isTrapAddress = this.libraryTraps.isTrapAddress(pc);
    const isTrapOffset =
      offset < 0 && offset >= -2000 && this.libraryTraps.isTrapOffset(offset);
    const isLibraryTrap = isTrapAddress || isTrapOffset;

    // DEBUG: Log trap detection for offset -372
    if (offset === -372 || (pc >= 0xfe80 && pc <= 0xfe90)) {
      console.log(
        `[TRAP-DEBUG] PC=0x${pc.toString(
          16
        )}, offset=${offset}, isTrapAddr=${isTrapAddress}, isTrapOffset=${isTrapOffset}`
      );
    }

    if (!isLibraryTrap) {
      return Promise.resolve(false);
    }

    // Check if we just handled this exact trap (prevent double interception)
    if (
      pc === this.lastInterceptedTrap &&
      this.iterationCount - this.lastInterceptedIteration <= 2
    ) {
      console.log(
        `[LibraryTraps] SKIPPING DUPLICATE TRAP at PC=0x${pc.toString(16)}`
      );
      this.lastInterceptedTrap = 0;
      this.lastInterceptedIteration = 0;
      return Promise.resolve(true);
    }

    // Handle trap at current PC (PC is already at library vector)
    console.log(
      `[LibraryTraps] DIRECT TRAP at PC=0x${pc.toString(
        16
      )} (offset=${offset}, A6=0x${a6.toString(16)})`
    );

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
      timeout: 300, // 5 minutes default
      ...config,
    };
    this.isBullsDoor = path
      .basename(this.config.executablePath)
      .toLowerCase()
      .includes("bull");

    // Set up socket event handlers
    this.setupSocketHandlers();
  }

  /**
   * Set up Socket.io event handlers for user input
   */
  private setupSocketHandlers(): void {
    console.log(
      "[AmigaDoorSession] Setting up socket handlers for door:input and keys:state"
    );

    // Handle user input (keystrokes)
    this.socket.on("door:input", (data: string) => {
      console.log(
        `[AmigaDoorSession] 🎹 door:input event received: "${data}" isRunning=${
          this.isRunning
        } hasXIM=${!!this.ximProtocol}`
      );

      if (!this.isRunning) {
        console.log("[AmigaDoorSession] ❌ Input ignored: door not running");
        return;
      }

      // Route to XIM protocol if active
      if (this.ximProtocol) {
        console.log(
          `[AmigaDoorSession] Forwarding input to XIM queue: "${data}"`
        );
        this.ximProtocol.queueInput(data);
      }

      // Route to DOS stdin when either no XIM protocol or door isn't waiting on XIM line input
      const ximWaitingForLine =
        this.ximProtocol?.isWaitingForLineInput() ?? false;
      if (this.dosLibrary && (!this.ximProtocol || !ximWaitingForLine)) {
        console.log(
          `[AmigaDoorSession] Queueing input for DOS stdin: "${data}"`
        );
        this.dosLibrary.queueInput(data);
      }
    });

    // Handle simultaneous key state updates (for games that need multiple keys at once)
    this.socket.on(
      "keys:state",
      (data: {
        key: string;
        pressed: boolean;
        keyState: Record<string, boolean>;
      }) => {
        console.log(
          `[AmigaDoorSession] 🎮 keys:state event received: ${data.key} = ${data.pressed}`
        );

        if (this.isRunning && this.ximProtocol) {
          // Update XIM protocol with key state
          this.ximProtocol.updateKeyState(data);
        } else {
          console.log(
            `[AmigaDoorSession] ❌ Key state update ignored: isRunning=${
              this.isRunning
            } hasXIM=${!!this.ximProtocol}`
          );
        }
      }
    );

    // Handle disconnection
    this.socket.on("disconnect", () => {
      console.log("[AmigaDoorSession] Socket disconnected, terminating door");
      this.terminate();
    });

    // Handle explicit termination request
    this.socket.on("door:terminate", () => {
      console.log("[AmigaDoorSession] Termination requested by user");
      this.terminate();
    });
  }

  /**
   * Initialize and start the door
   */
  async start(): Promise<void> {
    try {
      this.bullsScriptIndex = 0;
      console.log(
        `[AmigaDoorSession] Starting door: ${this.config.executablePath}`
      );
      this.socket.emit("door:status", { status: "initializing" });

      // Initialize emulator (16MB for full 24-bit address space)
      this.emulator = new MoiraEmulator(16 * 1024 * 1024);
      await this.emulator.initialize();

      // Load Kickstart ROM to provide real library code at trap addresses
      console.log("[AmigaDoorSession] Loading Kickstart ROM at 0xF80000...");
      const kickstart = new KickstartRom();
      const romData = kickstart.getRomData();
      this.emulator.loadROM(romData);
      console.log(
        `[AmigaDoorSession] Kickstart ROM loaded (${romData.length} bytes)`
      );

      // Initialize Exec system (NO ROM BOOT - Option C Hybrid)
      console.log(
        "[AmigaDoorSession] Initializing Exec system (Option C Hybrid - no ROM boot)..."
      );
      await this.initializeExec();

      console.log("[AmigaDoorSession] Exec system initialized!");
      console.log(
        `[AmigaDoorSession] ExecBase at 0x${this.execLibrary!.getExecBaseAddress().toString(
          16
        )}`
      );

      if (this.execLibrary) {
        this.execLibrary.ensurePublicPort("AE.Master");
      }

      // Load the door executable
      console.log("[AmigaDoorSession] Loading door executable...");
      await this.loadDoor();

      // Set door directory for PROGDIR: device
      const doorDir = path.dirname(this.config.executablePath);
      if (this.dosLibrary) {
        this.dosLibrary.setDoorDirectory(doorDir);
        console.log(`[AmigaDoorSession] Set door directory: ${doorDir}`);
      }

      // ========================================================================
      // SHARED MEMORY STRUCTURES - Initialize user and BBS data for door access
      // ========================================================================
      console.log(
        "[AmigaDoorSession] Initializing shared memory structures..."
      );

      // Initialize shared user data structures (loggedOnUser, loggedOnUserKeys, loggedOnUserMisc)
      this.sharedUserData = new SharedUserData(this.emulator);
      if (this.config.bbsSession?.user) {
        this.sharedUserData.writeUserData(this.config.bbsSession.user);
        console.log(
          `[AmigaDoorSession] Wrote user data for "${this.config.bbsSession.user.username}"`
        );
        console.log(
          `  loggedOnUser:     0x${this.sharedUserData
            .getUserAddr()
            .toString(16)}`
        );
        console.log(
          `  loggedOnUserKeys: 0x${this.sharedUserData
            .getUserKeysAddr()
            .toString(16)}`
        );
        console.log(
          `  loggedOnUserMisc: 0x${this.sharedUserData
            .getUserMiscAddr()
            .toString(16)}`
        );
      } else {
        console.warn(
          "[AmigaDoorSession] No user data in bbsSession - doors may not work correctly"
        );
      }

      // Initialize shared BBS data structures (cmds, sopt, node state)
      this.sharedBBSData = new SharedBBSData(this.emulator);
      if (this.config.bbsSession) {
        this.sharedBBSData.writeBBSData(this.config.bbsSession);
        console.log(`[AmigaDoorSession] Wrote BBS config data`);
        console.log(
          `  cmds:       0x${this.sharedBBSData.getCmdsAddr().toString(16)}`
        );
        console.log(
          `  sopt:       0x${this.sharedBBSData.getSoptAddr().toString(16)}`
        );
        console.log(
          `  nodeState:  0x${this.sharedBBSData
            .getNodeStateAddr()
            .toString(16)}`
        );
      }

      console.log("[AmigaDoorSession] Shared memory structures initialized!");
      // ========================================================================

      // Set up timeout
      if (this.config.timeout) {
        this.executionTimer = setTimeout(() => {
          console.log("[AmigaDoorSession] Execution timeout");
          this.socket.emit("door:error", { message: "Execution timeout" });
          this.terminate();
        }, this.config.timeout * 1000);
      }

      // Start door execution
      this.isRunning = true;
      console.log("[AmigaDoorSession] 🚪 Emitting door:status = running");
      this.socket.emit("door:status", { status: "running" });

      console.log("[AmigaDoorSession] Starting door execution...");

      // VERIFY registers one more time before starting execution loop
      console.log("[AmigaDoorSession] === PRE-EXECUTION REGISTER CHECK ===");
      console.log(`  PC: 0x${this.emulator.getRegister(16).toString(16)}`);
      console.log(`  SP: 0x${this.emulator.getRegister(15).toString(16)}`);
      console.log(`  A6: 0x${this.emulator.getRegister(14).toString(16)}`);
      console.log(`  SR: 0x${this.emulator.getRegister(17).toString(16)}`);

      // CRITICAL: Door polls address 0x2001 in a loop at PC=0x1156
      // The instruction is: MOVE.B ($2000,A1),D0 where A1=0x1
      // Effective address = 0x1 + 0x2000 = 0x2001
      //
      // The door reads byte at 0x2001 and uses DBRA to loop
      // We initially set this to 0, but we MUST set it to 1 after AEDoorLibrary initialization
      // to signal to the door that the BBS is ready and it can proceed to call AEDoor.library
      this.emulator.writeMemory(0x2001, 0);
      console.log(
        "[AmigaDoorSession] Set memory[0x2001] = 0 (initial polling flag)"
      );

      // 🔧 CRITICAL FIX: Restore BBS ready signal before execution
      // The door loading process overwrites memory[0x2001] from 1 to 0
      // We must restore it to 1 so the door knows the BBS is ready
      this.emulator.writeMemory(0x2001, 1);
      console.log(
        "[AmigaDoorSession] Restored memory[0x2001] = 1 (BBS ready signal for door)"
      );

      // CRITICAL: Must await the execution loop so start() doesn't return until door completes
      await this.runExecutionLoop();
    } catch (error) {
      console.error("[AmigaDoorSession] Error starting door:", error);
      this.socket.emit("door:error", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      this.terminate();
    }
  }

  /**
   * Initialize Exec system with Kickstart ROM
   * Loads Kickstart ROM for proper exception handling and system initialization
   */
  private async initializeExec(): Promise<void> {
    if (!this.emulator) throw new Error("Emulator not initialized");

    console.log("[AmigaDoorSession] Loading Kickstart ROM...");

    // Load Kickstart 3.1 ROM (most compatible)
    // Path: web/backend/data/amiga-roms/
    const romPath = path.join(
      process.cwd(),
      "web/backend/data/amiga-roms/Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom"
    );
    const romData = fs.readFileSync(romPath);
    this.emulator.loadROM(new Uint8Array(romData));

    console.log(
      "[AmigaDoorSession] Kickstart ROM loaded - provides ROM routines"
    );

    console.log("[AmigaDoorSession] Creating ExecBase structure...");

    this.execLibrary = new ExecLibrary(this.emulator);
    this.execLibrary.initialize();
    this.execLibrary.setWaitPortReturnCallback((addr: number) => {
      if (this.isBullsDoor) {
        this.bullsLastWaitPortReturnPc = addr;
        console.log(
          `[BullsFix] Recorded WaitPort return PC 0x${addr.toString(16)}`
        );
      }
    });

    if (!this.execLibrary.loadRealAEDoorLibrary()) {
      console.warn("[AmigaDoorSession] Real AEDoor.library failed to load");
    }
    // Configure LibraryLoader to load real AEDoor.library
    const libraryLoader = new LibraryLoader(this.emulator);
    libraryLoader.addSearchPath(path.join(process.cwd(), "Libs"));
    this.execLibrary.setLibraryLoader(libraryLoader, true);

    // Get door type (defaults to SIM per express.e:4681)
    const doorType = this.config.doorType || "SIM";
    const nodeId = this.config.bbsSession?.nodeId || 0;

    console.log(`[AmigaDoorSession] Door type: ${doorType}`);

    // ALL doors need AEDoorPort to access BBS information (even SIM doors)
    // WHO door and others call FindPort("AEDoorPort%d") to read BBS data
    console.log(
      "[AmigaDoorSession] Creating AEDoorPort for BBS data access..."
    );

    // RTW, WHO, and other doors search for "AEDoorPort%d" where %d is the node number
    // From RTW binary strings: "AEDoorPort%d", "Couldn't create reply port"
    // From WHO binary strings: "AEDoorPort%s", "Cannot find Doorport"
    // Each node needs its own numbered port
    const portName = `AEDoorPort${nodeId}`; // e.g., "AEDoorPort0"

    // Create the port that door will use to access BBS data
    const portAddr = this.execLibrary.createPublicPort(portName);
    this.execLibrary.setDoorPortAddress(portAddr);
    console.log(
      `[AmigaDoorSession] Created ${portName} at 0x${portAddr.toString(16)}`
    );

    // ALSO create simple "AEDoorPort" for doors that don't use node numbers (like ustats)
    const simplePortAddr = this.execLibrary.createPublicPort("AEDoorPort");
    console.log(
      `[AmigaDoorSession] Created AEDoorPort (simple) at 0x${simplePortAddr.toString(
        16
      )}`
    );

    // Store for cleanup
    this.doorPortAddress = portAddr;
    this.aePortAddress = portAddr; // RTW-FIX needs this for port injection

    // SIM and SUP doors run synchronously without XIM message protocol (express.e:4280-4282, 4304-4306)
    // They execute as standard CLI commands and output to stdout via DOS Write()
    // But they STILL need AEDoorPort for reading BBS data
    const useXimProtocol = doorType !== "SIM" && doorType !== "SUP";
    this.useXimProtocol = useXimProtocol;

    if (useXimProtocol) {
      console.log(
        "[AmigaDoorSession] Creating XIM Protocol handler for async message-based communication..."
      );

      // Create XIM protocol handler for door communication (async XIM doors only)
      this.ximProtocol = new XIMProtocol(
        this.emulator,
        this.execLibrary,
        this.socket,
        portAddr
      );
    } else {
      console.log(
        `[AmigaDoorSession] Skipping XIM protocol for ${doorType} door - runs synchronously without message-based I/O`
      );
    }

    console.log("[AmigaDoorSession] Creating DOS.library...");

    // Create DosLibrary for file I/O and console operations
    this.dosLibrary = new DosLibrary(this.emulator);
    // Doors expect CLI-style STDIN/STDOUT handles (Input()/Output())
    this.dosLibrary.setInheritedHandles(1, 2);

    // Enable new FileManager/PathManager system for real file I/O
    // Use BBS_ROOT env var or default to project root (go up 2 levels from web/backend)
    const projectRoot =
      process.env.BBS_ROOT || path.resolve(process.cwd(), "../..");
    console.log(
      `[AmigaDoorSession] Enabling FileManager with base directory: ${projectRoot}`
    );
    this.dosLibrary.enableNewFileSystem(projectRoot);

    // CRITICAL FIX: Set output callback so DOS Write() sends to terminal
    // WHO door and other DOS-based doors use Write() instead of AEDoor WriteStr()
    this.dosLibrary.setOutputCallback((text: string) => {
      console.log(
        `[AmigaDoorSession] 📤 DOS output callback invoked, emitting ${text.length} bytes to socket`
      );
      console.log(`[AmigaDoorSession] 📤 Output text: ${JSON.stringify(text)}`);
      this.socket.emit("ansi-output", text);
      console.log(`[AmigaDoorSession] 📤 socket.emit('ansi-output') called`);
    });
    console.log("[AmigaDoorSession] DOS.library output callback configured");

    console.log(
      "[AmigaDoorSession] Initializing node status semaphores for WHO doors..."
    );

    // TEMPORARY: Skip NodeStatusManager initialization due to addSemaphore compilation issue
    // This is needed for SIM doors like Bulls that don't use WHO functionality
    console.log(
      "[AmigaDoorSession] ⚠️ SKIPPING NodeStatusManager (compilation issue with addSemaphore)"
    );
    console.log(
      "[AmigaDoorSession] ⚠️ This affects WHO doors but not SIM doors like Bulls"
    );

    // Initialize multiPort/singlePort semaphore structures for WHO door access
    // WHO doors (like RTW) search for node information via FindSemaphore("AEServer.%d")
    // nodeStatusManager.initializeInEmulator(
    //   this.emulator,
    //   this.execLibrary,
    //   0xb0000
    // );

    // Update current node status
    const userName = this.config.bbsSession?.user?.username || "Unknown";
    const userLocation = this.config.bbsSession?.user?.location || "";

    // TEMPORARY: Skip node status update due to NodeStatusManager initialization issue
    // nodeStatusManager.updateNode(this.emulator, nodeId, {
    //   status: NodeStatus.ENV_DOORS,
    //   handle: userName,
    //   location: userLocation,
    //   misc1: path.basename(this.config.executablePath), // Door name
    //   misc2: 1, // Available for chat
    //   baud: "57600", // Default baud rate
    // });

    console.log(
      `[AmigaDoorSession] Node ${nodeId} status: ${userName} running ${path.basename(
        this.config.executablePath
      )} (NodeStatusManager skipped)`
    );

    console.log("[AmigaDoorSession] Creating AEDoor.library...");

    // Create AEDoorLibrary with socket and session data
    this.aedoorLibrary = new AEDoorLibrary(
      this.socket,
      this.emulator,
      this.execLibrary,
      this.config.bbsSession || {}
    );

    // CRITICAL FIX: Signal to door that BBS is ready by setting 0x2001 to 1
    // The door polls this location to know when AEDoorLibrary initialization is complete
    this.emulator.writeMemory(0x2001, 1);
    console.log("[AmigaDoorSession] Set memory[0x2001] = 1 (BBS ready signal)");

    console.log("[AmigaDoorSession] Creating icon.library...");

    // Create IconLibrary for .info file access
    // bbsRoot is project root (2 levels up from backend directory)
    const bbsRoot = path.resolve(process.cwd(), "../..");
    this.iconLibrary = new IconLibrary(this.emulator, bbsRoot);

    console.log("[AmigaDoorSession] Installing library call traps...");

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
      if (name.toLowerCase() === "dos.library") {
        console.log(
          "[AmigaDoorSession] dos.library opened, installing vectors..."
        );
        this.libraryTraps!.installDOSVectors();
      }
      if (name.toLowerCase() === "aedoor.library") {
        console.log(
          "[AmigaDoorSession] AEDoor.library opened, installing vectors..."
        );
        this.libraryTraps!.installAEDoorVectors();
      }
      if (name.toLowerCase() === "icon.library") {
        console.log(
          "[AmigaDoorSession] icon.library opened, installing vectors..."
        );
        this.libraryTraps!.installIconVectors();
      }
    });

    // Set up callback for when door sends messages to AEDoorPort
    // This replaces polling GetMsg() with trap-based interception
    this.execLibrary.setDoorMessageCallback(
      (portAddr: number, msgAddr: number) => {
        this.handleDoorMessage(portAddr, msgAddr);
      }
    );

    // Set up library call monitoring to track what door is doing during polling loop
    this.libraryTraps.setLibraryCallMonitor(
      (functionName: string, pc: number) => {
        // Track library calls during polling loop
        if (this.startupMessageSent && this.iterationCount >= 1000) {
          this.libraryCallsInLoop++;
          console.log(
            `[AmigaDoorSession] *** LIBRARY CALL IN POLLING LOOP ***`
          );
          console.log(`[AmigaDoorSession]   Function: ${functionName}`);
          console.log(`[AmigaDoorSession]   PC: 0x${pc.toString(16)}`);
          console.log(`[AmigaDoorSession]   Iteration: ${this.iterationCount}`);
          console.log(
            `[AmigaDoorSession]   Total calls in loop: ${this.libraryCallsInLoop}`
          );
        }
      }
    );

    console.log("[AmigaDoorSession] Exec system ready");
  }

  /**
   * Load door executable
   */
  private async loadDoor(): Promise<void> {
    if (!this.emulator) throw new Error("Emulator not initialized");
    if (!this.execLibrary) throw new Error("Exec system not initialized");

    // Read door binary
    const binary = fs.readFileSync(this.config.executablePath);
    console.log(`[AmigaDoorSession] Door binary size: ${binary.length} bytes`);

    // Parse Amiga HUNK format
    const hunkLoader = new HunkLoader();
    const hunkFile = hunkLoader.parse(Buffer.from(binary));

    console.log(
      `[AmigaDoorSession] Parsed ${hunkFile.segments.length} segments:`
    );
    for (let i = 0; i < hunkFile.segments.length; i++) {
      const seg = hunkFile.segments[i];
      console.log(
        `  Segment ${i}: ${seg.type.toUpperCase()} at 0x${seg.address.toString(
          16
        )}, size=${seg.size} bytes`
      );
    }

    // Load segments into memory
    hunkLoader.load(this.emulator, hunkFile);

    console.log(
      `[AmigaDoorSession] Door loaded at entry point: 0x${hunkFile.entryPoint.toString(
        16
      )}`
    );

    // Set up CPU for door execution
    // CRITICAL: Set SR FIRST before other registers, as setSR might affect CPU state
    console.log("[AmigaDoorSession] Setting up CPU registers...");

    // Set CPU to SUPERVISOR MODE (bit 13 of SR) to allow privileged instructions
    // SR = 0x2700 = supervisor mode with interrupts disabled
    this.emulator.setRegister(17, 0x2700); // SR (Status Register)
    console.log(`  SR: 0x2700 (supervisor mode)`);

    // Set up A6 register with ExecBase (standard Amiga convention)
    const execBaseAddr = this.execLibrary.getExecBaseAddress();
    this.emulator.setRegister(14, execBaseAddr); // A6 = ExecBase
    console.log(`  A6 (ExecBase): 0x${execBaseAddr.toString(16)}`);

    // Set up command-line arguments for SAS/C startup
    // SAS/C c.o expects: D0 = length of FULL command line, A0 = pointer to FULL command line
    // The full command line is "progname arg1 arg2..." (NO leading space!)
    // The startup code will parse this into argc/argv
    const nodeId = this.config.bbsSession?.nodeId || 0;
    const progName = path.basename(this.config.executablePath);
    const customArgs =
      this.config.args && this.config.args.length > 0
        ? this.config.args
        : [nodeId.toString()];
    const argString = [progName, ...customArgs].join(" ").trim();
    const ARG_STRING_ADDR = 0x0f0100;

    // Write argument string to memory
    for (let i = 0; i < argString.length; i++) {
      this.emulator.writeMemory(ARG_STRING_ADDR + i, argString.charCodeAt(i));
    }
    this.emulator.writeMemory(ARG_STRING_ADDR + argString.length, 0); // Null terminator

    // Set D0 = length of FULL command line, A0 = pointer to command line
    // This is the AmigaDOS/SAS-C calling convention for CLI programs
    this.emulator.setRegister(0, argString.length); // D0 = full command line length
    this.emulator.setRegister(8, ARG_STRING_ADDR); // A0 = full command line
    console.log(`  D0 (arg length): ${argString.length}`);
    console.log(
      `  A0 (arg string): 0x${ARG_STRING_ADDR.toString(16)} = "${argString}"`
    );

    // Set A1 to end of CODE segment (SAS/C startup code uses this for initialization)
    // The startup code copies initialization data from end of CODE to BSS
    if (hunkFile.segments.length > 0) {
      // Find the first segment (CODE segment)
      const codeSegment = hunkFile.segments[0];
      const codeEnd = codeSegment.address + codeSegment.size;
      this.emulator.setRegister(9, codeEnd); // A1 = end of CODE
      console.log(`  A1 (end of CODE): 0x${codeEnd.toString(16)}`);
    }

    // Now set PC
    this.emulator.setRegister(16, hunkFile.entryPoint); // PC
    console.log(`  PC: 0x${hunkFile.entryPoint.toString(16)}`);

    // Set SP and push exit address LAST
    // CRITICAL: Stack must be where door's StackSwapStruct expects it
    // Doors have compiled-in stack addresses, typically around 0xFE000
    // This matches what the WHO door's StackSwapStruct contains (0xFD000-0xFE000)
    // Allocate at standard Amiga location used by CLI programs
    const initialSP = 0xfe000; // Standard CLI stack location
    const finalSP = 0xfdffc; // 4-byte aligned (0xFDFFC % 4 = 0)

    // Push exit address to stack (for when door does RTS)
    // According to AmigaDOS docs: "Assembly programs should place a return code in D0,
    // and execute an RTS instruction with their original stack ptr."
    // We provide an address that will be detected as program exit
    const exitTrapAddress = 0xffff00; // Special address to detect program exit

    // Fill top of stack with exit trap addresses
    // When program returns (RTS), it will pop return address from stack
    // We fill multiple locations to catch the return no matter where SP ends up
    // The C startup code will push/pop things, so we need coverage
    // CRITICAL: RTW/WHO doors need coverage ABOVE finalSP too (up to SP+60)
    for (let offset = -64; offset < 64; offset += 4) {
      this.emulator.writeMemory32(finalSP + offset, exitTrapAddress);
    }
    console.log(
      `  Exit trap addresses: 0x${exitTrapAddress.toString(16)} from 0x${(
        finalSP - 64
      ).toString(16)} to 0x${(finalSP + 60).toString(16)}`
    );

    // NOTE: SP+0xAC already contains exit trap (0xFFFF00) from loop above
    // Bulls checks this location - leaving it as-is for now
    console.log(
      `  SP+0xAC: 0x${(finalSP + 0xac).toString(16)} contains exit trap value`
    );

    // CRITICAL: Initialize stack-based code that door expects
    // Door executes JSR (3682,A7) at PC=0x1248 (instruction 198)
    // At that time, SP=0xFDFF8, so it jumps to: 0xFDFF8 + 0xE62 = 0xFEE5A
    // JSR (d16,An) jumps TO that address, doesn't load FROM it!
    // So we need EXECUTABLE CODE at 0xFEE5A, not a pointer!
    const STACK_FN_OFFSET = 0xe62;

    // Write RTS instruction at multiple locations to cover SP variations
    // Door might have SP anywhere from finalSP-16 to finalSP+16
    for (let offset = -16; offset <= 16; offset += 2) {
      const stubAddr = finalSP + STACK_FN_OFFSET + offset;
      this.emulator.writeMemory16(stubAddr, 0x4e75); // RTS
    }
    console.log(
      `  Stack function stubs (RTS): 0x${(
        finalSP +
        STACK_FN_OFFSET -
        16
      ).toString(16)} to 0x${(finalSP + STACK_FN_OFFSET + 16).toString(16)}`
    );

    // Set SP LAST
    this.emulator.setRegister(15, finalSP); // A7 (SP)
    console.log(`  SP: 0x${finalSP.toString(16)}`);

    // NOTE: A0 already points to argument string (set above at line 503)
    // Do NOT overwrite A0 - SAS/C startup needs it to parse argc/argv!
    // Doors will call FindPort() themselves to find AEDoorPort

    console.log(`[AmigaDoorSession] CPU configured for door execution`);
    console.log("[AmigaDoorSession] Door ready to execute!");

    // Verify final state before execution
    const verifyFinalSP = this.emulator.getRegister(15);
    const verifyFinalPC = this.emulator.getRegister(16);
    const verifyFinalA0 = this.emulator.getRegister(8);
    console.log(
      `[AmigaDoorSession] Door ready: SP=0x${verifyFinalSP.toString(
        16
      )}, PC=0x${verifyFinalPC.toString(16)}, A0=0x${verifyFinalA0.toString(
        16
      )}`
    );

    // Prefill the 68000 instruction queue so the very first instruction
    // (typically a BRA.W over the $VER string) executes correctly.
    this.emulator.refillPrefetch();
    console.log(
      "[AmigaDoorSession] Prefetch queue primed for first instruction"
    );
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

      console.log(
        "\n[AmigaDoorSession] ==============================================="
      );
      console.log("[AmigaDoorSession] *** A0 REGISTER CHANGED! ***");
      console.log(
        "[AmigaDoorSession] ==============================================="
      );
      console.log(
        `[AmigaDoorSession] Old A0: 0x${this.lastA0Value.toString(16)}`
      );
      console.log(`[AmigaDoorSession] New A0: 0x${currentA0.toString(16)}`);
      console.log(
        `[AmigaDoorSession] PC: 0x${this.emulator.getRegister(16).toString(16)}`
      );
      console.log(
        `[AmigaDoorSession] SP: 0x${this.emulator.getRegister(15).toString(16)}`
      );
      console.log(`[AmigaDoorSession] Iteration: ${this.iterationCount}`);
      console.log("[AmigaDoorSession]");
      console.log("[AmigaDoorSession] Reading memory around current PC:");

      const pc = this.emulator.getRegister(16);
      const bytes: string[] = [];
      for (let i = -8; i <= 16; i++) {
        bytes.push(
          this.emulator
            .readMemory(pc + i)
            .toString(16)
            .padStart(2, "0")
        );
      }
      console.log(
        `[AmigaDoorSession] Memory at PC-8 to PC+16: ${bytes.join(" ")}`
      );

      console.log("[AmigaDoorSession]");
      console.log(
        "[AmigaDoorSession] Checking if A0 value was loaded from memory:"
      );

      // Check common patterns:
      // 1. Direct load from absolute address
      // 2. Load from offset off A4, A5, A6 (base registers)
      // 3. Load from stack

      // Try to find memory location containing the new A0 value
      const searchValue = currentA0;
      const foundLocations: number[] = [];

      // Search in common areas
      const searchAreas = [
        { start: 0x0, end: 0x1000, name: "Low memory (vectors/globals)" },
        { start: 0x8000, end: 0x9000, name: "AllocMem area" },
        { start: 0xfdf00, end: 0xfe100, name: "Stack area" },
      ];

      for (const area of searchAreas) {
        for (let addr = area.start; addr <= area.end - 4; addr += 2) {
          const value = this.emulator.readMemory32(addr);
          if (value === searchValue) {
            foundLocations.push(addr);
          }
        }
      }

      // Inject AEDoor/XIM ports immediately after A4 is set up so loops using WaitPort/PutMsg work
      if (this.useXimProtocol && !this.ximPortsInitialized && pc === 0x1034) {
        this.injectXimPortsEarly();
      }

      if (foundLocations.length > 0) {
        console.log(
          `[AmigaDoorSession] Found A0 value (0x${searchValue.toString(
            16
          )}) in memory at:`
        );
        foundLocations.forEach((addr) => {
          console.log(`[AmigaDoorSession]   - 0x${addr.toString(16)}`);
        });
      } else {
        console.log(
          `[AmigaDoorSession] Value 0x${searchValue.toString(
            16
          )} not found in searched memory areas`
        );
        console.log(
          `[AmigaDoorSession] Might be computed or loaded from unmapped area`
        );
      }

      console.log(
        "[AmigaDoorSession] ===============================================\n"
      );
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
    const hi = (opcode >> 8) & 0xff;
    const lo = opcode & 0xff;

    // MOVE.L
    if ((hi & 0xc0) === 0x00 && (hi & 0x30) === 0x20) {
      return `MOVE.L (opcode: 0x${opcode.toString(16)})`;
    }
    // MOVEM
    if ((hi & 0xfb) === 0x48 && (lo & 0xc0) === 0xc0) {
      return `MOVEM (opcode: 0x${opcode.toString(16)})`;
    }
    // JSR
    if (opcode === 0x4eb9 || (hi === 0x4e && (lo & 0xc0) === 0x80)) {
      const target = this.emulator?.readMemory32(pc + 2) || 0;
      return `JSR 0x${target.toString(16)}`;
    }
    // RTS
    if (opcode === 0x4e75) {
      return "RTS";
    }
    // RTE
    if (opcode === 0x4e73) {
      return "RTE";
    }
    // TRAP
    if ((opcode & 0xfff0) === 0x4e40) {
      const trapNum = opcode & 0x0f;
      return `TRAP #${trapNum}`;
    }
    // MOVE to/from SR
    if ((opcode & 0xffc0) === 0x46c0) {
      return `MOVE to SR (opcode: 0x${opcode.toString(16)})`;
    }
    if ((opcode & 0xffc0) === 0x40c0) {
      return `MOVE from SR (opcode: 0x${opcode.toString(16)})`;
    }
    // LEA
    if ((hi & 0xf1) === 0x41 && (lo & 0xc0) === 0xc0) {
      return `LEA (opcode: 0x${opcode.toString(16)})`;
    }
    // TST
    if ((hi & 0xff) === 0x4a) {
      return `TST (opcode: 0x${opcode.toString(16)})`;
    }
    // BRA/Bcc
    if ((hi & 0xf0) === 0x60) {
      const cond = hi & 0x0f;
      const condNames = [
        "BRA",
        "BSR",
        "BHI",
        "BLS",
        "BCC",
        "BCS",
        "BNE",
        "BEQ",
        "BVC",
        "BVS",
        "BPL",
        "BMI",
        "BGE",
        "BLT",
        "BGT",
        "BLE",
      ];
      return `${condNames[cond] || "Bxx"} (opcode: 0x${opcode.toString(16)})`;
    }
    // DBcc
    if ((hi & 0xf0) === 0x50 && (lo & 0xc8) === 0xc8) {
      return `DBcc (opcode: 0x${opcode.toString(16)})`;
    }
    // ADD/SUB
    if ((hi & 0xf0) === 0xd0) {
      return `ADD (opcode: 0x${opcode.toString(16)})`;
    }
    if ((hi & 0xf0) === 0x90) {
      return `SUB (opcode: 0x${opcode.toString(16)})`;
    }
    // CMP
    if ((hi & 0xf0) === 0xb0) {
      return `CMP (opcode: 0x${opcode.toString(16)})`;
    }
    // AND/OR
    if ((hi & 0xf0) === 0xc0) {
      return `AND (opcode: 0x${opcode.toString(16)})`;
    }
    if ((hi & 0xf0) === 0x80) {
      return `OR (opcode: 0x${opcode.toString(16)})`;
    }

    return `Unknown (opcode: 0x${opcode.toString(16)})`;
  }

  private logBullsPcState(pc: number): void {
    if (!this.isBullsDoor || !this.emulator) {
      return;
    }
    if (
      pc >= 0x1300 &&
      pc <= 0x1400 &&
      (this.bullsPcLogCount[pc] ?? 0) < 2
    ) {
      console.log(
        `[BullsFix] PC entering handshake range: 0x${pc.toString(16)} iteration ${this.iterationCount}`
      );
    }
    const count = this.bullsPcLogCount[pc] ?? 0;
    if (count >= 3) {
      return;
    }
    this.bullsPcLogCount[pc] = count + 1;

    const a4 = this.emulator.getRegister(12);
    if (a4 === 0) {
      return;
    }

    const infoPtr = this.emulator.readMemory32(a4 + 0x6c28);
    if (!infoPtr) {
      return;
    }

    if (pc === 0x01264) {
      const controlPtr = this.emulator.readMemory32(a4 + 0x6c24);
      const handshake = this.emulator.readMemory32(infoPtr + 0xdc);
      const e0Val = this.emulator.readMemory32(infoPtr + 0xe0);
      console.log(
        `[BullsFix] PC=0x${pc
          .toString(16)
          .padStart(4, "0")} control=0x${controlPtr.toString(
          16
        )}, info=0x${infoPtr.toString(16)}, handshake=0x${handshake.toString(
          16
        )}, e0=0x${e0Val.toString(16)}`
      );
    } else if (pc === 0x013c8) {
      const a5 = this.emulator.getRegister(13);
      const sourceStr = a5 ? this.emulator.readString(a5, 64) : "<null>";
      const infoWords: string[] = [];
      for (let offset = 0; offset < 0x18; offset += 4) {
        infoWords.push(
          `0x${this.emulator
            .readMemory32(infoPtr + offset)
            .toString(16)
            .padStart(8, "0")}`
        );
      }
      console.log(
        `[BullsFix] PC=0x${pc.toString(
          16
        )} copying string from 0x${a5.toString(16)} -> infoPtr=0x${infoPtr.toString(
          16
        )} (source="${sourceStr}")`
      );
      console.log(
        `[BullsFix]   infoPtr[0..0x14]: ${infoWords.join(" ")}`
      );
    } else if (pc === 0x01408) {
      const handshake = this.emulator.readMemory32(infoPtr + 0xdc);
      const e0Val = this.emulator.readMemory32(infoPtr + 0xe0);
      const summary = this.emulator.readString(infoPtr + 0x14, 64);
      console.log(
        `[BullsFix] PC=0x${pc.toString(
          16
        )} handshake=0x${handshake.toString(16)}, e0=0x${e0Val.toString(
          16
        )}, summary="${summary}"`
      );
    }
  }

  private logBullsHandshakeState(pc: number): void {
    if (
      !this.isBullsDoor ||
      !this.emulator ||
      pc < 0x1170 ||
      pc > 0x1286
    ) {
      return;
    }

    const d0 = this.emulator.getRegister(0);
    const a0 = this.emulator.getRegister(8);
    const a1 = this.emulator.getRegister(9);
    const a4 = this.emulator.getRegister(12);

    const parts = [
      `pc=0x${pc.toString(16)}`,
      `d0=0x${d0.toString(16)}`,
      `a0=0x${a0.toString(16)}`,
      `a1=0x${a1.toString(16)}`,
      `a4=0x${a4.toString(16)}`,
    ];

    if (d0 !== 0) {
      try {
        const replyPort = this.emulator.readMemory32(d0 + 14);
        const length = this.emulator.readMemory16(d0 + 18);
        const command = this.emulator.readMemory32(d0 + 20);
        const dataPtr = this.emulator.readMemory32(d0 + 24);
        parts.push(
          `reply=0x${replyPort.toString(16)}`,
          `len=${length}`,
          `cmd=0x${command.toString(16)}`,
          `data=0x${dataPtr.toString(16)}`
        );
      } catch (err) {
        parts.push("cmd=<err>");
      }
    }

    const logLine = `[BullsFix][HANDSHAKE] ${parts.join(" | ")}`;
    if (this.bullsHandshakeLog !== logLine) {
      this.bullsHandshakeLog = logLine;
      console.log(logLine);
    }
  }

  private monitorBullsPointers(pc: number): void {
    if (
      !this.isBullsDoor ||
      !this.emulator ||
      pc < 0x1000 ||
      pc > 0x20000
    ) {
      return;
    }

    const a4 = this.emulator.getRegister(12);
    if (a4 === 0) {
      return;
    }

    const infoPtr = this.emulator.readMemory32(a4 + 0x6c28);
    if (infoPtr !== this.bullsPointerWatch.info) {
      this.bullsPointerWatch.info = infoPtr;
      console.log(
        `[BullsFix][POINTER] pc=0x${pc.toString(16)} set 0x6c28 -> 0x${infoPtr.toString(
          16
        )}`
      );
    }

    const controlPtr = this.emulator.readMemory32(a4 + 0x6c24);
    if (controlPtr !== this.bullsPointerWatch.control) {
      this.bullsPointerWatch.control = controlPtr;
      console.log(
        `[BullsFix][POINTER] pc=0x${pc.toString(16)} set 0x6c24 -> 0x${controlPtr.toString(
          16
        )}`
      );
    }

    const handshakePtr = this.emulator.readMemory32(a4 + 0x6c40);
    if (handshakePtr !== this.bullsPointerWatch.handshake) {
      this.bullsPointerWatch.handshake = handshakePtr;
      console.log(
        `[BullsFix][POINTER] pc=0x${pc.toString(16)} set 0x6c40 -> 0x${handshakePtr.toString(
          16
        )}`
      );
    }

    const nodeMirror = this.emulator.readMemory32(a4 + 0x6c2c);
    if (nodeMirror !== this.bullsPointerWatch.nodeMirror) {
      this.bullsPointerWatch.nodeMirror = nodeMirror;
      console.log(
        `[BullsFix][POINTER] pc=0x${pc.toString(16)} set 0x6c2c -> 0x${nodeMirror.toString(
          16
        )}`
      );
    }
  }

  /**
   * Inject AEDoor/XIM ports into the door's data segment (A4-based struct).
   * Some doors (Bulls) call WaitPort/PutMsg before the standard RTW check at 0x124C,
   * so we need the ports ready immediately after A4 is initialized.
   */
  private injectXimPortsEarly(): void {
    if (
      !this.execLibrary ||
      !this.emulator ||
      !this.useXimProtocol ||
      this.ximPortsInitialized
    ) {
      return;
    }

    const emulator = this.emulator;
    const execLibrary = this.execLibrary;

    const a4 = emulator.getRegister(12);
    if (a4 === 0 || this.aePortAddress === 0) {
      console.log(
        "[RTW-FIX] Cannot inject ports yet - A4 or AEDoorPort missing"
      );
      return;
    }

    console.log(`\n[RTW-FIX] *** INJECTING XIM PORTS ***`);
    console.log(`[RTW-FIX] A4 (data segment) = 0x${a4.toString(16)}`);

    if (this.doorReplyPortAddr === 0) {
      this.doorReplyPortAddr = execLibrary.createMsgPort();
      console.log(
        `[RTW-FIX] Created reply port at 0x${this.doorReplyPortAddr.toString(
          16
        )}`
      );
    } else {
      console.log(
        `[RTW-FIX] Reusing reply port at 0x${this.doorReplyPortAddr.toString(
          16
        )}`
      );
    }

    console.log(
      `[RTW-FIX] BBS door port (AEDoorPort) at 0x${this.aePortAddress.toString(
        16
      )}`
    );

    emulator.writeMemory32(a4 + 0x44c, this.aePortAddress);
    console.log(
      `[RTW-FIX] ✓ Injected BBS port into A4+0x44C (0x${(a4 + 0x44c).toString(
        16
      )})`
    );

    emulator.writeMemory32(a4 + 0x57c, this.aePortAddress);
    console.log(`[RTW-FIX] ✓ ALSO injecting BBS port into A4+0x57C`);

    emulator.writeMemory32(a4 + 0x5b8, this.aePortAddress);
    console.log(`[RTW-FIX] ✓ ALSO injecting BBS port into A4+0x5B8`);

    emulator.writeMemory32(a4 + 0x450, this.doorReplyPortAddr);
    emulator.writeMemory32(a4 + 0x474, this.doorReplyPortAddr);
    console.log(
      `[RTW-FIX] ✓ Injected reply port into A4+0x450 (0x${(a4 + 0x450).toString(
        16
      )})`
    );
    console.log(
      `[RTW-FIX] ✓ Injected reply port into A4+0x474 (0x${(a4 + 0x474).toString(
        16
      )})`
    );

    const verifyBBS = emulator.readMemory32(a4 + 0x44c);
    const verifyReply = emulator.readMemory32(a4 + 0x474);
    console.log(
      `[RTW-FIX] Verification: A4+0x44C (BBS port) = 0x${verifyBBS.toString(
        16
      )}`
    );
    console.log(
      `[RTW-FIX] Verification: A4+0x474 (reply port) = 0x${verifyReply.toString(
        16
      )}`
    );
    console.log(
      `[RTW-FIX] ✓ XIM door should now enter IPC loop and communicate with BBS!\n`
    );

    this.ximPortsInitialized = true;
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
      // 🚨 COMPREHENSIVE DEBUG PHASE 1: INITIAL STATE VERIFICATION
      console.log(
        "[AmigaDoorSession] ==============================================="
      );
      console.log(
        "[AmigaDoorSession] 🚀 EXECUTION LOOP STARTING - COMPREHENSIVE DEBUG"
      );
      console.log(
        "[AmigaDoorSession] ==============================================="
      );

      // Verify all critical components
      console.log("[AmigaDoorSession] 📋 SYSTEM STATUS:");
      console.log(`[AmigaDoorSession]   Emulator: ${!!this.emulator} ✅`);
      console.log(`[AmigaDoorSession]   Running: ${this.isRunning} ✅`);
      console.log(`[AmigaDoorSession]   Socket: ${this.socket.connected} ✅`);
      console.log(
        `[AmigaDoorSession]   Door Type: ${this.config.doorType || "SIM"}`
      );
      console.log(
        `[AmigaDoorSession]   Executable: ${path.basename(
          this.config.executablePath
        )}`
      );
      console.log(
        `[AmigaDoorSession]   BBS Session: ${!!this.config.bbsSession} ${
          this.config.bbsSession?.user?.username
            ? `(${this.config.bbsSession.user.username})`
            : "(No user)"
        }`
      );

      // Verify libraries
      console.log("[AmigaDoorSession] 📚 LIBRARIES STATUS:");
      console.log(
        `[AmigaDoorSession]   Exec: ${!!this.execLibrary} ${
          this.execLibrary
            ? `(@0x${this.execLibrary.getExecBaseAddress().toString(16)})`
            : ""
        }`
      );
      console.log(`[AmigaDoorSession]   AEDoor: ${!!this.aedoorLibrary}`);
      console.log(`[AmigaDoorSession]   DOS: ${!!this.dosLibrary}`);
      console.log(`[AmigaDoorSession]   Icon: ${!!this.iconLibrary}`);
      console.log(`[AmigaDoorSession]   LibraryTraps: ${!!this.libraryTraps}`);
      console.log(
        `[AmigaDoorSession]   XIM: ${!!this.ximProtocol} ${
          this.useXimProtocol ? "(Active)" : "(Inactive)"
        }`
      );

      // Verify ports
      console.log("[AmigaDoorSession] 🔌 PORTS STATUS:");
      console.log(
        `[AmigaDoorSession]   DoorPort: 0x${this.doorPortAddress.toString(16)}`
      );
      console.log(
        `[AmigaDoorSession]   AEPort: 0x${this.aePortAddress.toString(16)}`
      );
      console.log(
        `[AmigaDoorSession]   ReplyPort: 0x${this.doorReplyPortAddr.toString(
          16
        )}`
      );

      // Log initial register state
      console.log("[AmigaDoorSession] 💾 INITIAL CPU REGISTERS:");
      console.log(
        `[AmigaDoorSession]   PC: 0x${this.emulator
          .getRegister(16)
          .toString(16)}`
      );
      console.log(
        `[AmigaDoorSession]   SP: 0x${this.emulator
          .getRegister(15)
          .toString(16)}`
      );
      console.log(
        `[AmigaDoorSession]   A6: 0x${this.emulator
          .getRegister(14)
          .toString(16)}`
      );
      console.log(
        `[AmigaDoorSession]   A4: 0x${this.emulator
          .getRegister(12)
          .toString(16)}`
      );
      console.log(
        `[AmigaDoorSession]   A0: 0x${this.emulator
          .getRegister(8)
          .toString(16)}`
      );

      // Log initial memory state
      console.log("[AmigaDoorSession] 🧠 INITIAL MEMORY STATE:");
      console.log(
        `[AmigaDoorSession]   memory[0x2001] = 0x${this.emulator
          .readMemory32(0x2001)
          .toString(16)} (BBS ready flag)`
      );
      console.log(
        `[AmigaDoorSession]   memory[0x2000] = 0x${this.emulator
          .readMemory32(0x2000)
          .toString(16)}`
      );
      console.log(
        `[AmigaDoorSession]   memory[0x0F0100] = 0x${this.emulator
          .readMemory32(0x0f0100)
          .toString(16)} (arg string area)`
      );

      // Verify code is loaded at entry point
      const entryPoint = 0x1000;
      const bytes: string[] = [];
      for (let i = 0; i < 16; i++) {
        bytes.push(
          this.emulator
            .readMemory(entryPoint + i)
            .toString(16)
            .padStart(2, "0")
        );
      }
      console.log(`[AmigaDoorSession] Code at 0x1000: ${bytes.join(" ")}`);

      // CLI structure required for doors to read command line arguments
      // Door checks argc - if no args, prints banner and exits
      // Door reads command line from CLI structure (cli_CommandName), not D0/A0
      const taskAddr = 0x70000;
      const prCliOffset = 0xac;
      const cliStructAddr = 0x90000;
      const nodeId = this.config.bbsSession?.nodeId || 0;

      // Extract program name from executable path (e.g., "rtw", "who")
      const progName = path.basename(this.config.executablePath);

      // Create minimal CLI structure at 0x90000
      // struct CommandLineInterface {
      //   BPTR cli_Result2;        // 0x00 - secondary result
      //   BSTR cli_SetName;        // 0x04 - current program name
      //   BPTR cli_CommandDir;     // 0x08 - lock on command directory
      //   LONG cli_ReturnCode;     // 0x0C - return code
      //   BSTR cli_CommandName;    // 0x10 - command line BSTR ← THIS!
      //   ...
      // }

      // Write command line BSTR: "<DOORNAME> <nodeId>" (e.g., "RTW 3", "WHO 0")
      // BSTR format: BPTR points to LENGTH BYTE (4-byte aligned), string data follows
      const cmdLineAddr = 0x90100; // 4-byte aligned
      const cmdLine = `${progName.toUpperCase()} ${nodeId}`;
      this.emulator.writeMemory(cmdLineAddr, cmdLine.length); // BSTR length at 0x90100
      for (let i = 0; i < cmdLine.length; i++) {
        this.emulator.writeMemory(cmdLineAddr + 1 + i, cmdLine.charCodeAt(i)); // String data at 0x90101+
      }
      this.emulator.writeMemory(cmdLineAddr + 1 + cmdLine.length, 0); // Null terminate

      // Write CLI structure
      this.emulator.writeMemory32(cliStructAddr + 0x00, 0); // cli_Result2
      this.emulator.writeMemory32(cliStructAddr + 0x04, 0); // cli_SetName
      this.emulator.writeMemory32(cliStructAddr + 0x08, 0); // cli_CommandDir
      this.emulator.writeMemory32(cliStructAddr + 0x0c, 0); // cli_ReturnCode
      // BPTR points to LENGTH BYTE (4-byte aligned)
      this.emulator.writeMemory32(cliStructAddr + 0x10, cmdLineAddr >> 2); // cli_CommandName (BPTR)
      this.emulator.writeMemory32(cliStructAddr + 0x14, 0); // cli_FailLevel
      this.emulator.writeMemory32(cliStructAddr + 0x18, 0); // cli_Prompt
      this.emulator.writeMemory32(cliStructAddr + 0x1c, 0); // cli_StandardInput
      this.emulator.writeMemory32(cliStructAddr + 0x20, 0); // cli_CurrentInput
      this.emulator.writeMemory32(cliStructAddr + 0x24, 0); // cli_CommandFile
      this.emulator.writeMemory32(cliStructAddr + 0x28, -1); // cli_Interactive = TRUE
      this.emulator.writeMemory32(cliStructAddr + 0x2c, 0); // cli_Background = FALSE
      this.emulator.writeMemory32(cliStructAddr + 0x30, 0); // cli_CurrentOutput
      this.emulator.writeMemory32(cliStructAddr + 0x34, 4096); // cli_DefaultStack
      this.emulator.writeMemory32(cliStructAddr + 0x38, 0); // cli_StandardOutput
      this.emulator.writeMemory32(cliStructAddr + 0x3c, 0); // cli_Module
      this.emulator.writeMemory32(cliStructAddr + 0x40, 0); // cli_CurrentDir (no current dir lock)
      this.emulator.writeMemory32(cliStructAddr + 0x44, 0); // cli_DirLen
      this.emulator.writeMemory32(cliStructAddr + 0x48, 0); // cli_DirBuf
      this.emulator.writeMemory32(cliStructAddr + 0x4c, 0); // cli_PathList
      this.emulator.writeMemory32(cliStructAddr + 0x50, 0); // cli_ReturnAddr
      this.emulator.writeMemory32(cliStructAddr + 0x54, 0); // cli_Pid
      this.emulator.writeMemory32(cliStructAddr + 0x58, 0); // cli_NumArgs

      // Create local variables list for FindVar() support (RTW checks RC and Result2)
      // cli_LocalVars at offset 0x5C points to MinList of LocalVar structures
      const localVarsListAddr = 0x90300;

      // Initialize MinList (8 bytes): lh_Head, lh_Tail, lh_TailPred
      this.emulator.writeMemory32(localVarsListAddr + 0, localVarsListAddr + 4); // lh_Head -> Tail
      this.emulator.writeMemory32(localVarsListAddr + 4, 0); // lh_Tail (always NULL)
      this.emulator.writeMemory32(localVarsListAddr + 8, localVarsListAddr); // lh_TailPred -> Head

      // Create RC local variable (return code = 0)
      const rcVarAddr = 0x90320;
      const rcNameAddr = 0x90340;
      this.emulator.writeString(rcNameAddr, "RC");
      this.emulator.writeMemory32(rcVarAddr + 0, 0); // ln_Succ (end of list)
      this.emulator.writeMemory32(rcVarAddr + 4, 0); // ln_Pred
      this.emulator.writeMemory(rcVarAddr + 8, 0); // ln_Type
      this.emulator.writeMemory(rcVarAddr + 9, 0); // ln_Pri
      this.emulator.writeMemory32(rcVarAddr + 10, rcNameAddr); // ln_Name
      this.emulator.writeMemory32(rcVarAddr + 14, 0); // lv_Value = 0 (success)
      this.emulator.writeMemory32(rcVarAddr + 18, 0); // lv_Len = 0 (numeric)

      // Create Result2 local variable (secondary result = 0)
      const result2VarAddr = 0x90360;
      const result2NameAddr = 0x90380;
      this.emulator.writeString(result2NameAddr, "Result2");
      this.emulator.writeMemory32(result2VarAddr + 0, 0); // ln_Succ (end)
      this.emulator.writeMemory32(result2VarAddr + 4, rcVarAddr); // ln_Pred -> RC
      this.emulator.writeMemory(result2VarAddr + 8, 0); // ln_Type
      this.emulator.writeMemory(result2VarAddr + 9, 0); // ln_Pri
      this.emulator.writeMemory32(result2VarAddr + 10, result2NameAddr); // ln_Name
      this.emulator.writeMemory32(result2VarAddr + 14, 0); // lv_Value = 0
      this.emulator.writeMemory32(result2VarAddr + 18, 0); // lv_Len = 0

      // Link RC to the list
      this.emulator.writeMemory32(rcVarAddr + 0, result2VarAddr); // RC.ln_Succ -> Result2

      // Update list head to point to RC
      this.emulator.writeMemory32(localVarsListAddr + 0, rcVarAddr); // lh_Head -> RC

      // Set cli_LocalVars BPTR to point to list
      this.emulator.writeMemory32(cliStructAddr + 0x5c, localVarsListAddr >> 2); // cli_LocalVars (BPTR)

      console.log(
        `[AmigaDoorSession] Created CLI local variables: RC=0, Result2=0`
      );

      const cliBPTR = cliStructAddr >> 2;
      // AmiExpress (express.e:4317-4336) leaves pr_CLI NULL until the door finishes initialization.
      // Bulls checks *(pr_CLI) at A3+0xAC as an "already initialized" flag and skips CreatePort()
      // if it sees a non-zero pointer. This caused "Couldn't create reply port" errors.
      // Set pr_CLI = 0 so doors detect the first-run path, then restore the pointer once
      // CreatePort() runs (see doorInitCallback below).
      this.emulator.writeMemory32(taskAddr + prCliOffset, 0);

      console.log(
        `[AmigaDoorSession] Created CLI structure at 0x${cliStructAddr.toString(
          16
        )}`
      );
      console.log(
        `[AmigaDoorSession]   cli_CommandName BSTR: length=${
          cmdLine.length
        } at 0x${cmdLineAddr.toString(16)}, data="${cmdLine}"`
      );
      console.log(
        `[AmigaDoorSession]   pr_CLI preset to 0 (door will set after CreatePort)`
      );

      // Set up CLI info for GetArgStr() and GetCliProgramName()
      // GetArgStr() should return just the arguments (node number), not the program name
      const argStringAddr = 0x90200; // Separate from full command line
      const cliArgs =
        this.config.args && this.config.args.length > 0
          ? this.config.args
          : [nodeId.toString()];
      const argStringPlain = cliArgs.join(" ").trim() || nodeId.toString();
      for (let i = 0; i < argStringPlain.length; i++) {
        this.emulator.writeMemory(
          argStringAddr + i,
          argStringPlain.charCodeAt(i)
        );
      }
      this.emulator.writeMemory(argStringAddr + argStringPlain.length, 0); // Null terminate

      // Tell DOS library about CLI info
      if (this.dosLibrary) {
        this.dosLibrary.setCliInfo(argStringAddr, progName);
        console.log(
          `[AmigaDoorSession] Set CLI info: argString="${argStringPlain}" at 0x${argStringAddr.toString(
            16
          )}, progName="${progName}"`
        );
      }

      if (this.execLibrary && this.emulator) {
        this.execLibrary.setDoorInitCallback(() => {
          if (!this.emulator) {
            return;
          }

          const currentValue = this.emulator.readMemory32(
            taskAddr + prCliOffset
          );
          if (currentValue === 0) {
            console.log(
              "[AmigaDoorSession] Door CreatePort completed - setting pr_CLI to CLI structure"
            );
            this.emulator.writeMemory32(taskAddr + prCliOffset, cliBPTR);
          }
        });
      }

      // REMOVED: This was blocking XIM protocol for doors like Bulls
      // XIM doors NEED the message protocol to communicate with BBS
      // Setting startupMessageSent = true here prevented XIM doors from ever entering IPC mode

      // Track execution path for debugging WHO door
      let lastPC = 0;
      let pcChangeCount = 0;
      const pcHistory: number[] = [];
      let logged0x1020 = false;

      // 🚨 CRITICAL: Initialize execution tracking
      this.aedoorCallCount = 0;
      this.executionPath = [];
      this.stuckInLoop = false;
      this.loopDetectionCount = 0;
      this.progressCheckCount = 0;
      this.lastSignificantPC = 0;
      this.mainExecutionReached = false;
      this.initializationComplete = false;
      this.romReturnAttempts = 0;

      console.log(
        "[AmigaDoorSession] 🚨 CRITICAL DEBUG: Execution tracking initialized"
      );

      while (this.isRunning) {
        // === STEP 1: Check if paused (async input) ===
        if (this.emulator.isPaused()) {
          if (this.isBullsDoor && !this.bullsReplyPortInjected) {
            const a4Paused = this.emulator.getRegister(12);
            if (a4Paused !== 0) {
              console.log(
                `[BullsFix] A4 set to 0x${a4Paused.toString(
                  16
                )}, injecting reply ports (iteration ${this.iterationCount})`
              );
              this.injectBullsReplyPort();
              this.bullsReplyPortInjected = true;
            }
          }
          await new Promise((resolve) => setImmediate(resolve));
          continue;
        }

        // === STEP 2: Get current PC ===
        const pc = this.emulator.getRegister(16);
        if (
          !this.bullsCreateCommPatched &&
          pc === 0x1264 &&
          this.doorInfoAddr !== 0
        ) {
          const a4current = this.emulator.getRegister(12);
          if (a4current !== 0) {
            this.emulator.writeMemory32(a4current + 0x6c20, this.doorInfoAddr);
            let handshakeTarget = 1;
            if (this.bullsInfoBufferAddr !== 0) {
              handshakeTarget = this.emulator.readMemory32(
                this.bullsInfoBufferAddr + 0xe0
              );
            }
            if (handshakeTarget !== 0) {
              this.emulator.writeMemory32(
                a4current + 0x6c40,
                handshakeTarget
              );
              console.log(
                `[BullsFix] Synced handshake target at 0x6c40 -> 0x${handshakeTarget.toString(
                  16
                )}`
              );
            }
          }
          this.emulator.setRegister(0, this.doorInfoAddr);
          const sr = this.emulator.getRegister(17);
          const clearedSr = sr & ~0x0c; // Clear N/Z so branch sees success
          this.emulator.setRegister(17, clearedSr);
          console.log(
            `[BullsFix] Forcing D0=0x${this.doorInfoAddr
              .toString(16)
              .toUpperCase()} and refreshing A4+0x6c20 before handshake loop`
          );
          this.bullsCreateCommPatched = true;
        }
        if (pc === 0x1184) {
          console.log("[BullsFix] EXACT 0x1184 encountered");
        }
        if (pc >= 0x1184 && pc <= 0x11b2) {
          console.log(
            `[BullsFix] bullsForce check triggered at PC=0x${pc.toString(16)}`
          );
          this.bullsForceMessagePointer();
        }
        this.logBullsPcState(pc);
        this.logBullsHandshakeState(pc);
        this.monitorBullsPointers(pc);
        if (pc < 0xf00000) {
          this.lastDoorPc = pc;
        }

        // If Bulls jumps into ROM wait loop, try to pull it back into door code
        if (this.isBullsDoor && pc >= 0xf00000 && pc <= 0xf30000) {
          this.logRomEntryState(pc);
          console.log(
            `[BullsFix] PC entered ROM region (0x${pc.toString(
              16
            )}), attempting forced return (attempt ${this.romReturnAttempts + 1})`
          );
          if (this.forceROMReturn()) {
            this.romReturnAttempts++;
            continue;
          }
        }

        // Periodic Bulls reply port injection (retry every iteration until A4 is set)
        const progNameLower = path
          .basename(this.config.executablePath)
          .toLowerCase();
        const isBullsDoor = progNameLower.includes("bull");
        if (isBullsDoor && !this.bullsReplyPortInjected) {
          const a4 = this.emulator!.getRegister(12);
          if (a4 !== 0) {
            console.log(
              `[BullsFix] A4 set to 0x${a4.toString(
                16
              )}, injecting reply ports (iteration ${this.iterationCount})`
            );
            this.injectBullsReplyPort();
            if (!this.sentInitialMessage) {
              this.sendStartupMessage();
              this.sentInitialMessage = true;
            }
            this.bullsReplyPortInjected = true;
          }
        } else if (isBullsDoor) {
          this.refreshBullsDoorPointers();
        }

        // 🚨 CRITICAL DEBUG: Track execution progress and identify stuck state
        this.progressCheckCount++;

        // Log execution milestone every 100 iterations
        if (this.iterationCount % 100 === 0 && this.iterationCount > 0) {
          console.log(
            `[CRITICAL-DEBUG] Iteration ${
              this.iterationCount
            }: PC=0x${pc.toString(16)}`
          );
          console.log(
            `[CRITICAL-DEBUG]   Write calls: ${this.writeCallCount}, AEDoor calls: ${this.aedoorCallCount}`
          );
          console.log(
            `[CRITICAL-DEBUG]   Main execution reached: ${this.mainExecutionReached}`
          );
          console.log(
            `[CRITICAL-DEBUG]   Initialization complete: ${this.initializationComplete}`
          );

          // Check if we're stuck in a loop
          if (this.lastSignificantPC === pc) {
            this.loopDetectionCount++;
            if (this.loopDetectionCount >= 10) {
              console.warn(
                `[CRITICAL-DEBUG] ⚠️ POTENTIAL STUCK LOOP: PC=0x${pc.toString(
                  16
                )} for 10+ progress checks!`
              );
              this.stuckInLoop = true;
            }
          } else {
            this.loopDetectionCount = 0;
            this.lastSignificantPC = pc;
          }
        }

        // Log significant PC changes for path tracking
        if (pc !== lastPC && this.iterationCount % 50 === 0) {
          const opcode = this.emulator.readMemory16(pc);
          console.log(
            `[PATH-TRACK] PC: 0x${pc.toString(16)} -> Opcode: 0x${opcode
              .toString(16)
              .padStart(4, "0")}`
          );
        }

        if (pc === 0x1264 && this.iterationCount % 250 === 0) {
          const words: string[] = [];
          for (let offset = 0; offset < 6; offset += 2) {
            words.push(
              this.emulator
                .readMemory16(pc + offset)
                .toString(16)
                .padStart(4, "0")
            );
          }
          console.log(
            `[BullsFix] PC=0x1264 bytes: ${words.join(" ")}`
          );
        }

        // 🚨 CRITICAL: Detect when door reaches main execution code
        // Doors typically reach main code after initialization (around PC > 0x2000)
        if (!this.mainExecutionReached && pc > 0x2000) {
          this.mainExecutionReached = true;
          console.log(
            `[CRITICAL-DEBUG] ✅ MAIN EXECUTION REACHED at PC=0x${pc.toString(
              16
            )}!`
          );
          this.executionPath.push(
            `Main execution reached at iteration ${this.iterationCount}`
          );
        }

        // 🚨 CRITICAL: Track initialization completion
        // Initialization typically completes when door starts polling AEDoorPort
        if (!this.initializationComplete && pc >= 0x1100 && pc <= 0x1300) {
          this.initializationComplete = true;
          console.log(
            `[CRITICAL-DEBUG] ✅ INITIALIZATION COMPLETE at PC=0x${pc.toString(
              16
            )}!`
          );
          this.executionPath.push(
            `Initialization complete at iteration ${this.iterationCount}`
          );
        }

        // Track first few instructions to verify execution is happening
        if (this.iterationCount < 20) {
          const opcode = this.emulator.readMemory16(pc);
          console.log(
            `[EXEC-DEBUG] Iteration ${this.iterationCount}: PC=0x${pc.toString(
              16
            )} Opcode=0x${opcode.toString(16).padStart(4, "0")}`
          );

          // Special tracking for first 10 instructions
          if (this.iterationCount < 10) {
            const d0 = this.emulator.getRegister(0);
            const a0 = this.emulator.getRegister(8);
            const sp = this.emulator.getRegister(15);
            console.log(
              `[FIRST-INSTR]   D0=0x${d0.toString(16)} A0=0x${a0.toString(
                16
              )} SP=0x${sp.toString(16)}`
            );
          }
        }

        // Check for execution stalls (PC not changing for too long)
        if (pc === lastPC) {
          pcChangeCount++;
          if (pcChangeCount === 100) {
            console.log(
              `[STALL-WARNING] PC=0x${pc.toString(
                16
              )} not changing after 100 iterations!`
            );
            console.log(`[STALL-WARNING] Iteration: ${this.iterationCount}`);
            console.log(`[STALL-WARNING] Checking registers...`);
            const d0 = this.emulator.getRegister(0);
            const a6 = this.emulator.getRegister(14);
            console.log(
              `[STALL-WARNING]   D0=0x${d0.toString(16)} A6=0x${a6.toString(
                16
              )}`
            );
          }
        } else {
          pcChangeCount = 0;
          lastPC = pc;
        }

        // Progress milestones every 1000 iterations
        if (this.iterationCount > 0 && this.iterationCount % 1000 === 0) {
          const currentTime = Date.now();
          const opcode = this.emulator.readMemory16(pc);
          console.log(
            `[MILESTONE] Iteration ${this.iterationCount}: PC=0x${pc.toString(
              16
            )} Opcode=0x${opcode.toString(16).padStart(4, "0")}`
          );
          console.log(
            `[MILESTONE] Total cycles: ${this.totalCycles} (${(
              this.totalCycles / 1000000
            ).toFixed(1)}M)`
          );
          const elapsed = this.startTime ? Date.now() - this.startTime : 0;
          console.log(`[MILESTONE] Elapsed time: ${elapsed}ms`);
        }

        // Instrumentation: capture when doors execute movea.l D0,A7 (stack change without StackSwap)
        if (!this.loggedMoveaStack && (pc === 0x11b2 || pc === 0x1232)) {
          const d0 = this.emulator.getRegister(0);
          const d1 = this.emulator.getRegister(1);
          const spBefore = this.emulator.getRegister(15);
          this.dumpInstruction(pc);
          console.log(
            `[AmigaDoorSession] movea.l D0,A7 at PC=0x${pc.toString(
              16
            )} -> D0=0x${d0.toString(16)}, D1=0x${d1.toString(
              16
            )}, SP(before)=0x${spBefore.toString(16)}`
          );
          this.loggedMoveaStack = true;
        }

        // Track PC changes for WHO debugging (collect 200 unique PCs, log first 100)
        if (pc !== lastPC && pcHistory.length < 200) {
          pcHistory.push(pc);
          pcChangeCount++;
          if (pcChangeCount <= 100) {
            const instruction = this.emulator.readMemory16(pc);
            console.log(
              `[WHO-DEBUG] PC: 0x${pc.toString(
                16
              )} -> Instr: 0x${instruction.toString(16)}`
            );

            // After LEA at 0x1008, check what A1 was set to
            if (lastPC === 0x1008 && pc === 0x100e) {
              const a1 = this.emulator.getRegister(9);
              console.log(
                `[WHO-DEBUG] *** AFTER LEA at 0x1008: A1 = 0x${a1.toString(
                  16
                )} ***`
              );
            }
          }
          lastPC = pc;
        }

        // Log all registers at 0x1020 (before entering the loop) - only once
        if (pc === 0x1020 && !logged0x1020) {
          logged0x1020 = true;
          const d0 = this.emulator.getRegister(0);
          const a1 = this.emulator.getRegister(9);
          const a2 = this.emulator.getRegister(10);
          const a3 = this.emulator.getRegister(11);
          const a4 = this.emulator.getRegister(12);
          const a5 = this.emulator.getRegister(13);
          console.log(`[WHO-DEBUG-INIT] At 0x1020 (before loop):`);
          console.log(`  D0=0x${d0.toString(16)}`);
          console.log(
            `  A1=0x${a1.toString(16)} A2=0x${a2.toString(
              16
            )} A3=0x${a3.toString(16)}`
          );
          console.log(`  A4=0x${a4.toString(16)} A5=0x${a5.toString(16)}`);

          // Dump memory at 0x1020-0x1028 to see actual instructions
          console.log(`[WHO-DEBUG-INIT] Memory at 0x1020-0x1028:`);
          for (let addr = 0x1020; addr < 0x1028; addr += 2) {
            const word = this.emulator.readMemory16(addr);
            console.log(
              `  0x${addr.toString(16)}: 0x${word
                .toString(16)
                .padStart(4, "0")}`
            );
          }
        }

        // Track A1 at both 0x1022 (before MOVE) and 0x1024 (after MOVE)
        if (
          (pc === 0x1022 || pc === 0x1024) &&
          this.iterationCount >= 100 &&
          this.iterationCount <= 104
        ) {
          const d0 = this.emulator.getRegister(0);
          const a1 = this.emulator.getRegister(9);
          const a3 = this.emulator.getRegister(11);

          // Read actual memory at A1 to see what would be copied
          const memAtA1 = this.emulator.readMemory32(a1);
          const memAtA1Minus4 = this.emulator.readMemory32(a1 - 4);
          const memAtA1Minus708 = this.emulator.readMemory32(a1 - 708); // Before BSS
          const memAtA1Minus800 = this.emulator.readMemory32(a1 - 800); // Well before BSS

          if (pc === 0x1022) {
            console.log(`[WHO-DEBUG-MOVE] BEFORE MOVE at 0x1022:`);
            console.log(
              `  D0=0x${d0.toString(16)} A1=0x${a1.toString(
                16
              )} A3=0x${a3.toString(16)}`
            );
            console.log(
              `  Memory[A1]=0x${memAtA1.toString(
                16
              )} Memory[A1-4]=0x${memAtA1Minus4.toString(16)}`
            );
            console.log(
              `  Memory[A1-708]=0x${memAtA1Minus708.toString(
                16
              )} Memory[A1-800]=0x${memAtA1Minus800.toString(16)}`
            );
          } else {
            console.log(`[WHO-DEBUG-MOVE] AFTER MOVE at 0x1024:`);
            console.log(
              `  D0=0x${d0.toString(16)} A1=0x${a1.toString(
                16
              )} A3=0x${a3.toString(16)}`
            );
            console.log(
              `  Memory[A1]=0x${memAtA1.toString(
                16
              )} Memory[A1-4]=0x${memAtA1Minus4.toString(16)}`
            );

            // Check what was written to A3-4
            const writtenValue = this.emulator.readMemory32(a3 - 4);
            console.log(`  Written to [A3-4]=0x${writtenValue.toString(16)}`);
          }
        }

        // === DEBUG: Track the mystery jump from 0x24a6 to 0x1ffce ===
        if (pc === 0x24a6) {
          console.log(
            `[WHO-DEBUG-24A6] === AT PC 0x24a6 (mystery jump location) ===`
          );

          // Read next 5 instructions
          for (let i = 0; i < 10; i += 2) {
            const addr = pc + i;
            const instr = this.emulator.readMemory16(addr);
            console.log(
              `[WHO-DEBUG-24A6] Memory[0x${addr.toString(16)}] = 0x${instr
                .toString(16)
                .padStart(4, "0")}`
            );
          }

          // Log ALL registers
          console.log(`[WHO-DEBUG-24A6] Registers BEFORE execute():`);
          for (let d = 0; d < 8; d++) {
            const val = this.emulator.getRegister(d);
            console.log(`  D${d}=0x${val.toString(16).padStart(8, "0")}`);
          }
          for (let a = 0; a < 7; a++) {
            const val = this.emulator.getRegister(8 + a);
            console.log(`  A${a}=0x${val.toString(16).padStart(8, "0")}`);
          }
          const sp = this.emulator.getRegister(15);
          const pc_reg = this.emulator.getRegister(16);
          const sr = this.emulator.getRegister(17);
          console.log(`  SP=0x${sp.toString(16).padStart(8, "0")}`);
          console.log(`  PC=0x${pc_reg.toString(16).padStart(8, "0")}`);
          console.log(`  SR=0x${sr.toString(16).padStart(4, "0")}`);

          // Check what A0 points to (0x2940 is MOVE.L (A0),(A4)+)
          const a0 = this.emulator.getRegister(8);
          console.log(`[WHO-DEBUG-24A6] A0 points to: 0x${a0.toString(16)}`);
          if (a0 >= 0x1000 && a0 < 0x200000) {
            const memAtA0 = this.emulator.readMemory32(a0);
            console.log(
              `[WHO-DEBUG-24A6] Memory[A0] = 0x${memAtA0.toString(16)}`
            );
          } else {
            console.log(
              `[WHO-DEBUG-24A6] A0 is INVALID! (0x${a0.toString(16)})`
            );
          }
        }

        // === STEP 3: Check exit conditions ===

        // === DEBUG: Check A4 setup (right after LEA.L <data>,A4) ===
        if (pc === 0x1034) {
          const a4 = this.emulator.getRegister(12); // A4 = register 12
          console.log(`\n[A4-DEBUG] A4 initialized at PC=0x1034`);
          console.log(`[A4-DEBUG] A4 = 0x${a4.toString(16)}`);
          const testValue = this.emulator.readMemory32(a4 + 0x474);
          console.log(`[A4-DEBUG] A4+0x474 = 0x${(a4 + 0x474).toString(16)}`);
          console.log(
            `[A4-DEBUG] Memory[A4+0x474] = 0x${testValue.toString(16)}`
          );
          if (testValue !== 0) {
            console.log(
              `[A4-DEBUG] *** WARNING: A4+0x474 is NON-ZERO (0x${testValue.toString(
                16
              )}) - RTW will exit early! ***\n`
            );
          } else {
            console.log(
              `[A4-DEBUG] ✓ A4+0x474 is zero - RTW should continue to IPC code\n`
            );
          }
        }

        // === FIX: Inject reply port AND BBS port RIGHT BEFORE the critical test ===
        if (pc === 0x124c && this.useXimProtocol && !this.ximPortsInitialized) {
          // Safety fallback: ensure ports exist even if early injection missed somehow
          this.injectXimPortsEarly();
        }

        // === DEBUG: The critical test at PC=0x124C (file 0x278 -> memory 0x124C) ===
        if (pc === 0x124c) {
          const a4 = this.emulator.getRegister(12);
          const testValue = this.emulator.readMemory32(a4 + 0x474);
          console.log(`[CRITICAL-TEST] PC=0x124C: TST.L 0x474(A4)`);
          console.log(`[CRITICAL-TEST] A4 = 0x${a4.toString(16)}`);
          console.log(
            `[CRITICAL-TEST] Value at A4+0x474: 0x${testValue.toString(16)}`
          );
          if (testValue !== 0) {
            console.log(
              `[CRITICAL-TEST] ✓ Port is set! RTW will enter IPC loop!\n`
            );
          } else {
            console.log(
              `[CRITICAL-TEST] ✗ Port is ZERO - RTW will exit with code 30\n`
            );
          }
        }

        // === DEBUG: Track reply port creation at PC=0x1068 (file 0x1068) ===
        if (pc === 0x1068) {
          const a4 = this.emulator.getRegister(12);
          const d0 = this.emulator.getRegister(0);
          console.log(`\n[REPLY-PORT-CREATE] PC=0x1068: MOVE.L D0, 0x450(A4)`);
          console.log(
            `[REPLY-PORT-CREATE] D0 (port address) = 0x${d0.toString(16)}`
          );
          console.log(`[REPLY-PORT-CREATE] A4 = 0x${a4.toString(16)}`);
          console.log(
            `[REPLY-PORT-CREATE] Storing at A4+0x450 = 0x${(
              a4 + 0x450
            ).toString(16)}\n`
          );
        }

        // === DEBUG: Test reply port creation at PC=0x1078 (file 0x1078) ===
        if (pc === 0x1078) {
          const a4 = this.emulator.getRegister(12);
          const testValue = this.emulator.readMemory32(a4 + 0x450);
          console.log(`\n[REPLY-PORT-TEST] PC=0x1078: TST.L 0x450(A4)`);
          console.log(
            `[REPLY-PORT-TEST] Value at A4+0x450 = 0x${testValue.toString(16)}`
          );
          if (testValue === 0) {
            console.log(
              `[REPLY-PORT-TEST] ✗ Reply port creation FAILED - RTW will take error path\n`
            );
          } else {
            console.log(
              `[REPLY-PORT-TEST] ✓ Reply port created successfully at 0x${testValue.toString(
                16
              )}\n`
            );
          }
        }

        // === DEBUG: The cleanup branch at PC=0x1270 (file 0x29C -> memory 0x1270) ===
        if (pc === 0x1270) {
          console.log(
            `\n[CLEANUP-BRANCH] PC=0x1270 (file 0x29C): BRA.B to cleanup`
          );
          console.log(
            `[CLEANUP-BRANCH] RTW is now executing cleanup and will exit with code 30\n`
          );
        }

        // === DEBUG: Verify trap instructions in memory ===
        if (pc === 0x1000 && !this.trapVerified) {
          this.trapVerified = true;
          const putMsgTrap = this.emulator.readMemory16(0xfe92);
          const waitTrap = this.emulator.readMemory16(0xfec2);
          const allocMemTrap = this.emulator.readMemory16(0xff3a);
          console.log(`\n[TRAP-VERIFY] Checking trap instructions in memory:`);
          console.log(
            `[TRAP-VERIFY] PutMsg at 0xFE92: 0x${putMsgTrap
              .toString(16)
              .padStart(4, "0")}`
          );
          console.log(
            `[TRAP-VERIFY] Wait at 0xFEC2: 0x${waitTrap
              .toString(16)
              .padStart(4, "0")}`
          );
          console.log(
            `[TRAP-VERIFY] AllocMem at 0xFF3A: 0x${allocMemTrap
              .toString(16)
              .padStart(4, "0")}\n`
          );
        }

        // === DEBUG: Check A6 and JSR execution ===
        if (pc === 0x116c && this.emulator) {
          const a6 = this.emulator.getRegister(14);
          const opcode116C = this.emulator.readMemory32(0x116c);
          const opcode1170 = this.emulator.readMemory32(0x1170);
          console.log(`\n[RTW-JSR] PC=0x116C: About to execute instruction`);
          console.log(`[RTW-JSR] A6 (ExecBase) = 0x${a6.toString(16)}`);
          console.log(
            `[RTW-JSR] Memory at 0x116C: 0x${opcode116C.toString(
              16
            )} (should be 0x2C780004 = movea.l 0x4.w,a6)`
          );
          console.log(
            `[RTW-JSR] Memory at 0x1170: 0x${opcode1170.toString(
              16
            )} (should be 0x4EAEFE92 = jsr -0x16e(a6))`
          );
          console.log(
            `[RTW-JSR] Expected jump to: 0x${(a6 - 0x16e).toString(16)}\n`
          );
        }

        // === DEBUG: Check if we reach JSR instruction ===
        if (pc === 0x1170 && this.emulator) {
          console.log(
            `\n[RTW-JSR] *** PC=0x1170: Executing JSR -0x16e(A6) to PutMsg ***`
          );
          const a6 = this.emulator.getRegister(14);
          console.log(
            `[RTW-JSR] A6 = 0x${a6.toString(16)}, will jump to 0x${(
              a6 - 0x16e
            ).toString(16)}\n`
          );
        }

        // === DEBUG: Check exit point at 0x117C ===
        if (pc === 0x117c && this.emulator) {
          const a0 = this.emulator.getRegister(8);
          const d0 = this.emulator.getRegister(0);
          const opcode = this.emulator.readMemory16(0x117c);
          console.log(
            `\n[RTW-EXIT-117C] *** PC=0x117C: About to execute move.b 0x22, (a0) ***`
          );
          console.log(
            `[RTW-EXIT-117C] A0 = 0x${a0.toString(16)} (write destination)`
          );
          console.log(`[RTW-EXIT-117C] D0 = 0x${d0.toString(16)}`);
          console.log(`[RTW-EXIT-117C] Opcode: 0x${opcode.toString(16)}`);
          console.log(
            `[RTW-EXIT-117C] Next instruction at 0x117E: move.l a0, -(a7)`
          );
          console.log(`[RTW-EXIT-117C] Then BRA to 0x11CE\n`);
        }

        // === DEBUG: Check if we reach instructions after 0x117C ===
        if (pc === 0x117e && this.emulator) {
          console.log(
            `\n[RTW-EXIT-117E] *** PC=0x117E: Reached instruction after 0x117C! ***`
          );
          console.log(
            `[RTW-EXIT-117E] move.b succeeded, continuing execution\n`
          );
        }

        // === DEBUG: Check if we reach branch target ===
        if (pc === 0x11ce && this.emulator) {
          console.log(
            `\n[RTW-EXIT-11CE] *** PC=0x11CE: Reached branch target! ***`
          );
          console.log(`[RTW-EXIT-11CE] Executing initialization code\n`);
        }

        // === DEBUG: Trace ALL execution between 0x11CE and 0x124C to find missing FindPort ===
        if (pc >= 0x11ce && pc <= 0x124c) {
          if (!this.rtwInitPCs) this.rtwInitPCs = [];
          this.rtwInitPCs.push(pc);

          // Log every 10th PC to avoid spam
          if (this.rtwInitPCs.length % 10 === 0) {
            console.log(
              `[RTW-INIT] PCs so far: ${this.rtwInitPCs
                .slice(-10)
                .map((p) => "0x" + p.toString(16))
                .join(" -> ")}`
            );
          }
        }

        // === DEBUG: Log when we reach the critical test ===
        if (pc === 0x124c && this.emulator) {
          console.log(
            `\n[RTW-INIT] *** Complete path from 0x11CE to 0x124C: ***`
          );
          if (this.rtwInitPCs) {
            const uniquePCs = [...new Set(this.rtwInitPCs)];
            console.log(`[RTW-INIT] ${uniquePCs.length} unique PCs visited`);
            console.log(
              `[RTW-INIT] Path: ${uniquePCs
                .map((p) => "0x" + p.toString(16))
                .join(" -> ")}`
            );
          }
          console.log(
            `[RTW-INIT] Now executing TST.L 0x474(A4) - this will determine exit or IPC\n`
          );
        }

        // === DEBUG: RTW actual loop at 0x1158-0x1160 ===
        if (pc === 0x1158 || pc === 0x115e || pc === 0x1160) {
          if (!this.rtwLoopCount) this.rtwLoopCount = 0;
          this.rtwLoopCount++;

          if (this.rtwLoopCount % 100 === 0) {
            console.log(
              `\n[RTW-LOOP] PC=0x${pc.toString(16)}, iteration ${
                this.rtwLoopCount
              }`
            );
            const opcode = this.emulator.readMemory16(pc);
            console.log(
              `[RTW-LOOP] Opcode: 0x${opcode.toString(16).padStart(4, "0")}`
            );

            // Log all registers
            const regs = [];
            for (let i = 0; i < 8; i++) {
              regs.push(`D${i}=0x${this.emulator.getRegister(i).toString(16)}`);
            }
            for (let i = 8; i < 16; i++) {
              regs.push(
                `A${i - 8}=0x${this.emulator.getRegister(i).toString(16)}`
              );
            }
            console.log(`[RTW-LOOP] ${regs.join(", ")}`);

            if (this.rtwLoopCount >= 500) {
              console.log(
                `[RTW-LOOP] *** STUCK IN LOOP FOR 500+ iterations - forcing exit ***`
              );
              this.isRunning = false;
            }
          }
        }

        // === DEBUG: PutMsg() call at PC 0x1170 - RTW sending message to BBS ===
        if (pc === 0x1170 && this.emulator && this.execLibrary) {
          const a0 = this.emulator.getRegister(8); // A0 = port address
          const a1 = this.emulator.getRegister(9); // A1 = message address
          const a4 = this.emulator.getRegister(12);
          const currentA6 = this.emulator.getRegister(14);

          console.log(`\n[PutMsg-SEND] PC=0x1170: RTW calling PutMsg()`);
          console.log(`[PutMsg-SEND] A0 (port) = 0x${a0.toString(16)}`);
          console.log(`[PutMsg-SEND] A1 (message) = 0x${a1.toString(16)}`);
          console.log(`[PutMsg-SEND] A4 = 0x${a4.toString(16)}`);

          // Read message structure
          const mn_ReplyPort = this.emulator.readMemory32(a1 + 0x10);
          const mn_Length = this.emulator.readMemory16(a1 + 0x0e);

          console.log(
            `[PutMsg-SEND] Message.mn_ReplyPort = 0x${mn_ReplyPort.toString(
              16
            )}`
          );
          console.log(`[PutMsg-SEND] Message.mn_Length = ${mn_Length}`);

          // Check if port exists in ExecLibrary
          const portName = this.execLibrary.getPortName(a0);
          const replyPortName = this.execLibrary.getPortName(mn_ReplyPort);

          console.log(
            `[PutMsg-SEND] Destination port name: ${portName || "UNKNOWN"}`
          );
          console.log(
            `[PutMsg-SEND] Reply port name: ${replyPortName || "UNKNOWN"}`
          );

          // Read first 16 bytes of message data
          const msgData: number[] = [];
          for (let i = 0; i < 16; i++) {
            msgData.push(this.emulator.readMemory(a1 + 0x14 + i));
          }
          console.log(
            `[PutMsg-SEND] Message data (first 16 bytes): ${msgData
              .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
              .join(" ")}\n`
          );

          // === DEBUG: Scan A4 for the pointer that matches A0 (helps locate AEDoorPort injection point) ===
          if (this.emulator && a4 !== 0) {
            const matches: number[] = [];
            const bptrMatches: number[] = [];
            const a0Bptr = a0 >>> 2;
            for (let offset = 0; offset <= 0x1fff; offset += 4) {
              const value = this.emulator.readMemory32(a4 + offset);
              if (value === a0) {
                matches.push(offset);
              } else if (value === a0Bptr) {
                bptrMatches.push(offset);
              }
            }
            if (matches.length > 0) {
              console.log(
                `[PutMsg-SEND] A4 matches for A0: ${matches
                  .map((o) => "0x" + o.toString(16))
                  .join(", ")}`
              );
            }
            if (bptrMatches.length > 0) {
              console.log(
                `[PutMsg-SEND] A4 BPTR matches for A0>>2: ${bptrMatches
                  .map((o) => "0x" + o.toString(16))
                  .join(", ")}`
              );
            }
            if (matches.length === 0 && bptrMatches.length === 0) {
              console.log(
                "[PutMsg-SEND] No match for A0 (or BPTR form) found in A4 range 0x000-0x1fff"
              );
              const sniffOffsets = [0x44c, 0x450, 0x474, 0x57c, 0x58a, 0x5b8];
              sniffOffsets.forEach((offset) => {
                const value = this.emulator!.readMemory32(a4 + offset);
                console.log(
                  `[PutMsg-SEND]   A4+0x${offset.toString(
                    16
                  )} = 0x${value.toString(16)}`
                );
              });

              // As last resort, scan a larger region to find where Bulls stored the port pointer.
              const globalMatches: number[] = [];
              const limit = 0x1000000; // scan first 16MB
              for (let addr = 0; addr < limit; addr += 4) {
                const value = this.emulator.readMemory32(addr);
                if (value === a0) {
                  globalMatches.push(addr);
                  if (globalMatches.length >= 5) break;
                }
              }
              if (globalMatches.length > 0) {
                console.log(
                  `[PutMsg-SEND] Global matches for A0 found at: ${globalMatches
                    .map((a) => "0x" + a.toString(16))
                    .join(", ")}`
                );
              } else {
                console.log(
                  "[PutMsg-SEND] No global matches for A0 within first 16MB"
                );
              }
            }

            // Force Bulls to use the XIM reply port/BBS port just like AEDoor.library would
            if (this.useXimProtocol) {
              if (this.doorReplyPortAddr === 0) {
                this.doorReplyPortAddr = this.execLibrary.createMsgPort();
                console.log(
                  `[PutMsg-SEND] Created reply port on the fly at 0x${this.doorReplyPortAddr.toString(
                    16
                  )}`
                );
              }
              if (this.doorReplyPortAddr) {
                this.emulator.writeMemory32(a1 + 0x10, this.doorReplyPortAddr);
                console.log(
                  `[PutMsg-SEND] ✔ Patched mn_ReplyPort -> 0x${this.doorReplyPortAddr.toString(
                    16
                  )}`
                );
              }
              let forcedPortAddr = a0;
              if (this.aePortAddress) {
                forcedPortAddr = this.aePortAddress;
                this.emulator.setRegister(8, forcedPortAddr);
                console.log(
                  `[PutMsg-SEND] ✔ Redirected A0 to AEDoorPort at 0x${this.aePortAddress.toString(
                    16
                  )}`
                );
              }
              if (
                this.execLibrary &&
                currentA6 !== this.execLibrary.getExecBaseAddress()
              ) {
                const execBaseAddr = this.execLibrary.getExecBaseAddress();
                this.emulator.setRegister(14, execBaseAddr);
                console.log(
                  `[PutMsg-SEND] ✔ Forced A6 to ExecBase 0x${execBaseAddr.toString(
                    16
                  )} (was 0x${currentA6.toString(16)})`
                );
              }
              if (this.execLibrary) {
                const nextPc = (this.emulator.getRegister(16) + 4) & 0xffffff;
                console.log("[PutMsg-SEND] Emulating Exec PutMsg via host handler");
                this.emulateExecPutMsg(forcedPortAddr, a1, nextPc);
                continue;
              }
            }
          }
        }

        // === DEBUG: Wait() call at PC 0x1176 - RTW waiting for reply signal ===
        if (pc === 0x1176 && this.emulator) {
          const d0 = this.emulator.getRegister(0); // D0 = signal mask
          const d7 = this.emulator.getRegister(7); // D7 was copied to D0

          console.log(`\n[Wait-CALL] PC=0x1176: RTW calling Wait()`);
          console.log(`[Wait-CALL] D0 (signal mask) = 0x${d0.toString(16)}`);
          console.log(`[Wait-CALL] D7 (original mask) = 0x${d7.toString(16)}`);
          console.log(
            `[Wait-CALL] RTW is blocking, waiting for signal from reply port\n`
          );
        }

        // === CRITICAL FIX: Send startup message when door enters polling loop ===
        // This addresses the root cause: doors get stuck waiting for initial BBS message

        // Special Bulls door handling - Bulls doesn't use standard RTW polling pattern
        // Bulls goes directly to ROM memory at 0xf24404, so we need early intervention
        if (this.isBullsDoor && !this.sentInitialMessage) {
          // Bulls-specific early initialization - send startup message immediately
          // This prevents Bulls from jumping to ROM
          console.log(
            `\n[BULLS-EARLY] *** BULLS DOOR DETECTED - SENDING EARLY STARTUP MESSAGE ***`
          );
          this.sentInitialMessage = true;

          // Send initial message that Bulls expects to receive
          this.sendStartupMessage();

          // Also inject reply port directly into Bulls data structures
          this.injectBullsReplyPort();
        }

        // Bulls-specific polling detection - Bulls may poll at different addresses than RTW
        const bullsPollingAddresses = [
          0x1158, 0x118e, 0x1190, 0x1200, 0x1250, 0x1300,
        ];
        const isBullsPolling =
          bullsPollingAddresses.includes(pc) && !this.sentInitialMessage;

        if (isBullsPolling) {
          console.log(
            `\n[BULLS-POLL] *** BULLS POLLING DETECTED AT PC=0x${pc.toString(
              16
            )} - SENDING STARTUP MESSAGE ***`
          );
          this.sentInitialMessage = true;

          // Send the initial door configuration message that doors expect
          this.sendStartupMessage();
        }

        // Fallback: Generic polling loop detection for any door type
        // If PC stays in 0x1100-0x1400 range for many iterations, likely polling
        if (pc >= 0x1100 && pc <= 0x1400 && !this.sentInitialMessage) {
          // Check if we're repeatedly visiting this PC range
          this.loopDetectionCount = (this.loopDetectionCount || 0) + 1;

          if (this.loopDetectionCount >= 50) {
            console.log(
              `\n[GENERIC-POLL] *** GENERIC POLLING DETECTED AT PC=0x${pc.toString(
                16
              )} (50+ visits) - SENDING STARTUP MESSAGE ***`
            );
            this.sentInitialMessage = true;

            // Send the initial door configuration message that doors expect
            this.sendStartupMessage();
          }
        }

        // === DEBUG: GetMsg() polling loop entry (PC 0x118E) ===
        if (pc === 0x118e) {
          const a4 = this.emulator.getRegister(12);
          const portAddr = this.emulator.readMemory32(a4 + 0x450);
          console.log(
            `\n[GetMsg-POLL] PC=0x118E: RTW entering GetMsg() polling loop`
          );
          console.log(`[GetMsg-POLL] A4 = 0x${a4.toString(16)}`);
          console.log(
            `[GetMsg-POLL] A4+0x450 (port pointer) = 0x${portAddr.toString(16)}`
          );

          if (portAddr === 0 || portAddr === 0xffffffff) {
            console.log(
              `[GetMsg-POLL] *** INVALID PORT ADDRESS! RTW will crash or loop forever! ***\n`
            );
          } else {
            // Check message count in port's message list
            const msgListHead = this.emulator.readMemory32(portAddr + 20); // mp_MsgList.lh_Head
            const msgListTail = portAddr + 20 + 4; // mp_MsgList.lh_Tail
            const msgCount = msgListHead === msgListTail ? 0 : 1; // Simple check

            console.log(
              `[GetMsg-POLL] Port mp_MsgList.lh_Head = 0x${msgListHead.toString(
                16
              )}`
            );
            console.log(
              `[GetMsg-POLL] Port mp_MsgList.lh_Tail = 0x${msgListTail.toString(
                16
              )}`
            );
            console.log(`[GetMsg-POLL] Messages in queue: ${msgCount}`);

            if (msgCount === 0) {
              console.log(
                `[GetMsg-POLL] *** PORT IS EMPTY! GetMsg() will return NULL and RTW will exit! ***`
              );

              // CRITICAL FIX: Send initial door configuration message to unblock door
              if (!this.sentInitialMessage) {
                this.sentInitialMessage = true;
                console.log(
                  `[GetMsg-POLL] === SENDING INITIAL IPC MESSAGE (FALLBACK) ===`
                );
                this.sendStartupMessage();
              }
            } else {
              console.log(
                `[GetMsg-POLL] ✓ Port has messages - RTW should continue\n`
              );
            }
          }
        }

        // === DEBUG: Track when D0 becomes 30 (0x1E) ===
        const currentD0 = this.emulator.getRegister(0);
        if (currentD0 === 30 || currentD0 === 0x1e) {
          if (!this.d0Was30) {
            this.d0Was30 = true;
            const opcode = this.emulator.readMemory16(pc);
            console.log(
              `[D0=30] First time D0=30 at PC=0x${pc.toString(
                16
              )}, opcode=0x${opcode.toString(16).padStart(4, "0")}`
            );
            console.log(
              `[D0=30] Last 10 PCs: ${pcHistory
                .slice(-10)
                .map((p) => "0x" + p.toString(16))
                .join(" -> ")}`
            );
          }
        }

        // Exit trap: Door returned to our sentinel address
        if (pc === 0xffff00) {
          const returnCode = this.emulator.getRegister(0);
          console.log(`[AmigaDoorSession] === DOOR EXITED CLEANLY ===`);
          console.log(`[AmigaDoorSession] Return code (D0): ${returnCode}`);
          console.log(
            `[AmigaDoorSession] Total iterations: ${this.iterationCount}`
          );
          console.log(
            `[RTW-EXIT] Execution path (${pcHistory.length} unique PCs):`
          );
          console.log(`[RTW-EXIT] Last 50 PCs before exit:`);
          console.log(
            `[RTW-EXIT] ${pcHistory
              .slice(-50)
              .map((p) => "0x" + p.toString(16))
              .join(" -> ")}`
          );
          this.terminate();
          return;
        }

        // Low memory PC (crash/corruption)
        if (pc < 0x100 && this.iterationCount > 100) {
          console.log(
            `[AmigaDoorSession] PC in low memory (0x${pc.toString(
              16
            )}) - likely stack corruption`
          );
          console.log(
            `[AmigaDoorSession] Total iterations: ${this.iterationCount}`
          );
          console.log(
            `[WHO-DEBUG] Execution path (${pcHistory.length} unique PCs):`
          );
          console.log(
            `[WHO-DEBUG] First 30: ${pcHistory
              .slice(0, 30)
              .map((p) => "0x" + p.toString(16))
              .join(" -> ")}`
          );
          if (pcHistory.length > 30) {
            console.log(
              `[WHO-DEBUG] Last 30: ${pcHistory
                .slice(-30)
                .map((p) => "0x" + p.toString(16))
                .join(" -> ")}`
            );
          }
          this.terminate();
          return;
        }

        // ROM polling loop (door jumped into Kickstart routine)
        // === STEP 4: UNIFIED trap detection (single canonical check) ===
        const trapHandled = await this.checkAndHandleLibraryTrap(pc);
        if (trapHandled) {
          // 🚨 CRITICAL: Track library trap calls for debugging
          const a6 = this.emulator.getRegister(14);
          let offset = pc - a6;

          // Handle 16-bit signed offset wrapping
          if (a6 < 0x10000 && offset > 0x8000 && offset < 0x1000000) {
            const low16 = offset & 0xffff;
            offset = low16 >= 0x8000 ? low16 - 0x10000 : low16;
          } else if (offset > 0x7fffffff) {
            offset = offset - 0x100000000;
          }

          // Track DOS.Write() calls specifically
          if (offset === -48 || pc === 0xfffffed0) {
            this.writeCallCount++;
            const fileHandle = this.emulator.getRegister(8); // A0 = file handle
            const buffer = this.emulator.getRegister(9); // A1 = buffer
            const length = this.emulator.getRegister(0); // D0 = length

            console.log(
              `[WRITE-TRACK] *** DOS.Write() CALL #${this.writeCallCount} ***`
            );
            console.log(
              `[WRITE-TRACK]   PC: 0x${pc.toString(16)}, Iteration: ${
                this.iterationCount
              }`
            );
            console.log(
              `[WRITE-TRACK]   File handle: 0x${fileHandle.toString(16)}`
            );
            console.log(
              `[WRITE-TRACK]   Buffer: 0x${buffer.toString(
                16
              )}, Length: ${length}`
            );

            // Log the Write() call details
            this.writeCallLog.push({
              pc,
              iteration: this.iterationCount,
              args: { fileHandle, buffer, length },
            });

            // Read and display the content being written
            if (length > 0 && length < 1000) {
              // Only read reasonable amounts
              let content = "";
              for (let i = 0; i < Math.min(length, 200); i++) {
                const byte = this.emulator.readMemory(buffer + i);
                if (byte >= 32 && byte <= 126) {
                  // Printable ASCII
                  content += String.fromCharCode(byte);
                } else if (byte === 0) {
                  break;
                } else {
                  content += `[${byte.toString(16).padStart(2, "0")}]`;
                }
              }
              console.log(`[WRITE-TRACK]   Content: "${content}"`);
            }
          }

          // Track AEDoor.library calls
          if (a6 === 0xff4000 || (a6 >= 0xff4000 && a6 <= 0xff4fff)) {
            this.aedoorCallCount++;
            const functionName = this.getAEDoorFunctionName(offset);

            console.log(
              `[AEDOOR-TRACK] *** AEDoor.library CALL #${this.aedoorCallCount} ***`
            );
            console.log(
              `[AEDOOR-TRACK]   Function: ${functionName} (offset ${offset})`
            );
            console.log(
              `[AEDOOR-TRACK]   PC: 0x${pc.toString(16)}, Iteration: ${
                this.iterationCount
              }`
            );

            this.aedoorCallLog.push({
              pc,
              iteration: this.iterationCount,
              function: functionName,
            });
          }

          this.iterationCount++;
          await new Promise((resolve) => setImmediate(resolve));
          continue;
        }

        // === STEP 5: Execute exactly ONE instruction ===
        // CRITICAL FIX: Use MOIRA's executeInstruction() which executes exactly ONE
        // complete instruction (regardless of cycles required). This is the ROOT solution:
        // - Multi-cycle instructions (DBRA, MOVEM, MULU) complete fully
        // - Library traps checked between EVERY instruction
        // - No mid-batch JSR execution bugs
        // Previous execute(20) ran multiple instructions, missing JSRs within the batch.
        const wasAt24a6 = pc === 0x24a6;
        const cyclesExecuted = this.emulator.executeInstruction();
        this.totalCycles += cyclesExecuted;

        // === DEBUG: WHO/RTW Polling Loop Analysis (0x1140-0x1178) ===
        // Track what happens just before and during polling loops
        // WHO enters loop at 0x1140 after calling functions that return counts in D0
        if (pc >= 0x1140 && pc <= 0x1178) {
          const newPc = this.emulator.getRegister(16);
          const opcode = this.emulator.readMemory16(pc);
          const d0 = this.emulator.getRegister(0);
          const d1 = this.emulator.getRegister(1);
          const d2 = this.emulator.getRegister(2);
          const a0 = this.emulator.getRegister(8);
          const a1 = this.emulator.getRegister(9);
          const sr = this.emulator.getRegister(17);
          const ccr = sr & 0x1f; // Condition Code Register (lower 5 bits)
          console.log(
            `[POLL] PC=0x${pc.toString(16)} Op=0x${opcode
              .toString(16)
              .padStart(4, "0")} -> 0x${newPc.toString(16)} | D0=${d0
              .toString(16)
              .padStart(8, "0")} D1=${d1.toString(16).padStart(8, "0")} D2=${d2
              .toString(16)
              .padStart(8, "0")} | A0=0x${a0.toString(16)}`
          );
        }

        // === DEBUG: Check PC after executeInstruction() if we were at 0x24a6 ===
        if (wasAt24a6) {
          const newPc = this.emulator.getRegister(16);
          console.log(
            `[WHO-DEBUG-24A6] AFTER executeInstruction(): PC = 0x${newPc.toString(
              16
            )}, cycles=${cyclesExecuted}`
          );
          if (newPc === 0x1ffce) {
            console.log(
              `[WHO-DEBUG-24A6] !!! PC JUMPED TO GARBAGE MEMORY 0x1ffce !!!`
            );
            // Log registers again
            for (let a = 0; a < 7; a++) {
              const val = this.emulator.getRegister(8 + a);
              console.log(`  A${a}=0x${val.toString(16).padStart(8, "0")}`);
            }
          }
        }

        // === STEP 6: Track progress and yield ===
        this.iterationCount++;

        // 🚨 DEBUG PHASE 4: SAFETY AND PROGRESS MONITORING

        // Initialize start time for elapsed tracking
        if (!this.startTime) {
          this.startTime = Date.now();
        }

        // Log progress every 5k iterations (more frequent for debugging)
        if (this.iterationCount % 5000 === 0 && this.iterationCount > 0) {
          const elapsed = Date.now() - this.startTime;
          const totalSeconds =
            this.totalCycles / (this.CYCLES_PER_MICROSECOND * 1000000);
          console.log(
            `[AmigaDoorSession] 📊 PROGRESS: Iteration ${
              this.iterationCount
            } (${(this.totalCycles / 1000000).toFixed(
              1
            )}M cycles, ${totalSeconds.toFixed(2)}s virtual, ${elapsed}ms real)`
          );
          console.log(`[AmigaDoorSession] 📊 PC: 0x${pc.toString(16)}`);

          // Memory check at progress milestones
          try {
            const mem2001 = this.emulator.readMemory32(0x2001);
            console.log(
              `[AmigaDoorSession] 📊 memory[0x2001]: 0x${mem2001.toString(16)}`
            );
          } catch (e) {
            console.log(`[AmigaDoorSession] 📊 memory[0x2001]: ERROR ${e}`);
          }
        }

        // Prevent infinite loops (safety limit) - reduced for faster testing
        const guardLimit = Number(process.env.AEDOOR_LOOP_LIMIT ?? 50000); // Reduced from 100k
        if (this.iterationCount > guardLimit) {
          console.log(
            `[AmigaDoorSession] 🛑 SAFETY LIMIT: Door running for ${guardLimit} iterations - likely stuck`
          );
          console.log(`[AmigaDoorSession] 🛑 Last PC: 0x${pc.toString(16)}`);
          console.log(
            `[AmigaDoorSession] 🛑 Total cycles: ${this.totalCycles}`
          );
          console.log(
            `[AmigaDoorSession] 🛑 Elapsed time: ${
              Date.now() - this.startTime
            }ms`
          );
          console.log(
            `[AmigaDoorSession] 🛑 Terminating for debugging purposes`
          );
          this.terminate();
          return;
        }

        // Yield to event loop for responsiveness
        const isWaitingForInput =
          this.ximProtocol && this.ximProtocol.isWaitingForLineInput();
        if (isWaitingForInput) {
          // Yield every 10 iterations when waiting for input
          if (this.iterationCount % 10 === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
        } else {
          // Normal execution: yield every 1000 iterations (more frequent for debugging)
          if (this.iterationCount % 1000 === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
      }

      console.log("[AmigaDoorSession] 🏁 Execution loop completed normally");
    } catch (error) {
      console.error("[AmigaDoorSession] 💥 ERROR in execution loop:", error);
      console.error(`[AmigaDoorSession] 💥 Iteration: ${this.iterationCount}`);
      console.error(
        `[AmigaDoorSession] 💥 PC: 0x${
          this.emulator ? this.emulator.getRegister(16).toString(16) : "unknown"
        }`
      );
      console.error(
        `[AmigaDoorSession] 💥 Stack: ${
          error instanceof Error ? error.stack : "No stack"
        }`
      );
      this.socket.emit("door:error", {
        message: error instanceof Error ? error.message : "Execution error",
      });
      this.terminate();
    }
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
      console.error(
        "[AmigaDoorSession] Cannot send startup message: libraries not initialized"
      );
      return;
    }

    this.ensureDoorInfoStructure();

    console.log("[AmigaDoorSession] === SENDING STARTUP MESSAGE TO DOOR ===");

    // The door is polling AEDoorPort0 (created at 0xa0000 during init)
    const portAddr = this.doorPortAddress || 0xa0000;
    console.log(
      `[AmigaDoorSession] Target port: AEDoorPort0 at 0x${portAddr.toString(
        16
      )}`
    );

    const STARTUP_COMMAND = 0;
    const nodeId = this.config.bbsSession?.nodeId || 0;
    const userName =
      this.config.bbsSession?.user?.username ?? "AmiExpress User";
    const startupText = `NODE ${nodeId} READY - ${userName}`;
    const msgAddr = this.allocateDoorCommandMessage(
      STARTUP_COMMAND,
      nodeId,
      startupText
    );
    if (msgAddr === null) {
      console.error(
        "[AmigaDoorSession] Unable to allocate startup message structure"
      );
      return;
    }

    this.logDoorMessageContents(msgAddr, "Startup message");

    // Send the message using PutMsg()
    console.log(
      `[AmigaDoorSession] Calling PutMsg(port=0x${portAddr.toString(
        16
      )}, msg=0x${msgAddr.toString(16)})`
    );
    this.execLibrary.putMsg(portAddr, msgAddr, {
      suppressDoorCallback: true,
    });

    console.log("[AmigaDoorSession] === STARTUP MESSAGE SENT ===");
    console.log(
      "[AmigaDoorSession] Door should receive this via GetMsg() and exit polling loop"
    );

    this.startupMessageSent = true;

    if (this.isBullsDoor) {
      this.sendNodeStatusMessage();
    }
  }

  private sendNodeStatusMessage(): void {
    if (
      !this.execLibrary ||
      !this.emulator ||
      this.nodeStatusMessageSent ||
      !this.isBullsDoor
    ) {
      return;
    }

    this.ensureDoorInfoStructure();
    if (!this.nodeStatusAddr) {
      console.warn(
        "[AmigaDoorSession] Cannot send node status message: no node status block"
      );
      return;
    }

    const portAddr = this.doorPortAddress || 0xa0000;
    const statusText = `NODE ${this.resolveNodeId()} STATUS READY`;
    const msgAddr = this.allocateDoorCommandMessage(
      1,
      this.nodeStatusAddr,
      statusText
    );
    if (msgAddr === null) {
      return;
    }

    console.log(
      `[AmigaDoorSession] Sending node status message (data=0x${this.nodeStatusAddr.toString(
        16
      )})`
    );
    this.execLibrary.putMsg(portAddr, msgAddr, {
      suppressDoorCallback: true,
    });
    this.nodeStatusMessageSent = true;
  }

  private allocateDoorCommandMessage(
    command: number,
    data: number,
    messageText: string
  ): number | null {
    if (!this.execLibrary || !this.emulator) {
      return null;
    }

    if (this.doorReplyPortAddr === 0) {
      this.doorReplyPortAddr = this.execLibrary.createMsgPort();
    }
    if (this.doorReplyPortAddr === 0) {
      console.error("[AmigaDoorSession] Failed to create reply port");
      return null;
    }

    const msgAddr = this.execLibrary.allocMem(
      AmigaDoorSession.MESSAGE_TOTAL_LENGTH,
      AmigaDoorSession.MEMF_PUBLIC_CLEAR
    );
    if (msgAddr === 0) {
      console.error(
        "[AmigaDoorSession] Failed to allocate door command message memory"
      );
      return null;
    }

    const replyPortAddr = this.doorReplyPortAddr;
    const NT_MESSAGE = 5;

    this.emulator.writeMemory32(msgAddr + 0, 0);
    this.emulator.writeMemory32(msgAddr + 4, 0);
    this.emulator.writeMemory(msgAddr + 8, NT_MESSAGE);
    this.emulator.writeMemory(msgAddr + 9, 0);
    this.emulator.writeMemory32(msgAddr + 10, 0);
    this.emulator.writeMemory32(
      msgAddr + AmigaDoorSession.MESSAGE_REPLY_PORT_OFFSET,
      replyPortAddr
    );
    this.emulator.writeMemory16(
      msgAddr + AmigaDoorSession.MESSAGE_LENGTH_OFFSET,
      AmigaDoorSession.MESSAGE_TOTAL_LENGTH
    );
    this.emulator.writeMemory32(
      msgAddr + AmigaDoorSession.MESSAGE_COMMAND_OFFSET,
      command
    );
    this.emulator.writeMemory32(
      msgAddr + AmigaDoorSession.MESSAGE_DATA_OFFSET,
      data
    );
    this.emulator.writeMemory32(
      msgAddr + AmigaDoorSession.MESSAGE_NODE_OFFSET,
      this.resolveNodeId()
    );
    this.writeStringToMemory(
      msgAddr + AmigaDoorSession.MESSAGE_STRING_OFFSET,
      messageText,
      AmigaDoorSession.MESSAGE_STRING_CAPACITY
    );

    return msgAddr;
  }

  private ensureDoorInfoStructure(): void {
    console.log(
      `[BullsFix] ensureDoorInfoStructure invoked (exec=${!!this.execLibrary}, emu=${!!this.emulator}, bulls=${this.isBullsDoor})`
    );
    if (!this.execLibrary || !this.emulator || !this.isBullsDoor) {
      return;
    }

    const replyName = `DoorReplyPort${this.resolveNodeId()}`;
    const bbsPortName = this.config.bbsSession?.bbsName ?? "AmiExpress";

    if (this.doorInfoAddr === 0) {
      const addr = this.execLibrary.allocMem(
        AmigaDoorSession.DOOR_INFO_SIZE,
        AmigaDoorSession.MEMF_PUBLIC_CLEAR
      );
      if (addr === 0) {
        console.error(
          "[AmigaDoorSession] Failed to allocate DoorInfo structure"
        );
        return;
      }
      this.doorInfoAddr = addr;

      if (this.doorReplyPortAddr === 0) {
        this.doorReplyPortAddr = this.execLibrary.createMsgPort();
      }
    }

    const addr = this.doorInfoAddr;
    const messageAddr =
      addr + AmigaDoorSession.DOOR_INFO_MESSAGE_OFFSET;
    this.nodeStatusAddr =
      messageAddr + AmigaDoorSession.MESSAGE_DATA_OFFSET;
    console.log(
      `[BullsFix] DoorInfo block prepared at 0x${addr.toString(
        16
      )}, message=0x${messageAddr.toString(
        16
      )}, nodeStatus=0x${this.nodeStatusAddr.toString(16)}`
    );

    this.doorSummaryPtr =
      messageAddr + AmigaDoorSession.MESSAGE_STRING_OFFSET;

    this.emulator.writeMemory32(addr + 0x00, this.aePortAddress);
    this.emulator.writeMemory32(addr + 0x04, this.doorReplyPortAddr);
    this.emulator.writeMemory32(addr + 0x08, messageAddr);
    this.emulator.writeMemory32(
      addr + AmigaDoorSession.DIF_DATA_PTR_OFFSET,
      this.nodeStatusAddr
    );
    this.emulator.writeMemory32(
      addr + AmigaDoorSession.DIF_STRING_PTR_OFFSET,
      this.doorSummaryPtr
    );

    this.writeStringToMemory(addr + 0x0c, replyName, 16);
    this.writeStringToMemory(
      addr + 0x46,
      `${bbsPortName} (${this.config.bbsSession?.user?.username ?? "guest"})`,
      0x90
    );

    this.emulator.writeMemory32(
      messageAddr + AmigaDoorSession.MESSAGE_REPLY_PORT_OFFSET,
      this.doorReplyPortAddr
    );
    this.emulator.writeMemory16(
      messageAddr + AmigaDoorSession.MESSAGE_LENGTH_OFFSET,
      AmigaDoorSession.MESSAGE_TOTAL_LENGTH
    );
    this.emulator.writeMemory32(
      messageAddr + AmigaDoorSession.MESSAGE_COMMAND_OFFSET,
      0
    );

    this.populateDoorInfoStringBuffer(
      messageAddr,
      AmigaDoorSession.MESSAGE_STRING_OFFSET,
      200
    );
    this.populateNodeStatusBlock(messageAddr);
  }

  private populateDoorInfoStringBuffer(
    messageAddr: number,
    stringOffset: number,
    stringCapacity: number
  ): void {
    if (!this.emulator || this.doorInfoAddr === 0) {
      return;
    }

    const nodeId = this.resolveNodeId();
    const executableName = path
      .basename(this.config.executablePath ?? "door")
      .toUpperCase();
    const cliName = `${executableName} ${nodeId}`;
    this.writeStringToMemory(this.doorInfoAddr + 0x0c, cliName, 0x32);

    const indexInfo = [
      `NODE ${nodeId}`,
      `USER ${this.config.bbsSession?.user?.username ?? "GUEST"}`,
      `BBS ${this.config.bbsSession?.bbsName ?? "AmiExpress-Web"}`,
    ];
    const summary = indexInfo.join("\r\n");
    const stringAddr = messageAddr + stringOffset;
    this.writeStringToMemory(stringAddr, summary, stringCapacity);
    this.doorSummaryPtr = stringAddr;
  }

  private populateNodeStatusBlock(messageAddr: number): void {
    if (!this.emulator || this.nodeStatusAddr === 0) {
      if (!this.emulator) {
        return;
      }
      console.warn(
        "[AmigaDoorSession] Cannot populate node status block - address not initialized"
      );
      return;
    }

    const nodeId = this.resolveNodeId();
    const secLevel = this.config.bbsSession?.user?.secLevel ?? 100;
    const minutesLeft = this.config.bbsSession?.user?.timeLeft ?? 30;
    const ansiEnabled = this.config.bbsSession?.user?.ansi ? 1 : 0;
    const userName =
      this.config.bbsSession?.user?.username ?? "AmiExpress User";
    const location =
      this.config.bbsSession?.user?.location ?? "Remote Connection";
    const bbsName = this.config.bbsSession?.bbsName ?? "AmiExpress-Web";

    this.emulator.writeMemory32(this.nodeStatusAddr + 0x00, nodeId);
    this.emulator.writeMemory32(this.nodeStatusAddr + 0x04, secLevel);
    this.emulator.writeMemory32(this.nodeStatusAddr + 0x08, minutesLeft);
    this.emulator.writeMemory32(this.nodeStatusAddr + 0x0c, ansiEnabled);

    const userAddr =
      this.nodeStatusAddr + AmigaDoorSession.NODE_STATUS_USERNAME_OFFSET;
    const locationAddr =
      this.nodeStatusAddr + AmigaDoorSession.NODE_STATUS_LOCATION_OFFSET;
    const summaryAddr =
      this.nodeStatusAddr + AmigaDoorSession.NODE_STATUS_SUMMARY_OFFSET;

    this.writeStringToMemory(userAddr, userName, 32);
    this.writeStringToMemory(locationAddr, location, 32);
    this.writeStringToMemory(summaryAddr, `${bbsName} Node ${nodeId}`, 64);

    this.emulator.writeMemory32(
      this.nodeStatusAddr +
        AmigaDoorSession.NODE_STATUS_USERNAME_PTR_OFFSET,
      userAddr
    );
    this.emulator.writeMemory32(
      this.nodeStatusAddr +
        AmigaDoorSession.NODE_STATUS_LOCATION_PTR_OFFSET,
      locationAddr
    );
    this.emulator.writeMemory32(
      this.nodeStatusAddr +
        AmigaDoorSession.NODE_STATUS_SUMMARY_PTR_OFFSET,
      summaryAddr
    );

    this.emulator.writeMemory32(
      messageAddr + AmigaDoorSession.MESSAGE_DATA_OFFSET,
      this.nodeStatusAddr
    );
    this.emulator.writeMemory32(
      messageAddr + AmigaDoorSession.MESSAGE_NODE_OFFSET,
      nodeId
    );
  }

  private writeStringToMemory(
    address: number,
    value: string,
    maxLength: number
  ): void {
    if (!this.emulator) {
      return;
    }
    const truncated = value.slice(0, Math.max(0, maxLength - 1));
    for (let i = 0; i < truncated.length; i++) {
      this.emulator.writeMemory(address + i, truncated.charCodeAt(i));
    }
    this.emulator.writeMemory(address + truncated.length, 0);
  }

  private logRomEntryState(pc: number): void {
    if (!this.emulator) {
      return;
    }
    const sp = this.emulator.getRegister(15);
    const returnAddr = this.emulator.readMemory32(sp);
    console.log(
      `[BullsFix] ROM entry snapshot -> PC=0x${pc.toString(
        16
      )}, SP=0x${sp.toString(16)}, return@SP=0x${returnAddr.toString(16)}, lastDoorPc=0x${this.lastDoorPc.toString(
        16
      )}`
    );
    for (let i = 0; i < 4; i++) {
      const addr = sp + i * 4;
      const val = this.emulator.readMemory32(addr);
      console.log(
        `[BullsFix]   SP+0x${(i * 4).toString(16)} -> 0x${val.toString(16)}`
      );
    }
  }

  private logDoorMessageContents(msgAddr: number, label: string): void {
    if (!this.emulator) {
      return;
    }

    const replyPort = this.emulator.readMemory32(msgAddr + 14);
    const length = this.emulator.readMemory16(msgAddr + 18);
    const command = this.emulator.readMemory32(msgAddr + 20);
    const data = this.emulator.readMemory32(msgAddr + 24);
    let str = "";
    const stringBase =
      msgAddr + AmigaDoorSession.MESSAGE_STRING_OFFSET;
    for (
      let i = 0;
      i < AmigaDoorSession.MESSAGE_STRING_CAPACITY;
      i++
    ) {
      const ch = this.emulator.readMemory(stringBase + i);
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }

    console.log(
      `[AmigaDoorSession] ${label}: msg=0x${msgAddr.toString(
        16
      )}, len=${length}, cmd=${command}, data=${data}, reply=0x${replyPort.toString(
        16
      )}, str="${str}"`
    );
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
  private forceROMReturn(): boolean {
    if (!this.emulator || !this.execLibrary) {
      console.error(
        "[AmigaDoorSession] Cannot force ROM return: not initialized"
      );
      return false;
    }

    console.log("[AmigaDoorSession] Attempting to return door from ROM...");

    // Check if there's a return address on stack
    const sp = this.emulator.getRegister(15); // A7 = Stack Pointer
    console.log(`[AmigaDoorSession]   Current SP: 0x${sp.toString(16)}`);

    // Read return address from stack
    let returnAddr = this.emulator.readMemory32(sp);
    console.log(
      `[AmigaDoorSession]   Return address on stack: 0x${returnAddr.toString(
        16
      )}`
    );

    // Validate return address (should be in door code range)
    if (returnAddr < 0x1000 || returnAddr > 0x100000) {
      if (
        this.isBullsDoor &&
        this.bullsLastWaitPortReturnPc >= 0x1000 &&
        this.bullsLastWaitPortReturnPc <= 0x100000
      ) {
        console.log(
          `[BullsFix]   Invalid return address 0x${returnAddr.toString(
            16
          )}, using last WaitPort return PC 0x${this.bullsLastWaitPortReturnPc.toString(
            16
          )}`
        );
        returnAddr = this.bullsLastWaitPortReturnPc;
      } else if (
        this.lastDoorPc >= 0x1000 &&
        this.lastDoorPc <= 0x100000
      ) {
        console.log(
          `[AmigaDoorSession]   Invalid return address 0x${returnAddr.toString(
            16
          )}, falling back to last door PC 0x${this.lastDoorPc.toString(16)}`
        );
        returnAddr = this.lastDoorPc;
      } else {
        console.error(
          `[AmigaDoorSession]   Invalid return address: 0x${returnAddr.toString(
            16
          )}`
        );
        return false;
      }
    }

    // Check for messages in AEDoorPort0
    const nodeId = this.config.bbsSession?.nodeId || 0;
    let portAddr = this.doorPortAddress;
    if (!portAddr) {
      const portName = `AEDoorPort${nodeId}`;

      // Allocate memory for port name
      const portNameSize = portName.length + 1;
      const portNameAddr = this.execLibrary.allocMem(portNameSize, 0x10001);
      this.emulator.writeString(portNameAddr, portName);
      const debugPortName = this.emulator.readString(portNameAddr);
      console.log(
        `[AmigaDoorSession]   Looking up port "${debugPortName}" (len=${portName.length})`
      );

      // Find port
      portAddr = this.execLibrary.findPort(portNameAddr);
      this.execLibrary.freeMem(portNameAddr, portNameSize);
    } else {
      console.log(
        `[AmigaDoorSession]   Reusing cached AEDoorPort at 0x${portAddr.toString(
          16
        )}`
      );
    }

    if (portAddr === 0) {
      console.error("[AmigaDoorSession]   Port not found!");
      return false;
    }

    this.refreshBullsDoorPointers();

    const a4 = this.emulator.getRegister(12);
    if (a4 !== 0) {
      const doorInfoPtr = this.emulator.readMemory32(a4 + 0x6c20);
      const nodeStatePtr = this.emulator.readMemory32(a4 + 0xdc);
      console.log(
        `[BullsFix] DoorInfo pointers -> A4+0x6c20=0x${doorInfoPtr.toString(
          16
        )}, A4+0xdc=0x${nodeStatePtr.toString(16)}`
      );
    }

    // Call WaitPort to get message (if any)
    const msgAddr = this.execLibrary.waitPort(portAddr);
    console.log(
      `[AmigaDoorSession]   WaitPort returned: 0x${msgAddr.toString(16)}`
    );
    if (msgAddr !== 0) {
      this.logDoorMessageContents(msgAddr, "WaitPort message");
    }

    // Set D0 to message address (WaitPort return value)
    this.emulator.setRegister(0, msgAddr);
    console.log(`[AmigaDoorSession]   Set D0 = 0x${msgAddr.toString(16)}`);

    // Pop return address from stack (RTS behavior)
    this.emulator.setRegister(15, sp + 4); // SP += 4
    console.log(
      `[AmigaDoorSession]   Adjusted SP to 0x${(sp + 4).toString(16)}`
    );

    // Set PC to return address
    this.emulator.setRegister(16, returnAddr);
    console.log(`[AmigaDoorSession]   Set PC = 0x${returnAddr.toString(16)}`);

    // Refill prefetch queue (critical!)
    this.emulator.refillPrefetch();
    console.log(`[AmigaDoorSession]   Refilled prefetch queue`);

    console.log("[AmigaDoorSession] *** DOOR RETURNED FROM ROM ***");
    console.log(
      `[AmigaDoorSession]   Door should now process message at 0x${msgAddr.toString(
        16
      )}`
    );
    return true;
  }

  /**
   * Handle door message (trap-based, not polling)
   *
   * Called by ExecLibrary when door calls PutMsg() to send to AEDoorPort.
   * This is the CORRECT XIM protocol implementation.
   */
  private handleDoorMessage(portAddr: number, msgAddr: number): void {
    if (!this.emulator || !this.execLibrary) return;

    console.log(
      `[AmigaDoorSession] ===============================================`
    );
    console.log(
      `[AmigaDoorSession] *** DOOR MESSAGE RECEIVED (via PutMsg trap) ***`
    );
    console.log(
      `[AmigaDoorSession] ===============================================`
    );
    console.log(`[AmigaDoorSession]   Port: 0x${portAddr.toString(16)}`);
    console.log(`[AmigaDoorSession]   Message: 0x${msgAddr.toString(16)}`);

    // Parse message structure (same as processDoorMessages)
    const mn_ReplyPort = this.emulator.readMemory32(msgAddr + 14);
    const mn_Length = this.emulator.readMemory16(msgAddr + 18);

    // AEDoor message extension (after struct Message)
    const command = this.emulator.readMemory32(msgAddr + 20);
    const data = this.emulator.readMemory32(msgAddr + 24);

    // Read string (first 128 bytes max)
    let str = "";
    for (let i = 0; i < 128; i++) {
      const ch = this.emulator.readMemory(msgAddr + 28 + i);
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }

    console.log(`[AmigaDoorSession]   Command: ${command}`);
    console.log(`[AmigaDoorSession]   Data: ${data}`);
    console.log(`[AmigaDoorSession]   String: "${str}"`);
    console.log(
      `[AmigaDoorSession]   Reply port: 0x${mn_ReplyPort.toString(16)}`
    );

    // Use XIM Protocol handler to process and respond
    if (this.ximProtocol) {
      const ximMessage = this.ximProtocol.parseMessage(msgAddr);
      this.ximProtocol.handleMessage(ximMessage);

      if (this.isBullsDoor && ximMessage.command === XIMCommand.JH_LI) {
        this.injectBullsKeyboardInput();
      }
    } else {
      console.log(`[AmigaDoorSession] WARNING: XIM Protocol not initialized!`);
      // Fall back to old handler
      this.processCommand(command, data, str, msgAddr, mn_ReplyPort);
    }

    console.log(
      `[AmigaDoorSession] ===============================================`
    );
  }

  /**
   * Emulate Exec PutMsg for doors that bypass the normal vector (Bulls)
   */
  private emulateExecPutMsg(
    portAddr: number,
    msgAddr: number,
    returnAddr?: number
  ): void {
    if (!this.execLibrary || !this.emulator) {
      return;
    }

    console.log(
      `[AmigaDoorSession] >>> Host handling PutMsg(port=0x${portAddr.toString(
        16
      )}, msg=0x${msgAddr.toString(16)})`
    );
    this.execLibrary.putMsg(portAddr, msgAddr);

    const sp = this.emulator.getRegister(15);
    let resumePc = returnAddr ?? this.emulator.readMemory32(sp);
    this.emulator.setRegister(15, sp + 4);
    this.emulator.setRegister(16, resumePc);
    this.emulator.refillPrefetch();

    console.log(
      `[AmigaDoorSession] <<< PutMsg emulation complete, returning to 0x${resumePc.toString(
        16
      )}`
    );
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

      console.log(
        `[AmigaDoorSession] Found ${portName} at 0x${this.doorPortAddress.toString(
          16
        )} (door created it!)`
      );
    }

    // Poll the AEDoorPort for messages
    const msgAddr = this.execLibrary.getMsg(this.doorPortAddress);

    if (msgAddr === 0) {
      // No message
      return;
    }

    console.log(
      `[AmigaDoorSession] ===============================================`
    );
    console.log(`[AmigaDoorSession] *** DOOR MESSAGE RECEIVED! ***`);
    console.log(
      `[AmigaDoorSession] ===============================================`
    );
    console.log(
      `[AmigaDoorSession]   Message address: 0x${msgAddr.toString(16)}`
    );

    // Parse message structure
    const mn_ReplyPort = this.emulator.readMemory32(msgAddr + 14);
    const mn_Length = this.emulator.readMemory16(msgAddr + 18);

    // AEDoor message extension (after struct Message)
    const command = this.emulator.readMemory32(msgAddr + 20);
    const data = this.emulator.readMemory32(msgAddr + 24);

    // Read string (first 128 bytes max)
    let str = "";
    for (let i = 0; i < 128; i++) {
      const ch = this.emulator.readMemory(msgAddr + 28 + i);
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }

    console.log(`[AmigaDoorSession]   Command: ${command}`);
    console.log(`[AmigaDoorSession]   Data: ${data}`);
    console.log(`[AmigaDoorSession]   String: "${str}"`);
    console.log(
      `[AmigaDoorSession]   Reply port: 0x${mn_ReplyPort.toString(16)}`
    );

    // Process command based on type
    // Command constants from aedoor.h:
    // JH_WRITE = 3 (write text to terminal)
    // DT_NAME = 100 (get user name)
    // GETKEY = 500 (get user input)
    this.processCommand(command, data, str, msgAddr, mn_ReplyPort);

    console.log(
      `[AmigaDoorSession] ===============================================`
    );
  }

  /**
   * Process a specific door command
   *
   * Based on express.e processXimMsg() and aedoor.h command constants
   */
  private processCommand(
    command: number,
    data: number,
    str: string,
    msgAddr: number,
    replyPortAddr: number
  ): void {
    console.log(`[AmigaDoorSession] Processing command ${command}...`);

    // Command constants from aedoor.h
    const JH_LI = 0; // Line Input
    const JH_REGISTER = 1; // Register door with BBS
    const JH_SHUTDOWN = 2; // Shutdown door
    const JH_WRITE = 3; // Write text to terminal
    const JH_SM = 4; // Send Message
    const JH_PM = 5; // Post Message
    const JH_HK = 6; // HotKey
    const JH_SG = 7; // Show GFile
    const JH_SF = 8; // Show File
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
        this.writeStringToMessage(msgAddr, "");
        console.log(
          `[AmigaDoorSession]   Returned empty string (simulated Enter key)`
        );
        break;

      case JH_REGISTER:
        // Register door with BBS
        console.log(
          `[AmigaDoorSession]   JH_REGISTER: Door registering with BBS`
        );
        console.log(`[AmigaDoorSession]   Door is now active and ready`);
        // No response data needed, just reply
        break;

      case JH_SHUTDOWN:
        // Door is shutting down
        console.log(`[AmigaDoorSession]   JH_SHUTDOWN: Door shutting down`);
        console.log(`[AmigaDoorSession]   Terminating door session`);
        // Reply and then terminate
        this.execLibrary!.putMsg(replyPortAddr, msgAddr, {
          suppressDoorCallback: true,
        });
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
          output += "\r\n";
        }
        this.socket.emit("ansi-output", output);
        console.log(`[AmigaDoorSession]   Sent to terminal: "${output}"`);
        break;

      case DT_NAME:
        // Get user name - write to message string field
        console.log(`[AmigaDoorSession]   DT_NAME: Request for user name`);
        const userName = this.config.bbsSession?.user?.username || "Sysop";
        this.writeStringToMessage(msgAddr, userName);
        console.log(`[AmigaDoorSession]   Replied with name: "${userName}"`);
        break;

      case DT_LOCATION:
        // Get user location
        console.log(
          `[AmigaDoorSession]   DT_LOCATION: Request for user location`
        );
        const location = this.config.bbsSession?.user?.location || "Unknown";
        this.writeStringToMessage(msgAddr, location);
        console.log(
          `[AmigaDoorSession]   Replied with location: "${location}"`
        );
        break;

      case DT_SECLEVEL:
        // Get security level
        console.log(
          `[AmigaDoorSession]   DT_SECLEVEL: Request for security level`
        );
        const secLevel = this.config.bbsSession?.user?.secLevel || 100;
        // Write to data field (offset 24)
        this.emulator!.writeMemory32(msgAddr + 24, secLevel);
        console.log(`[AmigaDoorSession]   Replied with sec level: ${secLevel}`);
        break;

      case GETKEY:
        // Get user input - this requires pausing execution
        console.log(`[AmigaDoorSession]   GETKEY: Request for user input`);
        console.log(
          `[AmigaDoorSession]   TODO: Implement input handling (pause execution, wait for key)`
        );
        // For now, just reply with Enter key (0x0D)
        this.emulator!.writeMemory32(msgAddr + 24, 0x0d);
        break;

      default:
        console.log(`[AmigaDoorSession]   Unknown command: ${command}`);
        console.log(
          `[AmigaDoorSession]   TODO: Implement handler for this command`
        );
        break;
    }

    // Reply to the door by sending message back to its reply port
    this.execLibrary!.putMsg(replyPortAddr, msgAddr, {
      suppressDoorCallback: true,
    });
    console.log(
      `[AmigaDoorSession]   Sent reply to door at port 0x${replyPortAddr.toString(
        16
      )}`
    );
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
      console.log(
        "[AmigaDoorSession] ERROR: Cannot send startup message - emulator not initialized"
      );
      return;
    }

    console.log(
      "[AmigaDoorSession] ==============================================="
    );
    console.log(
      "[AmigaDoorSession] *** SENDING SIMPLE STARTUP MESSAGE TO DOOR ***"
    );
    console.log(
      "[AmigaDoorSession] ==============================================="
    );

    // WHO2's Process message port is at task address + 0x5C
    const doorPortAddr = 0x7005c;

    // Allocate simple message structure (just struct Message header, 20 bytes)
    const msgSize = 20;
    const msgAddr = this.execLibrary.allocMem(msgSize, 0x10001); // MEMF_PUBLIC|MEMF_CLEAR

    if (msgAddr === 0) {
      console.log(
        "[AmigaDoorSession] ERROR: Failed to allocate startup message"
      );
      return;
    }

    console.log(
      `[AmigaDoorSession] Allocated simple message at 0x${msgAddr.toString(
        16
      )} (${msgSize} bytes)`
    );

    // Write struct Message header (20 bytes)
    this.emulator.writeMemory32(msgAddr + 0, 0); // mn_Succ
    this.emulator.writeMemory32(msgAddr + 4, 0); // mn_Pred
    this.emulator.writeMemory(msgAddr + 8, 5); // mn_Type = NT_MESSAGE
    this.emulator.writeMemory(msgAddr + 9, 0); // mn_Pri
    this.emulator.writeMemory32(msgAddr + 10, 0); // mn_ReplyPort (0 = no reply needed)
    this.emulator.writeMemory16(msgAddr + 18, msgSize); // mn_Length

    console.log(`[AmigaDoorSession] Simple message structure:`);
    console.log(`  Message address: 0x${msgAddr.toString(16)}`);
    console.log(`  mn_Length: ${msgSize}`);
    console.log(`  Sending to port: 0x${doorPortAddr.toString(16)}`);

    // Put the message in the door's message port queue
    this.execLibrary.putMsg(doorPortAddr, msgAddr, {
      suppressDoorCallback: true,
    });

    console.log("[AmigaDoorSession] *** SIMPLE STARTUP MESSAGE SENT! ***");
    console.log(
      "[AmigaDoorSession] WHO2 should now wake up and start processing"
    );
    console.log(
      "[AmigaDoorSession] ==============================================="
    );
  }

  /**
   * Send initial WbStartup message to WHO2 door (UNUSED - WHO2 is not a WB tool)
   * WHO2 expects a proper Workbench startup message with program arguments
   * This allows WHO2 to find its WHO.info file and read tooltypes
   */
  private sendInitialXimMessage(): void {
    if (!this.emulator || !this.execLibrary) {
      console.log(
        "[AmigaDoorSession] ERROR: Cannot send startup message - emulator not initialized"
      );
      return;
    }

    console.log(
      "[AmigaDoorSession] ==============================================="
    );
    console.log("[AmigaDoorSession] *** SENDING WBSTARTUP MESSAGE TO DOOR ***");
    console.log(
      "[AmigaDoorSession] ==============================================="
    );

    // WHO2's Process message port is at task address + 0x5C
    const doorPortAddr = 0x7005c;

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
    const wbStartupSize = 40; // WbStartup struct
    const wbArgSize = 8; // One WBArg entry
    const filenameSize = 8; // "WHO" as BSTR (1 byte len + chars + null)
    const totalSize = wbStartupSize + wbArgSize + filenameSize;

    const msgAddr = this.execLibrary.allocMem(totalSize, 0x10001); // MEMF_PUBLIC|MEMF_CLEAR

    if (msgAddr === 0) {
      console.log(
        "[AmigaDoorSession] ERROR: Failed to allocate WbStartup message"
      );
      return;
    }

    console.log(
      `[AmigaDoorSession] Allocated WbStartup at 0x${msgAddr.toString(
        16
      )} (${totalSize} bytes)`
    );

    // Calculate addresses
    const wbArgAddr = msgAddr + wbStartupSize; // WBArg array starts after WbStartup
    const filenameAddr = wbArgAddr + wbArgSize; // Filename BSTR after WBArg

    // 1. Write struct Message header (20 bytes)
    this.emulator.writeMemory32(msgAddr + 0, 0); // mn_Succ
    this.emulator.writeMemory32(msgAddr + 4, 0); // mn_Pred
    this.emulator.writeMemory(msgAddr + 8, 5); // mn_Type = NT_MESSAGE
    this.emulator.writeMemory(msgAddr + 9, 0); // mn_Pri
    this.emulator.writeMemory32(msgAddr + 10, 0); // mn_ReplyPort (0 = no reply needed)
    this.emulator.writeMemory16(msgAddr + 18, totalSize); // mn_Length

    // 2. Write WbStartup fields (20 bytes, from offset 20-39)
    this.emulator.writeMemory32(msgAddr + 20, doorPortAddr); // sm_Process (door's message port)
    this.emulator.writeMemory32(msgAddr + 24, 0); // sm_Segment (0 for WB programs)
    this.emulator.writeMemory32(msgAddr + 28, 1); // sm_NumArgs (1 arg: the program itself)
    this.emulator.writeMemory32(msgAddr + 32, 0); // sm_ToolWindow (0 = none)
    this.emulator.writeMemory32(msgAddr + 36, wbArgAddr); // sm_ArgList (pointer to WBArg array)

    // 3. Write WBArg entry (8 bytes at wbArgAddr)
    // For WHO2, we need to point to its PROGDIR: (doors/who/) and filename "WHO"
    // IMPORTANT: wa_Lock and wa_Name are BPTR (BCPL pointers), not C pointers!
    // BPTR = pointer >> 2 (divided by 4)
    this.emulator.writeMemory32(wbArgAddr + 0, 0); // wa_Lock (0 = NULL = use PROGDIR:)
    this.emulator.writeMemory32(wbArgAddr + 4, filenameAddr >> 2); // wa_Name (BPTR to BSTR)

    // 4. Write filename as BSTR (AmigaDOS BSTR = length byte + chars)
    const filename = "WHO";
    this.emulator.writeMemory(filenameAddr, filename.length); // BSTR length byte
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
    console.log(
      `  WBArg[0].wa_Name: 0x${(filenameAddr >> 2).toString(
        16
      )} (BPTR to BSTR at 0x${filenameAddr.toString(16)} = "${filename}")`
    );

    // Put the message in the door's message port queue
    this.execLibrary.putMsg(doorPortAddr, msgAddr, {
      suppressDoorCallback: true,
    });

    console.log("[AmigaDoorSession] *** WBSTARTUP MESSAGE SENT! ***");
    console.log(
      "[AmigaDoorSession] WHO2 should now read WHO.info and node*.txt files"
    );
    console.log(
      "[AmigaDoorSession] ==============================================="
    );
  }

  /**
   * Map AEDoor.library function offset to function name for debugging
   */
  private getAEDoorFunctionName(offset: number): string {
    // Use string keys since negative numbers can't be object keys
    const functionMap: { [key: string]: string } = {
      "-6": "Open",
      "-12": "Close",
      "-18": "Read",
      "-24": "Write",
      "-30": "Input",
      "-36": "Output",
      "-42": "Seek",
      "-48": "DeleteFile",
      "-54": "Rename",
      "-60": "CreateDir",
      "-66": "CurrentDir",
      "-72": "FHFromLock",
      "-78": "OpenFromLock",
      "-84": "Parent",
      "-90": "RealName",
      "-96": "Examine",
      "-102": "ExNext",
      "-108": "Info",
      "-114": "CreateProc",
      "-120": "InternalFromName",
      "-126": "FromName",
      "-132": "GetArgStr",
      "-138": "Cli",
      "-144": "RunCommand",
      "-150": "SystemTagList",
      "-152": "System",
      "-158": "AssignLock",
      "-164": "AssignLate",
      "-170": "AssignPath",
      "-176": "UnLock",
      "-182": "UnLockList",
      "-204": "GetProgramName",
      "-210": "SetProgramName",
      "-216": "GetArgStr",
      "-222": "CliInit",
      "-228": "CliInit",
      "-234": "ReadArgs",
      "-240": "FindArg",
      "-246": "ReadItem",
      "-252": "StrToLong",
      "-258": "SplitName",
      "-264": "SameLock",
      "-270": "Lock",
      "-276": "LockDosList",
      "-282": "UnLockDosList",
      "-288": "MakeDosEntry",
      "-294": "FreeDosEntry",
      "-300": "DoPkt",
      "-306": "WaitPkt",
      "-312": "DoIO",
      "-318": "SendIO",
      "-324": "CheckIO",
      "-330": "AbortIO",
      "-336": "DeviceProc",
      "-342": "BFromStr",
      "-348": "BtoCStr",
      "-354": "StrToLong",
      "-360": "GetVersion",
      "-366": "Cli",
      "-372": "WriteChars",
      "-378": "ReadChars",
      "-384": "PutStr",
      "-390": "VPrintf",
      "-396": "VFPrintf",
      "-402": "ParsePattern",
      "-408": "MatchPattern",
      "-414": "FreeArgs",
      "-420": "ParseFileName",
      "-426": "PutCh",
      "-432": "GetCh",
      "-438": "VSNPrintf",
      "-444": "SNPrintf",
      "-450": "Printf",
      "-456": "FPrintf",
      "-462": "TPrintf",
      "-468": "TPuts",
      "-474": "TWrite",

      // AEDoor-specific functions (estimated offsets)
      "-500": "WriteStr",
      "-506": "ReadStr",
      "-512": "GetUserInput",
      "-518": "GetKey",
      "-524": "ScreenMode",
      "-530": "ShowFile",
      "-536": "SendMessage",
      "-542": "GetMessage",
      "-548": "DoorInfo",
      "-554": "BBSInfo",
      "-560": "UserInfo",
      "-566": "DoorControl",
      "-572": "LineInput",
      "-578": "ClearScreen",
      "-584": "SetColor",
      "-590": "SetCursor",
      "-596": "SetTitle",
      "-602": "ShowBanner",
      "-608": "Pause",
      "-614": "GetTime",
      "-620": "GetDate",
      "-626": "WriteError",
      "-632": "LogEvent",
      "-638": "GetStats",
      "-644": "SetTimer",
      "-650": "KillTimer",
    };

    return functionMap[offset.toString()] || `Unknown(offset ${offset})`;
  }

  /**
   * Inject reply port directly into Bulls door data structures
   *
   * Bulls door doesn't use the standard RTW/WHO polling pattern.
   * It reads reply port from different offsets in its A4-based data structure.
   * This method ensures Bulls has the reply port it needs for XIM communication.
   */
  private injectBullsReplyPort(): void {
    if (!this.emulator || !this.execLibrary) {
      console.error(
        "[AmigaDoorSession] Cannot inject Bulls reply port: libraries not initialized"
      );
      return;
    }

    console.log("[AmigaDoorSession] === INJECTING BULLS REPLY PORT ===");

    // Get A4 (Bulls data segment base)
    const a4 = this.emulator.getRegister(12);
    if (a4 === 0) {
      console.error(
        "[AmigaDoorSession] A4 register is 0 - cannot inject reply port"
      );
      return;
    }

    console.log(`[AmigaDoorSession] A4 (data segment) = 0x${a4.toString(16)}`);

    // Create reply port if not already created
    if (this.doorReplyPortAddr === 0) {
      this.doorReplyPortAddr = this.execLibrary.createMsgPort();
      console.log(
        `[AmigaDoorSession] Created reply port at 0x${this.doorReplyPortAddr.toString(
          16
        )}`
      );
    } else {
      console.log(
        `[AmigaDoorSession] Reusing reply port at 0x${this.doorReplyPortAddr.toString(
          16
        )}`
      );
    }

    this.ensureDoorInfoStructure();
    this.ensureBullsControlBlock(a4);

    if (this.isBullsDoor && this.doorInfoAddr) {
      this.emulator.writeMemory32(a4 + 0x6c20, this.doorInfoAddr);
    }
    if (this.isBullsDoor && this.doorReplyPortAddr) {
      this.emulator.writeMemory32(a4 + 0x6c1c, this.doorReplyPortAddr);
    }

    // Bulls stores the reply port across several data-structure slots that differ
    // from the RTW/WHO pattern. 0x9a4/0x9a8 back up the pointer that later code
    // checks at 0x21e, while 0x450/0x474 continue to hold the immediate PutMsg
    // destinations. Keep the offsets separate from the AEDoor/BBS port slots so
    // we do not overwrite the value we just injected.
    const bullsReplyPortOffsets = [0x450, 0x474, 0x720, 0x800, 0x9a4, 0x9a8];

    console.log(
      "[AmigaDoorSession] Injecting reply port into Bulls data structure:"
    );
    bullsReplyPortOffsets.forEach((offset) => {
      const addr = a4 + offset;
      if (this.emulator) {
        this.emulator.writeMemory32(addr, this.doorReplyPortAddr);
      }
      console.log(
        `[AmigaDoorSession]   A4+0x${offset.toString(
          16
        )} = 0x${this.doorReplyPortAddr.toString(16)}`
      );
    });

    // Also inject BBS port (AEDoorPort) at the slots Bulls polls before jumping
    // into the ROM stub. These match the RTW offsets but are dedicated to the
    // AEDoor/BBS port and should never hold the reply port pointer.
    if (this.aePortAddress !== 0) {
      const bbsPortOffsets = [0x44c, 0x57c, 0x5b8, 0x6a0];
      console.log(
        "[AmigaDoorSession] Injecting BBS port into Bulls data structure:"
      );
      bbsPortOffsets.forEach((offset) => {
        const addr = a4 + offset;
        if (this.emulator) {
          this.emulator.writeMemory32(addr, this.aePortAddress);
        }
        console.log(
          `[AmigaDoorSession]   A4+0x${offset.toString(
            16
          )} = 0x${this.aePortAddress.toString(16)}`
        );
      });
    }

    // Verify injection
    console.log("[AmigaDoorSession] Verification:");
    const verifyOffsets = [0x44c, 0x450, 0x474];
    verifyOffsets.forEach((offset) => {
      const value = this.emulator ? this.emulator.readMemory32(a4 + offset) : 0;
      console.log(
        `[AmigaDoorSession]   A4+0x${offset.toString(16)} = 0x${value.toString(
          16
        )}`
      );
    });

    console.log(
      "[AmigaDoorSession] === BULLS REPLY PORT INJECTION COMPLETE ==="
    );
    if (this.bullsInfoBufferAddr !== 0) {
      const handshakeTarget = this.emulator.readMemory32(
        this.bullsInfoBufferAddr + 0xe0
      );
      if (handshakeTarget !== 0) {
        this.emulator.writeMemory32(a4 + 0x6c40, handshakeTarget);
        console.log(
          `[BullsFix] Initial handshake target set to 0x${handshakeTarget.toString(
            16
          )}`
        );
      }
    }
    console.log(
      "[AmigaDoorSession] Bulls should now have reply port for XIM communication"
    );
  }

  private ensureBullsControlBlock(a4: number): void {
    if (!this.execLibrary || !this.emulator || !this.isBullsDoor) {
      return;
    }
    if (this.bullsControlBlockAddr === 0) {
      const size = 0x146;
      const addr = this.execLibrary.allocMem(size, 0x10001 | 0x2);
      if (addr === 0) {
        console.error(
          "[AmigaDoorSession] Failed to allocate Bulls control block"
        );
        return;
      }
      this.bullsControlBlockAddr = addr;
      this.bullsInfoBufferAddr = addr;
    }

    this.ensureBullsInfoBuffer(a4);

    if (this.bullsControlBlockAddr !== 0) {
      this.emulator.writeMemory32(a4 + 0x6c24, this.bullsControlBlockAddr);
      if (this.bullsInfoBufferAddr !== 0) {
        this.emulator.writeMemory32(a4 + 0x6c28, this.bullsInfoBufferAddr);
        this.syncBullsHandshakeTarget(a4);
      }
      this.writeStringToMemory(a4 + 0x61e, "BULLS DATA READY", 0x40);
      if (this.doorSummaryPtr) {
        this.emulator.writeMemory32(a4 + 0x620, this.doorSummaryPtr);
        this.emulator.writeMemory32(a4 + 0x62e, this.doorSummaryPtr);
      }
      if (this.emulator) {
        this.emulator.writeMemory32(this.bullsControlBlockAddr + 0xe0, 1);
        this.emulator.writeMemory32(this.bullsControlBlockAddr + 0xdc, 2);
        this.emulator.writeMemory32(this.bullsControlBlockAddr + 0xe4, 0xff);
        this.emulator.writeMemory32(this.bullsControlBlockAddr + 0xe8, 0);
        const fields = [];
        for (let offset = 0xe0; offset <= 0xe8; offset += 4) {
          fields.push(
            `0x${offset.toString(16)}=0x${this.emulator
              .readMemory32(this.bullsControlBlockAddr + offset)
              .toString(16)}`
          );
        }
        console.log(
          `[BullsFix] Control block snapshot: ${fields.join(", ")}`
        );
      }
    }
  }

  private ensureBullsInfoBuffer(a4: number): void {
    if (
      !this.execLibrary ||
      !this.emulator ||
      !this.isBullsDoor ||
      a4 === 0 ||
      this.doorSummaryPtr === 0
    ) {
      console.log(
        `[BullsFix] ensureBullsInfoBuffer guard: exec=${!!this.execLibrary} emu=${!!this.emulator} isBulls=${this.isBullsDoor} a4=0x${a4.toString(
          16
        )} summaryPtr=0x${this.doorSummaryPtr.toString(16)}`
      );
      return;
    }

    if (this.bullsInfoBufferAddr === 0 && this.bullsControlBlockAddr !== 0) {
      this.bullsInfoBufferAddr = this.bullsControlBlockAddr;
    }
    if (this.bullsInfoBufferAddr === 0) {
      console.warn("[BullsFix] Info buffer address is still zero after allocation");
      return;
    }

    const infoAddr = this.bullsInfoBufferAddr;
    // Clear the buffer before repopulating to avoid leftover data
    for (
      let offset = 0;
      offset < AmigaDoorSession.DOOR_INFO_SIZE;
      offset += 4
    ) {
      this.emulator.writeMemory32(infoAddr + offset, 0);
    }

    this.emulator.writeMemory(infoAddr + 0x08, 5);
    this.emulator.writeMemory16(infoAddr + 0x12, 0x0104);

    if (this.doorInfoAddr) {
      this.emulator.writeMemory32(infoAddr + 0x0e, this.doorInfoAddr);
    }

      const summaryText =
        this.emulator.readString(a4 + 0x61e, 0x40) || "BULLS DATA READY";
      this.writeStringToMemory(infoAddr + 0x14, summaryText, 0x100);

      this.emulator.writeMemory32(infoAddr + 0xe0, 1);
      this.emulator.writeMemory32(infoAddr + 0xdc, 2);
      this.emulator.writeMemory32(infoAddr + 0xe4, 0xff);
      this.emulator.writeMemory32(infoAddr + 0xe8, 0);
      this.emulator.writeMemory32(infoAddr + 0xf8, infoAddr + 0x14);
      this.emulator.writeMemory32(infoAddr + 0xfc, infoAddr + 0x14);
      console.log(
        `[BullsFix] Info buffer handshake fields: dc=0x${this.emulator
          .readMemory32(infoAddr + 0xdc)
          .toString(16)}, e0=0x${this.emulator
          .readMemory32(infoAddr + 0xe0)
          .toString(16)}, e4=0x${this.emulator
          .readMemory32(infoAddr + 0xe4)
          .toString(16)}, e8=0x${this.emulator
          .readMemory32(infoAddr + 0xe8)
          .toString(16)}`
      );
  }

  private refreshBullsDoorPointers(): void {
    const emulator = this.emulator;
    if (!emulator || !this.isBullsDoor) {
      return;
    }

    const a4 = emulator.getRegister(12);
    if (a4 === 0) {
      return;
    }

    if (this.doorReplyPortAddr) {
      const currentReply = emulator.readMemory32(a4 + 0x6c1c);
      if (currentReply !== this.doorReplyPortAddr) {
        emulator.writeMemory32(a4 + 0x6c1c, this.doorReplyPortAddr);
      }
    }

    if (this.doorInfoAddr) {
      const currentInfo = emulator.readMemory32(a4 + 0x6c20);
      if (currentInfo !== this.doorInfoAddr) {
        emulator.writeMemory32(a4 + 0x6c20, this.doorInfoAddr);
      }
    }

    if (this.bullsControlBlockAddr) {
      const currentControl = emulator.readMemory32(a4 + 0x6c24);
      if (currentControl !== this.bullsControlBlockAddr) {
        emulator.writeMemory32(a4 + 0x6c24, this.bullsControlBlockAddr);
      }
      this.syncBullsHandshakeTarget(a4);
      if (!this.loggedInfoBufferPointer) {
        console.log(
          `[BullsFix] bullsInfoBufferAddr property = 0x${this.bullsInfoBufferAddr.toString(
            16
          )}`
        );
        this.loggedInfoBufferPointer = true;
      }
      const infoPointer = emulator.readMemory32(a4 + 0x6c28);
      const logLine = `[BullsFix] A4+0x6c24=0x${currentControl.toString(
        16
      )}, 0x6c28=0x${infoPointer.toString(16)}/0x6c2c=0x${emulator
        .readMemory32(a4 + 0x6c2c)
        .toString(16)}/0x6c40=0x${emulator
        .readMemory32(a4 + 0x6c40)
        .toString(16)}`;
      if (this.pointerLog !== logLine) {
        this.pointerLog = logLine;
        console.log(logLine);
      }
    }

    if (this.bullsInfoBufferAddr) {
      const currentInfo = emulator.readMemory32(a4 + 0x6c28);
      if (currentInfo !== this.bullsInfoBufferAddr) {
        emulator.writeMemory32(a4 + 0x6c28, this.bullsInfoBufferAddr);
        console.log(
          `[BullsFix] Reset A4+0x6c28 -> 0x${this.bullsInfoBufferAddr.toString(
            16
          )}`
        );
      }
      const handshakeValue = emulator.readMemory32(
        this.bullsInfoBufferAddr + 0xdc
      );
      if (handshakeValue !== 0xff) {
        const handshakeLine = `[BullsFix] handshake 0xdc=0x${handshakeValue.toString(
          16
        )}`;
        if (handshakeLine !== this.bullsHandshakeLog) {
          this.bullsHandshakeLog = handshakeLine;
          console.log(handshakeLine);
        }
      } else if (
        this.bullsHandshakeLog &&
        this.bullsHandshakeLog.includes("handshake")
      ) {
        this.bullsHandshakeLog = null;
      }
    }
  }

  private syncBullsHandshakeTarget(a4: number): void {
    if (
      !this.emulator ||
      !this.isBullsDoor ||
      this.bullsInfoBufferAddr === 0 ||
      a4 === 0
    ) {
      return;
    }

    const handshakeTarget = this.emulator.readMemory32(
      this.bullsInfoBufferAddr + 0xe0
    );
    if (handshakeTarget === 0) {
      return;
    }

    const currentValue = this.emulator.readMemory32(a4 + 0x6c40);
    if (currentValue !== handshakeTarget) {
      this.emulator.writeMemory32(a4 + 0x6c40, handshakeTarget);
      console.log(
        `[BullsFix] 0x6c40 updated -> 0x${handshakeTarget.toString(16)}`
      );
    }
  }

  /**
   * Inject keyboard input for Bulls door to bypass "Press ENTER to continue" prompt
   *
   * Bulls door shows "press <RETURN> to continue" and waits for keyboard input
   * instead of proceeding directly to XIM mode. This method injects the expected
   * ENTER key press to allow Bulls to continue.
   */
  private injectBullsKeyboardInput(): void {
    console.log(
      "[AmigaDoorSession] === INJECTING KEYBOARD INPUT FOR BULLS DOOR ==="
    );

    const payload =
      this.bullsInputScript[this.bullsScriptIndex] ?? "\r\n";
    this.bullsScriptIndex++;

    if (this.ximProtocol) {
      console.log(
        `[AmigaDoorSession] Sending scripted input via XIM queue: ${JSON.stringify(
          payload
        )}`
      );
      this.ximProtocol.queueInput(payload);
    } else {
      console.warn("[AmigaDoorSession] XIM protocol not initialized yet");
    }

    if (this.dosLibrary) {
      console.log(
        `[AmigaDoorSession] Injecting scripted input into DOS buffer: ${JSON.stringify(
          payload
        )}`
      );
      this.dosLibrary.queueInput(payload);
    }

    console.log(
      "[AmigaDoorSession] === KEYBOARD INPUT INJECTION COMPLETE ==="
    );
  }

  /**
   * Terminate the door session
   */
  terminate(): void {
    if (!this.isRunning) return;

    console.log("[AmigaDoorSession] Terminating door session");

    this.isRunning = false;

    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
      this.executionTimer = null;
    }

    if (this.emulator) {
      this.emulator.cleanup();
      this.emulator = null;
    }

    console.log("[AmigaDoorSession] 🚪 Emitting door:status = terminated");
    this.socket.emit("door:status", { status: "terminated" });
    console.log("[AmigaDoorSession] Door session terminated");
  }
}
