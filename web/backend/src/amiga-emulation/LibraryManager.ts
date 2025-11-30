// LibraryManager.ts
// Extracted from AmigaDoorSession.ts - Phase 2: Core Library Management
// Handles Amiga library initialization, traps, and port management
// 2025-11-20

import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { ExecLibrary } from "./api/ExecLibrary.js";
import { AEDoorLibrary } from "./api/AEDoorLibrary.js";
import { DosLibrary } from "./api/DosLibrary.js";
import { IconLibrary } from "./api/IconLibrary.js";
import { LibraryTraps } from "./api/LibraryTraps.js";
import { XIMProtocol } from "./XIMProtocol.js";
import { DoorConfig, DoorConstants } from "./DoorTypes.js";
import { Socket } from "socket.io";
import * as path from "path";
import * as fs from "fs";
import { LibraryLoader } from "./loader/LibraryLoader.js";
import { PathManager } from "./api/PathManager.js";

export class LibraryManager {
  public execLibrary: ExecLibrary | null = null;
  public aedoorLibrary: AEDoorLibrary | null = null;
  public dosLibrary: DosLibrary | null = null;
  public iconLibrary: IconLibrary | null = null;
  public libraryTraps: LibraryTraps | null = null;
  public ximProtocol: XIMProtocol | null = null;

  private emulator: MoiraEmulator;
  private socket: Socket;
  private config: DoorConfig;
  private isBullsDoor: boolean = false;
  private doorPortAddress: number = 0;
  private aePortAddress: number = 0;
  private doorReplyPortAddr: number = 0;
  private useXimProtocol: boolean = false;
  private pathManager: PathManager | null = null;

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

  private async initializeExec(): Promise<void> {
    console.log("[LibraryManager] Loading Kickstart ROM...");

    const romBase = path.resolve(__dirname, "..", "..", "data", "amiga-roms");
    const romPath = path.join(
      romBase,
      "Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom"
    );
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

    const doorType = this.config.doorType || "SIM";
    const nodeId = this.config.bbsSession?.nodeId || 0;

    console.log(`[LibraryManager] Door type: ${doorType}`);

    console.log("[LibraryManager] Creating AEDoorPort for BBS data access...");

    // Amiga doors (including Bulls) call FindPort("AEDoorPort<n>") with 1-based node numbers.
    // Our session nodeId may be 0-based; normalize to 1-based for public port naming.
    const amigaNodeId = nodeId === 0 ? 1 : nodeId;
    const portName = `AEDoorPort${amigaNodeId}`;
    const portAddr = this.execLibrary.createPublicPort(portName);
    this.execLibrary.setDoorPortAddress(portAddr);
    console.log(
      `[LibraryManager] Created ${portName} at 0x${portAddr.toString(16)}`
    );

    const simplePortAddr = this.execLibrary.createPublicPort("AEDoorPort");
    console.log(
      `[LibraryManager] Created AEDoorPort (simple) at 0x${simplePortAddr.toString(
        16
      )}`
    );
    // Also register the raw nodeId variant if different, to satisfy any 0-based lookups.
    if (nodeId !== amigaNodeId) {
      const zeroBasedName = `AEDoorPort${nodeId}`;
      const zeroBasedAddr = this.execLibrary.createPublicPort(zeroBasedName);
      console.log(
        `[LibraryManager] Created ${zeroBasedName} at 0x${zeroBasedAddr.toString(
          16
        )}`
      );
    }

    this.doorPortAddress = portAddr;
    this.aePortAddress = portAddr;

    // Initialize PathManager assigns based on BBS root/dataDir and optional overrides from config.assigns
    // Resolve the BBS root reliably from this source path to avoid depending on cwd
    const projectRoot =
      process.env.BBS_ROOT || path.resolve(__dirname, "../../../..");
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

    if (useXimProtocol) {
      console.log("[LibraryManager] Creating XIM Protocol handler...");
      this.ximProtocol = new XIMProtocol(
        this.emulator,
        this.execLibrary,
        this.socket,
        portAddr,
        this.config.bbsSession
      );
    } else {
      console.log(
        `[LibraryManager] Skipping XIM protocol for ${doorType} door`
      );
    }

    console.log("[LibraryManager] Creating DOS.library...");

    this.dosLibrary = new DosLibrary(this.emulator);
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

    console.log("[LibraryManager] Creating icon.library...");

    const bbsRoot = projectRoot;
    this.ensureAnswerFiles(bbsRoot);
    this.iconLibrary = new IconLibrary(this.emulator, bbsRoot);

    console.log("[LibraryManager] Installing library call traps...");

    this.libraryTraps = new LibraryTraps(this.emulator, this.execLibrary);

    this.emulator.setLibraryTrapHandler((pc: number) => {
      return this.libraryTraps!.handleTrap(pc);
    });

    // Reset allocator base after bootstrapping ports/libraries to match vamos expectations
    this.execLibrary.setAllocBase(0x0090d0);

    this.libraryTraps.installExecVectors();

    this.libraryTraps.setDOSLibrary(this.dosLibrary);
    this.libraryTraps.setAEDoorLibrary(this.aedoorLibrary);
    this.libraryTraps.setIconLibrary(this.iconLibrary);

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
      if (
        name.toLowerCase() === "graphics.library" ||
        name.toLowerCase() === "intuition.library" ||
        name.toLowerCase() === "utility.library"
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
