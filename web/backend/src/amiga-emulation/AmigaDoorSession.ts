// AmigaDoorSession.ts - REFACTORED
// Comprehensive refactoring of the original 5,259-line monolithic file
// Split into logical, maintainable modules with clear separation of concerns
// 2025-11-20

import { Server, Socket } from "socket.io";
import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { KickstartRom } from "./KickstartRom.js";
import { HunkLoader } from "./loader/HunkLoader.js";
import { XIMProtocol } from "./XIMProtocol.js";
import * as path from "path";
import { appendFileSync } from "fs";

import { DoorConfig } from "./DoorTypes.js";
import { LibraryManager } from "./LibraryManager.js";
import { DoorLoader } from "./DoorLoader.js";
import { DoorLifecycleManager } from "./session/DoorLifecycleManager.js";
import { DoorMessageHandler } from "./session/DoorMessageHandler.js";

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
 * Version: 2025-12-01 - Generic door emulation (Bulls-specific code removed)
 */

export class AmigaDoorSession {
  private emulator: MoiraEmulator | null = null;
  private socket: Socket;
  private config: DoorConfig;
  private isRunning: boolean = false;

  // Core components (extracted into separate modules)
  private libraryManager: LibraryManager | null = null;
  private doorLoader: DoorLoader | null = null;
  private lifecycleManager: DoorLifecycleManager | null = null;
  private messageHandler: DoorMessageHandler | null = null;

  // Shared state between components
  private sharedState = {
    // Library references
    execLibrary: null as any,
    aedoorLibrary: null as any,
    dosLibrary: null as any,
    iconLibrary: null as any,
    libraryTraps: null as any,
    ximProtocol: null as XIMProtocol | null,

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

    // Bulls-specific
    bullsCreateCommPatched: false,
    bullsInputScript: ["\r\n", "1\r\n", "Q\r\n"] as string[],
    bullsScriptIndex: 0,
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

    console.log(
      `[AmigaDoorSession] Initializing refactored session for: ${path.basename(
        this.config.executablePath
      )}`
    );
    this.logDoorEvent(
      `START door=${path.basename(this.config.executablePath)} path=${this.config.executablePath}`
    );

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

      // Route to XIM protocol if active
      if (this.sharedState.ximProtocol) {
        console.log(
          `[AmigaDoorSession] Forwarding input to XIM queue: "${data}"`
        );
        this.sharedState.ximProtocol.queueInput(data);
      }

      // Route to DOS stdin when either no XIM protocol or door isn't waiting on XIM line input
      const ximWaitingForLine =
        this.sharedState.ximProtocol?.isWaitingForLineInput() ?? false;
      if (!this.sharedState.ximProtocol || !ximWaitingForLine) {
        console.log(
          `[AmigaDoorSession] Queueing input for DOS stdin: "${data}"`
        );
        this.sharedState.dosLibrary.queueInput(data);
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

      // Initialize Library Manager (Phase 2)
      this.libraryManager = new LibraryManager(
        this.emulator,
        this.socket,
        this.config
      );
      await this.initializeLibraries();

      // Provide a CLI structure so doors see a real pr_CLI (matches /X SystemTagList)
      this.setupCliEnvironment();

      // Initialize Door Loader (Phase 3)
      this.doorLoader = new DoorLoader(
        this.emulator,
        this.sharedState.execLibrary,
        this.config
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

      // Initialize Lifecycle Manager (Phase 5A)
      this.lifecycleManager = new DoorLifecycleManager(
        this.emulator,
        this.socket,
        this.config,
        this.libraryManager,
        this.doorLoader,
        this.messageHandler
      );
      this.lifecycleManager.setLibraryTraps(this.sharedState.libraryTraps);
      this.lifecycleManager.setXIMProtocol(this.sharedState.ximProtocol);

      console.log("[AmigaDoorSession] ✅ All modular components initialized");
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

      // Start door execution via Lifecycle Manager
      this.isRunning = true;
      console.log("[AmigaDoorSession] 🚪 Emitting door:status = running");
      this.socket.emit("door:status", { status: "running" });

      // Start the lifecycle management
      await this.lifecycleManager.startLifecycle();
      this.logDoorEvent(
        `END door=${path.basename(this.config.executablePath)} status=ok`
      );
    } catch (error) {
      console.error("[AmigaDoorSession] Error starting door:", error);
      this.logDoorEvent(
        `END door=${path.basename(this.config.executablePath)} status=error msg=${
          error instanceof Error ? error.message : error
        }`
      );
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

    // Load Kickstart ROM
    console.log("[AmigaDoorSession] Loading Kickstart ROM at 0xF80000...");
    const kickstart = new KickstartRom();
    const romData = kickstart.getRomData();
    this.emulator.loadROM(romData);
    console.log(
      `[AmigaDoorSession] Kickstart ROM loaded (${romData.length} bytes)`
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

    // Set up door message callback
    this.sharedState.execLibrary.setDoorMessageCallback(
      (portAddr: number, msgAddr: number) => {
        if (this.messageHandler) {
          this.messageHandler.handleDoorMessage(portAddr, msgAddr);
        }
      }
    );

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

    const taskAddr = 0x70000; // Current task address used by ExecLibrary
    const prCliOffset = 0xac; // pr_CLI offset inside struct Process
    const cliStructAddr = 0x90000;
    const cmdLineAddr = 0x90100; // BSTR (length byte + text)
    const argStringAddr = 0x0f0100; // args only (no program name) — keep aligned with DoorLoader
    const localVarsListAddr = 0x90300;
    const rcVarAddr = 0x90320;
    const rcNameAddr = 0x90340;
    const result2VarAddr = 0x90360;
    const result2NameAddr = 0x90380;

    const progName = path.basename(this.config.executablePath);
    const nodeId =
      this.config.bbsSession?.nodeId ??
      this.config.bbsSession?.nodeNumber ??
      0;

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
    const cliArgs =
      this.config.args && this.config.args.length > 0
        ? this.config.args
        : [nodeId.toString()];
    const argStringPlain = cliArgs.join(" ").trim() || nodeId.toString();
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
    console.log("[AmigaDoorSession] 🔄 Terminating refactored door session...");

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

    // Terminate through Lifecycle Manager
    if (this.lifecycleManager) {
      this.lifecycleManager.terminate();
    }

    // Cleanup emulator
    if (this.emulator) {
      this.emulator.cleanup();
      this.emulator = null;
    }

    // Clear all references
    this.libraryManager = null;
    this.doorLoader = null;
    this.lifecycleManager = null;
    this.messageHandler = null;

    console.log("[AmigaDoorSession] ✅ Refactored door session terminated");
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
   * Append door events to backend.log so admin log view shows 68k door activity.
   */
  private logDoorEvent(message: string): void {
    try {
      const projectRoot = path.resolve(process.cwd());
      const logFile = path.join(projectRoot, "logs", "door-68k.log");
      const line = `[DoorLog] ${new Date().toISOString()} ${message}\n`;
      appendFileSync(logFile, line, { encoding: "utf8" });
    } catch (err) {
      console.error("[AmigaDoorSession] Failed to write door log:", err);
    }
  }
}
