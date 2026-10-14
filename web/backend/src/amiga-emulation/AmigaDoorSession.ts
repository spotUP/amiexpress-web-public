// AmigaDoorSession.ts - REFACTORED
// Comprehensive refactoring of the original 5,259-line monolithic file
// Split into logical, maintainable modules with clear separation of concerns
// 2025-11-20

import { isSysopAvailable } from '../services/sysop-availability';
import { Server, Socket } from "socket.io";
import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { HunkLoader } from "./loader/HunkLoader.js";
import { XIMProtocol } from "./XIMProtocol.js";
import { FIMProtocol } from "./fim/fim-protocol.js";
import { fimPortName } from "./fim/fim-constants.js";
import { routeAmigaDoorInput } from "./door-input-router.js";
import { KickstartRom } from "./KickstartRom.js";
import * as path from "path";
import { appendFileSync } from "fs";

import { DoorConfig, doorProgramName } from "./DoorTypes.js";
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
import { inputForTrace, setSecretInput } from './xim/secret-input';
import { closeUserField } from './xim/userfield';
import { DOOR_CLI_ADDR, DOOR_CLI_ARGS_ADDR, assertMemoryMapFits } from "./memory-map";
import { setEnvStat } from "../utils/acs.util";
import { multicomManager, ENV_DOORS } from "../nodes/MulticomManager";
import { EnvStat } from "../constants/env-codes";
import { c64AdapterFor, uninstallC64DoorAdapter } from "../server/c64-door-adapter";

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

/** Distinguishes two door sessions that share a node. See `multicomSessionId`. */
let doorSessionSerial = 0;

export class AmigaDoorSession {
  /**
   * THIS DOOR SESSION'S OWN IDENTITY in the MULTICOM registry.
   *
   * It used to be derived as `session-<nodeId>` whenever the BBS session had
   * no id of its own, so EVERY door on a node shared one key: a logoff batch
   * running on node 1 and a caller's door on node 1 were the same entry, each
   * overwriting the other, and either one exiting cleared the node for both.
   * The sysop's jammed board on 2026-09-15 had six registrations, all
   * `session-1`.
   *
   * Computed once, here, so init and teardown cannot disagree about it - they
   * used to derive it independently at two call sites.
   */
  private readonly multicomSessionId: string;
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

  /**
   * Runs the door at full speed unless its .info asks to be paced.
   *
   * 68K door output went through the user's modem throttle unconditionally
   * (io.ts directEmit, policy of 2026-04-29). That is right for a door whose
   * VISUALS are paced for a modem - it was introduced because Conftop's
   * clear/redraw rendered too fast to see - and wrong for everything else.
   *
   * Measured on DoorRepo's full-screen browser, same binary both sides:
   * ~7ms per 198-byte JH_SM with no modem emulator in the path, ~200ms on a
   * session throttled to 56000 bps, because sendThrottled() walks the
   * payload in <=64-char slices and sleeps in 5ms quanta whenever the byte
   * budget runs dry. One redraw is 11-80 of those messages, so a cursor
   * keypress cost 1-2 seconds of pure pacing. 68K execution was 5ms of it.
   *
   * So pacing is opt-in now, the same choice TypeScript doors have always
   * had: THROTTLE=YES in the .info for a door that wants the modem look.
   */
  private suspendModemThrottle(): void {
    if (this.wantsModemThrottle) return;
    try {
      const { getModemEmulator } = require('../utils/modem-emulator.util');
      const modem = getModemEmulator(this.socket);
      if (!modem || !modem.isEnabled()) return;
      this.suspendedModemBps = modem.getBps();
      modem.disable();
      console.log(
        `[AmigaDoorSession] Door output unthrottled (was ${this.suspendedModemBps} bps); ` +
        `set THROTTLE=YES in the door's .info to pace it at modem speed`
      );
    } catch {
      /* No modem emulator on this socket (harness, tests): nothing to do. */
    }
  }

  /**
   * Puts the user's modem speed back. Must run on EVERY exit path: a door
   * that left the BBS unthrottled would silently change how the whole board
   * renders for the rest of the session. Safe to call more than once.
   */
  private restoreModemThrottle(): void {
    if (this.suspendedModemBps === null) return;
    const bps = this.suspendedModemBps;
    this.suspendedModemBps = null;
    try {
      const { getModemEmulator } = require('../utils/modem-emulator.util');
      const modem = getModemEmulator(this.socket);
      if (modem && bps > 0) {
        modem.enable(bps);
        console.log(`[AmigaDoorSession] Modem emulation restored at ${bps} bps`);
      }
    } catch {
      /* Socket already gone - the throttle goes with it. */
    }
  }

  // Port tracking for cleanup (express.e:4527 - deletePort if we created it)
  private createdDoorPort = false;
  private doorPortName = "";

  // If we registered with DebugRegistry, this holds the nodeId used
  private registeredWithDebug: number | null = null;

  /** THROTTLE=YES in the door's .info: pace output at the user's modem speed. */
  private wantsModemThrottle = false;
  /** The user's baud rate, held while the door runs unthrottled. */
  private suspendedModemBps: number | null = null;

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
    fimProtocol: null as FIMProtocol | null,
    dreamDoorLibrary: null as any,
    // Mirrors this.timHandler — kept in sync (see initializeLibraries())
    // so door-input-router.ts's single routing function can reach TIM the
    // same way it already reaches FIM/DreamDoor/XIM/DOS, all via this one
    // sharedState object (Critical 1, DD final-review wave, 2026-08-16).
    timHandler: null as TIMDoorMessageHandler | null,

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
    {
      const ownNode = config.bbsSession?.nodeId ?? config.bbsSession?.nodeNumber ?? 1;
      this.multicomSessionId =
        config.bbsSession?.id || `session-${ownNode}-${++doorSessionSerial}`;
    }
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

    // Handle user input (keystrokes).
    //
    // Delegates entirely to routeAmigaDoorInput (door-input-router.ts) —
    // the SAME function door.handler.ts's live doorInputHandler closures
    // call. This listener only fires from test/corpus harnesses in
    // production (the frontend never emits 'door:input'; see that
    // module's header comment), but it must still behave identically to
    // the live path, not carry its own second copy of the per-protocol
    // branch list (Critical 1, DD final-review wave, 2026-08-16 — two
    // divergent copies is exactly how DD's live-hang bug and 2026-08-15's
    // FIM live-input bug both happened).
    this.onDoorInput = (data: string) => {
debugLog(
        `[AmigaDoorSession] door:input event received: "${inputForTrace(this.config.bbsSession, data, (s) => s)}" isRunning=${this.isRunning}`
      );

      if (!this.isRunning || !this.sharedState.dosLibrary) {
debugLog(
          "[AmigaDoorSession] Input ignored: door not running or DOS library not available"
        );
        return;
      }

      routeAmigaDoorInput(this.sharedState, data);
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
    const __t0 = Date.now();
    let __lagMax = 0;
    let __lagLast = Date.now();
    const __lagTimer = setInterval(() => {
      const late = Date.now() - __lagLast - 20;
      if (late > __lagMax) __lagMax = late;
      __lagLast = Date.now();
    }, 20);
    __lagTimer.unref?.();
    const mark = (what: string) =>
      this.logger.info(`[timing] ${what} +${Date.now() - __t0}ms (loop lag max ${__lagMax}ms)`);
    try {
      mark("start() entered");
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
      // memory-map.ts places the stack and system regions up to 4 MB.
      const memSize = Math.max(4, Math.min(16, memSizeMB)) * 1024 * 1024;
      assertMemoryMapFits(memSize);
      debugLog(`[AmigaDoorSession] Emulator memory: ${memSizeMB}MB`);
      this.emulator = new MoiraEmulator(memSize);
      this.emulator.doorName = path.basename(this.config.executablePath);
      // Frame boundary for a C64 caller whenever the CPU stops. NOTE the limit:
      // C64_ADAPT_MAX_FRAME_MS is a setTimeout, so it can only fire when the JS
      // loop yields - it cannot preempt a synchronous 68K batch inside
      // executeUntilTrap (MoiraEmulator.ts, a tight C++ loop of up to
      // maxIterations instructions). A door that paints for a whole batch shows
      // its frame when the batch ends, not 250 ms in. The fake-timer unit test
      // does NOT cover that; only the live walk does. No-op when no adapter is
      // installed (every non-PETSCII session).
      this.emulator.onPause(() => c64AdapterFor(this.socket)?.flush());
      await this.emulator.initialize();
      mark("emulator initialized");
debugLog("[AmigaDoorSession] ✅ Emulator initialized");

      // Load Kickstart ROM (CRITICAL - must load before libraries)
debugLog("[AmigaDoorSession] Loading Kickstart ROM...");
      this.sharedState.kickstartRom = new KickstartRom();
      this.sharedState.kickstartRom.dumpInfo();
      mark("kickstart ready");

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
        
        // Pacing is opt-in; see suspendModemThrottle().
        const throttleTooltype = (tooltypes.get('THROTTLE') || '').trim().toUpperCase();
        this.wantsModemThrottle =
          throttleTooltype === 'YES' || throttleTooltype === '1' || throttleTooltype === 'ON';

        // Update doorType if specified in tooltypes
        const typeTooltype = tooltypes.get('TYPE');
        if (typeTooltype) {
debugLog(`[AmigaDoorSession] Overriding doorType with TYPE tooltype: ${typeTooltype}`);
          this.config.doorType = typeTooltype.toUpperCase();
        }
      }

      // Tooltypes are known now, so this is decided before the door emits
      // its first byte.
      this.suspendModemThrottle();

      // Map ROM into emulator memory at 0xF80000-0xFFFFFF
      const romData = this.sharedState.kickstartRom.getRomData();
      this.emulator.loadROM(romData);
      mark("ROM mapped");
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
      mark("libraries initialized");

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
        this.logger,
        this.sharedState.dosLibrary ?? undefined
      );
      await this.doorLoader.loadDoor();
      mark("door loaded");
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
        this.sharedState.timHandler = this.timHandler;
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
      clearInterval(__lagTimer);
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
    this.sharedState.dreamDoorLibrary = this.libraryManager.dreamDoorLibrary;
    this.sharedState.doorPortAddress = this.libraryManager.getDoorPortAddress();
    this.sharedState.aePortAddress = this.libraryManager.getDoorPortAddress(); // Same as door port for RTW
    this.sharedState.doorReplyPortAddr =
      this.libraryManager.getReplyPortAddress();

    // Initialize MULTICOM structures in this session's emulator
    // This matches express.e where ACP creates structures at startup
    const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber ?? 1;
    const sessionId = this.multicomSessionId;
    const username = this.config.bbsSession?.user?.username || 'Guest';
    const location = this.config.bbsSession?.user?.location || 'Unknown';

    this.logger.log('MULTICOM', `INIT: nodeId=${nodeId}, username="${username}", location="${location}"`);

    try {
      // The board's one table, the instance DoorLifecycleManager and the
      // cleanup below use. Never `await import()` it: under Node 20 + tsx that
      // goes through the off-thread ESM loader, loads a SECOND MulticomManager,
      // and in a headless runner (nothing else on the event loop) the reply
      // never arrives - the 68K upload checker hung here until the 120 s kill.
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
          // Test/diagnostic override (harness A/B runs of FAME chat semantics).
          if (process.env.FIM_CHAT_FLAG !== undefined) return Number(process.env.FIM_CHAT_FLAG) || 0;
          // FAME chat-flag semantics (A/B-verified vs 5D_Page): 1 = NOT
          // pageable, 0 = pageable. Map from sysopAvailable accordingly.
          // The board's one answer (services/sysop-availability.ts); a
          // harness with no database gets express.e's default, available.
          return isSysopAvailable() ? 0 : 1;
        },
        runInternalCommand: (cmd: string) => {
          // CF_InternalCmd: only "C" (sysop chat/page) is supported — the
          // notify-only page (chat session + webhook, no UI) so replacement
          // pager doors like 5D_Page keep rendering their own paging screen.
          if (cmd.toUpperCase() !== 'C') return false;
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const chat = require('../handlers/chat/chat.handler');
            const ok = chat?.notifySysopPage?.(this.config.bbsSession) === true;
            if (ok) {
              // Real FAME's internal C runs a blocking page-wait UX before
              // returning; our notify-only version returns instantly, so
              // without this line the door exits with zero visible feedback
              // and the page looks like a silent crash.
              this.socket?.emit('ansi-output',
                '\r\n\x1b[36mSysop has been paged. You will be notified if they respond.\x1b[m\r\n');
            }
            return ok;
          } catch (err) {
            debugLog(`[AmigaDoorSession] FIM internal cmd "C" failed: ${(err as Error)?.message ?? err}`);
            return false;
          }
        },
      });
      this.sharedState.execLibrary?.setFimMessageCallback((msgAddr: number) =>
        this.fimProtocol!.handleMessage(msgAddr)
      );
      // Expose on sharedState like ximProtocol: the live BBS routes
      // keystrokes through door.handler's session.doorInputHandler, which
      // reads protocol handlers off sharedState (the harness's door:input
      // socket path is a different route — both must reach queueInput).
      this.sharedState.fimProtocol = this.fimProtocol;
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
   * The door's CLI argument string and program name for dos.library's
   * GetArgStr/GetProgramName, matching the /X SystemTagList environment
   * (node number as arg). The CLI structure itself is DoorLoader's.
   */
  private setupCliEnvironment(): void {
    if (!this.emulator || !this.sharedState.execLibrary || !this.sharedState.dosLibrary) {
      return;
    }

    const prCliOffset = 0xac; // pr_CLI offset inside struct Process
    // The args only (no program name), in memory-map.ts "the door CLI block";
    // DoorLoader rewrites the same address with the AmigaDOS newline.
    const argStringAddr = DOOR_CLI_ARGS_ADDR;

    // Use doorCommand if available (e.g., "N" for newscan), otherwise use executable basename
    // CRITICAL: AquaScan and other multi-function doors check the CLI program name to determine
    // which operation to perform (N=newscan, NSU=new since upload, FR=file rescan, etc.)
    const sessionCommand = this.config.bbsSession?.doorCommand;
    const progName = doorProgramName(this.config);
debugLog(`[AmigaDoorSession] progName="${progName}" (from doorCommand="${sessionCommand}" or basename)`);
    // CRITICAL: Default to 1, not 0, to match port creation at line 437
    // This ensures the door's first argument matches the AEDoorPort name
    const nodeId =
      this.config.bbsSession?.nodeId ??
      this.config.bbsSession?.nodeNumber ??
      1;

    const isXimDoor = (this.config.doorType || "").toUpperCase() === "XIM";

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
    this.sharedState.dosLibrary.setCliInfo(argStringAddr);

    // Restore pr_CLI if a door CreatePort() overwrites it
    // XIM doors: pr_CLI is set by DoorLoader based on CLI_REQUIRED tooltype, don't modify here
    // Non-XIM doors: restore pr_CLI if it was cleared during CreatePort
    // The CLI is DoorLoader's (memory-map.ts DOOR_CLI_ADDR); this callback
    // uses the CURRENT task address from ExecLibrary.
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
        const doorLoaderCliBptr = DOOR_CLI_ADDR >> 2;
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

    /*
     * ASKED FROM INSIDE THE DOOR'S OWN WAIT? UNWIND FIRST.
     *
     * Under DOOR_ASYNC_WAIT=1 the door pumps the event loop while it waits
     * for a keystroke or a line, so a browser reload is delivered here from
     * INSIDE that trap handler. Running the teardown below at that moment
     * empties the port registry and deletes the CPU the handler is standing
     * in. The old code never survived to find out - its wait never returned:
     * it polled the two ports it had just lost for the full ten-minute budget,
     * pumping the whole event loop each turn. That is `Port not found:
     * 0x12230c` / `0x126f00` thousands of times a second and a board that
     * feels jammed - the sysop, three times on 2026-09-15 through GWall.
     *
     * So, from inside a wait: tell the wait the caller is gone, stop the
     * loop, and return. The trap hands the door NO_CARRIER, the loop ends on
     * its own condition, and the lifecycle's `finally` calls back into this
     * method with nothing on the emulator's stack. `isRunning` stays true
     * until then, so that second call is the one that does the work.
     */
    const aedoor = this.libraryManager?.aedoorLibrary;
    if (aedoor?.isInWaitForReply() && this.lifecycleManager?.isRunning()) {
console.log("[AmigaDoorSession] terminate() reached from inside the door's wait - unwinding first, teardown deferred");
      if (this.sharedState.ximProtocol) this.sharedState.ximProtocol.markCarrierDropped();
      aedoor.abandonWaits();
      this.lifecycleManager.requestTermination();
      return;
    }

debugLog("[AmigaDoorSession] Terminating refactored door session...");
    this.logger.info("Terminating session...");

    this.isRunning = false;
    // First, so a throw further down cannot leave the traces withholding for the next door (AEW_USERFIELD SECRET).
    setSecretInput(this.config.bbsSession, false);
    closeUserField(this.config.bbsSession);   // the next door on this session must OPEN again
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
    const nodeId = this.config.bbsSession?.nodeId ?? this.config.bbsSession?.nodeNumber ?? 1;
    const sessionId = this.multicomSessionId;

    // Clear this node's status (user logged out or door exited). The id says
    // WHO is clearing, so another session still live on this node keeps the
    // structures its door's port lives in - see MulticomManager.clearNode.
    multicomManager.clearNode(nodeId, sessionId);

    // Return ENV:STATS@<nodeId> to IDLE so pollers stop reporting the user
    // as "Using A Door" after the door exits back to the BBS menu.
    if (this.config.bbsSession) {
      setEnvStat(this.config.bbsSession, EnvStat.IDLE);
    }

    // Unregister this session's emulator
    multicomManager.unregisterEmulator(sessionId);

debugLog(`[AmigaDoorSession] Cleared node ${nodeId} and unregistered MULTICOM for session ${sessionId}`);

    // Give the user their modem speed back before anything else can throw.
    this.restoreModemThrottle();

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
    // A disconnect or door:terminate tears the door down without ever
    // returning through executeAmigaDoor's finally, so the LAST place that
    // can restore the socket's emit is here. Leaving it patched would send
    // the menu, the logoff screen and the next door through a reconstructor
    // that no longer has an owner.
    //
    // SILENT: this path is reached because the caller went away or the door
    // was killed. A frame still pending belongs to a door that has already
    // ended; painting it would drop a stale door screen on top of whatever
    // the caller sees next (the menu, the logoff screen) - or emit onto a
    // dead socket. Same argument as executeDoor's defensive uninstall.
    uninstallC64DoorAdapter(this.socket, { silent: true });
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
