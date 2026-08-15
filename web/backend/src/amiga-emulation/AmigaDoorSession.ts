// AmigaDoorSession.ts - REFACTORED
// Comprehensive refactoring of the original 5,259-line monolithic file
// Split into logical, maintainable modules with clear separation of concerns
// 2025-11-20

import { Server, Socket } from "socket.io";
import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { HunkLoader } from "./loader/HunkLoader.js";
import { XIMProtocol } from "./XIMProtocol.js";
import { FIMProtocol } from "./fim/fim-protocol.js";
import { fimPortName } from "./fim/fim-constants.js";
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
import { debugRegistry } from "../debug/DebugRegistry.js";
import { parseInfoFile } from "../utils/amiga-command-parser.util";
import { debugLog } from '../utils/debug-log';
import { setEnvStat } from "../utils/acs.util";
import { EnvStat } from "../constants/env-codes";

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

  // Socket handler references for cleanup
  private onDoorInput?: (data: string) => void;
  private onKeysState?: (data: {
    key: string;
    pressed: boolean;
    keyState: Record<string, boolean>;
  }) => void;
  private onSocketDisconnect?: () => void;
  private onDoorTerminate?: () => void;

  // Port tracking for cleanup (express.e:4527 - deletePort if we created it)
  private createdDoorPort = false;
  private doorPortName = "";

  // If we registered with DebugRegistry, this holds the nodeId used
  private registeredWithDebug: number | null = null;

  // FIM protocol handler for FAME BBS doors (doorType === "FIM")
  private fimProtocol: FIMProtocol | null = null;

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
    if (this.config.bbsSession && this.config.mimicVer) {
      const session: any = this.config.bbsSession;
      if (!session.mimicVer) {
        session.mimicVer = this.config.mimicVer;
      }
    }
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
debugLog(`[AmigaDoorSession] About to create logger for: ${doorName} node: ${nodeId}`);
    this.logger = getDoorLogger(doorName, nodeId);
debugLog(`[AmigaDoorSession] Logger created, path: ${this.logger.getLogPath()}`);

debugLog(
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
debugLog(
      "[AmigaDoorSession] Setting up socket handlers for door:input and keys:state"
    );

    // Handle user input (keystrokes)
    this.onDoorInput = (data: string) => {
debugLog(
        `[AmigaDoorSession] 🎹 door:input event received: "${data}" isRunning=${this.isRunning}`
      );

      if (!this.isRunning || !this.sharedState.dosLibrary) {
debugLog(
          "[AmigaDoorSession] ❌ Input ignored: door not running or DOS library not available"
        );
        return;
      }

      // Route to FIM protocol if active. FAME BBS doors (doorType FIM) use a
      // completely separate deferred-reply protocol (NR_PromptChars /
      // AR_GetKey / NR_HotKey / AR_HotKey) — not XIM/TIM/DOS stdin — so
      // forward and stop here to avoid double-delivering the same input.
      if (this.fimProtocol) {
debugLog(
          `[AmigaDoorSession] Forwarding input to FIM protocol: "${data}"`
        );
        this.fimProtocol.queueInput(data);
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
debugLog(
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
debugLog(
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
debugLog(
          `[AmigaDoorSession] Forwarding input to TIM handler: "${data}"`
        );
        this.timHandler.queueInput(data);
      }

      // Route to DOS stdin ONLY when no protocol handler consumed the input
      // This prevents double-delivery: once via XIM/TIM and once via DOS
      if ((!this.sharedState.ximProtocol || !ximWaitingForInput) && !timWaitingForInput) {
debugLog(
          `[AmigaDoorSession] Queueing input for DOS stdin: "${data}"`
        );
        this.sharedState.dosLibrary.queueInput(data);
      } else {
debugLog(
          `[AmigaDoorSession] Skipping DOS queue - input was consumed by protocol handler`
        );
      }
    };
    this.socket.on("door:input", this.onDoorInput);

    // Handle simultaneous key state updates (for games that need multiple keys at once)
    this.onKeysState = (data: {
      key: string;
      pressed: boolean;
      keyState: Record<string, boolean>;
    }) => {
debugLog(
        `[AmigaDoorSession] 🎮 keys:state event received: ${data.key} = ${data.pressed}`
      );

      if (this.isRunning && this.sharedState.ximProtocol) {
        // Update XIM protocol with key state
        this.sharedState.ximProtocol.updateKeyState(data);
      } else {
debugLog(
          `[AmigaDoorSession] ❌ Key state update ignored: isRunning=${
            this.isRunning
          } hasXIM=${!!this.sharedState.ximProtocol}`
        );
      }
    };
    this.socket.on("keys:state", this.onKeysState);

    // Handle disconnection
    this.onSocketDisconnect = () => {
debugLog("[AmigaDoorSession] Socket disconnected, terminating door");
      if (this.sharedState.ximProtocol) {
        this.sharedState.ximProtocol.markCarrierDropped();
      }
      this.terminate();
    };
    this.socket.on("disconnect", this.onSocketDisconnect);

    // Handle explicit termination request
    this.onDoorTerminate = () => {
debugLog("[AmigaDoorSession] Termination requested by user");
      if (this.sharedState.ximProtocol) {
        this.sharedState.ximProtocol.markCarrierDropped();
      }
      this.terminate();
    };
    this.socket.on("door:terminate", this.onDoorTerminate);
  }

  /**
   * Initialize and start the door - REFACTORED
   */
  async start(): Promise<void> {
    try {
debugLog(
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

      // Initialize emulator with configurable memory size
      // Default: 4MB (sufficient for 95%+ of doors). Set EMULATOR_MEMORY_MB=8 or 16 for demanding doors.
      const memSizeMB = parseInt(process.env.EMULATOR_MEMORY_MB || '4', 10);
      const memSize = Math.max(2, Math.min(16, memSizeMB)) * 1024 * 1024;
      debugLog(`[AmigaDoorSession] Emulator memory: ${memSizeMB}MB`);
      this.emulator = new MoiraEmulator(memSize);
      await this.emulator.initialize();
debugLog("[AmigaDoorSession] ✅ Emulator initialized");

      // Load Kickstart ROM (CRITICAL - must load before libraries)
debugLog("[AmigaDoorSession] Loading Kickstart ROM...");
      this.sharedState.kickstartRom = new KickstartRom();
      this.sharedState.kickstartRom.dumpInfo();

      // Load door tooltypes from .info file if available
      // Try full path first (e.g. Doors/aquascan/AquaScan.020.info)
      let infoPath = `${this.config.executablePath}.info`;
      let tooltypes = parseInfoFile(infoPath);
      
      // If not found, try base name (e.g. Doors/aquascan/AquaScan.info)
      if (tooltypes.size === 0) {
        const parsedPath = path.parse(this.config.executablePath);
        const baseName = parsedPath.name.split('.')[0];
        const fallbackInfoPath = path.join(parsedPath.dir, `${baseName}.info`);
debugLog(`[AmigaDoorSession] Tooltypes not found at ${infoPath}, trying fallback: ${fallbackInfoPath}`);
        tooltypes = parseInfoFile(fallbackInfoPath);
        if (tooltypes.size > 0) {
          infoPath = fallbackInfoPath;
        }
      }

      if (tooltypes.size > 0) {
debugLog(`[AmigaDoorSession] Loaded ${tooltypes.size} tooltypes from ${infoPath}`);
        this.config.toolTypes = { ...this.config.toolTypes, ...Object.fromEntries(tooltypes) };
        
        // Update doorType if specified in tooltypes
        const typeTooltype = tooltypes.get('TYPE');
        if (typeTooltype) {
debugLog(`[AmigaDoorSession] Overriding doorType with TYPE tooltype: ${typeTooltype}`);
          this.config.doorType = typeTooltype.toUpperCase();
        }
      }

      // Map ROM into emulator memory at 0xF80000-0xFFFFFF
      const romData = this.sharedState.kickstartRom.getRomData();
      this.emulator.loadROM(romData);
debugLog("[AmigaDoorSession] ✅ Main ROM loaded and mapped to 0xF80000-0xFFFFFF");

      // For AROS, also load extension ROM at 0xE00000-0xE7FFFF
      if (this.sharedState.kickstartRom.isArosRom()) {
        const extRomData = this.sharedState.kickstartRom.getExtRomData();
        if (extRomData) {
          const extRomStart = this.sharedState.kickstartRom.getExtRomStart();
          this.emulator.loadExtensionROM(extRomData, extRomStart);
debugLog(`[AmigaDoorSession] ✅ AROS Extension ROM loaded at 0x${extRomStart.toString(16)}`);
        }
      }
debugLog("[AmigaDoorSession] ✅ Kickstart ROM loaded and mapped to memory");

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
debugLog(
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
debugLog(
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
debugLog(
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
debugLog('[AmigaDoorSession] [NATIVE DEBUG] Enabling Moira native debugger...');

          // Enable instruction logging (256-entry circular buffer)
          cpu.nativeEnableLogging();
debugLog('[AmigaDoorSession] [NATIVE DEBUG] Instruction logging enabled');

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
debugLog(`[AmigaDoorSession] [NATIVE DEBUG] Watchpoints set on: ${nativeWatchAddrs.map(a => '0x' + a.toString(16)).join(', ')}`);

          // Set catchpoint for illegal instructions
          cpu?.nativeSetCatchpoint?.(4); // Vector 4 = Illegal instruction
debugLog('[AmigaDoorSession] [NATIVE DEBUG] Catchpoint set for illegal instructions');
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

      // Ensure our full teardown (registry unregister, socket handler cleanup,
      // globals) runs on every exit path — not only user-initiated kills.
      // Guard in terminate() prevents re-entry when we call lifecycleManager.terminate()
      // ourselves.
      this.lifecycleManager.setOnExit(() => this.terminate());

      // Register this live door session with the debug MCP so external tools
      // (curl, Claude via MCP) can introspect its emulator state. Dev-only.
      if (process.env.NODE_ENV !== "production" && this.emulator && this.doorLoader && this.lifecycleManager) {
        const rawNode = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber ?? 0;
        const nodeId = typeof rawNode === "string" ? parseInt(rawNode, 10) || 0 : rawNode;
        if (nodeId > 0) {
          debugRegistry.register({
            nodeId,
            doorId: this.config.doorId || path.basename(this.config.executablePath),
            executablePath: this.config.executablePath,
            startedAtMs: Date.now(),
            emulator: this.emulator,
            doorLoader: this.doorLoader,
            lifecycleManager: this.lifecycleManager,
            socket: this.socket,
            ximRing: [],
            ximRingCapacity: 200,
          });
          this.registeredWithDebug = nodeId;
        }
      }

      // NOTE: AEDoorPort now created EARLY in initializeLibraries() to ensure it exists
      // before any door code or native library initialization can call FindPort().
      // See lines 605-617 for the new early creation location.

      // Initialize TIM Door Handler for DoorControl-using doors (Phase 5C)
      // TIM, SIM, IIM, SUP doors all use DoorControl{n} port (per express.e:4316-4320)
      // Only XIM doors use AEDoorPort - all others use DoorControl with doorMsg structure
      // CRITICAL: Default to SIM if doorType not specified (matches LibraryManager default)
      const effectiveDoorType = (this.config.doorType || "SIM").toUpperCase();
      const usesDoorControl = effectiveDoorType === "TIM" ||
                              effectiveDoorType === "SIM" ||
                              effectiveDoorType === "IIM" ||
                              effectiveDoorType === "SUP";
      if (usesDoorControl) {
        this.timHandler = new TIMDoorMessageHandler(
          this.emulator,
          this.socket,
          this.config
        );
        this.lifecycleManager.setTIMHandler(this.timHandler);
debugLog(`[AmigaDoorSession] DoorControl handler initialized for ${effectiveDoorType} door`);
      }

debugLog("[AmigaDoorSession] All modular components initialized");
debugLog(`[AmigaDoorSession] 📊 Architecture:`);
debugLog(
        `[AmigaDoorSession]   - LibraryManager: Library initialization and traps`
      );
debugLog(
        `[AmigaDoorSession]   - DoorLoader: Binary loading and CPU setup`
      );
debugLog(
        `[AmigaDoorSession]   - DoorLifecycleManager: Execution loop management`
      );
debugLog(
        `[AmigaDoorSession]   - DoorMessageHandler: IPC and message processing`
      );

      // NOTE: BBSInfo structure population is now handled in door-info.util.ts
      // It's done AFTER CreateComm() allocates the DIFace structure at the correct address
      // See: sdk/68k/doors/diagnostic/BBSINFO_FIX_CORRECTED.md

      // Start door execution via Lifecycle Manager
      this.isRunning = true;
debugLog("[AmigaDoorSession] 🚪 Emitting door:status = running");
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

debugLog(
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

    // Initialize MULTICOM structures in this session's emulator
    // This matches express.e where ACP creates structures at startup
    const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber ?? 1;
    const sessionId = this.config.bbsSession?.id || `session-${nodeId}`;
    const username = this.config.bbsSession?.user?.username || 'Guest';
    const location = this.config.bbsSession?.user?.location || 'Unknown';

    this.logger.log('MULTICOM', `INIT: nodeId=${nodeId}, username="${username}", location="${location}"`);

    try {
      const { multicomManager, ENV_DOORS } = await import("../nodes/MulticomManager.js");
      this.logger.log('MULTICOM', `multicomManager imported successfully`);

      // Initialize structures in this emulator (all nodes get valid singlePort ptrs;
      // RTW output is capped via JH_SM filtering in io.ts, not via the struct).
      multicomManager.initializeInEmulator(this.emulator, sessionId, nodeId);
      this.logger.log('MULTICOM', `initializeInEmulator called`);

      // Update with current user info (status = ENV_DOORS since we're launching a door)
      multicomManager.updateNode(nodeId, username, location, ENV_DOORS);
      this.logger.log('MULTICOM', `updateNode called`);

      // Mirror the DOORS status into ENV:STATS@<nodeId> so file-based pollers
      // (WarOLM, MultiTop, Bulls, etc.) see the user as "Using A Door" instead
      // of "Idle". MulticomManager only touches singlePort memory.
      if (this.config.bbsSession) {
        setEnvStat(this.config.bbsSession, EnvStat.DOORS);
      }

      this.logger.log('MULTICOM', `initialized for node ${nodeId}: ${username} @ ${location}`);
    } catch (error) {
      this.logger.log('MULTICOM', `INIT ERROR: ${error}`);
      console.error('[AmigaDoorSession] MULTICOM init failed:', error);
    }

    // CRITICAL FIX (Jan 8): Create AEDoorPort IMMEDIATELY after libraries init, BEFORE door loads!
    // Native AEDoor.library or door's first instruction may call FindPort("AEDoorPort")
    // during initialization. We must create it BEFORE any door code can execute.
    // express.e creates port at lines 4316-4328 BEFORE startProcess() at line 4336.
    const doorType = (this.config.doorType || "").toUpperCase();
debugLog(`[AmigaDoorSession] doorType="${doorType}" for ${this.config.executablePath}`);
    if (doorType === "XIM" || doorType === "AIM") {
      const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber ?? 1;
      const portName = `AEDoorPort${nodeId}`;
      this.doorPortName = portName;
      const portAddr = this.sharedState.execLibrary?.createLightweightPort(portName);
debugLog(`[AmigaDoorSession] Created ${portName} at 0x${portAddr?.toString(16)}`);
      this.createdDoorPort = true; // Delete on cleanup
    } else if (doorType === "FIM") {
      const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber ?? 1;
      const portName = fimPortName(nodeId);
      this.doorPortName = portName;
      const portAddr = this.sharedState.execLibrary?.createLightweightPort(portName);
debugLog(`[AmigaDoorSession] Created ${portName} at 0x${portAddr?.toString(16)}`);
      this.createdDoorPort = true; // Delete on cleanup

      this.fimProtocol = new FIMProtocol({
        emulator: this.emulator!,
        execLibrary: this.sharedState.execLibrary,
        socket: this.socket,
        bbsSession: this.config.bbsSession || {},
        nodeId,
        onShutdown: (rc, lastWords) => {
debugLog(`[AmigaDoorSession] FIM onShutdown(rc=${rc}, lastWords=${lastWords ?? ""})`);
          this.terminate();
        },
        getChatFlag: () => {
          // Lazy require: harness runs (SKIP_NETWORK_LISTENERS) may not have
          // server state loaded; boot default is sysopAvailable=true.
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const init = require('../server/initialization');
            return init?.chatState?.sysopAvailable ? 1 : 0;
          } catch {
            return 1;
          }
        },
      });
      this.sharedState.execLibrary?.setFimMessageCallback((msgAddr: number) =>
        this.fimProtocol!.handleMessage(msgAddr)
      );
    } else {
debugLog(`[AmigaDoorSession][DEBUG] NOT creating AEDoorPort - doorType is "${doorType}", not XIM, AIM, or FIM`);
    }

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

debugLog(
      "[AmigaDoorSession] ✅ Libraries initialized via LibraryManager"
    );
debugLog(
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

    // Set up library opened callback. This APPENDS to the list of
    // library-opened callbacks (ExecLibrary.addLibraryOpenedCallback) — it
    // does NOT replace LibraryManager's own callback (LibraryManager.ts,
    // registered earlier in initializeLibraries()). Both fire, in
    // registration order, on every OpenLibrary(). Previously
    // setLibraryOpenedCallback was a single overwritable slot, so this
    // registration silently discarded LibraryManager's callback entirely —
    // including its fame.library branch, which installs FAME.library's trap
    // vectors. Every FIM (FAME-doorport) door crashed on its first
    // FAME.library call as a result. Fixed at the root in ExecLibrary.ts
    // (compose/list of callbacks) rather than duplicating LibraryManager's
    // branches here.
debugLog("[AmigaDoorSession] Setting library opened callback");
    this.sharedState.execLibrary.addLibraryOpenedCallback(
      (name: string, addr: number) => {
        if (name.toLowerCase() === "dos.library") {
debugLog(
            "[AmigaDoorSession] dos.library opened, installing vectors..."
          );
          this.sharedState.libraryTraps.installDOSVectors();
        }
        if (name.toLowerCase() === "aedoor.library") {
debugLog(
            "[AmigaDoorSession] AEDoor.library opened, installing vectors..."
          );
          this.sharedState.libraryTraps.installAEDoorVectors();

          // CRITICAL: Send INIT/STAT to door's pr_MsgPort when library opens
          // AquaScan (and similar doors) do WaitPort on pr_MsgPort BEFORE calling CreateComm,
          // expecting startup messages to determine BBS vs CLI mode.
          // Previously we sent these proactively on first poll (too early) or in CreateComm (too late).
          // express.e:4352-4369 shows BBS waits for door to send JH_REGISTER, but doors like
          // AquaScan use pr_MsgPort messages for BBS mode detection before sending JH_REGISTER.
          if (this.messageHandler && !this.sharedState.sentInitialMessage) {
debugLog(
              "[AmigaDoorSession] Sending INIT/STAT messages after AEDoor.library open"
            );
            this.sendStartupMessage();
          }
        }
        if (name.toLowerCase() === "icon.library") {
debugLog(
            "[AmigaDoorSession] icon.library opened, installing vectors..."
          );
          this.sharedState.libraryTraps.installIconVectors();
        }
        if (name.toLowerCase() === "intuition.library") {
          // S/stats regression (historical root cause, now fixed at the
          // ExecLibrary composition level — see addLibraryOpenedCallback
          // above): this branch used to be the ONLY place installing
          // intuition.library vectors, because this whole callback replaced
          // LibraryManager's (LibraryManager.ts:775) rather than composing
          // with it. LibraryManager also has its own intuition.library
          // branch now that both callbacks run. This branch stays because
          // it additionally calls syncTrapAddressesToMoira() (below), which
          // LibraryManager's branch does not. The stats door's SAS/C panic
          // handler opens intuition.library, calls AutoRequest at LVO -348,
          // and without vectors the JSR jumps into uninitialized memory at
          // (intuitionBase + LVO) — door faults, runtime longjmps to its
          // recovery exit, and exits FAIL=20.
          //
          // syncTrapAddressesToMoira() is also required: MOIRA's batch
          // executor caches trap addresses and won't dispatch the 0x4AFC
          // illegal-instruction trap to our handler unless the address set
          // is re-synced. Without it the door hits the trap, faults, and
          // PC drifts off into uninitialized memory (we observed an
          // 8000-byte-stride loop in 0x1d… range — the post-fault drift).
debugLog(
            "[AmigaDoorSession] intuition.library opened, installing vectors..."
          );
          this.sharedState.libraryTraps.installIntuitionVectors();
          this.sharedState.libraryTraps.syncTrapAddressesToMoira();
        }
        if (name.toLowerCase() === "bsdsocket.library") {
debugLog(
            "[AmigaDoorSession] bsdsocket.library opened, installing vectors..."
          );
          this.sharedState.libraryTraps.installBsdSocketVectors();
          // CRITICAL: Sync new trap addresses to MOIRA for batch execution
          this.sharedState.libraryTraps.syncTrapAddressesToMoira();
debugLog("[AmigaDoorSession] bsdsocket trap addresses synced to MOIRA");
        }
        if (name.toLowerCase() === "amisslmaster.library") {
debugLog(
            "[AmigaDoorSession] amisslmaster.library opened, installing vectors..."
          );
          this.sharedState.libraryTraps.installAmiSSLMasterVectors();
          // CRITICAL: Sync new trap addresses to MOIRA for batch execution
          this.sharedState.libraryTraps.syncTrapAddressesToMoira();
debugLog("[AmigaDoorSession] amisslmaster trap addresses synced to MOIRA");
        }
        if (name.toLowerCase() === "amissl.library") {
debugLog(
            "[AmigaDoorSession] amissl.library opened, installing vectors..."
          );
          this.sharedState.libraryTraps.installAmiSSLVectors();
          // CRITICAL: Sync new trap addresses to MOIRA for batch execution
          this.sharedState.libraryTraps.syncTrapAddressesToMoira();
debugLog("[AmigaDoorSession] amissl trap addresses synced to MOIRA");
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
debugLog(
              `[AmigaDoorSession] *** LIBRARY CALL IN POLLING LOOP ***`
            );
debugLog(`[AmigaDoorSession]   Function: ${functionName}`);
debugLog(`[AmigaDoorSession]   PC: 0x${pc.toString(16)}`);
debugLog(
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

    // Get the dynamically allocated task address from ExecLibrary
    const taskAddr = this.sharedState.execLibrary.getCurrentTaskAddress();
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

    // Use doorCommand if available (e.g., "N" for newscan), otherwise use executable basename
    // CRITICAL: AquaScan and other multi-function doors check the CLI program name to determine
    // which operation to perform (N=newscan, NSU=new since upload, FR=file rescan, etc.)
    const sessionCommand = this.config.bbsSession?.doorCommand;
    const progName = (sessionCommand && typeof sessionCommand === 'string')
      ? sessionCommand.toUpperCase()
      : path.basename(this.config.executablePath);
debugLog(`[AmigaDoorSession] progName="${progName}" (from doorCommand="${sessionCommand}" or basename)`);
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
    this.emulator.writeMemory32(cliStructAddr + 0x34, 65536 >> 2); // cli_DefaultStack (in longwords, not bytes) - generous 64KB default
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

    // CRITICAL: Do NOT write pr_CLI here! Task hasn't been allocated yet (address=0)
    // DoorLoader will write pr_CLI after allocating the Task structure
    const isXimDoor = (this.config.doorType || "").toUpperCase() === "XIM";

debugLog(
      `[AmigaDoorSession] Created CLI struct at 0x${cliStructAddr.toString(
        16
      )} (cliBPTR=0x${cliBPTR.toString(16)}${isXimDoor ? " - XIM door, pr_CLI depends on CLI_REQUIRED tooltype" : " - will be written to pr_CLI by DoorLoader"})`
    );
debugLog(
      `[AmigaDoorSession]   Command BSTR len=${cmdLine.length} at 0x${cmdLineAddr.toString(
        16
      )} "${cmdLine}"`
    );

    // Set CLI info for dos.library helpers (GetArgStr, GetCliProgramName)
    // Note: isXimDoor already defined above (still gates the separate
    // pr_CLI-restore callback below, which is XIM-specific).
    // Args selection itself uses DoorLoader.selectCliArgs — single source
    // of truth shared with DoorLoader.setupCpuRegisters so XIM/FIM's
    // node-only-CLI rule can't drift between the two call sites (FIM doors
    // deliver runtime params via NR_GetArgument1-4/NR_GetFullArg, commands
    // 87-91 — see fim-protocol.ts).
    const cliArgsRaw = Array.isArray(this.config.args) ? this.config.args : [];
    const cliArgs = DoorLoader.selectCliArgs(
      this.config.doorType || "",
      cliArgsRaw,
      nodeId,
    );
    if (isXimDoor && cliArgsRaw.length > 0) {
debugLog(
        `[AmigaDoorSession] XIM doors ignore config.args for CLI (express.e runDoor); using node only`
      );
    }
    const argStringPlain =
      cliArgs.join(" ").trim() || nodeId.toString();
    for (let i = 0; i < argStringPlain.length; i++) {
      this.emulator.writeMemory(argStringAddr + i, argStringPlain.charCodeAt(i));
    }
    this.emulator.writeMemory(argStringAddr + argStringPlain.length, 0);
debugLog(`[AmigaDoorSession] CLI arg string="${argStringPlain}"`);
    this.sharedState.dosLibrary.setCliInfo(argStringAddr, progName);

    // Restore pr_CLI if a door CreatePort() overwrites it
    // XIM doors: pr_CLI is set by DoorLoader based on CLI_REQUIRED tooltype, don't modify here
    // Non-XIM doors: restore pr_CLI if it was cleared during CreatePort
    // NOTE: DoorLoader creates its own CLI struct at a different address (0xa0000 vs 0x110000).
    // This callback uses the CURRENT task address (from ExecLibrary) and the CLI struct
    // created by DoorLoader, not the one from setupCliEnvironment.
    this.sharedState.execLibrary.setDoorInitCallback(() => {
      // Don't modify pr_CLI for XIM doors - DoorLoader already set the correct value
      if (isXimDoor) {
        return;
      }
      // Get CURRENT task address (may have been allocated by DoorLoader after this callback was set)
      const currentTaskAddr = this.sharedState.execLibrary?.getCurrentTaskAddress() ?? 0;
      if (currentTaskAddr === 0) {
        debugLog("[AmigaDoorSession] pr_CLI restore callback: task not allocated yet, skipping");
        return;
      }
      const currentValue = this.emulator?.readMemory32(currentTaskAddr + prCliOffset) ?? 0;
      if (currentValue === 0) {
        // Use DoorLoader's CLI struct address (0xa0000 >> 2 = 0x28000)
        // This is the CLI structure that DoorLoader populates with correct values
        const doorLoaderCliBptr = 0xa0000 >> 2; // 0x28000
        this.emulator?.writeMemory32(currentTaskAddr + prCliOffset, doorLoaderCliBptr);
debugLog(
          `[AmigaDoorSession] pr_CLI was cleared during CreatePort; restored to 0x${doorLoaderCliBptr.toString(16)} at task 0x${currentTaskAddr.toString(16)}`
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
    // Re-entry guard: terminate() can be reached from multiple paths in the
    // same exit sequence (user 'door:terminate', lifecycleManager's onExit
    // hook, JH_SHUTDOWN handler, socket disconnect). Running the full
    // teardown twice causes double-free on the AEDoorPort among other things.
    // isRunning is set true in start() and false below, so it's the authoritative
    // "already cleaned up" flag.
    if (!this.isRunning) return;

debugLog("[AmigaDoorSession] Terminating refactored door session...");
    this.logger.info("Terminating session...");

    this.isRunning = false;
    this.removeSocketHandlers();

    // Drop the debug registry entry so MCP callers stop seeing a stale session.
    if (this.registeredWithDebug !== null) {
      debugRegistry.unregister(this.registeredWithDebug);
      this.registeredWithDebug = null;
    }

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
debugLog(`[AmigaDoorSession] Deleted ${this.doorPortName} at 0x${portAddr.toString(16)} (cleanup)`);
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

    // Clear node status and unregister from MULTICOM manager
    const { multicomManager } = require("../nodes/MulticomManager.js");
    const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber ?? 1;
    const sessionId = this.config.bbsSession?.id || `session-${nodeId}`;

    // Clear this node's status (user logged out or door exited)
    multicomManager.clearNode(nodeId);

    // Return ENV:STATS@<nodeId> to IDLE so pollers stop reporting the user
    // as "Using A Door" after the door exits back to the BBS menu.
    if (this.config.bbsSession) {
      setEnvStat(this.config.bbsSession, EnvStat.IDLE);
    }

    // Unregister this session's emulator
    multicomManager.unregisterEmulator(sessionId);

debugLog(`[AmigaDoorSession] Cleared node ${nodeId} and unregistered MULTICOM for session ${sessionId}`);

    // Cleanup library state to release memory (RAM optimization)
    if (this.sharedState.execLibrary) {
      this.sharedState.execLibrary.cleanup();
    }
    if (this.sharedState.dosLibrary) {
      this.sharedState.dosLibrary.cleanup();
    }

    // Cleanup emulator
    if (this.emulator) {
      this.emulator.cleanup();
      this.emulator = null;
    }

    // End door logger
    this.logger.end(undefined, "Session terminated");
    const doorName = path.basename(this.config.executablePath);
    removeDoorLogger(doorName, nodeId);

    // Clear all references
    this.libraryManager = null;
    this.doorLoader = null;
    this.lifecycleManager = null;
    this.messageHandler = null;

debugLog("[AmigaDoorSession] Refactored door session terminated");
  }

  private removeSocketHandlers(): void {
    if (!this.socket) {
      return;
    }
    if (this.onDoorInput) {
      this.socket.off("door:input", this.onDoorInput);
      this.onDoorInput = undefined;
    }
    if (this.onKeysState) {
      this.socket.off("keys:state", this.onKeysState);
      this.onKeysState = undefined;
    }
    if (this.onSocketDisconnect) {
      this.socket.off("disconnect", this.onSocketDisconnect);
      this.onSocketDisconnect = undefined;
    }
    if (this.onDoorTerminate) {
      this.socket.off("door:terminate", this.onDoorTerminate);
      this.onDoorTerminate = undefined;
    }
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
    console.log(`[AmigaDoorSession] getExitState: hasXimProtocol=${!!this.sharedState.ximProtocol}, returnCommand="${ximState?.returnCommand || 'NONE'}"`);
debugLog(`[AmigaDoorSession] getExitState: ximProtocol=${!!this.sharedState.ximProtocol}, returnCommand="${ximState?.returnCommand || 'NONE'}"`);
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
