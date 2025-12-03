// LibraryManager.ts
// Extracted from AmigaDoorSession.ts - Phase 2: Core Library Management
// Handles Amiga library initialization, traps, and port management
// 2025-11-20

import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { ExecLibrary } from "./api/ExecLibrary.js";
import { AEDoorLibrary } from "./api/AEDoorLibrary.js";
import { DosLibrary } from "./api/DosLibrary.js";
import { IconLibrary } from "./api/IconLibrary.js";
import { UtilityLibrary } from "./api/UtilityLibrary.js";
import {
  MathFFPLibrary,
  MathTransLibrary,
  MathIEEEDoubBasLibrary,
  MathIEEEDoubTransLibrary,
  MathIEEESingBasLibrary,
  MathIEEESingTransLibrary,
} from "./api/MathLibrary";
import { LibraryTraps } from "./api/LibraryTraps.js";
import { XIMProtocol } from "./XIMProtocol.js";
import { DoorConfig, DoorConstants } from "./DoorTypes.js";
import { Socket } from "socket.io";
import * as path from "path";
import * as fs from "fs";
import { LibraryLoader } from "./loader/LibraryLoader.js";
import { PathManager } from "./api/PathManager.js";
import { BbsApiLibrary } from "./api/BbsApiLibrary.js";

const DEFAULT_ROM =
  "Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom";

export class LibraryManager {
  public execLibrary: ExecLibrary | null = null;
  public aedoorLibrary: AEDoorLibrary | null = null;
  public dosLibrary: DosLibrary | null = null;
  public iconLibrary: IconLibrary | null = null;
  public utilityLibrary: UtilityLibrary | null = null;
  public mathFFPLibrary: MathFFPLibrary | null = null;
  public mathTransLibrary: MathTransLibrary | null = null;
  public mathIEEEDoubBasLibrary: MathIEEEDoubBasLibrary | null = null;
  public mathIEEEDoubTransLibrary: MathIEEEDoubTransLibrary | null = null;
  public mathIEEESingBasLibrary: MathIEEESingBasLibrary | null = null;
  public mathIEEESingTransLibrary: MathIEEESingTransLibrary | null = null;
  public libraryTraps: LibraryTraps | null = null;
  public ximProtocol: XIMProtocol | null = null;
  public bbsApiLibrary: BbsApiLibrary | null = null;

  private emulator: MoiraEmulator;
  private socket: Socket;
  private config: DoorConfig;
  private isBullsDoor: boolean = false;
  private doorPortAddress: number = 0;
  private aePortAddress: number = 0;
  private doorReplyPortAddr: number = 0;
  private useXimProtocol: boolean = false;
  private pathManager: PathManager | null = null;
  private bbsRoot: string = "";

  constructor(emulator: MoiraEmulator, socket: Socket, config: DoorConfig) {
    this.emulator = emulator;
    this.socket = socket;
    this.config = config;
    this.isBullsDoor = path
      .basename(config.executablePath)
      .toLowerCase()
      .includes("bull");
  }

  async initialize(): Promise<void> {
    await this.initializeExec();
  }

  private resolveBbsRoot(): string {
    const sessionRoot =
      (this.config.bbsSession?.bbsRoot as string | undefined) ||
      (this.config.bbsSession?.dataDir as string | undefined);
    const envRoot =
      process.env.BBS_DATA_DIR || process.env.BBS_ROOT || sessionRoot;
    const resolved = envRoot
      ? path.resolve(envRoot)
      : path.resolve(__dirname, "../../../..");
    this.bbsRoot = resolved;
    return resolved;
  }

  private resolveRomPath(): string {
    const romName = process.env.AEDOOR_ROM_FILE || DEFAULT_ROM;
    const candidates = [
      path.join(this.bbsRoot, "data", "amiga-roms", romName),
      path.join(process.cwd(), "data", "amiga-roms", romName),
      path.resolve(__dirname, "..", "..", "data", "amiga-roms", romName),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    throw new Error(
      `Kickstart ROM not found. Tried: ${candidates.join(", ")}`
    );
  }

  private async initializeExec(): Promise<void> {
    const projectRoot = this.resolveBbsRoot();
    console.log(`[LibraryManager] BBS root resolved to ${projectRoot}`);
    console.log("[LibraryManager] Loading Kickstart ROM...");

    const romPath = this.resolveRomPath();
    const romData = fs.readFileSync(romPath);
    this.emulator.loadROM(new Uint8Array(romData));

    console.log(
      "[LibraryManager] Kickstart ROM loaded - provides ROM routines"
    );

    console.log("[LibraryManager] Creating ExecBase structure...");

    this.execLibrary = new ExecLibrary(this.emulator);
    this.execLibrary.initialize();
    this.execLibrary.setWaitPortReturnCallback((addr: number) => {
      if (this.isBullsDoor) {
        // Store for Bulls handling (will be used by BullsDoorHandler)
        console.log(
          `[LibraryManager] WaitPort return PC recorded: 0x${addr.toString(16)}`
        );
      }
    });

    if (!this.execLibrary.loadRealAEDoorLibrary()) {
      console.warn("[LibraryManager] Real AEDoor.library failed to load");
    }

    const libraryLoader = new LibraryLoader(this.emulator);
    libraryLoader.addSearchPath(path.join(process.cwd(), "Libs"));
    this.execLibrary.setLibraryLoader(libraryLoader, true);

    // Pre-register any libraries present on disk so getLibraryBase() can
    // resolve them before OpenLibrary is invoked.
    this.registerLibrariesFromDisk(path.join(this.bbsRoot, "Libs"));
    this.registerLibrariesFromDisk(path.join(this.bbsRoot, "System", "Libs"));

    const doorType = this.config.doorType || "SIM";
    const nodeId = this.config.bbsSession?.nodeId || 0;

    console.log(`[LibraryManager] Door type: ${doorType}`);

    // Per express.e:4316-4320: XIM doors use AEDoorPort{n}, SIM/SUP/TIM/IIM use DoorControl{n}
    const isSIMType = doorType === "SIM" || doorType === "SUP" || doorType === "TIM" || doorType === "IIM";
    const basePortName = isSIMType ? "DoorControl" : "AEDoorPort";

    console.log(`[LibraryManager] Creating ${basePortName} for BBS data access...`);

    // Amiga doors call FindPort with 1-based node numbers.
    // Our session nodeId may be 0-based; normalize to 1-based for public port naming.
    const amigaNodeId = nodeId === 0 ? 1 : nodeId;
    const portName = `${basePortName}${amigaNodeId}`;
    const portAddr = this.execLibrary.createPublicPort(portName);
    this.execLibrary.setDoorPortAddress(portAddr);
    console.log(
      `[LibraryManager] Created ${portName} at 0x${portAddr.toString(16)}`
    );

    const simplePortAddr = this.execLibrary.createPublicPort(basePortName);
    console.log(
      `[LibraryManager] Created ${basePortName} (simple) at 0x${simplePortAddr.toString(
        16
      )}`
    );
    // Also register the raw nodeId variant if different, to satisfy any 0-based lookups.
    if (nodeId !== amigaNodeId) {
      const zeroBasedName = `${basePortName}${nodeId}`;
      const zeroBasedAddr = this.execLibrary.createPublicPort(zeroBasedName);
      console.log(
        `[LibraryManager] Created ${zeroBasedName} at 0x${zeroBasedAddr.toString(
          16
        )}`
      );
    }

    // CRITICAL FIX: Create BOTH port naming conventions to support all door types
    // Some doors are misdetected, so create alternate port names for compatibility
    const altBasePortName = isSIMType ? "AEDoorPort" : "DoorControl";
    console.log(`[LibraryManager] Creating alternate port names (${altBasePortName}) for compatibility...`);

    this.execLibrary.createPublicPort(`${altBasePortName}${amigaNodeId}`);
    this.execLibrary.createPublicPort(altBasePortName);
    if (nodeId !== amigaNodeId) {
      this.execLibrary.createPublicPort(`${altBasePortName}${nodeId}`);
    }
    console.log(`[LibraryManager] Alternate ports created - doors can FindPort with either naming convention`);

    this.doorPortAddress = portAddr;
    this.aePortAddress = portAddr;

    // Initialize PathManager assigns based on BBS root/dataDir and optional overrides from config.assigns
    // Resolve the BBS root reliably from this source path to avoid depending on cwd
    this.pathManager = new PathManager(projectRoot);
    if (this.config.assigns) {
      for (const [assign, target] of Object.entries(this.config.assigns)) {
        this.pathManager.addAssign(assign, target);
      }
    }
    const doorDir = path.dirname(this.config.executablePath);
    this.pathManager.setProgDir(doorDir);

    const useXimProtocol = doorType !== "SIM" && doorType !== "SUP";
    this.useXimProtocol = useXimProtocol;

    // Create icon.library BEFORE XIMProtocol so it can pre-load command .info files
    console.log("[LibraryManager] Creating icon.library...");
    const bbsRoot = projectRoot;
    this.ensureAnswerFiles(bbsRoot);
    this.iconLibrary = new IconLibrary(this.emulator, bbsRoot);
    // Set door directory for PROGDIR: support in GetDiskObject
    this.iconLibrary.setDoorDirectory(doorDir);

    if (useXimProtocol) {
      console.log("[LibraryManager] Creating XIM Protocol handler...");
      this.ximProtocol = new XIMProtocol(
        this.emulator,
        this.execLibrary,
        this.socket,
        portAddr,
        this.config.bbsSession,
        this.iconLibrary  // Pass iconLibrary for command .info file loading
      );
    } else {
      console.log(
        `[LibraryManager] Skipping XIM protocol for ${doorType} door`
      );
    }

    console.log("[LibraryManager] Creating DOS.library...");

    this.dosLibrary = new DosLibrary(this.emulator, projectRoot);
    this.dosLibrary.setBasePaths(projectRoot);
    this.dosLibrary.setEnvironment(this.config.env);
    this.dosLibrary.setInheritedHandles(1, 2);

    console.log(
      `[LibraryManager] Enabling FileManager with base directory: ${projectRoot}`
    );
    this.dosLibrary.enableNewFileSystem(projectRoot, this.pathManager || undefined);
    // Ensure PROGDIR: and CurrentDir point at the door folder so relative opens hit the right files
    this.dosLibrary.setDoorDirectory(doorDir);

    const stdoutRedirect = process.env.AEDOOR_STDOUT || process.env.AEDOOR_STDOUT_PATH;
    if (stdoutRedirect) {
      this.dosLibrary.redirectStdout(stdoutRedirect);
    }

    this.dosLibrary.setOutputRawCallback((buf: Buffer) => {
      const bbsSession: any = this.config.bbsSession || {};
      if (bbsSession.transferRawActive) {
        this.socket.emit('transfer-raw:echo', buf);
        return;
      }
      const text = buf.toString('latin1');
      this.socket.emit("ansi-output", text);
    });
    this.dosLibrary.setOutputCallback((text: string) => {
      const bbsSession: any = this.config.bbsSession || {};
      if (bbsSession.transferRawActive) {
        this.socket.emit('transfer-raw:echo', Buffer.from(text, 'latin1'));
        return;
      }
      this.socket.emit("ansi-output", text);
    });
    console.log("[LibraryManager] DOS.library output callback configured");

    // Expose raw input hook to the session so socket-handlers can feed transfer-raw data
    const bbsSession: any = this.config.bbsSession || {};
    bbsSession.serialInputHook = (data: Buffer) => {
      this.dosLibrary?.queueInput(data);
    };

    console.log("[LibraryManager] Creating AEDoor.library...");

    this.aedoorLibrary = new AEDoorLibrary(
      this.socket,
      this.emulator,
      this.execLibrary,
      this.config.bbsSession || {}
    );

    console.log("[LibraryManager] Creating utility.library...");

    this.utilityLibrary = new UtilityLibrary(this.emulator, this.socket);

    console.log("[LibraryManager] Creating math libraries...");

    this.mathFFPLibrary = new MathFFPLibrary(this.emulator);
    this.mathTransLibrary = new MathTransLibrary(this.emulator);
    this.mathIEEEDoubBasLibrary = new MathIEEEDoubBasLibrary(this.emulator);
    this.mathIEEEDoubTransLibrary = new MathIEEEDoubTransLibrary(this.emulator);
    this.mathIEEESingBasLibrary = new MathIEEESingBasLibrary(this.emulator);
    this.mathIEEESingTransLibrary = new MathIEEESingTransLibrary(this.emulator);

    console.log("[LibraryManager] Installing library call traps...");

    this.libraryTraps = new LibraryTraps(this.emulator, this.execLibrary);

    this.emulator.setLibraryTrapHandler((pc: number) => {
      return this.libraryTraps!.handleTrap(pc);
    });

    // Reset allocator base after bootstrapping ports/libraries
    // Use 0x100000 (1MB) to avoid overlap with door code segments (0x1000-0x100000)
    this.execLibrary.setAllocBase(0x100000);

    this.libraryTraps.installExecVectors();

    this.libraryTraps.setDOSLibrary(this.dosLibrary);
    this.libraryTraps.setAEDoorLibrary(this.aedoorLibrary);
    this.libraryTraps.setIconLibrary(this.iconLibrary);
    this.libraryTraps.setUtilityLibrary(this.utilityLibrary);
    this.libraryTraps.setMathFFPLibrary(this.mathFFPLibrary);
    this.libraryTraps.setMathTransLibrary(this.mathTransLibrary);
    this.libraryTraps.setMathIEEEDoubBasLibrary(this.mathIEEEDoubBasLibrary);
    this.libraryTraps.setMathIEEEDoubTransLibrary(this.mathIEEEDoubTransLibrary);
    this.libraryTraps.setMathIEEESingBasLibrary(this.mathIEEESingBasLibrary);
    this.libraryTraps.setMathIEEESingTransLibrary(this.mathIEEESingTransLibrary);

    // Pre-open utility.library and install vectors immediately
    // Some doors use utility.library functions without calling OpenLibrary first
    console.log("[LibraryManager] Pre-opening utility.library and installing vectors...");
    this.execLibrary.openLibraryHybrid("utility.library", 37);
    this.libraryTraps.installUtilityVectors();

    this.execLibrary.setLibraryOpenedCallback((name: string, addr: number) => {
      if (name.toLowerCase() === "dos.library") {
        console.log(
          "[LibraryManager] dos.library opened, installing vectors..."
        );
        this.libraryTraps!.installDOSVectors();
      }
      if (name.toLowerCase() === "aedoor.library") {
        console.log(
          "[LibraryManager] AEDoor.library opened, installing vectors..."
        );
        this.libraryTraps!.installAEDoorVectors();
      }
      if (name.toLowerCase() === "icon.library") {
        console.log(
          "[LibraryManager] icon.library opened, installing vectors..."
        );
        this.libraryTraps!.installIconVectors();
      }
      if (name.toLowerCase() === "utility.library") {
        console.log(
          "[LibraryManager] utility.library opened, installing vectors..."
        );
        this.libraryTraps!.installUtilityVectors();
      }
      if (name.toLowerCase() === "mathffp.library") {
        console.log("[LibraryManager] mathffp.library opened, installing vectors...");
        this.libraryTraps!.installMathFFPVectors();
      }
      if (name.toLowerCase() === "mathtrans.library") {
        console.log("[LibraryManager] mathtrans.library opened, installing vectors...");
        this.libraryTraps!.installMathTransVectors();
      }
      if (name.toLowerCase() === "mathieeedoubbas.library") {
        console.log("[LibraryManager] mathieeedoubbas.library opened, installing vectors...");
        this.libraryTraps!.installMathIEEEDoubBasVectors();
      }
      if (name.toLowerCase() === "mathieeedoubtrans.library") {
        console.log("[LibraryManager] mathieeedoubtrans.library opened, installing vectors...");
        this.libraryTraps!.installMathIEEEDoubTransVectors();
      }
      if (name.toLowerCase() === "mathieeesingbas.library") {
        console.log("[LibraryManager] mathieeesingbas.library opened, installing vectors...");
        this.libraryTraps!.installMathIEEESingBasVectors();
      }
      if (name.toLowerCase() === "mathieeesingtrans.library") {
        console.log("[LibraryManager] mathieeesingtrans.library opened, installing vectors...");
        this.libraryTraps!.installMathIEEESingTransVectors();
      }
      if (
        name.toLowerCase() === "graphics.library" ||
        name.toLowerCase() === "intuition.library"
      ) {
        console.log(
          `[LibraryManager] ${name} opened, installing stub vectors from LVOs.i...`
        );
        this.libraryTraps!.installStubVectorsForLibrary(name, addr);
      }
      // Always install any known LVO stubs for newly opened libraries to avoid missing traps
      this.libraryTraps!.installStubVectorsForLibrary(name, addr);
    });

    this.execLibrary.setDoorMessageCallback(
      (portAddr: number, msgAddr: number) => {
        // Will be handled by DoorMessageHandler in Phase 5
        console.log(
          "[LibraryManager] Door message callback - to be handled by message handler"
        );
      }
    );

    // Set up BBS API dispatcher for SIM doors (0x790 calling convention)
    if (isSIMType) {
      console.log("[LibraryManager] Setting up BBS API dispatcher for SIM door...");

      // Initialize low-memory region (parameter blocks at 0x794, 0x79c)
      BbsApiLibrary.setupLowMemory(this.emulator);

      // Create BBS API library instance
      // Note: AmigaDoorSession is not available here, so we pass session data via config
      this.bbsApiLibrary = new BbsApiLibrary(
        this.config.bbsSession as any,
        this.emulator
      );

      // Allocate memory for trap instruction (ILLEGAL = 0x4AFC)
      const trapAddr = this.execLibrary.allocMem(4, 0); // 4 bytes, any memory
      if (trapAddr === 0) {
        console.error("[LibraryManager] Failed to allocate memory for BBS API trap!");
      } else {
        // Write ILLEGAL instruction at trap address
        this.emulator.writeMemory16(trapAddr, 0x4AFC);

        // Register trap handler
        this.libraryTraps!.registerCustomTrap(
          trapAddr,
          "BBS_API_DISPATCHER",
          (emu: MoiraEmulator) => {
            // Call BBS API dispatcher
            const result = this.bbsApiLibrary!.dispatch();
            return result;
          },
          this.bbsApiLibrary
        );

        // Write trap address to 0x790 so WHO can find it
        this.emulator.writeMemory32(0x790, trapAddr);

        console.log(
          `[LibraryManager] BBS API dispatcher installed at 0x${trapAddr.toString(16)}`
        );
        console.log(
          `[LibraryManager] Function pointer written to 0x790 → 0x${trapAddr.toString(16)}`
        );

        // Verify the value was written correctly
        const verifyValue = this.emulator.readMemory32(0x790);
        console.log(
          `[LibraryManager] Verification: 0x790 contains 0x${verifyValue.toString(16)}`
        );

        // Also verify the ILLEGAL instruction is at the trap address
        const trapInstruction = this.emulator.readMemory16(trapAddr);
        console.log(
          `[LibraryManager] Verification: ILLEGAL instruction at 0x${trapAddr.toString(16)} = 0x${trapInstruction.toString(16)}`
        );
      }
    }

    console.log("[LibraryManager] Library system ready");
  }

  private ensureAnswerFiles(bbsRoot: string): void {
    try {
      const nodeId = this.config.bbsSession?.nodeId ?? 1;
      const amigaNodeId = nodeId === 0 ? 1 : nodeId;
      const nodeDir = path.join(bbsRoot, `Node${amigaNodeId}`);

      const dirs = [
        path.join(bbsRoot, "Answers"),
        path.join(nodeDir, "Answers"),
        path.join(nodeDir, "TempAns"),
      ];

      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
    } catch (error) {
      console.warn("[LibraryManager] Failed to ensure Answers directories", error);
    }
  }

  private registerLibrariesFromDisk(dir: string): void {
    if (!this.execLibrary) return;
    try {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const name = entry.name;
        if (!name.toLowerCase().endsWith(".library")) continue;
        this.execLibrary.registerLibraryPlaceholder(name);
      }
    } catch (err) {
      console.warn(
        `[LibraryManager] Failed to pre-register libraries from ${dir}:`,
        err
      );
    }
  }

  getExecBaseAddress(): number {
    return this.execLibrary ? this.execLibrary.getExecBaseAddress() : 0;
  }

  getDoorPortAddress(): number {
    return this.doorPortAddress;
  }

  getReplyPortAddress(): number {
    return this.doorReplyPortAddr;
  }

  getUseXimProtocol(): boolean {
    return this.useXimProtocol;
  }
}
