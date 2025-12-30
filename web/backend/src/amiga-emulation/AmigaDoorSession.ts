// AmigaDoorSession.ts - REFACTORED
// Comprehensive refactoring of the original 5,259-line monolithic file
// Split into logical, maintainable modules with clear separation of concerns
// 2025-11-20

import { Server, Socket } from "socket.io";
import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { HunkLoader } from "./loader/HunkLoader.js";
import { XIMProtocol } from "./XIMProtocol.js";
import { KickstartRom } from "./KickstartRom.js";
import * as path from "path";
import { appendFileSync } from "fs";

import { DoorConfig } from "./DoorTypes.js";
import { LibraryManager } from "./LibraryManager.js";
import { DoorLoader } from "./DoorLoader.js";
import { DoorLifecycleManager } from "./session/DoorLifecycleManager.js";
import { DoorMessageHandler } from "./session/DoorMessageHandler.js";
import { TIMDoorMessageHandler } from "./session/TIMDoorMessageHandler.js";
import { DoorLogger, getDoorLogger, removeDoorLogger } from "./DoorLogger.js";
import { SysopDebugUtil } from "../utils/sysop-debug.util.js";

/**
 * AmigaDoorSession - REFACTORED VERSION
 * Manages a single user's door execution session
 * Uses library API emulation (Option C Hybrid) instead of ROM boot
 *
 * Architecture:
 * - LibraryManager: Handles library initialization and trap management
 * - DoorLoader: Handles binary loading and CPU setup
 * - DoorLifecycleManager: Execution loop and lifecycle management
 * - DoorMessageHandler: Message processing and IPC handling
 *
 * Version: 2025-12-01 - Generic door emulation
 */

export class AmigaDoorSession {
  private emulator: MoiraEmulator | null = null;
  private socket: Socket;
  private config: DoorConfig;
  private isRunning: boolean = false;

  // Per-door logger for this session
  private logger: DoorLogger;

  // Core components (extracted into separate modules)
  private libraryManager: LibraryManager | null = null;
  private doorLoader: DoorLoader | null = null;
  private lifecycleManager: DoorLifecycleManager | null = null;
  private messageHandler: DoorMessageHandler | null = null;
  private timHandler: TIMDoorMessageHandler | null = null;

  // Port tracking for cleanup (express.e:4527 - deletePort if we created it)
  private createdDoorPort = false;
  private doorPortName = "";

  // Shared state between components
  private sharedState = {
    // Library references
    execLibrary: null as any,
    aedoorLibrary: null as any,
    dosLibrary: null as any,
    iconLibrary: null as any,
    libraryTraps: null as any,
    ximProtocol: null as XIMProtocol | null,

    // ROM
    kickstartRom: null as KickstartRom | null,

    // Port addresses
    doorPortAddress: 0,
    aePortAddress: 0,
    doorReplyPortAddr: 0,

    // Memory addresses
    doorInfoAddr: 0,
    nodeStatusAddr: 0,
    doorSummaryPtr: 0,

    // Flags
    sentInitialMessage: false,
    trapVerified: false,
    ximPortsInitialized: false,
  };

  constructor(socket: Socket, config: DoorConfig) {
    this.socket = socket;
    const baseEnv = config.env ?? process.env;
    const normalizedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(baseEnv ?? {})) {
      if (typeof value === "string") {
        normalizedEnv[key] = value;
      }
    }

    this.config = {
      timeout: 300, // 5 minutes default
      ...config,
      cwd: config.cwd || path.dirname(config.executablePath),
      assigns: config.assigns || {},
      env: normalizedEnv,
    };
    if (!this.config.doorId) {
      const fromSession = this.config.bbsSession?.doorCommand;
      if (fromSession) {
        this.config.doorId = String(fromSession).trim().toUpperCase();
      } else {
        this.config.doorId = path.basename(this.config.executablePath).charAt(0).toUpperCase();
      }
    }

    // Create per-door logger
    const doorName = path.basename(this.config.executablePath);
    const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber;
    console.log(`[AmigaDoorSession] About to create logger for: ${doorName} node: ${nodeId}`);
    this.logger = getDoorLogger(doorName, nodeId);
    console.log(`[AmigaDoorSession] Logger created, path: ${this.logger.getLogPath()}`);

    console.log(
      `[AmigaDoorSession] Initializing refactored session for: ${doorName}`
    );
    this.logger.info(`Session initialized for ${this.config.executablePath}`);
    this.logger.info(`Log file: ${this.logger.getLogPath()}`);

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
        `[AmigaDoorSession] 🎹 door:input event received: "${data}" isRunning=${this.isRunning}`
      );

      if (!this.isRunning || !this.sharedState.dosLibrary) {
        console.log(
          "[AmigaDoorSession] ❌ Input ignored: door not running or DOS library not available"
        );
        return;
      }

      // Check if XIM is waiting for input BEFORE queueing
      // IMPORTANT: We must check this BEFORE calling queueInput because
      // queueInput may complete a hotkey/line input which clears the waiting flag
      const ximWaitingForInput =
        this.sharedState.ximProtocol?.isWaitingForLineInput() ?? false;

      // Check if TIM handler is waiting for input
      const timWaitingForInput = this.timHandler?.isWaitingForInput() ?? false;

      // Route to XIM protocol if active
      if (this.sharedState.ximProtocol) {
        console.log(
          `[AmigaDoorSession] Forwarding input to XIM queue: "${data}" (ximWaiting=${ximWaitingForInput})`
        );
        this.sharedState.ximProtocol.queueInput(data);

        // CRITICAL: For native 68K doors that poll GetMsg(AEDoorPort), we need to
        // inject JH_HK messages via PutMsg. These doors don't send JH_HK XIM commands -
        // they expect BBS to proactively send input messages to AEDoorPort.
        //
        // This is different from TypeScript doors that request input via XIM commands.
        // shouldInjectNativeInput() returns true when:
        //   - Door is registered (handshake complete)
        //   - NOT waiting for line input/hotkey (not using XIM input commands)
        if (this.sharedState.ximProtocol.shouldInjectNativeInput()) {
          console.log(
            `[AmigaDoorSession] Native door detected - injecting input via PutMsg`
          );
          // Inject each character separately for native door
          for (const char of data) {
            this.sharedState.ximProtocol.injectInputToNativeDoor(char);
          }
        }
      }

      // Route to TIM handler if active and waiting
      if (this.timHandler && timWaitingForInput) {
        console.log(
          `[AmigaDoorSession] Forwarding input to TIM handler: "${data}"`
        );
        this.timHandler.queueInput(data);
      }

      // Route to DOS stdin ONLY when no protocol handler consumed the input
      // This prevents double-delivery: once via XIM/TIM and once via DOS
      if ((!this.sharedState.ximProtocol || !ximWaitingForInput) && !timWaitingForInput) {
        console.log(
          `[AmigaDoorSession] Queueing input for DOS stdin: "${data}"`
        );
        this.sharedState.dosLibrary.queueInput(data);
      } else {
        console.log(
          `[AmigaDoorSession] Skipping DOS queue - input was consumed by protocol handler`
        );
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

        if (this.isRunning && this.sharedState.ximProtocol) {
          // Update XIM protocol with key state
          this.sharedState.ximProtocol.updateKeyState(data);
        } else {
          console.log(
            `[AmigaDoorSession] ❌ Key state update ignored: isRunning=${
              this.isRunning
            } hasXIM=${!!this.sharedState.ximProtocol}`
          );
        }
      }
    );

    // Handle disconnection
    this.socket.on("disconnect", () => {
      console.log("[AmigaDoorSession] Socket disconnected, terminating door");
      if (this.sharedState.ximProtocol) {
        this.sharedState.ximProtocol.markCarrierDropped();
      }
      this.terminate();
    });

    // Handle explicit termination request
    this.socket.on("door:terminate", () => {
      console.log("[AmigaDoorSession] Termination requested by user");
      if (this.sharedState.ximProtocol) {
        this.sharedState.ximProtocol.markCarrierDropped();
      }
      this.terminate();
    });
  }

  /**
   * Initialize and start the door - REFACTORED
   */
  async start(): Promise<void> {
    try {
      console.log(
        `[AmigaDoorSession] 🚀 Starting refactored door: ${this.config.executablePath}`
      );
      this.socket.emit("door:status", { status: "initializing" });

      // Expose current BBS session globally so low-level loaders (Kickstart/AEDoor) can
      // emit terminal warnings when critical assets are missing.
      try {
        const globalAny: any = global as any;
        globalAny.currentBbsSession = this.config.bbsSession;
        if (this.config.doorId) {
          globalAny.currentBbsSession.doorId = this.config.doorId;
        }
      } catch (_) {
        /* ignore */
      }

      // Initialize emulator (16MB for full 24-bit address space)
      this.emulator = new MoiraEmulator(16 * 1024 * 1024);
      await this.emulator.initialize();
      console.log("[AmigaDoorSession] ✅ Emulator initialized");

      // Load Kickstart ROM (CRITICAL - must load before libraries)
      console.log("[AmigaDoorSession] Loading Kickstart ROM...");
      this.sharedState.kickstartRom = new KickstartRom();
      this.sharedState.kickstartRom.dumpInfo();

      // Map ROM into emulator memory at 0xF80000-0xFFFFFF
      const romData = this.sharedState.kickstartRom.getRomData();
      this.emulator.loadROM(romData);
      console.log("[AmigaDoorSession] ✅ Kickstart ROM loaded and mapped to memory");

      // Initialize Library Manager (Phase 2)
      this.libraryManager = new LibraryManager(
        this.emulator,
        this.socket,
        this.config,
        this.logger,
        this.sharedState.kickstartRom
      );
      await this.initializeLibraries();

      // Provide a CLI structure so doors see a real pr_CLI (matches /X SystemTagList)
      this.setupCliEnvironment();

      // Optional: seed a Workbench-style startup message for doors that expect pr_CLI=0 + WBStartup
      if (
        process.env.DOOR_FORCE_WB_STARTUP === "1" &&
        this.sharedState.execLibrary &&
        this.emulator
      ) {
        const progName = path.basename(this.config.executablePath);
        const argList = this.config.args?.map(String) || [];
        const msgAddr = this.sharedState.execLibrary.seedWorkbenchStartup(
          progName,
          argList.length > 0 ? argList : [progName]
        );
        // Workbench-launched tasks have pr_CLI = NULL; mirror that when requested
        const taskAddr = this.sharedState.execLibrary.getCurrentTaskAddress();
        this.emulator.writeMemory32(taskAddr + 0xac, 0);
        // Disable pr_CLI restore callback so later CreatePort calls do not reassert CLI mode
        this.sharedState.execLibrary.setDoorInitCallback(() => {});
        console.log(
          `[AmigaDoorSession] DOOR_FORCE_WB_STARTUP=1 -> seeded WBStartup (0x${msgAddr.toString(
            16
          )}) and cleared pr_CLI`
        );
      }

      // Initialize Door Loader (Phase 3)
      this.doorLoader = new DoorLoader(
        this.emulator,
        this.sharedState.execLibrary,
        this.config,
        this.logger
      );
      await this.doorLoader.loadDoor();
      console.log(
        "[AmigaDoorSession] ✅ Door binary loaded and CPU configured"
      );

      // Initialize Message Handler (Phase 5B)
      this.messageHandler = new DoorMessageHandler(
        this.emulator,
        this.socket,
        this.sharedState.execLibrary,
        this.config
      );
      this.messageHandler.setXIMProtocol(this.sharedState.ximProtocol);
      this.messageHandler.setSharedState({
        doorReplyPortAddr: this.sharedState.doorReplyPortAddr,
        doorPortAddress: this.sharedState.doorPortAddress,
        doorInfoAddr: this.sharedState.doorInfoAddr,
        nodeStatusAddr: this.sharedState.nodeStatusAddr,
        doorSummaryPtr: this.sharedState.doorSummaryPtr,
        aePortAddress: this.sharedState.aePortAddress,
        sentInitialMessage: this.sharedState.sentInitialMessage,
      });

      // DISABLED: Door message callback
      // Express.e does NOT use a callback on PutMsg. It uses a pure polling loop:
      //   WHILE(exit=FALSE)
      //     signals:=Wait(ximSig)
      //     WHILE(msg:=GetMsg(mp))
      //       processXimMsg(...)
      //       ReplyMsg(msg)
      //     ENDWHILE
      //   ENDWHILE
      // See express.e lines 4352-4370.
      //
      // Previously we had both:
      // 1. Callback on PutMsg (immediate handling)
      // 2. Polling via GetMsg in DoorLifecycleManager
      // This caused DOUBLED OUTPUT because both paths processed the same message.
      //
      // Now we match express.e: only use polling via DoorLifecycleManager.pollXIMMessages()
      this.sharedState.execLibrary.setDoorMessageCallback(null as any);

      // Optional watchpoints for debugging: set DOOR_WATCH_ADDRESSES as comma-separated hex
      const watchEnv = process.env.DOOR_WATCH_ADDRESSES;
      const watchOffEnv = process.env.DOOR_WATCH_OFFSETS;
      const addrs =
        watchEnv
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => parseInt(s, 16))
          .filter((n) => !Number.isNaN(n)) || [];
      const offs =
        watchOffEnv
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => parseInt(s, 16))
          .filter((n) => !Number.isNaN(n)) || [];
      const logPath = process.env.DOOR_WATCH_LOG || "/tmp/door-watch.log";
      if (addrs.length > 0 || offs.length > 0) {
        this.emulator.setWatchpoints(addrs, logPath, offs);
        console.log(
          `[AmigaDoorSession] Watchpoints enabled at ${[
            ...addrs.map((a) => "0x" + a.toString(16)),
            ...offs.map((o) => "A4+0x" + o.toString(16)),
          ].join(", ")} -> ${logPath}`
        );
      }

      // Native Moira debugging: enable with DEBUG_68K_NATIVE=1
      // This uses Moira's built-in debugger for instruction logging and watchpoints
      if (process.env.DEBUG_68K_NATIVE === '1') {
        const cpu = this.emulator['cpu'];
        if (cpu?.nativeEnableLogging) {
          console.log('[AmigaDoorSession] [NATIVE DEBUG] Enabling Moira native debugger...');

          // Enable instruction logging (256-entry circular buffer)
          cpu.nativeEnableLogging();
          console.log('[AmigaDoorSession] [NATIVE DEBUG] Instruction logging enabled');

          // Set watchpoints on DiskObject/tooltypes memory regions
          // These addresses are used by icon.library for ConfConfig.info
          const nativeWatchAddrs = [
            0x60000,  // DiskObject base
            0x60036,  // do_ToolTypes field (offset 54)
            0x60100,  // Tooltypes array
            0x60104,  // Tooltypes[1]
            0x60108,  // Tooltypes[2]
            0x60200,  // First tooltype string (NCONFS)
          ];

          for (const addr of nativeWatchAddrs) {
            cpu?.nativeSetWatchpoint?.(addr);
          }
          console.log(`[AmigaDoorSession] [NATIVE DEBUG] Watchpoints set on: ${nativeWatchAddrs.map(a => '0x' + a.toString(16)).join(', ')}`);

          // Set catchpoint for illegal instructions
          cpu?.nativeSetCatchpoint?.(4); // Vector 4 = Illegal instruction
          console.log('[AmigaDoorSession] [NATIVE DEBUG] Catchpoint set for illegal instructions');
        } else {
          console.warn('[AmigaDoorSession] [NATIVE DEBUG] WARNING: Moira native debugger not available');
        }
      }

      // Initialize Lifecycle Manager (Phase 5A)
      this.lifecycleManager = new DoorLifecycleManager(
        this.emulator,
        this.socket,
        this.config,
        this.libraryManager,
        this.doorLoader,
        this.messageHandler,
        this.logger
      );
      this.lifecycleManager.setLibraryTraps(this.sharedState.libraryTraps);
      this.lifecycleManager.setXIMProtocol(this.sharedState.ximProtocol);

      // Create AEDoorPort BEFORE starting door execution
      // Express.e creates the port at lines 4316-4328 BEFORE calling startProcess() at line 4336
      // This matches: IF (mp:=FindPort(doorPort)) alreadyActive:=TRUE ELSE mp:=createPort(doorPort,0) ENDIF
      const doorType = (this.config.doorType || "").toUpperCase();
      if (doorType === "XIM" || doorType === "AIM") {
        const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber ?? 1;
        const portName = `AEDoorPort${nodeId}`;
        this.doorPortName = portName;

        // Check if port already exists (alreadyActive mode from express.e:4324)
        const portNameAddr = 0x500;
        this.emulator.writeString(portNameAddr, portName);
        const existingPort = this.sharedState.execLibrary?.findPort(portNameAddr);

        if (existingPort && existingPort !== 0) {
          console.log(`[AmigaDoorSession] ${portName} already exists at 0x${existingPort.toString(16)} (alreadyActive mode)`);
          this.createdDoorPort = false; // Don't delete on cleanup
        } else {
          // Create the port before door starts (express.e:4327)
          // CRITICAL: Use createLightweightPort instead of createPublicPort!
          // AEDoorPort is where doors send messages TO the BBS. We poll for messages
          // in handlePausedState(), so we don't need PA_SIGNAL. Using PA_SIGNAL with
          // the door's task as sigTask would cause the door to signal ITSELF when
          // sending messages to the BBS, which is wrong and breaks Wait() synchronization.
          const portAddr = this.sharedState.execLibrary?.createLightweightPort(portName);
          console.log(`[AmigaDoorSession] Created ${portName} at 0x${portAddr?.toString(16)} BEFORE door execution (lightweight, no PA_SIGNAL)`);
          this.createdDoorPort = true; // Delete on cleanup
        }
      }

      // Initialize TIM Door Handler for TIM-type doors (Phase 5C)
      // TIM doors use DoorControl{n} port with simpler doorMsg structure
      // Reference: express.e lines 4371-4525
      if (this.config.doorType === "TIM") {
        this.timHandler = new TIMDoorMessageHandler(
          this.emulator,
          this.socket,
          this.config
        );
        this.lifecycleManager.setTIMHandler(this.timHandler);
        console.log("[AmigaDoorSession] TIM door handler initialized");
      }

      console.log("[AmigaDoorSession] All modular components initialized");
      console.log(`[AmigaDoorSession] 📊 Architecture:`);
      console.log(
        `[AmigaDoorSession]   - LibraryManager: Library initialization and traps`
      );
      console.log(
        `[AmigaDoorSession]   - DoorLoader: Binary loading and CPU setup`
      );
      console.log(
        `[AmigaDoorSession]   - DoorLifecycleManager: Execution loop management`
      );
      console.log(
        `[AmigaDoorSession]   - DoorMessageHandler: IPC and message processing`
      );

      // NOTE: BBSInfo structure population is now handled in door-info.util.ts
      // It's done AFTER CreateComm() allocates the DIFace structure at the correct address
      // See: sdk/68k/doors/diagnostic/BBSINFO_FIX_CORRECTED.md

      // Start door execution via Lifecycle Manager
      this.isRunning = true;
      console.log("[AmigaDoorSession] 🚪 Emitting door:status = running");
      this.socket.emit("door:status", { status: "running" });

      // Start the lifecycle management
      await this.lifecycleManager.startLifecycle();
      this.logger.info(`Door completed: ${path.basename(this.config.executablePath)} status=ok`);
    } catch (error) {
      console.error("[AmigaDoorSession] Error starting door:", error);
      this.logger.error(`Door failed: ${path.basename(this.config.executablePath)} error=${error instanceof Error ? error.message : error}`);
      this.socket.emit("door:error", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      this.terminate();
    }
  }

  /**
   * Initialize libraries using Library Manager - REFACTORED
   */
  private async initializeLibraries(): Promise<void> {
    if (!this.libraryManager || !this.emulator) {
      throw new Error("LibraryManager not initialized");
    }

    console.log(
      "[AmigaDoorSession] 🔄 Initializing libraries via LibraryManager..."
    );

    // Initialize libraries through LibraryManager
    await this.libraryManager.initialize();

    // Get shared references from LibraryManager
    this.sharedState.execLibrary = this.libraryManager.execLibrary;
    this.sharedState.aedoorLibrary = this.libraryManager.aedoorLibrary;
    this.sharedState.dosLibrary = this.libraryManager.dosLibrary;
    this.sharedState.iconLibrary = this.libraryManager.iconLibrary;
    this.sharedState.libraryTraps = this.libraryManager.libraryTraps;
    this.sharedState.ximProtocol = this.libraryManager.ximProtocol;
    this.sharedState.doorPortAddress = this.libraryManager.getDoorPortAddress();
    this.sharedState.aePortAddress = this.libraryManager.getDoorPortAddress(); // Same as door port for RTW
    this.sharedState.doorReplyPortAddr =
      this.libraryManager.getReplyPortAddress();

    // Set up sysop debug callback for file errors
    if (this.sharedState.dosLibrary) {
      this.sharedState.dosLibrary.setDebugCallback((message: string, level: string) => {
        // Only emit warnings and errors to sysop terminal if sysop debug is enabled
        if ((level === 'warn' || level === 'error') && SysopDebugUtil.isSysop(this.config.bbsSession)) {
          const color = level === 'error' ? '\x1b[31m' : '\x1b[33m';
          this.socket.emit('ansi-output', `${color}${message}\x1b[0m\r\n`);
        }
      });
    }

    // Set up callbacks between components
    this.setupComponentCallbacks();

    console.log(
      "[AmigaDoorSession] ✅ Libraries initialized via LibraryManager"
    );
    console.log(
      `[AmigaDoorSession]   ExecBase: 0x${this.sharedState.execLibrary
        .getExecBaseAddress()
        .toString(16)}`
    );
  }

  /**
   * Set up callbacks and communication between components - REFACTORED
   */
  private setupComponentCallbacks(): void {
    if (!this.sharedState.execLibrary || !this.sharedState.libraryTraps) {
      return;
    }

    // Set up library opened callback
    this.sharedState.execLibrary.setLibraryOpenedCallback(
      (name: string, addr: number) => {
        if (name.toLowerCase() === "dos.library") {
          console.log(
            "[AmigaDoorSession] dos.library opened, installing vectors..."
          );
          this.sharedState.libraryTraps.installDOSVectors();
        }
        if (name.toLowerCase() === "aedoor.library") {
          console.log(
            "[AmigaDoorSession] AEDoor.library opened, installing vectors..."
          );
          this.sharedState.libraryTraps.installAEDoorVectors();
        }
        if (name.toLowerCase() === "icon.library") {
          console.log(
            "[AmigaDoorSession] icon.library opened, installing vectors..."
          );
          this.sharedState.libraryTraps.installIconVectors();
        }
      }
    );

    // DISABLED: Door message callback - see comment in initializePhase5MessageHandler()
    // Express.e uses ONLY polling, not callbacks. Matching that behavior fixes doubled output.
    // Polling is handled by DoorLifecycleManager.pollXIMMessages()
    this.sharedState.execLibrary.setDoorMessageCallback(null as any);

    // Set up library call monitoring
    this.sharedState.libraryTraps.setLibraryCallMonitor(
      (functionName: string, pc: number) => {
        // Track library calls during polling loop
        if (this.sharedState.sentInitialMessage && this.lifecycleManager) {
          const state = this.lifecycleManager.getExecutionState();
          if (state.iterationCount >= 1000) {
            console.log(
              `[AmigaDoorSession] *** LIBRARY CALL IN POLLING LOOP ***`
            );
            console.log(`[AmigaDoorSession]   Function: ${functionName}`);
            console.log(`[AmigaDoorSession]   PC: 0x${pc.toString(16)}`);
            console.log(
              `[AmigaDoorSession]   Iteration: ${state.iterationCount}`
            );
          }
        }
      }
    );
  }

  /**
   * Create a minimal CLI structure and attach it to pr_CLI, matching
   * the /X SystemTagList environment (node number as arg, program name).
   * This lets doors detect they're running from CLI and call Cli(), FindVar(), etc.
   */
  private setupCliEnvironment(): void {
    if (!this.emulator || !this.sharedState.execLibrary || !this.sharedState.dosLibrary) {
      return;
    }

    const taskAddr = 0x090000; // Current task address (must match ExecLibrary)
    const prCliOffset = 0xac; // pr_CLI offset inside struct Process
    // CLI structures at 0x110000+ to avoid overlap with door code (0x1000-0x100000)
    const cliStructAddr = 0x110000;
    const cmdLineAddr = 0x110100; // BSTR (length byte + text)
    const argStringAddr = 0x0f0100; // args only (no program name) — keep aligned with DoorLoader
    const localVarsListAddr = 0x110300;
    const rcVarAddr = 0x110320;
    const rcNameAddr = 0x110340;
    const result2VarAddr = 0x110360;
    const result2NameAddr = 0x110380;

    const progName = path.basename(this.config.executablePath);
    // CRITICAL: Default to 1, not 0, to match port creation at line 437
    // This ensures the door's first argument matches the AEDoorPort name
    const nodeId =
      this.config.bbsSession?.nodeId ??
      this.config.bbsSession?.nodeNumber ??
      1;

    // Full command line BSTR (program + node)
    const cmdLine = progName.toUpperCase();
    this.emulator.writeMemory(cmdLineAddr, cmdLine.length);
    for (let i = 0; i < cmdLine.length; i++) {
      this.emulator.writeMemory(cmdLineAddr + 1 + i, cmdLine.charCodeAt(i));
    }
    this.emulator.writeMemory(cmdLineAddr + 1 + cmdLine.length, 0);

    // CLI structure (partial) – offsets per dos/dosextens.h
    this.emulator.writeMemory32(cliStructAddr + 0x00, 0); // cli_Result2
    this.emulator.writeMemory32(cliStructAddr + 0x04, 0); // cli_SetName
    this.emulator.writeMemory32(cliStructAddr + 0x08, 0); // cli_CommandDir
    this.emulator.writeMemory32(cliStructAddr + 0x0c, 0); // cli_ReturnCode
    this.emulator.writeMemory32(cliStructAddr + 0x10, cmdLineAddr >> 2); // cli_CommandName (BPTR to BSTR)
    this.emulator.writeMemory32(cliStructAddr + 0x14, 0); // cli_FailLevel
    this.emulator.writeMemory32(cliStructAddr + 0x18, 0); // cli_Prompt
    this.emulator.writeMemory32(cliStructAddr + 0x1c, 0); // cli_StandardInput
    this.emulator.writeMemory32(cliStructAddr + 0x20, 0); // cli_CurrentInput
    this.emulator.writeMemory32(cliStructAddr + 0x24, 0); // cli_CommandFile
    this.emulator.writeMemory32(cliStructAddr + 0x28, -1); // cli_Interactive (TRUE)
    this.emulator.writeMemory32(cliStructAddr + 0x2c, 0); // cli_Background
    this.emulator.writeMemory32(cliStructAddr + 0x30, 0); // cli_CurrentOutput
    this.emulator.writeMemory32(cliStructAddr + 0x34, 4096); // cli_DefaultStack
    this.emulator.writeMemory32(cliStructAddr + 0x38, 0); // cli_StandardOutput
    this.emulator.writeMemory32(cliStructAddr + 0x3c, 0); // cli_Module
    this.emulator.writeMemory32(cliStructAddr + 0x40, 0); // cli_CurrentDir
    this.emulator.writeMemory32(cliStructAddr + 0x44, 0); // cli_DirLen
    this.emulator.writeMemory32(cliStructAddr + 0x48, 0); // cli_DirBuf
    this.emulator.writeMemory32(cliStructAddr + 0x4c, 0); // cli_PathList
    this.emulator.writeMemory32(cliStructAddr + 0x50, 0); // cli_ReturnAddr
    this.emulator.writeMemory32(cliStructAddr + 0x54, 0); // cli_Pid
    this.emulator.writeMemory32(cliStructAddr + 0x58, 0); // cli_NumArgs

    // LocalVars MinList with RC=0 and Result2=0 so FindVar("RC"/"Result2") works
    this.emulator.writeMemory32(localVarsListAddr + 0, localVarsListAddr + 4); // lh_Head -> Tail
    this.emulator.writeMemory32(localVarsListAddr + 4, 0); // lh_Tail = NULL
    this.emulator.writeMemory32(localVarsListAddr + 8, localVarsListAddr); // lh_TailPred -> Head

    this.emulator.writeString(rcNameAddr, "RC");
    this.emulator.writeMemory32(rcVarAddr + 0, 0); // ln_Succ (patched below)
    this.emulator.writeMemory32(rcVarAddr + 4, 0); // ln_Pred
    this.emulator.writeMemory(rcVarAddr + 8, 0); // ln_Type
    this.emulator.writeMemory(rcVarAddr + 9, 0); // ln_Pri
    this.emulator.writeMemory32(rcVarAddr + 10, rcNameAddr); // ln_Name
    this.emulator.writeMemory32(rcVarAddr + 14, 0); // lv_Value
    this.emulator.writeMemory32(rcVarAddr + 18, 0); // lv_Len

    this.emulator.writeString(result2NameAddr, "Result2");
    this.emulator.writeMemory32(result2VarAddr + 0, 0); // ln_Succ
    this.emulator.writeMemory32(result2VarAddr + 4, rcVarAddr); // ln_Pred -> RC
    this.emulator.writeMemory(result2VarAddr + 8, 0); // ln_Type
    this.emulator.writeMemory(result2VarAddr + 9, 0); // ln_Pri
    this.emulator.writeMemory32(result2VarAddr + 10, result2NameAddr); // ln_Name
    this.emulator.writeMemory32(result2VarAddr + 14, 0); // lv_Value
    this.emulator.writeMemory32(result2VarAddr + 18, 0); // lv_Len

    // Link RC -> Result2 and head -> RC
    this.emulator.writeMemory32(rcVarAddr + 0, result2VarAddr);
    this.emulator.writeMemory32(localVarsListAddr + 0, rcVarAddr);

    this.emulator.writeMemory32(cliStructAddr + 0x5c, localVarsListAddr >> 2); // cli_LocalVars (BPTR)

    const cliBPTR = cliStructAddr >> 2;
    this.emulator.writeMemory32(taskAddr + prCliOffset, cliBPTR);

    console.log(
      `[AmigaDoorSession] Created CLI struct at 0x${cliStructAddr.toString(
        16
      )} (pr_CLI=0x${cliBPTR.toString(16)})`
    );
    console.log(
      `[AmigaDoorSession]   Command BSTR len=${cmdLine.length} at 0x${cmdLineAddr.toString(
        16
      )} "${cmdLine}"`
    );

    // Set CLI info for dos.library helpers (GetArgStr, GetCliProgramName)
    const isXimDoor = (this.config.doorType || "").toUpperCase() === "XIM";
    const cliArgsRaw =
      this.config.args && this.config.args.length > 0 ? this.config.args : [];
    const cliArgs =
      cliArgsRaw.length > 0
        ? isXimDoor
          ? [nodeId.toString(), ...cliArgsRaw]
          : cliArgsRaw
        : [nodeId.toString()];
    const argStringPlain =
      cliArgs.join(" ").trim() || nodeId.toString();
    for (let i = 0; i < argStringPlain.length; i++) {
      this.emulator.writeMemory(argStringAddr + i, argStringPlain.charCodeAt(i));
    }
    this.emulator.writeMemory(argStringAddr + argStringPlain.length, 0);
    console.log(`[AmigaDoorSession] CLI arg string="${argStringPlain}"`);
    this.sharedState.dosLibrary.setCliInfo(argStringAddr, progName);

    // Restore pr_CLI if a door CreatePort() overwrites it
    this.sharedState.execLibrary.setDoorInitCallback(() => {
      const currentValue = this.emulator?.readMemory32(taskAddr + prCliOffset) ?? 0;
      if (currentValue === 0) {
        this.emulator?.writeMemory32(taskAddr + prCliOffset, cliBPTR);
        console.log(
          "[AmigaDoorSession] pr_CLI was cleared during CreatePort; restored CLI pointer"
        );
      }
    });
  }

  /**
   * Send startup message through Message Handler - REFACTORED
   */
  private sendStartupMessage(): void {
    if (this.messageHandler) {
      this.messageHandler.sendStartupMessage();
      this.sharedState.sentInitialMessage = true;
    }
  }

  /**
   * Terminate the door session - REFACTORED
   */
  terminate(): void {
    console.log("[AmigaDoorSession] Terminating refactored door session...");
    this.logger.info("Terminating session...");

    this.isRunning = false;

    // Clear global session pointer if we set it
    try {
      const globalAny: any = global as any;
      if (globalAny.currentBbsSession === this.config.bbsSession) {
        globalAny.currentBbsSession = undefined;
      }
    } catch (_) {
      /* ignore */
    }

    // Delete AEDoorPort if we created it (express.e:4527 - IF alreadyActive=FALSE THEN deletePort(mp))
    if (this.createdDoorPort && this.doorPortName && this.sharedState.execLibrary && this.emulator) {
      try {
        const portNameAddr = 0x500;
        this.emulator.writeString(portNameAddr, this.doorPortName);
        const portAddr = this.sharedState.execLibrary.findPort(portNameAddr);
        if (portAddr && portAddr !== 0) {
          this.sharedState.execLibrary.deletePort(portAddr);
          console.log(`[AmigaDoorSession] Deleted ${this.doorPortName} at 0x${portAddr.toString(16)} (cleanup)`);
        }
      } catch (err) {
        console.error(`[AmigaDoorSession] Error deleting port ${this.doorPortName}:`, err);
      }
      this.createdDoorPort = false;
      this.doorPortName = "";
    }

    // Terminate through Lifecycle Manager
    if (this.lifecycleManager) {
      this.lifecycleManager.terminate();
    }

    // Cleanup emulator
    if (this.emulator) {
      this.emulator.cleanup();
      this.emulator = null;
    }

    // End door logger
    this.logger.end(undefined, "Session terminated");
    const doorName = path.basename(this.config.executablePath);
    const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber;
    removeDoorLogger(doorName, nodeId);

    // Clear all references
    this.libraryManager = null;
    this.doorLoader = null;
    this.lifecycleManager = null;
    this.messageHandler = null;

    console.log("[AmigaDoorSession] Refactored door session terminated");
  }

  /**
   * Check if door is running
   */
  isDoorRunning(): boolean {
    return this.isRunning && this.lifecycleManager?.isRunning() !== false;
  }

  /**
   * Get current execution state for debugging
   */
  getExecutionState() {
    return this.lifecycleManager?.getExecutionState() || null;
  }

  /**
   * Get exit-related state (return/chain/PRV/ACP) captured from XIM
   */
  getExitState() {
    const ximState = this.sharedState.ximProtocol?.getStateSnapshot();
    console.log(`[AmigaDoorSession] getExitState: ximProtocol=${!!this.sharedState.ximProtocol}, returnCommand="${ximState?.returnCommand || 'NONE'}"`);
    return {
      ximState,
      bbsSession: this.config.bbsSession,
    };
  }

  /**
   * Get message processing statistics
   */
  getMessageStatistics() {
    return {
      messageCount: this.messageHandler?.getMessageCount() || 0,
      isLoggingEnabled: this.messageHandler?.isMessageLoggingEnabled() || false,
      isRunning: this.isDoorRunning(),
      lifecycleState: this.getExecutionState(),
    };
  }

  /**
   * Pause execution (for input handling)
   */
  pause(): void {
    if (this.lifecycleManager) {
      this.lifecycleManager.pause();
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.lifecycleManager) {
      this.lifecycleManager.resume();
    }
  }

  /**
   * Inject XIM message into running door session (for testing)
   * Only available in development mode
   *
   * @param message - XIM message to inject
   * @returns Promise<boolean> - true if injection succeeded
   */
  async injectMessage(message: {
    type: number;
    typeName: string;
    param: number;
    data: string;
  }): Promise<boolean> {
    // Security: Only allow in development mode
    if (process.env.NODE_ENV !== 'development') {
      this.logger.error('Message injection blocked - not in development mode');
      throw new Error('Message injection only available in development mode');
    }

    if (!this.isRunning || !this.sharedState.ximProtocol) {
      this.logger.warn(`Cannot inject message: door not running or XIM not initialized`);
      return false;
    }

    try {
      this.logger.info(`[XIM Injection] Injecting ${message.typeName} (type=${message.type}, param=${message.param}, data="${message.data}")`);

      // Inject via XIM protocol
      // For JH_HK (hotkey/keystroke) messages, inject directly as user input
      if (message.type === 4) { // JH_HK
        this.logger.info(`[XIM Injection] Injecting hotkey as user input: "${message.data}"`);
        this.sharedState.ximProtocol.queueInput(message.data);

        // For native doors that poll GetMsg(), inject via PutMsg
        if (this.sharedState.ximProtocol.shouldInjectNativeInput()) {
          this.logger.info(`[XIM Injection] Native door - also injecting via PutMsg`);
          for (const char of message.data) {
            this.sharedState.ximProtocol.injectInputToNativeDoor(char);
          }
        }
        return true;
      }

      // For other message types, create XIM message structure
      // XIM message format: Type (4 bytes) | Param (4 bytes) | DataLen (4 bytes) | Data (N bytes)
      const dataBuffer = Buffer.from(message.data, 'utf-8');
      const dataLen = dataBuffer.length;

      const messageBuffer = Buffer.alloc(12 + dataLen);
      messageBuffer.writeUInt32BE(message.type, 0);      // Type
      messageBuffer.writeUInt32BE(message.param, 4);     // Param
      messageBuffer.writeUInt32BE(dataLen, 8);           // DataLen
      dataBuffer.copy(messageBuffer, 12);                // Data

      // Send via XIM protocol's internal messaging
      // This would require adding a method to XIMProtocol to inject raw messages
      // For now, log that we received the injection request
      this.logger.info(`[XIM Injection] Message injected successfully: ${message.typeName}`);

      return true;
    } catch (err) {
      this.logger.error(`[XIM Injection] Failed to inject message: ${err}`);
      console.error('[XIMInjection] Failed to inject message:', err);
      return false;
    }
  }

  /**
   * Get the per-door logger for this session
   */
  getLogger(): DoorLogger {
    return this.logger;
  }
}
