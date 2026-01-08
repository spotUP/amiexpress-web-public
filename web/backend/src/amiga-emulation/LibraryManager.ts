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
import { IntuitionLibrary } from "./api/IntuitionLibrary";
import { LibraryTraps } from "./api/LibraryTraps.js";
import { XIMProtocol } from "./XIMProtocol.js";
import { DoorConfig, DoorConstants } from "./DoorTypes.js";
import { Socket } from "socket.io";
import * as path from "path";
import * as fs from "fs";
import * as amigafs from "../utils/amigafs";
import { LibraryLoader } from "./loader/LibraryLoader.js";
import { PathManager } from "./api/PathManager.js";
import { BbsApiLibrary } from "./api/BbsApiLibrary.js";
import { DoorLogger } from "./DoorLogger.js";
import { KickstartRom } from "./KickstartRom.js";
import { spawnSync } from "child_process";

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
  public intuitionLibrary: IntuitionLibrary | null = null;
  public libraryTraps: LibraryTraps | null = null;
  public ximProtocol: XIMProtocol | null = null;
  public bbsApiLibrary: BbsApiLibrary | null = null;

  private emulator: MoiraEmulator;
  private socket: Socket;
  private config: DoorConfig;
  private doorPortAddress: number = 0;
  private aePortAddress: number = 0;
  private doorReplyPortAddr: number = 0;
  private useXimProtocol: boolean = false;
  private pathManager: PathManager | null = null;
  private bbsRoot: string = "";
  private logger: DoorLogger | null = null;
  private kickstartRom: KickstartRom | null = null;

  constructor(emulator: MoiraEmulator, socket: Socket, config: DoorConfig, logger?: DoorLogger, kickstartRom?: KickstartRom | null) {
    this.emulator = emulator;
    this.socket = socket;
    this.config = config;
    this.logger = logger || null;
    this.kickstartRom = kickstartRom || null;
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

  private resolveRomSource(): { kind: "kickstart"; path: string } | { kind: "aros"; romPath: string; extPath: string } {
    const romPref = (process.env.AEDOOR_ROM || "").toLowerCase();
    const preferKickstart = romPref === "kickstart" || romPref === "";
    const romName = process.env.AEDOOR_ROM_FILE || DEFAULT_ROM;
    const kickCandidates = [
      path.join(this.bbsRoot, "data", "amiga-roms", romName),
      path.join(process.cwd(), "data", "amiga-roms", romName),
      path.resolve(__dirname, "..", "..", "data", "amiga-roms", romName),
      path.resolve(__dirname, "..", "..", "..", "data", "amiga-roms", romName),
      path.resolve(__dirname, "..", "..", "..", "..", "data", "amiga-roms", romName),
    ];

    for (const candidate of kickCandidates) {
      if (amigafs.existsSync(candidate)) {
        if (preferKickstart) {
          return { kind: "kickstart", path: candidate };
        }
      }
    }

    const arosDirs = [
      path.join(this.bbsRoot, "data", "amiga-roms"),
      path.join(process.cwd(), "data", "amiga-roms"),
      path.resolve(__dirname, "..", "..", "data", "amiga-roms"),
      path.resolve(__dirname, "..", "..", "..", "data", "amiga-roms"),
      path.resolve(__dirname, "..", "..", "..", "..", "data", "amiga-roms"),
    ];

    for (const dir of arosDirs) {
      const romPath = path.join(dir, "aros-rom.bin");
      const extPath = path.join(dir, "aros-ext.bin");
      if (amigafs.existsSync(romPath) && amigafs.existsSync(extPath)) {
        if (!preferKickstart) {
          return { kind: "aros", romPath, extPath };
        }
      }
    }

    if (preferKickstart) {
      for (const dir of arosDirs) {
        const romPath = path.join(dir, "aros-rom.bin");
        const extPath = path.join(dir, "aros-ext.bin");
        if (amigafs.existsSync(romPath) && amigafs.existsSync(extPath)) {
          return { kind: "aros", romPath, extPath };
        }
      }
    } else {
      for (const candidate of kickCandidates) {
        if (amigafs.existsSync(candidate)) {
          return { kind: "kickstart", path: candidate };
        }
      }
    }

    throw new Error(
      `ROM not found. Tried Kickstart: ${kickCandidates.join(", ")}; AROS: ${arosDirs
        .map((dir) => `${dir}/aros-rom.bin + ${dir}/aros-ext.bin`)
        .join(", ")}`
    );
  }

  /**
   * Ensure essential ROM libraries are available on disk by extracting them
   * from a supported Kickstart image once. This is generic (no per-door hacks).
   */
  private ensureRomLibrariesExtracted(romPath: string, projectRoot: string): void {
    try {
      const libsDir = path.join(projectRoot, "Libs");
      const systemDir = path.join(projectRoot, "System");
      const systemLibsDir = path.join(systemDir, "Libs");
      const devsDir = path.join(projectRoot, "Devs");
      const systemDevsDir = path.join(systemDir, "Devs");
      const resourcesDir = path.join(projectRoot, "Resources");
      const systemResourcesDir = path.join(systemDir, "Resources");
      const datatypesDir = path.join(projectRoot, "Classes", "Datatypes");
      const systemDatatypesDir = path.join(systemDir, "Classes", "Datatypes");
      const lDir = path.join(projectRoot, "L");
      const systemLDir = path.join(systemDir, "L");
      const fontsDir = path.join(projectRoot, "Fonts");
      const systemFontsDir = path.join(systemDir, "Fonts");
      const localeDir = path.join(projectRoot, "Locale");
      const systemLocaleDir = path.join(systemDir, "Locale");
      const catalogsDir = path.join(localeDir, "Catalogs");
      const systemCatalogsDir = path.join(systemLocaleDir, "Catalogs");
      const prefsDir = path.join(projectRoot, "Prefs");
      const systemPrefsDir = path.join(systemDir, "Prefs");
      const keymapsDir = path.join(devsDir, "Keymaps");
      const systemKeymapsDir = path.join(systemDevsDir, "Keymaps");
      const monitorsDir = path.join(devsDir, "Monitors");
      const systemMonitorsDir = path.join(systemDevsDir, "Monitors");
      const romDir = path.join(projectRoot, "ROM");
      const systemRomDir = path.join(systemDir, "ROM");

      // romtool must be present to split modules
      const which = spawnSync("which", ["romtool"], { encoding: "utf-8" });
      if (which.status !== 0 || !which.stdout.trim()) {
console.warn("[LibraryManager] romtool not found; cannot extract ROM libraries");
        return;
      }

      const outDir = path.join(projectRoot, "tmp", "rom-extract");
      const stampPath = path.join(outDir, ".stamp");
      fs.mkdirSync(outDir, { recursive: true });

      const romStat = fs.statSync(romPath);
      const stamp = `${romPath}|${romStat.size}|${romStat.mtimeMs}`;
      const existingStamp = amigafs.existsSync(stampPath) ? fs.readFileSync(stampPath, "utf-8").trim() : "";
      if (existingStamp !== stamp) {
        const split = spawnSync("romtool", ["split", romPath, "-o", outDir, "--no-version-dir"], {
          encoding: "utf-8",
        });
        if (split.status !== 0) {
console.warn("[LibraryManager] romtool split failed:", split.stderr || split.stdout);
          return;
        }
        fs.writeFileSync(stampPath, stamp);
      }

      const entries = amigafs.readdirSync(outDir);
      const copyTo = (src: string, targets: string[]): void => {
        for (const target of targets) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          if (amigafs.existsSync(target)) continue;
          fs.copyFileSync(src, target);
console.log(`[LibraryManager] Extracted ${path.basename(target)} from ROM → ${target}`);
        }
      };

      const libTargets = [libsDir, systemLibsDir];
      const devTargets = [devsDir, systemDevsDir];
      const resTargets = [resourcesDir, systemResourcesDir];
      const dtTargets = [datatypesDir, systemDatatypesDir];
      const lTargets = [lDir, systemLDir];
      const fontTargets = [fontsDir, systemFontsDir];
      const localeTargets = [localeDir, systemLocaleDir];
      const catalogTargets = [catalogsDir, systemCatalogsDir];
      const prefsTargets = [prefsDir, systemPrefsDir];
      const keymapTargets = [keymapsDir, systemKeymapsDir];
      const monitorTargets = [monitorsDir, systemMonitorsDir];
      const romTargets = [romDir, systemRomDir];

      entries.forEach((entry) => {
        const src = path.join(outDir, entry);
        if (!amigafs.existsSync(src) || fs.statSync(src).isDirectory()) {
          return;
        }

        const lower = entry.toLowerCase();
        if (lower.endsWith(".library")) {
          copyTo(src, libTargets.map((dir) => path.join(dir, entry)));
          return;
        }
        if (lower.endsWith(".device")) {
          copyTo(src, devTargets.map((dir) => path.join(dir, entry)));
          return;
        }
        if (lower.endsWith(".resource")) {
          copyTo(src, resTargets.map((dir) => path.join(dir, entry)));
          return;
        }
        if (lower.endsWith(".datatype")) {
          copyTo(src, dtTargets.map((dir) => path.join(dir, entry)));
          return;
        }
        if (lower.endsWith(".handler") || lower.endsWith(".filesystem")) {
          copyTo(src, lTargets.map((dir) => path.join(dir, entry)));
          return;
        }
        if (lower.endsWith(".keymap")) {
          copyTo(src, keymapTargets.map((dir) => path.join(dir, entry)));
          return;
        }
        if (lower.endsWith(".monitor")) {
          copyTo(src, monitorTargets.map((dir) => path.join(dir, entry)));
          return;
        }
        if (lower.endsWith(".font")) {
          copyTo(src, fontTargets.map((dir) => path.join(dir, entry)));
          return;
        }
        if (lower.endsWith(".prefs")) {
          copyTo(src, prefsTargets.map((dir) => path.join(dir, entry)));
          return;
        }
        if (lower.endsWith(".catalog")) {
          copyTo(src, catalogTargets.map((dir) => path.join(dir, entry)));
          return;
        }
        if (lower.endsWith(".locale") || lower.endsWith(".language")) {
          copyTo(src, localeTargets.map((dir) => path.join(dir, entry)));
          return;
        }

        // Fallback: keep everything else under ROM/ for completeness.
        copyTo(src, romTargets.map((dir) => path.join(dir, entry)));
      });
    } catch (err) {
console.warn("[LibraryManager] Failed to extract ROM libraries", err);
    }
  }

  private async initializeExec(): Promise<void> {
    const projectRoot = this.resolveBbsRoot();
console.log(`[LibraryManager] BBS root resolved to ${projectRoot}`);
console.log("[LibraryManager] Loading ROM...");

    const romSource = this.resolveRomSource();
    let romPath: string | null = null;

    const usingKickstart = romSource.kind === "kickstart";
    if (usingKickstart) {
      romPath = romSource.path;
      const romData = fs.readFileSync(romPath);
      this.emulator.loadROM(new Uint8Array(romData));
console.log("[LibraryManager] Kickstart ROM loaded - provides ROM routines");
    } else {
console.warn("[LibraryManager] Kickstart ROM not found; using AROS ROM fallback.");
      const arosRom = fs.readFileSync(romSource.romPath);
      const arosExt = fs.readFileSync(romSource.extPath);
      const combined = Buffer.concat([arosRom, arosExt]);
      this.emulator.loadROM(new Uint8Array(combined));
console.log("[LibraryManager] AROS ROM loaded - provides ROM routines");

      // Best-effort: allow romtool to try extracting libraries from AROS ROM.
      const combinedPath = path.join(projectRoot, "tmp", "aros-combined.rom");
      try {
        fs.mkdirSync(path.dirname(combinedPath), { recursive: true });
        if (!amigafs.existsSync(combinedPath)) {
          fs.writeFileSync(combinedPath, combined);
        }
        romPath = combinedPath;
      } catch (err) {
console.warn("[LibraryManager] Failed to persist combined AROS ROM for extraction", err);
      }
    }

console.log("[LibraryManager] Creating ExecBase structure...");

    this.execLibrary = new ExecLibrary(this.emulator);
    this.execLibrary.initialize();

    const libraryLoader = new LibraryLoader(this.emulator, undefined, this.kickstartRom);
    // Prefer real Amiga libraries when present on disk (repo / BBS root paths).
    // addSearchPath() unshifts, so add in reverse priority order.
    libraryLoader.addSearchPath(path.join(process.cwd(), "Libs"));
    libraryLoader.addSearchPath(path.join(projectRoot, "System", "Libs"));
    libraryLoader.addSearchPath(path.join(projectRoot, "Libs"));
    this.execLibrary.setLibraryLoader(libraryLoader, true);
console.log(
      `[LibraryManager] Native library loading: enabled (${usingKickstart ? "Kickstart ROM" : "AROS ROM"})`
    );

    // If a supported Kickstart is present, extract key libraries to disk once so
    // doors can load real binaries instead of stubs. This is generic and runs
    // only when files are missing.
    if (romPath) {
      this.ensureRomLibrariesExtracted(romPath, projectRoot);
    }

    if (!this.execLibrary.loadRealAEDoorLibrary()) {
console.warn("[LibraryManager] Real AEDoor.library failed to load");
    }

    // Pre-register any libraries present on disk so getLibraryBase() can
    // resolve them before OpenLibrary is invoked.
    this.registerLibrariesFromDisk(path.join(this.bbsRoot, "Libs"));
    this.registerLibrariesFromDisk(path.join(this.bbsRoot, "System", "Libs"));

    // Normalize and update doorType in config to ensure consistency throughout initialization
    const doorType = (this.config.doorType || "SIM").toUpperCase();
    const nodeId = this.config.bbsSession?.nodeId || 0;

console.log(`[LibraryManager] Door type: ${doorType}`);

    // CRITICAL: isSIMType must be calculated using the final normalized doorType
    const isSIMType = doorType === "SIM" || doorType === "SUP" || doorType === "TIM" || doorType === "IIM";
    const basePortName = isSIMType ? "DoorControl" : "AEServer";

console.log(`[LibraryManager] Creating ${basePortName} for BBS data access...`);

    // Amiga doors call FindPort with 1-based node numbers.
    // Our session nodeId may be 0-based; normalize to 1-based for public port naming.
    const amigaNodeId = nodeId === 0 ? 1 : nodeId;
    // CRITICAL: AEServer ports use DOT notation: "AEServer.1", "AEServer.2", etc.
    const portName = basePortName === "AEServer" ? `${basePortName}.${amigaNodeId}` : `${basePortName}${amigaNodeId}`;
    const mainPortAddr = this.execLibrary.createPublicPort(portName);
    this.execLibrary.setDoorPortAddress(mainPortAddr);
console.log(
      `[LibraryManager] Created ${portName} at 0x${mainPortAddr.toString(16)}`
    );

    const simplePortName = basePortName === "AEServer" ? `${basePortName}.0` : basePortName;
    const simplePortAddr = this.execLibrary.createPublicPort(simplePortName);
console.log(
      `[LibraryManager] Created ${simplePortName} (simple) at 0x${simplePortAddr.toString(
        16
      )}`
    );
    // Also register the raw nodeId variant if different, to satisfy any 0-based lookups.
    if (nodeId !== amigaNodeId) {
      const zeroBasedName = basePortName === "AEServer" ? `${basePortName}.${nodeId}` : `${basePortName}${nodeId}`;
      const zeroBasedAddr = this.execLibrary.createPublicPort(zeroBasedName);
console.log(
        `[LibraryManager] Created ${zeroBasedName} at 0x${zeroBasedAddr.toString(
          16
        )}`
      );
    }

    // CRITICAL FIX: Create BOTH port naming conventions to support all door types
    // Some doors are misdetected, so create alternate port names for compatibility
    // XIM doors (like RTW) check for AEDoorPort{N} first, then fall back to AEServer.{N}
    // SIM doors check for DoorControl{N} first, then fall back to AEDoorPort{N}
    // CRITICAL: Do NOT pre-create these ports - XIM doors expect them to NOT exist at startup
    // RTW calls FindPort("AEDoorPort1") and exits with code 30 if found (assumes another instance running)
    // Doors create their own communication ports during initialization
    const altBasePortName = isSIMType ? "AEServer" : "AEDoorPort";
console.log(`[LibraryManager] Skipping alternate port pre-creation (${altBasePortName}) - doors create their own`);

    // REMOVED: this.execLibrary.createPublicPort(`${altBasePortName}${amigaNodeId}`);
    // REMOVED: this.execLibrary.createPublicPort(altBasePortName);
    // REMOVED: if (nodeId !== amigaNodeId) { this.execLibrary.createPublicPort(`${altBasePortName}${nodeId}`); }
console.log(`[LibraryManager] XIM doors will create their own ports when they initialize`);

    // Create AEServer ports for multinode doors (used for node status detection)
    // Doors call FindPort("AEServer.%d") to detect active nodes on the BBS
    // AmiExpress supported up to 255 nodes - create ports for all possible nodes
    // Use lightweight ports to avoid exhausting signal bits (only 32 available)
    // CRITICAL: Skip the current node's port - it's already been created as the main port above
    const maxAEServerNodes = 255;
console.log(`[LibraryManager] Creating lightweight AEServer ports for multinode support (0-254, skipping node ${nodeId})...`);
    for (let i = 0; i < maxAEServerNodes; i++) {
      // Skip current node - already created as main port
      if (i === nodeId || i === amigaNodeId) {
        continue;
      }
      this.execLibrary.createLightweightPort(`AEServer.${i}`);
    }
console.log(`[LibraryManager] AEServer.0-254 lightweight ports created (except node ${nodeId} - already exists as main port)`);

    // Create AREXX-format ports (AEDoorRP.XXX) for doors like RTW that use this naming convention
    // RTW and other doors look for "AEDoorRP.000", "AEDoorRP.001" etc. (3-digit zero-padded node IDs)
    // These are AREXX Rexx Port format names used for message passing
console.log(`[LibraryManager] Creating AREXX-format AEDoorRP ports for XIM door compatibility...`);
    for (let i = 0; i < 10; i++) {
      const rexxPortName = `AEDoorRP.${i.toString().padStart(3, '0')}`;
      this.execLibrary.createLightweightPort(rexxPortName);
    }
console.log(`[LibraryManager] AEDoorRP.000-009 AREXX ports created`);

    this.doorPortAddress = mainPortAddr;
    this.aePortAddress = mainPortAddr;

    // CRITICAL: Do NOT create DoorReplyPort - it doesn't exist in real AmiExpress!
    // Native AEDoor.library creates its own internal reply ports.
    // Real AmiExpress only creates:
    //   - AEServer.N (public, named) - BBS receives FROM doors
    //   - serverRP (private, unnamed) - BBS receives replies when sending TO doors
    // See express.e:13095 (serverRP) and express.e:13129 (AEServer)
    this.doorReplyPortAddr = 0; // Not used

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
    // Set door command for DOORUSE.* lookups (used by AquaScan and similar doors)
    if (this.config.doorId) {
      this.iconLibrary.setDoorCommand(this.config.doorId);
    } else if (this.config.bbsSession?.doorCommand) {
      this.iconLibrary.setDoorCommand(String(this.config.bbsSession.doorCommand));
    }

    if (useXimProtocol) {
console.log("[LibraryManager] Creating XIM Protocol handler...");
      this.ximProtocol = new XIMProtocol(
        this.emulator,
        this.execLibrary,
        this.socket,
        mainPortAddr,
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

    // Initialize environment variables for XIM doors
    const doorNodeId = this.config.bbsSession?.nodeNumber || 1;
    const doorUsername = this.config.bbsSession?.user?.username || 'Guest';
    const doorSecLevel = this.config.bbsSession?.user?.securityLevel || 1;
    const doorConfId = this.config.bbsSession?.currentConference || 1;
    this.dosLibrary.initializeEnvironmentVariables(doorNodeId, doorConfId, doorUsername, doorSecLevel);

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

    const normalizeAnsiNewlines = (data: string) => data.replace(/\r?\n/g, "\r\n");

    this.dosLibrary.setOutputRawCallback((buf: Buffer) => {
      const bbsSession: any = this.config.bbsSession || {};
      if (bbsSession.transferRawActive) {
        this.socket.emit('transfer-raw:echo', buf);
        return;
      }
      const text = normalizeAnsiNewlines(buf.toString('latin1'));
      this.socket.emit("ansi-output", text);
    });
    this.dosLibrary.setOutputCallback((text: string) => {
      const bbsSession: any = this.config.bbsSession || {};
      if (bbsSession.transferRawActive) {
        this.socket.emit('transfer-raw:echo', Buffer.from(text, 'latin1'));
        return;
      }
      this.socket.emit("ansi-output", normalizeAnsiNewlines(text));
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

console.log("[LibraryManager] Creating intuition.library...");
    this.intuitionLibrary = new IntuitionLibrary(this.emulator);

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
    this.libraryTraps.setIntuitionLibrary(this.intuitionLibrary);

    // Pre-open utility.library and install vectors immediately
    // Some doors use utility.library functions without calling OpenLibrary first
console.log("[LibraryManager] Pre-opening utility.library and installing vectors...");
    this.execLibrary.openLibraryHybrid("utility.library", 37, false);
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
      if (name.toLowerCase() === "intuition.library") {
console.log("[LibraryManager] intuition.library opened, installing vectors...");
        this.libraryTraps!.installIntuitionVectors();
      }
      if (name.toLowerCase() === "graphics.library") {
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

    // Ensure real dos.library is resident and vectors installed up front (generic)
    const dosHybrid = this.execLibrary.openLibraryHybrid("dos.library", 37, true);
    if (dosHybrid.success) {
      this.libraryTraps!.installDOSVectors();
console.log(
        `[LibraryManager] dos.library pre-opened (${dosHybrid.isNative ? "native" : "stub"}) at 0x${dosHybrid.address.toString(
          16
        )}`
      );
    } else {
console.warn("[LibraryManager] Failed to pre-open dos.library");
    }

    // Pre-open AEDoor.library so vectors are installed even before doors call OpenLibrary.
    const aedHybrid = this.execLibrary.openLibraryHybrid("AEDoor.library", 2, false);
    if (aedHybrid.success) {
      this.libraryTraps!.installAEDoorVectors();
console.log(
        `[LibraryManager] AEDoor.library pre-opened (${aedHybrid.isNative ? "native" : "stub"}) at 0x${aedHybrid.address.toString(
          16
        )}`
      );
    } else {
console.warn("[LibraryManager] Failed to pre-open AEDoor.library");
    }

    // NOTE: AEDoorPort creation moved to DoorLifecycleManager.ts
    // REASON: Must be created AFTER allocateDoorTask() sets currentTask.address
    // TIMING: LibraryManager.initialize() runs before DoorLoader.loadDoor()
    // which means currentTask.address is still 0 here. DoorLifecycleManager
    // creates the port at the right time (after task allocation).
    // See DoorLifecycleManager.ts lines 387-390

    // Re-evaluate isSIMType based on potentially overridden config.doorType
    const currentDoorType = (this.config.doorType || "SIM").toUpperCase();
    const currentIsSIM = currentDoorType === "SIM" || currentDoorType === "SUP" || currentDoorType === "TIM" || currentDoorType === "IIM";

    // Set up BBS API dispatcher for SIM doors (0x790 calling convention)
    // CRITICAL: ONLY enable for doors that use this older API (SIM/SUP/TIM/IIM).
    // XIM/AIM doors check 0x790 and misinterpret our trap address as a frame pointer,
    // leading to register corruption (A5) and crashes.
    if (currentIsSIM) {
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

      // Ensure node directory exists
      if (!amigafs.existsSync(nodeDir)) {
        fs.mkdirSync(nodeDir, { recursive: true });
      }

      // TempAns is a directory for temporary answer files
      const tempAnsDir = path.join(nodeDir, "TempAns");
      if (!amigafs.existsSync(tempAnsDir)) {
        fs.mkdirSync(tempAnsDir, { recursive: true });
      }

      // NOTE: "Answers" is a FILE (not directory) that stores user questionnaire responses
      // Do NOT create it as a directory - doors like GetAnswer expect it to be a file
      // The file is created by new-user.handler.ts when users complete questionnaires
    } catch (error) {
console.warn("[LibraryManager] Failed to ensure node directories", error);
    }
  }

  private registerLibrariesFromDisk(dir: string): void {
    if (!this.execLibrary) return;
    try {
      if (!amigafs.existsSync(dir)) return;
      const entries = amigafs.readdirSync(dir);
      for (const name of entries) {
        const entryPath = path.join(dir, name);
        const stat = amigafs.statSync(entryPath);
        if (!stat.isFile()) continue;
        if (!name.toLowerCase().endsWith(".library")) continue;
        const lower = name.toLowerCase();
        if (
          lower === "exec.library" ||
          lower === "dos.library" ||
          lower === "utility.library" ||
          lower === "graphics.library" ||
          lower === "intuition.library" ||
          lower === "icon.library"
        ) {
          continue;
        }
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
