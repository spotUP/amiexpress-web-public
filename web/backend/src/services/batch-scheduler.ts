import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { findCaseInsensitive } from '../utils/amigafs';
import { writeQuickNewScreen, generateQuickNewFromConfig } from '../utils/quicknew-generator';
import { generateBulletin as generateSamiLogBulletin } from '../services/SamiLogService';
import { generateMultiTop } from '../utils/multitop-generator';
import { doorDropFileManager } from '../services/DoorDropFileManager';
import { InfoFileParser } from './info-file-parser';
import { getSystemTime } from '../utils/date-time.util';

/**
 * Get door type from .info file (TYPE tooltype)
 * Returns 'XIM' for XIM doors, 'SIM' as default for plain AmigaDOS executables
 */
function getDoorTypeFromInfo(doorPath: string): string {
  const infoPath = doorPath + '.info';
  if (!fs.existsSync(infoPath)) {
    return 'SIM'; // Default for doors without .info files
  }

  try {
    const buffer = fs.readFileSync(infoPath);
    const parser = new InfoFileParser();
    const parsed = parser.parse(buffer);

    // Look for TYPE tooltype (e.g., TYPE=XIM)
    const typeValue = parsed.toolTypes.get('TYPE');
    if (typeValue) {
      const upperType = typeValue.toUpperCase();
      // Valid door types: XIM, AIM, SIM, TIM
      if (['XIM', 'AIM', 'SIM', 'TIM'].includes(upperType)) {
        return upperType;
      }
    }
    return 'SIM'; // Default
  } catch (err) {
    console.warn(`[BatchScheduler] Failed to read ${infoPath}: ${err}`);
    return 'SIM'; // Default on error
  }
}

/**
 * EXECUTE_ON_* Event Types (from express.e:6666-6744)
 * These are tooltypes in bbsConfig.info that specify commands to run on BBS events.
 */
export type ExecuteOnEvent =
  | 'LOGON'           // User logs on (express.e:6715)
  | 'LOGOFF'          // User logs off (express.e:6738)
  | 'NEW_USER'        // New user registers (express.e:6726)
  | 'UPLOAD'          // File uploaded (express.e:6692)
  | 'CONNECT'         // Modem/telnet connect (express.e:7353)
  | 'STATUS_CHANGE'   // Node status changes (express.e:13229,13248,13469,13515)
  | 'SYSOP_COMMENT'   // User sends sysop comment (express.e:6704)
  | 'SYSOP_PAGE';     // User pages sysop (express.e:24196)

/**
 * Cache for bbsConfig.info tooltypes to avoid re-parsing on every event
 */
let executeOnCache: Map<string, string> | null = null;
let executeOnCacheTime = 0;
const CACHE_TTL_MS = 30000; // 30 second cache

/**
 * Read all tooltypes from bbsConfig.info (including EXECUTE_ON_* and EXECUTE_ASYNC_ON_*)
 */
function getExecuteOnTooltypes(): Map<string, string> {
  const now = Date.now();
  if (executeOnCache && (now - executeOnCacheTime) < CACHE_TTL_MS) {
    return executeOnCache;
  }

  const tooltypes = new Map<string, string>();
  const bbsRoot = config.getConfig().dataDir;
  const configPath = path.join(bbsRoot, 'bbsConfig.info');

  if (!fs.existsSync(configPath)) {
console.log('[BatchScheduler] bbsConfig.info not found, no EXECUTE_ON_* tooltypes');
    executeOnCache = tooltypes;
    executeOnCacheTime = now;
    return tooltypes;
  }

  try {
    const buffer = fs.readFileSync(configPath);
    const parser = new InfoFileParser();
    const parsed = parser.parse(buffer);

    for (const [key, value] of parsed.toolTypes.entries()) {
      const upperKey = key.toUpperCase();
      // Only cache EXECUTE_ON_* and EXECUTE_ASYNC_ON_* tooltypes
      if (upperKey.startsWith('EXECUTE_ON_') || upperKey.startsWith('EXECUTE_ASYNC_ON_')) {
        tooltypes.set(upperKey, value);
      }
    }

console.log(`[BatchScheduler] Loaded ${tooltypes.size} EXECUTE_ON_* tooltypes from bbsConfig.info`);
  } catch (error) {
console.error('[BatchScheduler] Failed to read bbsConfig.info:', error);
  }

  executeOnCache = tooltypes;
  executeOnCacheTime = now;
  return tooltypes;
}

/**
 * Clear the EXECUTE_ON cache (call when bbsConfig.info changes)
 */
export function clearExecuteOnCache(): void {
  executeOnCache = null;
  executeOnCacheTime = 0;
}

/**
 * Run EXECUTE_ON_* command for an event (express.e:6666-6687)
 *
 * This reads EXECUTE_ON_{event} and EXECUTE_ASYNC_ON_{event} tooltypes from
 * bbsConfig.info and executes them. Matches original AmiExpress behavior.
 *
 * @param event - The event type (LOGON, LOGOFF, NEW_USER, UPLOAD, etc.)
 * @param nodeId - Node number for context
 * @param context - Optional context for MCI substitution (username, location, etc.)
 */
export async function runExecuteOn(
  event: ExecuteOnEvent,
  nodeId: number = 1,
  context?: {
    username?: string;
    location?: string;
    confName?: string;
    confNum?: number;
  }
): Promise<void> {
  const tooltypes = getExecuteOnTooltypes();

  // Check for EXECUTE_ON_{event} (synchronous)
  const syncKey = `EXECUTE_ON_${event}`;
  const syncCmd = tooltypes.get(syncKey);
  if (syncCmd) {
console.log(`[BatchScheduler] Running ${syncKey}: ${syncCmd}`);
    const processed = processMciInCommand(syncCmd, nodeId, context);
    try {
      await executeLine(processed, nodeId);
    } catch (error) {
console.error(`[BatchScheduler] Error executing ${syncKey}:`, error);
    }
  }

  // Check for EXECUTE_ASYNC_ON_{event} (asynchronous - fire and forget)
  const asyncKey = `EXECUTE_ASYNC_ON_${event}`;
  const asyncCmd = tooltypes.get(asyncKey);
  if (asyncCmd) {
console.log(`[BatchScheduler] Running ${asyncKey}: ${asyncCmd}`);
    const processed = processMciInCommand(asyncCmd, nodeId, context);
    // Fire and forget - don't await
    executeLine(processed, nodeId).catch((error) => {
console.error(`[BatchScheduler] Error executing ${asyncKey}:`, error);
    });
  }

  if (!syncCmd && !asyncCmd) {
    // No EXECUTE_ON_* defined for this event - that's fine, just skip
    return;
  }
}

/**
 * Process MCI codes in command string (express.e:6675 processMci)
 * Basic MCI substitution for common codes used in EXECUTE_ON commands.
 */
function processMciInCommand(
  cmd: string,
  nodeId: number,
  context?: {
    username?: string;
    location?: string;
    confName?: string;
    confNum?: number;
  }
): string {
  let result = cmd;

  // Express.e MCI codes (express.e:5258-5850)
  // IMPORTANT: Order matters - longer codes must come before shorter ones
  // to avoid partial matches (e.g., ~ND before ~N)

  // ~ND = node number (express.e:5409-5412)
  result = result.replace(/~ND/gi, nodeId.toString());

  // ~N = username (express.e:5292-5295)
  if (context?.username) {
    result = result.replace(/~N/g, context.username);
  }

  // ~UL = user location (express.e:5296-5299)
  if (context?.location) {
    result = result.replace(/~UL/gi, context.location);
  }

  // ~CF = conference number (express.e:5413-5416)
  if (context?.confNum !== undefined) {
    result = result.replace(/~CF/gi, context.confNum.toString());
  }

  // ~CN = conference name (express.e:5417-5419)
  if (context?.confName) {
    result = result.replace(/~CN/gi, context.confName);
  }

  // ~DT = date (express.e:5435-5438)
  const now = getSystemTime();
  result = result.replace(/~DT/gi, now.toLocaleDateString());

  // ~OT = time (express.e:5395-5398)
  result = result.replace(/~OT/gi, now.toLocaleTimeString());

  // ~LG / ~ON = node number (express.e:5379-5382) - alias for ~ND
  result = result.replace(/~LG/gi, nodeId.toString());
  result = result.replace(/~ON/gi, nodeId.toString());

  return result;
}

/**
 * Parse AmigaDOS-style command line arguments with quote handling.
 * CRITICAL: Keep quotes IN the arguments - AmigaDOS programs expect to parse them.
 *
 * Examples:
 *   -UC"0" -> ['-UC"0"']  (program parses the quotes)
 *   -O"BBS:path"15 -> ['-O"BBS:path"15']  (program parses quotes and number)
 *   doors:path/file arg1 arg2 -> ['doors:path/file', 'arg1', 'arg2']
 *
 * Only splits on spaces OUTSIDE of quotes. Quotes remain in the arguments.
 */
function parseAmigaDOSArgs(cmdLine: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < cmdLine.length; i++) {
    const char = cmdLine[i];

    if (char === '"') {
      // Keep the quote in the argument
      current += char;
      inQuotes = !inQuotes;
    } else if (char === ' ' && !inQuotes) {
      // Whitespace outside quotes - end current argument
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      // Regular character - accumulate
      current += char;
    }
  }

  // Push final argument if any
  if (current) {
    parts.push(current);
  }

  return parts;
}

function resolveAssign(p: string): string {
  const lower = p.toLowerCase();
  const base = config.getConfig().dataDir;
  const bbsRoot = process.env.BBS_ROOT || base || path.resolve(process.cwd(), '..');
  if (lower.startsWith('bbs:')) {
    const rel = p.substring(4);
    return path.join(base, rel);
  }
  if (lower.startsWith('doors:')) {
    const rel = p.substring(6);
    return path.join(bbsRoot, 'Doors', rel);
  }
  return p;
}

function findInsensitiveFull(fullPath: string): string | null {
  const dir = path.dirname(fullPath);
  const base = path.basename(fullPath);
  return findCaseInsensitive(dir, base);
}

function resolveExecutable(base: string): string | null {
  const direct = findInsensitiveFull(base) || base;
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }

  const candidates = [
    `${direct}.ts`,
    `${direct}.js`,
    path.join(direct, 'index.ts'),
    path.join(direct, 'index.js'),
  ];

  for (const cand of candidates) {
    const resolved = findInsensitiveFull(cand) || cand;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }

  return null;
}

async function runProgram(progPath: string, args: string[], redirectPath?: string, nodeId: number = 1, envOverrides?: Record<string, string>): Promise<void> {
  const ext = path.extname(progPath).toLowerCase();
  const isTs = ext === '.ts';
  const isJs = ext === '.js';
  const isDoorish =
    /[/\\]doors[/\\]/i.test(progPath) ||
    progPath.toLowerCase().includes('doors:');

  // Route Amiga binaries through the door runner (everything non-TS/JS in batches)
  if (!isTs && !isJs) {
    await runAmigaDoorViaRunner(progPath, nodeId || 1, args, path.dirname(progPath), redirectPath, envOverrides);
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const child: any = isTs
        ? require('child_process').spawn('node', ['-r', 'ts-node/register/transpile-only', progPath, ...args], {
            cwd: path.dirname(progPath),
            env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
          })
        : isJs
        ? require('child_process').spawn('node', [progPath, ...args], {
            cwd: path.dirname(progPath),
            env: process.env,
          })
        : require('child_process').spawn(progPath, args, {
            cwd: path.dirname(progPath),
            env: process.env,
          });

      let output = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });

      child.on('error', async (err: any) => {
console.warn(`[BatchScheduler] Failed to start ${progPath}: ${err.message}`);
        // Fallback: if this looks like an Amiga binary, try running via the door runner
        if (!isTs && !isJs && (isDoorish || err.code === 'ENOEXEC')) {
console.warn(`[BatchScheduler] Retrying ${progPath} via Amiga door runner fallback`);
          await runAmigaDoorViaRunner(progPath, 0, args);
        }
        resolve();
      });

      child.on('close', (code: number) => {
        if (code !== 0) {
console.warn(`[BatchScheduler] Program ${progPath} exited with code ${code}`);
        }
        if (redirectPath && output.length > 0) {
          try {
            const resolved = resolveAssign(redirectPath);
            const dir = path.dirname(resolved);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(resolved, output, 'utf-8');
          } catch (err) {
console.error('[BatchScheduler] Failed to write output:', err);
          }
        }
        resolve();
      });
    } catch (err: any) {
console.warn(`[BatchScheduler] Error spawning ${progPath}: ${err.message || err}`);
      if (!isTs && !isJs) {
console.warn(`[BatchScheduler] Retrying ${progPath} via Amiga door runner fallback (spawn error)`);
        runAmigaDoorViaRunner(progPath, nodeId || 1, args).catch((e: any) => {
console.warn(`[BatchScheduler] Fallback runner failed for ${progPath}: ${e?.message || e}`);
        });
      }
      resolve();
    }
  });
}

async function executeLine(rawLine: string, nodeId: number): Promise<void> {
  const line = rawLine.trim();
  if (!line || line.startsWith(';') || line.startsWith('.')) {
    return;
  }

  // handle redirection
  let cmdPart = line;
  let redirect: string | undefined;
  if (line.includes('>')) {
    const [left, right] = line.split('>');
    cmdPart = left.trim();
    redirect = right.trim();
  }

  // Parse AmigaDOS-style arguments (handles quotes like -UC"0" -O"path"15)
  const parts = parseAmigaDOSArgs(cmdPart);
  if (parts.length === 0) {
    return;
  }
  const amigaArgs = parts.slice(1);
  // CRITICAL FIX: Do NOT resolve Amiga assigns to full paths!
  // 68K doors expect Amiga-style paths (doors:, bbs:, etc.)
  // Long Unix paths cause infinite loops in door string copy routines
  // The emulator's DOS library will resolve assigns during file operations
  const resolvedArgs = amigaArgs; // Keep original Amiga paths

  const program = parts[0].toLowerCase();
  if (program === '.key' || program === 'key') {
    // Reserved directive in AmiExpress batch files; ignore in this implementation
    return;
  }

  // Special-case NTR-LASTCALLERS (68K) to generate lastc.txt
  if (program.includes('ntr-lastcallers') || program.includes('lastcallers')) {
    const nodeNum = nodeId || parseInt(parts[1] || '0', 10) || 1;
    const doorPath = resolveAssign('doors:ntr-lastcallers/ntr-lastcallers');
    if (doorPath) {
      await runAmigaDoorViaRunner(doorPath, nodeNum, resolvedArgs, path.dirname(doorPath));
console.log(`[BatchScheduler] Ran NTR-LASTCALLERS for node ${nodeNum}`);
    }
    return;
  }

  // Special-case MultiTop (TypeScript) to generate bull1..bull5
  // Command format: doors:multitop/mtop <design_file> <output_file> [ignoresysop] [userdata] <user_data_file>
  // Example: doors:multitop/mtop doors:multitop/designs/mtopulbytes1.dsg bbs:bulletins/bull1.txt ignoresysop userdata bbs:user.data
  if (program.includes('multitop/mtop')) {
    const args = resolvedArgs;
    if (args.length >= 2) {
      // args[0] is design file path (e.g. "doors:multitop/designs/mtopulbytes1.dsg")
      // args[1] is output file path (e.g. "bbs:bulletins/bull1.txt")
      // These are raw Amiga paths - must resolve assigns to filesystem paths
      const rawDesignPath = args[0].replace(/^"|"$/g, '');
      const rawOutputPath = args[1].replace(/^"|"$/g, '');
      const designPath = resolveAssign(rawDesignPath);
      const outputPath = resolveAssign(rawOutputPath);

      // Parse optional flags
      const ignoreSysop = args.some(arg => arg.toLowerCase() === 'ignoresysop');

console.log(`[BatchScheduler] Generating MultiTop from design: ${designPath} (raw: ${rawDesignPath}), output: ${outputPath}, ignoreSysop: ${ignoreSysop}`);
      await generateMultiTop(designPath, outputPath, { ignoreSysop });
console.log('[BatchScheduler] MultiTop generated successfully');
    } else {
console.error('[BatchScheduler] MultiTop requires design file and output file arguments');
    }
    return;
  }

  // NOTE: dannounce (Discord Announce) now works natively via bsdsocket.library + amissl.library emulation
  // The 68K emulator can make real HTTPS connections using Node.js tls module bridging
  // No special-casing needed - let it run through the normal 68K emulation path

  // Special-case GLCUpdater (TypeScript) to send caller data to global server
  // Command format: utils:glcupdater BBSNAME CALLERSLOG [IGNORELOCAL] [IGNORESYSOP] [IGNORESYSOPUSER] [PROCESSALL]
  // Example: utils:glcupdater "AmiExpress" bbs:node1/callerslog IGNORELOCAL IGNORESYSOP
  if (program.includes('glcupdater')) {
    const { processCallersLog } = await import('../utils/glc-updater');

    // Parse GLCUpdater arguments
    const options: any = {
      bbsName: '',
      callersLog: '',
      ignoreLocal: false,
      ignoreSysop: false,
      ignoreSysopUser: false,
      processAll: false
    };

    for (let i = 0; i < resolvedArgs.length; i++) {
      const arg = resolvedArgs[i];

      if (arg.toUpperCase() === 'IGNORELOCAL') {
        options.ignoreLocal = true;
      } else if (arg.toUpperCase() === 'IGNORESYSOP') {
        options.ignoreSysop = true;
      } else if (arg.toUpperCase() === 'IGNORESYSOPUSER') {
        options.ignoreSysopUser = true;
      } else if (arg.toUpperCase() === 'PROCESSALL') {
        options.processAll = true;
      } else if (arg.toUpperCase().startsWith('TIMEZONE=')) {
        options.timeZone = arg.substring(9);
      } else if (!options.bbsName) {
        // Strip quotes from BBS name
        options.bbsName = arg.replace(/^"|"$/g, '');
      } else if (!options.callersLog) {
        // Resolve Amiga assign (bbs:, etc.) to filesystem path
        const rawPath = arg.replace(/^"|"$/g, '');
        options.callersLog = resolveAssign(rawPath);
      }
    }

    if (options.bbsName && options.callersLog) {
console.log(`[BatchScheduler] Running GLCUpdater for ${options.bbsName}, log: ${options.callersLog}`);
      await processCallersLog(options);
console.log('[BatchScheduler] GLCUpdater completed');
    } else {
console.error('[BatchScheduler] GLCUpdater requires BBSNAME and CALLERSLOG parameters');
    }
    return;
  }

  // Special-case QuickNew (TypeScript) to generate screens:quicknew.txt
  // Command format: doors:quicknew/quicknew <config_file> <days_back> >bbs:screens/quicknew.txt
  // Example: doors:quicknew/quicknew doors:quicknew/quicknew.config1 7 >bbs:screens/quicknew.txt
  if (program.includes('quicknew/quicknew')) {
    const args = resolvedArgs;
    if (args.length >= 2) {
      // args[0] is the config file path (e.g. "doors:quicknew/quicknew.config")
      // It might be quoted, so strip quotes first
      const rawConfigPath = args[0].replace(/^"|"$/g, '');
      // Resolve Amiga assign (doors:, bbs:) to absolute filesystem path
      const configPath = resolveAssign(rawConfigPath);
      
      const daysBack = parseInt(args[1], 10) || 7;

      // Output path comes from stdout redirect in batch file (e.g., >bbs:screens/quicknew.txt)
      // We extract it from the original command line using the redirect variable
      let outputPath = 'Screens/quicknew.txt'; // Default
      if (redirect) {
        // Resolve the output path (e.g., bbs:screens/quicknew.txt -> /path/to/Screens/quicknew.txt)
        const resolved = resolveAssign(redirect);
        if (resolved) {
          outputPath = resolved;
        }
      }

console.log(`[BatchScheduler] Generating QuickNew from config: ${configPath} (raw: ${args[0]}), days: ${daysBack}, output: ${outputPath}`);
      await generateQuickNewFromConfig(configPath, daysBack, outputPath);
console.log('[BatchScheduler] QuickNew generated successfully');
    } else {
console.error('[BatchScheduler] QuickNew requires config file and days back arguments');
    }
    return;
  }

  // Generate last callers bulletin using TypeScript SAmiLog implementation
  // Replaces 68K SAmiLog binary with TypeScript port (100% format compatible)
  // Command format: samilog -UC"N" -O"output/path"count
  if (program.includes('samilog/samilog') || program.includes('typescript:samilog')) {
console.log('[BatchScheduler] Running TypeScript SAmiLog');
    const samilog = await import('../services/SamiLogService');

    // Parse all stacked commands in order
    for (const arg of amigaArgs) {
      // 1. -C (Clear)
      if (arg.toUpperCase() === '-C') {
        await samilog.clearStore();
        continue;
      }

      // 2. -S (Strip MiniLog)
      const sMatch = arg.match(/^-S"(\d+)"$/i);
      if (sMatch) {
        await samilog.stripMiniLog(parseInt(sMatch[1], 10));
        continue;
      }

      // 3. -D (Docs)
      const dMatch = arg.match(/^-D"([^"]+)"$/i);
      if (dMatch) {
        const fullPath = resolveAssign(dMatch[1]);
        await samilog.createDocs(fullPath);
        continue;
      }

      // 4. -U (Update)
      const uMatch = arg.match(/^-U([SC]*)"(\d+)"$/i);
      if (uMatch) {
        const flags = uMatch[1].toUpperCase();
        const updateNode = parseInt(uMatch[2], 10);
        const updateOptions = {
          ignoreSysop: flags.includes('S'),
          createMiniLog: flags.includes('C')
        };
        await samilog.updateStoreFromCallersLog(updateNode, updateOptions);
        continue;
      }

      // 5. -W (Weekly Stats)
      const wMatch = arg.match(/^-W(N*)"([^"]+)"$/i);
      if (wMatch) {
        const options = { noAnsi: wMatch[1].toUpperCase().includes('N') };
        const fullPath = resolveAssign(wMatch[2]);
        const content = samilog.generateWeeklyStats(options);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'latin1');
        continue;
      }

      // 6. -R (Record Stats)
      const rMatch = arg.match(/^-R(N*)"([^"]+)"$/i);
      if (rMatch) {
        const options = { noAnsi: rMatch[1].toUpperCase().includes('N') };
        const fullPath = resolveAssign(rMatch[2]);
        const content = samilog.generateRecordStats(options);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'latin1');
        continue;
      }

      // 7. -O (Output Bulletin)
      const oMatch = arg.match(/^-O([NLFSTR]*)"([^"]+)"(\d+)$/i);
      if (oMatch) {
        const flags = oMatch[1].toUpperCase();
        const rawPath = oMatch[2];
        const count = parseInt(oMatch[3], 10);
        const options = {
          noAnsi: flags.includes('N'),
          logoffTimes: flags.includes('L'),
          fullNodes: flags.includes('F'),
          showFiles: flags.includes('S'),
          noTexts: flags.includes('T'),
          noRecords: flags.includes('R')
        };

        let fullPath;
        if (rawPath === '*' || rawPath.toLowerCase() === 'console:') {
console.log('[BatchScheduler] SAmiLog output to CONSOLE');
          // For now, we can't easily pipe back to actual console from batch
          continue;
        } else {
          fullPath = resolveAssign(rawPath);
        }

        const content = samilog.generateBulletin(count, options);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'latin1');
console.log(`[BatchScheduler] SAmiLog bulletin written to ${rawPath}`);
        continue;
      }
    }
    return;
  }

  // Special-case SlickTop (68K) to generate bull11
  // 68K doors expect raw Amiga paths - the emulator resolves assigns internally
  if (program.includes('slicktop/slicktop')) {
    const doorPath = resolveAssign('doors:slicktop/slicktop');
    const args = resolvedArgs; // Raw Amiga paths - emulator resolves assigns
    const nodeNum = nodeId || 1;
    if (doorPath) {
      await runAmigaDoorViaRunner(doorPath, nodeNum, args, path.dirname(doorPath));
console.log('[BatchScheduler] Ran SlickTop with args:', args.join(' '));
    }
    return;
  }

  // Generic Amiga binary execution (works for any utility: SuperAmiLog, custom tools, etc.)
  const rawProg = resolveAssign(parts[0]);
  const resolvedProg = resolveExecutable(rawProg) || (require('../utils/amigafs').resolvePath(rawProg));
  if (!resolvedProg) {
console.warn('[BatchScheduler] Skipping missing program:', parts[0]);
    return;
  }

  await runProgram(resolvedProg, amigaArgs, redirect, nodeId);
}

export async function runBatchFile(batchPath: string, nodeId: number): Promise<void> {
  if (!fs.existsSync(batchPath)) {
    return;
  }

  const contents = fs.readFileSync(batchPath, 'utf-8');
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    try {
      await executeLine(rawLine, nodeId);
    } catch (err) {
console.error(`[BatchScheduler] Error executing line "${rawLine}":`, err);
    }
  }
}

export async function runLoginBatches(nodeId: number): Promise<void> {
  const baseDir = config.getConfig().dataDir;
  const bbsRoot = process.env.BBS_ROOT || baseDir || path.resolve(process.cwd(), '..');
  const day = getSystemTime().getDay(); // 0-6, Sunday = 0
  const batchName = `batch${day}`;
  const batch000 = 'batch000';

  const candidates = [
    path.join(baseDir, batchName),
    path.join(bbsRoot, `Node${nodeId}`, batchName),
    path.join(baseDir, batch000),
    path.join(bbsRoot, `Node${nodeId}`, batch000),
  ];

  for (const candidate of candidates) {
    await runBatchFile(candidate, nodeId || 1);
  }
}

/**
 * Run logoff batches (same batch0–batch6/000 set as logon).
 * AmiExpress runs these at logoff via system commands; mirror that behavior here.
 */
export async function runLogoffBatches(nodeId: number): Promise<void> {
  const baseDir = config.getConfig().dataDir;
  const bbsRoot = process.env.BBS_ROOT || baseDir || path.resolve(process.cwd(), '..');
  const day = getSystemTime().getDay(); // 0-6, Sunday = 0
  const batchName = `batch${day}`;
  const batch000 = 'batch000';

console.log(`[BatchScheduler] Running logoff batches for node ${nodeId}, day=${day} (${batchName})`);

  const candidates = [
    path.join(baseDir, batchName),
    path.join(bbsRoot, `Node${nodeId}`, batchName),
    path.join(baseDir, batch000),
    path.join(bbsRoot, `Node${nodeId}`, batch000),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
console.log(`[BatchScheduler] Found batch file: ${candidate}`);
    }
    await runBatchFile(candidate, nodeId || 1);
  }

console.log(`[BatchScheduler] Logoff batches completed for node ${nodeId}`);
}
function runAmigaDoorViaRunner(
  doorPath: string,
  nodeId: number,
  args: string[] = [],
  cwd?: string,
  redirectPath?: string,
  envOverrides?: Record<string, string>
): Promise<void> {
  const appRootPath = path.resolve(__dirname, '../../../..');
  const dataDir = config.getConfig().dataDir;
  const bbsRoot = process.env.BBS_ROOT || dataDir || path.resolve(process.cwd(), '..');
  const assigns: Record<string, string> = {
    'BBS:': dataDir,
    'BBS': dataDir,
    'Doors:': path.join(bbsRoot, 'Doors'),
    'Doors': path.join(bbsRoot, 'Doors'),
    [`Node${nodeId}:`]: path.join(bbsRoot, `Node${nodeId}`),
    [`Node${nodeId}`]: path.join(bbsRoot, `Node${nodeId}`),
  };

  // Create drop files so doors see expected environment
  try {
    doorDropFileManager.createDoorSys(nodeId, {
      id: nodeId,
      name: 'Sysop',
      realname: 'Sysop',
      username: 'sysop',
      secLevel: 255,
      expert: 'Y',
      ansi: 'Y',
      calls: 1,
      uploads: 0,
      downloads: 0,
      byteLimit: 1024 * 1024 * 10,
      location: 'Unknown',
      phone: '000-000-0000',
      linesPerScreen: 24,
      protocol: 'Z',
      lastLogin: getSystemTime(),
    } as any, 60 * 60);
    doorDropFileManager.createDorInfo(nodeId, {
      id: nodeId,
      name: 'Sysop',
      realname: 'Sysop',
      username: 'sysop',
      secLevel: 255,
      expert: 'Y',
      ansi: 'Y',
      calls: 1,
      uploads: 0,
      downloads: 0,
      byteLimit: 1024 * 1024 * 10,
      location: 'Unknown',
      phone: '000-000-0000',
      linesPerScreen: 24,
      protocol: 'Z',
      lastLogin: getSystemTime(),
    } as any);
  } catch (err: any) {
console.warn('[BatchScheduler] Failed to create drop files:', err?.message || err);
  }

  return new Promise<void>((resolve) => {
    const runnerPath = path.join(appRootPath, 'web', 'backend', 'dist', 'scripts', 'run-amiga-door.js');
    const resolvedRunner = fs.existsSync(runnerPath) ? runnerPath : path.join(appRootPath, 'web', 'backend', 'src', 'scripts', 'run-amiga-door.ts');

    const useTsRunner = resolvedRunner.endsWith('.ts');
    const command = useTsRunner ? 'npx' : 'node';
    // For batch doors: read door type from .info file
    // Some batch doors (like quicklogon, ByteKillHandler) are actually XIM doors
    // that need XIM protocol polling to communicate with the BBS
    const doorType = getDoorTypeFromInfo(doorPath);
    console.log(`[BatchScheduler] Running door ${path.basename(doorPath)} as type ${doorType}`);
    const toolTypes = {}; // Use DoorLifecycleManager defaults
    const execArgs = useTsRunner
      ? ['tsx', resolvedRunner, doorPath, String(nodeId), ...args, '--assigns', JSON.stringify(assigns), '--tooltypes', JSON.stringify(toolTypes), '--doortype', doorType]
      : [resolvedRunner, doorPath, String(nodeId), ...args, '--assigns', JSON.stringify(assigns), '--tooltypes', JSON.stringify(toolTypes), '--doortype', doorType];

    const child: any = require('child_process').spawn(command, execArgs, {
      cwd: cwd || path.dirname(doorPath),
      env: { ...process.env, ...envOverrides, TS_NODE_TRANSPILE_ONLY: 'true' },
      detached: true, // Create new process group so we can kill the entire tree
    });

    // Timeout to prevent stuck doors from running forever
    // - XIM doors (interactive): 300s to allow for user interaction
    // - SIM doors (utilities): 30s since they should complete quickly
    // - mtop is an exception - it's XIM and needs 300s for large user databases
    const doorName = path.basename(doorPath).toLowerCase();
    const isSimUtility = doorType === 'SIM';
    const BATCH_DOOR_TIMEOUT = isSimUtility ? 30000 : 300000; // 30s for SIM, 300s for others
    let killed = false;
    const timeoutHandle = setTimeout(() => {
      if (!child.killed && child.pid) {
console.warn(`[BatchScheduler] Door ${path.basename(doorPath)} timed out after ${BATCH_DOOR_TIMEOUT / 1000}s, killing process tree (pid ${child.pid})`);
        killed = true;
        try {
          // AGGRESSIVE KILL: Use pkill to kill ALL processes matching the door name
          // This is necessary because npm/npx don't create proper process groups
          const doorName = path.basename(doorPath);
          const { execSync } = require('child_process');

          // First try process group kill
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (e1: any) {
console.warn(`[BatchScheduler] Process group kill failed: ${e1.message}`);
          }

          // Then kill by name (catches npm/npx children)
          try {
            execSync(`pkill -9 -f "${doorName}"`, { stdio: 'ignore' });
console.warn(`[BatchScheduler] Killed all processes matching: ${doorName}`);
          } catch (e2: any) {
            // pkill returns non-zero if no processes found, ignore
          }

          // Finally, direct kill of child
          child.kill('SIGKILL');
        } catch (e: any) {
console.error(`[BatchScheduler] Failed to kill door: ${e.message}`);
        }
      }
    }, BATCH_DOOR_TIMEOUT);

    const MAX_OUTPUT_LENGTH = 256 * 1024; // keep last 256 KB
    let output = '';
    const appendOutput = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(output.length - MAX_OUTPUT_LENGTH);
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      appendOutput(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      appendOutput(chunk);
    });

    child.on('error', (err: any) => {
      clearTimeout(timeoutHandle);
console.warn(`[BatchScheduler] Amiga door runner failed to start: ${err.message}`);
      resolve();
    });
    child.on('close', (code: number) => {
      clearTimeout(timeoutHandle);
      const trimmed = output.trim();
      if (killed) {
console.warn(`[BatchScheduler] Door ${path.basename(doorPath)} was killed due to timeout`);
      } else if (code !== 0) {
console.warn(`[BatchScheduler] Amiga door runner exited with code ${code}`);
        if (trimmed) {
console.warn(`[BatchScheduler] Runner output:\n${trimmed}`);
        }
      }
      if (trimmed) {
        try {
          const logFile = path.join(appRootPath, 'logs', 'door-68k.log');
          fs.appendFileSync(logFile, `[BatchRunner] door=${doorPath} node=${nodeId} code=${code}\n${trimmed}\n`, { encoding: 'utf8' });
        } catch {
          /* ignore */
        }
      }
      if (redirectPath) {
        const resolved = resolveAssign(redirectPath);
        try {
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          fs.writeFileSync(resolved, output, 'utf8');
console.log(`[BatchScheduler] Redirected output to ${resolved}`);
        } catch (err) {
console.error('[BatchScheduler] Failed to write redirect file:', err);
        }
      }
      resolve();
    });
  });
}
