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
import { BsdSocketLibrary } from "./api/BsdSocketLibrary";
import { AmiSSLMasterLibrary, AmiSSLLibrary } from "./api/AmiSSLLibrary";
import { DreamDoorLibrary } from "./api/DreamDoorLibrary";
import { FameLibrary } from "./api/FameLibrary";
import { LibraryTraps } from "./api/LibraryTraps.js";
import { XIMProtocol } from "./XIMProtocol.js";
import { DoorConfig, DoorConstants } from "./DoorTypes.js";
import { Socket } from "socket.io";
import { c64AdapterFor } from "../server/c64-door-adapter";
import { C64_COLUMNS } from "./xim/screen-width.util";
import { createEmpireNarrowShadow } from "./api/file-shadow";
import { stdoutReachesCaller } from "./door-stdout-policy";
import * as path from "path";
import * as fs from "fs";
import * as amigafs from "../utils/amigafs";
import { LibraryLoader } from "./loader/LibraryLoader.js";
import { PathManager } from "./api/PathManager.js";
import { BbsApiLibrary } from "./api/BbsApiLibrary.js";
import { DoorLogger } from "./DoorLogger.js";
import { KickstartRom } from "./KickstartRom.js";
import { spawnSync } from "child_process";
import { debugLog } from '../utils/debug-log';
import { isSecretInput } from './xim/secret-input';
import { boardRoot } from '../utils/board-root.util';
import { factsFromSession, BOARD_VERSION } from './utils/host-vars';

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
  public bsdSocketLibrary: BsdSocketLibrary | null = null;
  public amisslMasterLibrary: AmiSSLMasterLibrary | null = null;
  public amisslLibrary: AmiSSLLibrary | null = null;
  public dreamDoorLibrary: DreamDoorLibrary | null = null;
  public fameLibrary: FameLibrary | null = null;
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
    const resolved = boardRoot();
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
        // The stamp records THIS ROM WAS TRIED, not "it worked".
        //
        // It used to be written only on success, so a ROM romtool cannot split
        // re-ran the whole attempt on EVERY door launch, for ever: a `which`,
        // a subprocess, and the copy sweep below, per caller per door. Both
        // ROMs on this board fail it - romtool answers "was not found in split
        // database!" for the AROS image and for the Kickstart beside it - so
        // the retry was the normal case, not the rare one.
        //
        // A failure is still reported, once per ROM rather than once per
        // launch, and a romtool that learns the ROM later changes the stamp.
        fs.writeFileSync(stampPath, stamp);
        if (split.status !== 0) {
console.warn(
            `[LibraryManager] romtool cannot split this ROM; door libraries will come from stubs. ` +
            `Not retried until the ROM changes. ${String(split.stderr || split.stdout || '').trim().slice(0, 200)}`
          );
          return;
        }
      }

      const entries = amigafs.readdirSync(outDir);
      const copyTo = (src: string, targets: string[]): void => {
        for (const target of targets) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          if (amigafs.existsSync(target)) continue;
          fs.copyFileSync(src, target);
debugLog(`[LibraryManager] Extracted ${path.basename(target)} from ROM → ${target}`);
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
    /*
     * PHASE TIMING, because nobody knew where the launch went.
     *
     * A real BBS launch spends ~13 seconds between "ROM mapped" and
     * "libraries initialized" with the event loop BLOCKED for all of it -
     * measured 2026-09-13, when the sysop reported a door as "stuck". The
     * plan for it (thoughts/shared/plans/2026-09-08-68k-door-launch-speed.md)
     * had no diagnosis because the window had no marks inside it: the four
     * obvious suspects each measured in single-digit milliseconds when probed
     * in isolation, so the cost is somewhere the outside cannot see.
     *
     * Same shape as AmigaDoorSession.start()'s marks, so the two interleave
     * in one log, and the lag figure says whether a step BLOCKED the board or
     * merely took a while.
     */
    const __t0 = Date.now();
    let __lagMax = 0;
    let __lagLast = Date.now();
    const __lagTimer = setInterval(() => {
      const late = Date.now() - __lagLast - 20;
      if (late > __lagMax) __lagMax = late;
      __lagLast = Date.now();
    }, 20);
    __lagTimer.unref?.();
    const mark = (what: string): void => {
      // Sample the lag AT THE MARK, not only from the interval.
      //
      // A synchronous block stops the interval too, so it cannot observe its
      // own block until the tick AFTER it ends - and a mark placed right after
      // the block then printed "loop lag max 0ms" while the board had been
      // frozen for eleven seconds. The time since the interval last ran IS the
      // block that just finished.
      const sinceTick = Math.max(0, Date.now() - __lagLast - 20);
      if (sinceTick > __lagMax) __lagMax = sinceTick;
      // "unserviced" is the literal measurement: how long since the sampling
      // interval last got to run. Called it "blocked" first and that was a
      // third misleading meter - when the loop never yields at all the
      // interval never fires, so the figure is the time since this phase
      // BEGAN, not the cost of the step just finished. Both readings matter,
      // and the name should not pick one.
      this.logger?.log(
        'INFO',
        `[timing] exec: ${what} +${Date.now() - __t0}ms (loop unserviced ${sinceTick}ms)`
      );
    };

    try {
      await this.initializeExecTimed(mark);
    } finally {
      clearInterval(__lagTimer);
      mark('initializeExec done');
    }
  }

  private async initializeExecTimed(mark: (what: string) => void): Promise<void> {
    const projectRoot = this.resolveBbsRoot();
    mark("bbs root resolved");
debugLog(`[LibraryManager] BBS root resolved to ${projectRoot}`);
debugLog("[LibraryManager] Loading ROM...");

    const romSource = this.resolveRomSource();
    let romPath: string | null = null;

    const usingKickstart = romSource.kind === "kickstart";
    if (usingKickstart) {
      romPath = romSource.path;
      const romData = fs.readFileSync(romPath);
      this.emulator.loadROM(new Uint8Array(romData));
debugLog("[LibraryManager] Kickstart ROM loaded - provides ROM routines");
    } else {
console.warn("[LibraryManager] Kickstart ROM not found; using AROS ROM fallback.");
      const arosRom = fs.readFileSync(romSource.romPath);
      const arosExt = fs.readFileSync(romSource.extPath);
      const combined = Buffer.concat([arosRom, arosExt]);
      this.emulator.loadROM(new Uint8Array(combined));
debugLog("[LibraryManager] AROS ROM loaded - provides ROM routines");

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

debugLog("[LibraryManager] Creating ExecBase structure...");

    mark("ROM read and loaded");

    this.execLibrary = new ExecLibrary(this.emulator);
    this.execLibrary.initialize();
    mark("ExecBase built");

    const libraryLoader = new LibraryLoader(this.emulator, undefined, this.kickstartRom);
    // Prefer real Amiga libraries when present on disk (repo / BBS root paths).
    // addSearchPath() unshifts, so add in reverse priority order.
    libraryLoader.addSearchPath(path.join(process.cwd(), "Libs"));
    libraryLoader.addSearchPath(path.join(projectRoot, "System", "Libs"));
    libraryLoader.addSearchPath(path.join(projectRoot, "Libs"));
    this.execLibrary.setLibraryLoader(libraryLoader, true);
    mark("library loader ready");
debugLog(
      `[LibraryManager] Native library loading: enabled (${usingKickstart ? "Kickstart ROM" : "AROS ROM"})`
    );

    // If a supported Kickstart is present, extract key libraries to disk once so
    // doors can load real binaries instead of stubs. This is generic and runs
    // only when files are missing.
    if (romPath) {
      this.ensureRomLibrariesExtracted(romPath, projectRoot);
      mark("ROM libraries extracted");
    }

    if (!this.execLibrary.loadRealAEDoorLibrary()) {
console.warn("[LibraryManager] Real AEDoor.library failed to load");
    }
    mark("AEDoor.library loaded");

    // Pre-register any libraries present on disk so getLibraryBase() can
    // resolve them before OpenLibrary is invoked.
    this.registerLibrariesFromDisk(path.join(this.bbsRoot, "Libs"));
    this.registerLibrariesFromDisk(path.join(this.bbsRoot, "System", "Libs"));
    mark("disk libraries registered");

    // Normalize and update doorType in config to ensure consistency throughout initialization
    const doorType = (this.config.doorType || "SIM").toUpperCase();
    const nodeId = this.config.bbsSession?.nodeId || 0;

debugLog(`[LibraryManager] Door type: ${doorType}`);

    // CRITICAL: isSIMType must be calculated using the final normalized doorType
    const isSIMType = doorType === "SIM" || doorType === "SUP" || doorType === "TIM" || doorType === "IIM";
    const basePortName = isSIMType ? "DoorControl" : "AEServer";

debugLog(`[LibraryManager] Creating ${basePortName} for BBS data access...`);

    // Amiga doors call FindPort with 1-based node numbers.
    // Our session nodeId may be 0-based; normalize to 1-based for public port naming.
    const amigaNodeId = nodeId === 0 ? 1 : nodeId;
    // CRITICAL: AEServer ports use DOT notation: "AEServer.1", "AEServer.2", etc.
    const portName = basePortName === "AEServer" ? `${basePortName}.${amigaNodeId}` : `${basePortName}${amigaNodeId}`;

    // AEServer port sigBit — must NOT collide with SIGBREAKB_CTRL_C (bit 12)
    // or SIGBREAKB_CTRL_D (bit 13). Bit 17 (0x20000) is the standard dynamic
    // msg-port bit allocated by CreateMsgPort / AllocSignal.
    //
    // Prior value was 12 to "match door Wait() masks like 0x21000
    // (AquaScan, FR)". That was wrong: 0x21000 = bit 17 | bit 12 means
    // "wake on message (17) OR CTRL_C (12)". Signalling AEServer on bit 12
    // made every PutMsg look like CTRL_C; doors (e.g. WarOLM) that call
    // SetSignal(0, 0x3000) to poll for break then saw a false positive and
    // exited with FAIL. Bit 17 still wakes Wait(0x21000) callers via the
    // message-port half of the mask without masquerading as a break signal.
    //
    // If AquaScan / FR regress, investigate whether their Wait() mask is
    // actually bit 12 alone (not 0x21000) — the prior comment may have been
    // misdiagnosed.
    const AESERVER_SIGBIT = 17;
    const mainPortAddr = this.execLibrary.createPublicPort(portName, undefined, AESERVER_SIGBIT);
    this.execLibrary.setDoorPortAddress(mainPortAddr);
debugLog(
      `[LibraryManager] Created ${portName} at 0x${mainPortAddr.toString(16)}`
    );

    const simplePortName = basePortName === "AEServer" ? `${basePortName}.0` : basePortName;
    const simplePortAddr = this.execLibrary.createPublicPort(simplePortName, undefined, AESERVER_SIGBIT);
debugLog(
      `[LibraryManager] Created ${simplePortName} (simple) at 0x${simplePortAddr.toString(
        16
      )}`
    );
    // Also register the raw nodeId variant if different, to satisfy any 0-based lookups.
    if (nodeId !== amigaNodeId) {
      const zeroBasedName = basePortName === "AEServer" ? `${basePortName}.${nodeId}` : `${basePortName}${nodeId}`;
      const zeroBasedAddr = this.execLibrary.createPublicPort(zeroBasedName, undefined, AESERVER_SIGBIT);
debugLog(
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
debugLog(`[LibraryManager] Skipping alternate port pre-creation (${altBasePortName}) - doors create their own`);

    // REMOVED: this.execLibrary.createPublicPort(`${altBasePortName}${amigaNodeId}`);
    // REMOVED: this.execLibrary.createPublicPort(altBasePortName);
    // REMOVED: if (nodeId !== amigaNodeId) { this.execLibrary.createPublicPort(`${altBasePortName}${nodeId}`); }
debugLog(`[LibraryManager] XIM doors will create their own ports when they initialize`);

    // Create AEServer ports for multinode doors (used for node status detection)
    // Doors call FindPort("AEServer.%d") to detect active nodes on the BBS
    // AmiExpress supported up to 255 nodes - create ports for all possible nodes
    // Use lightweight ports to avoid exhausting signal bits (only 32 available)
    // CRITICAL: Skip the current node's port - it's already been created as the main port above
    const maxAEServerNodes = 255;
debugLog(`[LibraryManager] Creating lightweight AEServer ports for multinode support (0-254, skipping node ${nodeId})...`);
    for (let i = 0; i < maxAEServerNodes; i++) {
      // Skip current node - already created as main port
      if (i === nodeId || i === amigaNodeId) {
        continue;
      }
      this.execLibrary.createLightweightPort(`AEServer.${i}`);
    }
debugLog(`[LibraryManager] AEServer.0-254 lightweight ports created (except node ${nodeId} - already exists as main port)`);

    // Create AREXX-format ports (AEDoorRP.XXX) for doors like RTW that use this naming convention
    // RTW and other doors look for "AEDoorRP.000", "AEDoorRP.001" etc. (3-digit zero-padded node IDs)
    // These are AREXX Rexx Port format names used for message passing
debugLog(`[LibraryManager] Creating AREXX-format AEDoorRP ports for XIM door compatibility...`);
    for (let i = 0; i < 10; i++) {
      const rexxPortName = `AEDoorRP.${i.toString().padStart(3, '0')}`;
      this.execLibrary.createLightweightPort(rexxPortName);
    }
debugLog(`[LibraryManager] AEDoorRP.000-009 AREXX ports created`);

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

    const useXimProtocol = doorType !== "SIM" && doorType !== "SUP" && doorType !== "FIM" && doorType !== "DD";
    this.useXimProtocol = useXimProtocol;

    // Create icon.library BEFORE XIMProtocol so it can pre-load command .info files
debugLog("[LibraryManager] Creating icon.library...");
    const bbsRoot = projectRoot;
    this.ensureAnswerFiles(bbsRoot);
    mark("answer files ensured");
    this.iconLibrary = new IconLibrary(this.emulator, bbsRoot, this.execLibrary!);
    mark("icon library");
    // Set door directory for PROGDIR: support in GetDiskObject
    this.iconLibrary.setDoorDirectory(doorDir);
    // Set door binary basename so GetDiskObject can fall back to
    // "<doorDir>/<binary>.info" when a door passes an empty name
    // (ByteComment / similar — WBStartup.sm_ArgList[0] unpopulated).
    this.iconLibrary.setDoorBinaryName(path.basename(this.config.executablePath));
    // Set door command for DOORUSE.* lookups (used by AquaScan and similar doors)
    if (this.config.doorId) {
      this.iconLibrary.setDoorCommand(this.config.doorId);
    } else if (this.config.bbsSession?.doorCommand) {
      this.iconLibrary.setDoorCommand(String(this.config.bbsSession.doorCommand));
    }

    if (useXimProtocol) {
debugLog("[LibraryManager] Creating XIM Protocol handler...");
      this.ximProtocol = new XIMProtocol(
        this.emulator,
        this.execLibrary,
        this.socket,
        mainPortAddr,
        this.config.bbsSession,
        this.iconLibrary  // Pass iconLibrary for command .info file loading
      );
      mark("xim protocol");
    } else {
debugLog(
        `[LibraryManager] Skipping XIM protocol for ${doorType} door`
      );
    }

debugLog("[LibraryManager] Creating DOS.library...");

    this.dosLibrary = new DosLibrary(this.emulator, projectRoot);
    // Memory and the task's stack for programs the door runs (LoadSeg,
    // RunCommand, Execute, SystemTagList).
    this.dosLibrary.setExecLibrary(this.execLibrary);
    mark("dos library");
    // The caller's width, for the ONE place dos.library needs it: a door that
    // opens its own header file (`ctop`, `conftop`) instead of asking the BBS
    // to show it. The socket lives here, so the question is answered here.
    this.dosLibrary.setNarrowArtProvider(() => {
      const adapter = c64AdapterFor(this.socket);
      return !!adapter && adapter.columns <= C64_COLUMNS;
    });
    // Session-scoped CFG shadows: a narrow caller reads single-column
    // Empire configs (Bulls DUAL_LISTING forced to NO) while the disk file
    // - and every other node - is untouched. Same question, same place as
    // the narrow-art redirect above; the manifest declares what rewrites.
    this.dosLibrary.setShadowProvider(
      createEmpireNarrowShadow({ session: this.config.bbsSession, doorDir })
    );
    this.dosLibrary.setBasePaths(projectRoot);
    this.dosLibrary.setEnvironment(this.config.env);
    this.dosLibrary.setInheritedHandles(1, 2);

    // Initialize environment variables for XIM doors
    const doorNodeId = this.config.bbsSession?.nodeNumber || 1;
    const doorUsername = this.config.bbsSession?.user?.username || 'Guest';
    const doorSecLevel = this.config.bbsSession?.user?.securityLevel || 1;
    const doorConfId = this.config.bbsSession?.currentConference || 1;
    // What this caller can be sent, read off the live session: a C64 on
    // telnet is told 'petscii', a browser is told 'wide,mouse'. A door that
    // finds no AE_HOST at all is on classic AmiExpress (utils/host-vars.ts).
    const hostFacts = factsFromSession(this.config.bbsSession, BOARD_VERSION);
    this.dosLibrary.initializeEnvironmentVariables(doorNodeId, doorConfId, doorUsername, doorSecLevel, hostFacts);

debugLog(
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

    // Reset ANSI attributes at the end of each DOS Write() call that sets colors
    // but doesn't end with a reset. Prevents color bleed into subsequent Write()
    // calls from doors like 5D-Edit whose file descriptions contain ANSI codes.
    // Matches both ESC+[ and single-byte CSI (0x9B) forms.
    const ANSI_SGR = /(?:\x1b\[|\x9b)[\d;]*m/;
    const ANSI_RESET_SUFFIX = /(?:\x1b\[|\x9b)0?m[\r\n\s]*$/;
    const resetAnsiIfNeeded = (text: string): string =>
      ANSI_SGR.test(text) && !ANSI_RESET_SUFFIX.test(text) ? text + '\x1b[0m' : text;

    // XIM-protocol doors (XIM/AIM/TIM/IIM/MCI/AEM — anything that's not
    // SIM/SUP) talk to the user via AEDoor.library JH_PUTSTR / JH_PUTCH
    // messages. On real Amiga, AmiExpress launches them with stdout pointed
    // at NIL: so any DOS Write(Output(), ...) the door does goes nowhere.
    // Without this filter Conftop's printf banner leaks through ahead of the
    // real JH_PUTSTR banner — user sees two rows draw, then \f clear, then
    // the proper banner. Real reference-board BBS shows banner ONCE.
    //
    // Originally landed as commit 8abcb608 (2026-05-03). Was reverted by
    // 44411707b on the hypothesis that both banners came via JH_SM and
    // form-feed translation alone was the root cause. Live testing post-
    // revert shows banner #1 IS still pre-rendered — re-applying the
    // suppression alongside the form-feed translation. Both fixes are
    // independent and both contribute to 1:1 fidelity with real Amiga.
    //
    // SIM/SUP doors that DO use stdout legitimately (no AEDoor messages)
    // keep their forwarding. Transfer-raw passthrough still applies in both
    // cases (binary file transfers route through stdout).
    //
    // ...unless the door declares SILENT, which is how a board runs
    // MAINTENANCE through the door path. See `door-stdout-policy.ts`.
    const stdoutGoesToUser = stdoutReachesCaller({
      doorType: useXimProtocol ? doorType : 'SIM',
      silent: this.config.silent,
    });
    this.dosLibrary.setInputSecretCheck(() => isSecretInput(this.config.bbsSession));
    this.dosLibrary.setOutputRawCallback((buf: Buffer) => {
      const bbsSession: any = this.config.bbsSession || {};
      if (bbsSession.transferRawActive) {
        this.socket.emit('transfer-raw:echo', buf);
        return;
      }
      if (!stdoutGoesToUser) return;
      const text = resetAnsiIfNeeded(normalizeAnsiNewlines(buf.toString('latin1')));
      this.socket.emit("ansi-output", text);
    });
    this.dosLibrary.setOutputCallback((text: string) => {
      const bbsSession: any = this.config.bbsSession || {};
      if (bbsSession.transferRawActive) {
        this.socket.emit('transfer-raw:echo', Buffer.from(text, 'latin1'));
        return;
      }
      if (!stdoutGoesToUser) return;
      this.socket.emit("ansi-output", resetAnsiIfNeeded(normalizeAnsiNewlines(text)));
    });
debugLog(`[LibraryManager] DOS.library output callback configured (stdoutGoesToUser=${stdoutGoesToUser}, doorType=${doorType})`);

    // Expose raw input hook to the session so socket-handlers can feed transfer-raw data
    const bbsSession: any = this.config.bbsSession || {};
    bbsSession.serialInputHook = (data: Buffer) => {
      this.dosLibrary?.queueInput(data);
    };

debugLog("[LibraryManager] Creating AEDoor.library...");

    this.aedoorLibrary = new AEDoorLibrary(
      this.socket,
      this.emulator,
      this.execLibrary,
      this.config.bbsSession || {}
    );
    mark("aedoor library");

    // Let XIMProtocol observe AEDoorLibrary.isInWaitForReply() so that
    // shouldInjectNativeInput can push input into replyPort while a
    // synchronous trap-side waitForReply loop is holding the JS event
    // loop (SysInfo / zOOsTAT pause prompts).
    if (this.ximProtocol && typeof (this.ximProtocol as any).setAedoorLibrary === 'function') {
      (this.ximProtocol as any).setAedoorLibrary(this.aedoorLibrary);
    }

debugLog("[LibraryManager] Creating utility.library...");

    this.utilityLibrary = new UtilityLibrary(this.emulator, this.socket, this.execLibrary!);
    mark("aedoor + utility libraries");

debugLog("[LibraryManager] Creating math libraries...");

    this.mathFFPLibrary = new MathFFPLibrary(this.emulator);
    this.mathTransLibrary = new MathTransLibrary(this.emulator);
    this.mathIEEEDoubBasLibrary = new MathIEEEDoubBasLibrary(this.emulator);
    this.mathIEEEDoubTransLibrary = new MathIEEEDoubTransLibrary(this.emulator);
    this.mathIEEESingBasLibrary = new MathIEEESingBasLibrary(this.emulator);
    this.mathIEEESingTransLibrary = new MathIEEESingTransLibrary(this.emulator);

debugLog("[LibraryManager] Creating intuition.library...");
    this.intuitionLibrary = new IntuitionLibrary(this.emulator);

debugLog("[LibraryManager] Creating network libraries (bsdsocket, amissl)...");
    this.bsdSocketLibrary = new BsdSocketLibrary(this.emulator, this.execLibrary!);
    mark("math + intuition libraries");
    this.amisslMasterLibrary = new AmiSSLMasterLibrary(this.emulator);
    this.amisslLibrary = new AmiSSLLibrary(this.emulator);
    // Connect amissl to bsdsocket for TLS upgrade
    this.amisslLibrary.setBsdSocketLibrary(this.bsdSocketLibrary);

debugLog("[LibraryManager] Creating dreamdoor.library (DayDream BBS compatibility)...");
    this.dreamDoorLibrary = new DreamDoorLibrary(this.emulator, {
      allocMem: (size: number, flags?: number) => this.execLibrary!.allocMem(size, flags ?? 0),
      freeMem: (addr: number, size: number) => this.execLibrary!.freeMem(addr, size),
    });
    // Set session data for DreamDoor operations
    this.dreamDoorLibrary.setSession(this.config.bbsSession, this.socket);

debugLog("[LibraryManager] Creating fame.library (FAME BBS FIM compatibility)...");
    this.fameLibrary = new FameLibrary(this.emulator, {
      allocMem: (size: number, flags: number) => this.execLibrary!.allocMem(size, flags),
      freeMem: (addr: number, size: number) => this.execLibrary!.freeMem(addr, size),
    });
    // Set session data for FAME operations
    this.fameLibrary.setSession(this.config.bbsSession, this.socket);

debugLog("[LibraryManager] Installing library call traps...");

    this.libraryTraps = new LibraryTraps(this.emulator, this.execLibrary);
    mark("socket/ssl/dream/fame libraries");

    this.emulator.setLibraryTrapHandler((pc: number) => {
      return this.libraryTraps!.handleTrap(pc);
    });

    // NOTE: Do NOT reset allocator here - it already starts at 0x100000 (ExecLibrary.ts line 103)
    // Resetting after port creation causes new allocations (doorInfo) to overlap with existing ports
    // The allocator continues forward naturally from where ports left off

    this.libraryTraps.installExecVectors();
    mark("exec vectors installed");
    // CRITICAL: Sync exec trap addresses to MOIRA immediately after installation.
    // Exec traps (AllocMem, FindTask, etc.) fire in the SAS/C startup before
    // dos.library is opened, so they must be in MOIRA's WASM trap set from the start.
    // Previously syncTrapAddressesToMoira() was only called on dos.library open,
    // causing the WASM batch to run straight through exec traps and hit ROM handlers.
    this.libraryTraps.syncTrapAddressesToMoira();

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
    this.libraryTraps.setBsdSocketLibrary(this.bsdSocketLibrary);
    this.libraryTraps.setAmiSSLMasterLibrary(this.amisslMasterLibrary);
    this.libraryTraps.setAmiSSLLibrary(this.amisslLibrary);
    this.libraryTraps.setDreamDoorLibrary(this.dreamDoorLibrary);
    this.libraryTraps.setFameLibrary(this.fameLibrary);

    // Set up callback so OpenAmiSSL() triggers vector installation
    const libraryTrapsRef = this.libraryTraps;
    const execLibraryRef = this.execLibrary;
    this.amisslMasterLibrary.setOnOpenAmiSSL(() => {
      debugLog("[LibraryManager] OpenAmiSSL called, installing amissl.library vectors...");
      // First register amissl.library in ExecLibrary so getLibraryBase works
      if (execLibraryRef) {
        execLibraryRef.openLibraryHybrid("amissl.library", 0, false);
      }
      libraryTrapsRef.installAmiSSLVectors();
    });

    // Pre-open utility.library and install vectors immediately
    // Some doors use utility.library functions without calling OpenLibrary first
debugLog("[LibraryManager] Pre-opening utility.library and installing vectors...");
    this.execLibrary.openLibraryHybrid("utility.library", 37, false);
    this.libraryTraps.installUtilityVectors();
    mark("utility.library opened + vectors");

    // Pre-open icon.library and install vectors immediately
    // CRITICAL: AquaScan and other doors call GetDiskObject for config files
    // XIMProtocol also uses iconLibrary directly to pre-load command .info files
debugLog("[LibraryManager] Pre-opening icon.library and installing vectors...");
    this.execLibrary.openLibraryHybrid("icon.library", 37, false);
    this.libraryTraps.installIconVectors();
    mark("icon.library opened + vectors");

    this.execLibrary.addLibraryOpenedCallback((name: string, addr: number) => {
      if (name.toLowerCase() === "dos.library") {
debugLog(
          "[LibraryManager] dos.library opened, installing vectors..."
        );
        this.libraryTraps!.installDOSVectors();
      }
      if (name.toLowerCase() === "aedoor.library") {
debugLog(
          "[LibraryManager] AEDoor.library opened, installing vectors..."
        );
        this.libraryTraps!.installAEDoorVectors();
      }
      if (name.toLowerCase() === "icon.library") {
debugLog(
          "[LibraryManager] icon.library opened, installing vectors..."
        );
        this.libraryTraps!.installIconVectors();
      }
      if (name.toLowerCase() === "utility.library") {
debugLog(
          "[LibraryManager] utility.library opened, installing vectors..."
        );
        this.libraryTraps!.installUtilityVectors();
      }
      if (name.toLowerCase() === "mathffp.library") {
debugLog("[LibraryManager] mathffp.library opened, installing vectors...");
        this.libraryTraps!.installMathFFPVectors();
      }
      if (name.toLowerCase() === "mathtrans.library") {
debugLog("[LibraryManager] mathtrans.library opened, installing vectors...");
        this.libraryTraps!.installMathTransVectors();
      }
      if (name.toLowerCase() === "mathieeedoubbas.library") {
debugLog("[LibraryManager] mathieeedoubbas.library opened, installing vectors...");
        this.libraryTraps!.installMathIEEEDoubBasVectors();
      }
      if (name.toLowerCase() === "mathieeedoubtrans.library") {
debugLog("[LibraryManager] mathieeedoubtrans.library opened, installing vectors...");
        this.libraryTraps!.installMathIEEEDoubTransVectors();
      }
      if (name.toLowerCase() === "mathieeesingbas.library") {
debugLog("[LibraryManager] mathieeesingbas.library opened, installing vectors...");
        this.libraryTraps!.installMathIEEESingBasVectors();
      }
      if (name.toLowerCase() === "mathieeesingtrans.library") {
debugLog("[LibraryManager] mathieeesingtrans.library opened, installing vectors...");
        this.libraryTraps!.installMathIEEESingTransVectors();
      }
      if (name.toLowerCase() === "intuition.library") {
debugLog("[LibraryManager] intuition.library opened, installing vectors...");
        this.libraryTraps!.installIntuitionVectors();
      }
      if (name.toLowerCase() === "bsdsocket.library") {
debugLog("[LibraryManager] bsdsocket.library opened, installing vectors...");
        this.libraryTraps!.installBsdSocketVectors();
        // CRITICAL: Sync new trap addresses to MOIRA for batch execution
        this.libraryTraps!.syncTrapAddressesToMoira();
      }
      if (name.toLowerCase() === "amisslmaster.library") {
debugLog("[LibraryManager] amisslmaster.library opened, installing vectors...");
        this.libraryTraps!.installAmiSSLMasterVectors();
        // CRITICAL: Sync new trap addresses to MOIRA for batch execution
        this.libraryTraps!.syncTrapAddressesToMoira();
      }
      if (name.toLowerCase() === "amissl.library") {
debugLog("[LibraryManager] amissl.library opened, installing vectors...");
        this.libraryTraps!.installAmiSSLVectors();
        // CRITICAL: Sync new trap addresses to MOIRA for batch execution
        this.libraryTraps!.syncTrapAddressesToMoira();
      }
      if (name.toLowerCase() === "fame.library") {
debugLog("[LibraryManager] fame.library opened, installing vectors...");
        this.libraryTraps!.installFameVectors();
        // syncTrapAddressesToMoira() is called inside installFameVectors()
        // itself (see LibraryTraps.ts) so new traps are pushed to MOIRA
        // immediately after install.
      }
      if (name.toLowerCase() === "dreamdoor.library") {
debugLog("[LibraryManager] dreamdoor.library opened, installing vectors...");
        this.libraryTraps!.installDreamDoorVectors();
        // syncTrapAddressesToMoira() is called inside installDreamDoorVectors()
        // itself after this task's LibraryTraps.ts fix, mirroring fame.library.
      }
      if (name.toLowerCase() === "graphics.library") {
debugLog(
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
debugLog(
          "[LibraryManager] Door message callback - to be handled by message handler"
        );
      }
    );

    // Ensure real dos.library is resident and vectors installed up front (generic)
    const dosHybrid = this.execLibrary.openLibraryHybrid("dos.library", 37, true);
    if (dosHybrid.success) {
      this.libraryTraps!.installDOSVectors();
debugLog(
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
debugLog(
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
debugLog("[LibraryManager] Setting up BBS API dispatcher for SIM door...");

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

debugLog(
          `[LibraryManager] BBS API dispatcher installed at 0x${trapAddr.toString(16)}`
        );
debugLog(
          `[LibraryManager] Function pointer written to 0x790 → 0x${trapAddr.toString(16)}`
        );

        // Verify the value was written correctly
        const verifyValue = this.emulator.readMemory32(0x790);
debugLog(
          `[LibraryManager] Verification: 0x790 contains 0x${verifyValue.toString(16)}`
        );

        // Also verify the ILLEGAL instruction is at the trap address
        const trapInstruction = this.emulator.readMemory16(trapAddr);
debugLog(
          `[LibraryManager] Verification: ILLEGAL instruction at 0x${trapAddr.toString(16)} = 0x${trapInstruction.toString(16)}`
        );
      }
    }

debugLog("[LibraryManager] Library system ready");
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

      // Node<n>/TempAns is a FILE (express.e:30344 Open(..,MODE_NEWFILE),
      // copied line by line into Answers at 30413): never create it as a
      // directory, which made every later TempAns write fail.

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
