// AmigaDoorSession.ts - REFACTORED
// Comprehensive refactoring of the original 5,259-line monolithic file
// Split into logical, maintainable modules with clear separation of concerns
// 2025-11-20

import { Server, Socket } from "socket.io";
import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { KickstartRom } from "./KickstartRom.js";
import { HunkLoader } from "./loader/HunkLoader.js";
import { XIMProtocol } from "./XIMProtocol.js";
import * as fs from "fs";
import * as path from "path";

import { DoorConfig } from "./DoorTypes.js";
import { LibraryManager } from "./LibraryManager.js";
import { DoorLoader } from "./DoorLoader.js";
import { BullsDoorHandler } from "./session/BullsDoorHandler.js";
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
 * - BullsDoorHandler: Bulls-specific functionality
 * - DoorLifecycleManager: Execution loop and lifecycle management
 * - DoorMessageHandler: Message processing and IPC handling
 *
 * Version: 2025-11-20 - REFACTORED: Modular architecture implementation
 */

export class AmigaDoorSession {
  private emulator: MoiraEmulator | null = null;
  private socket: Socket;
  private config: DoorConfig;
  private isRunning: boolean = false;

  // Core components (extracted into separate modules)
  private libraryManager: LibraryManager | null = null;
  private doorLoader: DoorLoader | null = null;
  private bullsHandler: BullsDoorHandler | null = null;
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
    this.config = {
      timeout: 300, // 5 minutes default
      ...config,
    };

    console.log(
      `[AmigaDoorSession] Initializing refactored session for: ${path.basename(
        this.config.executablePath
      )}`
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

      // Initialize Bulls Handler (Phase 4)
      this.bullsHandler = new BullsDoorHandler(
        this.emulator,
        this.sharedState.execLibrary,
        this.config
      );
      this.bullsHandler.initializeBulls();

      // Set shared state in Bulls handler
      this.bullsHandler.setSharedState({
        doorInfoAddr: this.sharedState.doorInfoAddr,
        nodeStatusAddr: this.sharedState.nodeStatusAddr,
        doorSummaryPtr: this.sharedState.doorSummaryPtr,
        doorReplyPortAddr: this.sharedState.doorReplyPortAddr,
        aePortAddress: this.sharedState.aePortAddress,
        sentInitialMessage: this.sharedState.sentInitialMessage,
      });

      // Initialize Message Handler (Phase 5B)
      this.messageHandler = new DoorMessageHandler(
        this.emulator,
        this.socket,
        this.sharedState.execLibrary,
        this.bullsHandler,
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
        this.bullsHandler,
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
        `[AmigaDoorSession]   - BullsDoorHandler: Bulls-specific logic`
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
    } catch (error) {
      console.error("[AmigaDoorSession] Error starting door:", error);
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
    this.bullsHandler = null;
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
}
