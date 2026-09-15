import * as fs from 'fs';
/*
 * A BATCH SCRIPT IS AMIGA-CASED AND LINUX IS NOT, and the sysop writes the
 * batch script. "the entire bbs is supposed to be case insensitive" and "you
 * never know what sysops puts in the batch scripts" - the sysop, 2026-09-15.
 *
 * Every path in this file that comes from a batch line, a door's name or a
 * config goes through `amigafs`, which resolves existing ancestors
 * case-insensitively and only creates what genuinely is not there. Raw `fs`
 * stays for paths WE construct - the runner's own script, the debug log -
 * where the spelling is ours and cannot drift.
 *
 * The bug that prompted the sweep: `>bbs:screens/quicknew.txt` with a
 * `Screens` directory on the volume. Raw `fs.mkdirSync` would have created a
 * SECOND lowercase `screens/`, written the door's output into it, and left the
 * board reading the old file for ever - the "two quicknew files" this repo has
 * seen before.
 */
import * as amigafs from '../utils/amigafs';
import * as path from 'path';
import { GENERATED_SCREEN_ROWS } from '../screens/screen-rows';
import { config } from '../config';
import { findCaseInsensitive, resolveExistingAncestors } from '../utils/amigafs';

import { generateBulletin as generateSamiLogBulletin } from '../services/SamiLogService';

/**
 * How tall a generated bulletin may be.
 *
 * The board's one budget for a generated screen. It was 24 here, chosen
 * against a 25-row terminal - and the sysop's is 24, so the bulletin came out
 * exactly one row too tall and paginated. screens/screen-rows carries the
 * number and the reasoning now, so no generator picks its own again.
 */
const BULLETIN_FIT_ROWS = GENERATED_SCREEN_ROWS;
import { doorDropFileManager } from '../services/DoorDropFileManager';
import { InfoFileParser } from './info-file-parser';
import { getSystemTime } from '../utils/date-time.util';
import { processMci as processMciTokenizer, type MciDispatchMap } from '../utils/mci-tokenizer.util';

/**
 * Get door type from .info file (TYPE tooltype)
 * Returns 'XIM' for XIM doors, 'SIM' as default for plain AmigaDOS executables
 */
function getDoorTypeFromInfo(doorPath: string): string {
  const infoPath = doorPath + '.info';
  // `QuickNew.info`, `QUICKNEW.INFO` - a door brought over from a real Amiga
  // can be spelled either way, and getting this wrong silently downgrades the
  // door to the SIM default.
  if (!amigafs.existsSync(infoPath)) {
    return 'SIM'; // Default for doors without .info files
  }

  try {
    const buffer = amigafs.readFileSync(infoPath) as Buffer;
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
 * Process MCI codes in command string (express.e:6675 processMci).
 * Subset of the screen.handler.ts dispatch — only the codes that
 * EXECUTE_ON commands typically reference. Unknown codes fall through
 * intact (tokenizer's soft fall-through behaviour).
 *
 * Was 9 separate `replace(/~N/gi, ...)` regexes which had the same
 * bug as the old screen.handler regex pipeline: required no terminator,
 * so `~N1` would match `~N` first and emit `<username>1`. The shared
 * tokenizer reads cmd until a space/terminator/end and dispatches
 * exactly once, matching express.e behaviour.
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
  const now = getSystemTime();
  const nodeIdStr = nodeId.toString();
  const dispatch: MciDispatchMap = {
    // Node number aliases (express.e:5379-5382, 5409-5412)
    ND: () => nodeIdStr,
    LG: () => nodeIdStr,
    ON: () => nodeIdStr,
    // System clocks (express.e:5435-5438, 5395-5398)
    DT: () => now.toLocaleDateString(),
    OT: () => now.toLocaleTimeString(),
  };
  if (context?.username) {
    dispatch.N = () => context.username!;
  }
  if (context?.location) {
    dispatch.UL = () => context.location!;
  }
  if (context?.confNum !== undefined) {
    dispatch.CF = () => context.confNum!.toString();
  }
  if (context?.confName) {
    dispatch.CN = () => context.confName!;
  }
  return processMciTokenizer(cmd, dispatch);
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

/**
 * EVERY SEGMENT, NOT JUST THE LAST ONE.
 *
 * This resolved only the basename and passed the DIRECTORY through literally,
 * so `doors:quicknew/quicknew` never found `Doors/QuickNew/QuickNew`: the
 * lookup was made in `/app/data/bbs/Doors/quicknew`, a directory that does not
 * exist, and the answer was "no such door".
 *
 * That is not a missing-door message on the caller's screen - it is worse. The
 * batch quietly fell through to the TypeScript generator instead of the 68K
 * door the line names, so the board looked like it was working while running
 * something else entirely (2026-09-15: the restored QuickNew was on the volume,
 * the batch line named it, and every logoff still ran the generator).
 *
 * `amigafs.resolvePath` walks the whole path case-insensitively, which is what
 * AmigaDOS does and what the rest of this file now uses.
 */
function findInsensitiveFull(fullPath: string): string | null {
  return amigafs.resolvePath(fullPath);
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
            amigafs.mkdirSync(dir, { recursive: true });
            amigafs.writeFileSync(resolved, output, 'utf-8');
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

  // MultiTop: fall through to the generic Amiga 68K runner.
  // We previously short-circuited to a TypeScript port (generateMultiTop)
  // but it reads user-record aggregate fields and silently filters sysops
  // when batch passes `ignoresysop`, producing empty bull1..bull5 charts
  // for sysop-only test BBSes. The 68K binary at Doors/MultiTop/MultiTop
  // reads the real UDLog and reproduces the original behaviour.

  // WEB_: disable buggy Discord announce utility instead of launching it from batch files.
  // User requested removal; keep the binary/docs for reference but skip runtime execution.
  if (program.toLowerCase().includes('dannounce')) {
console.log('[BatchScheduler] Skipping disabled utility: dannounce');
    return;
  }

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
        amigafs.mkdirSync(path.dirname(fullPath), { recursive: true });
        amigafs.writeFileSync(fullPath, content, 'latin1');
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
          noRecords: flags.includes('R'),
          /*
           * The bulletin is written to fit an ordinary screen.
           *
           * `count` is how many callers the batch command ASKS for - 20 on
           * this board - and at that length the file came to 38 lines, so the
           * board paginated it and put `(Pause)...More(y/n/ns)?` through the
           * middle of the callers table (the sysop, 2026-09-14). A bulletin is
           * one composed screen; it should not need a page break at all.
           *
           * So `count` becomes a MAXIMUM and the height decides the rest. The
           * header art and the tailer are files the sysop edits, so a taller
           * logo simply costs caller rows - the fit is measured from the
           * assembled text, never from a hard-coded chrome height.
           *
           * Generated once at logoff for every caller, so the budget is the
           * standard screen rather than any one terminal: 24 rows, which fits
           * a 24-row terminal and leaves a line on a 25-row one.
           */
          fitRows: BULLETIN_FIT_ROWS
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
        amigafs.mkdirSync(path.dirname(fullPath), { recursive: true });
        amigafs.writeFileSync(fullPath, content, 'latin1');
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
  /*
   * QuickNew is a TypeScript generator, not a door on disk.
   *
   * The batch line is the Amiga one - `doors:quicknew/quicknew <config> <days>
   * >bbs:screens/quicknew.txt` - and the 68K binary it names is not shipped
   * (its directory was removed as corpus junk in 6a6dcc475). The generator
   * that replaced it, utils/quicknew-generator.ts, was deleted by an
   * unrelated commit (0fd4c03e1, 2026-04-28) and with it this intercept
   * (9b9ee9caa, then c99c1e0f3). Since then every logoff batch has logged
   * `Skipping missing program: doors:quicknew/quicknew` and the screen has
   * shown 00 files for months. "re-enable quicknew" (sysop, 2026-09-15).
   *
   * Config path and days come from the line; the output path from its
   * stdout redirect, exactly as the Amiga door was invoked.
   *
   * The line spells them the Amiga way - `doors:quicknew/quicknew.config1`,
   * `bbs:screens/quicknew.txt` - and the volume spells them
   * `Doors/QuickNew/QuickNew.Config1` and `Screens/`. On Linux those are
   * different files: an earlier run minted a lowercase `screens/` beside
   * `Screens/` (two 0-byte quicknew files, found on the live volume
   * 2026-09-15), and the loader's case-insensitive walk can then land on
   * either. Resolve through the existing directories the way the loader
   * does, so the file written is the file read.
   */
  if (program.includes('quicknew/quicknew')) {
    /*
     * THE REAL 68K DOOR FIRST, ALWAYS.
     *
     * "replacing quicknew with a typescript alternative doesnt help our project
     * get full compatibility" - the sysop, 2026-09-15, and they are right. The
     * generator below was written because the binary the batch line names had
     * been deleted from Doors/ as corpus junk (6a6dcc475), so the line resolved
     * to nothing and the screen showed 00 files for months. It is a fix at the
     * wrong layer: it renders what it thinks QuickNew renders, which is not the
     * same thing as what QuickNew renders. Measured on the restored binary the
     * same day: the real door emits lines up to 94 columns because it prints
     * the config's templates verbatim, and the generator folds them to 80 -
     * so the two disagree about the screen the moment a template is long.
     *
     * The binary is back (GOD-QN22, V2.2 by Calypso/GOD and REbEL/QTX, with its
     * asm source and .Doc beside it). When it is there it runs, through the
     * ordinary door path below, with its stdout redirected exactly as the Amiga
     * invoked it. The generator stays only for a board that does not have the
     * binary - a shareware door nobody is obliged to ship - and says so rather
     * than pretending to be the door.
     */
    const realDoor = resolveExecutable(resolveAssign(program));
    if (realDoor) {
console.log(`[BatchScheduler] QuickNew: running the real 68K door at ${realDoor}`);
      // Fall through to the ordinary 68K path.
    } else {
    const args = resolvedArgs;
    if (args.length >= 2) {
      const configPath = resolveExistingAncestors(resolveAssign(args[0].replace(/^"|"$/g, '')));
      const daysBack = parseInt(args[1], 10) || 7;
      let outputPath = resolveExistingAncestors(resolveAssign('bbs:screens/quicknew.txt'));
      if (redirect) {
        const resolved = resolveAssign(redirect);
        if (resolved) outputPath = resolveExistingAncestors(resolved);
      }
console.log(`[BatchScheduler] QuickNew: generating from ${configPath}, ${daysBack} days, into ${outputPath}`);
      const { generateQuickNewFromConfig } = require('../utils/quicknew-generator');
      /*
       * SAY WHICH IT WAS. `generateQuickNewFromConfig` answers null when it
       * could not read the config, and this logged "screen regenerated" either
       * way - so `bbs:screens/quicknew2.txt` sat unchanged since May while
       * every logoff reported success. The batch line for it names
       * `quicknew.config`, the volume has `QuickNew.Config1`, and nothing
       * connected the two because the failure announced itself as a success.
       */
      const written = await generateQuickNewFromConfig(configPath, daysBack, outputPath);
      if (written) {
console.log('[BatchScheduler] QuickNew: screen regenerated');
      } else {
console.error(`[BatchScheduler] QuickNew: NOT regenerated - could not read ${configPath}`);
      }
    } else {
console.error('[BatchScheduler] QuickNew: the batch line needs <config> <days>');
    }
    return;
    }
  }

  const rawProg = resolveAssign(parts[0]);
  const resolvedProg = resolveExecutable(rawProg) || (require('../utils/amigafs').resolvePath(rawProg));
  if (!resolvedProg) {
console.warn('[BatchScheduler] Skipping missing program:', parts[0]);
    return;
  }

  await runProgram(resolvedProg, amigaArgs, redirect, nodeId);
}

/**
 * ONE BATCH AT A TIME, ACROSS THE WHOLE BOARD.
 *
 * A batch file runs 68K doors - batch1 on this board is MultiTop five times,
 * ByteKillHandler and QuickNew, each a spawned emulator with a 300 s budget.
 * Nothing serialised them: a second logoff while the first batch was still
 * grinding started a second set of emulators beside it, and the login path
 * once needed a reentrancy guard for exactly this after two OOM kills (see
 * runLoginBatches' note above). That guard went with the function; this is
 * the one that stays, and it covers every path that runs a batch - the
 * LOGOFF<n> sys-command and the disconnect handler's mirror alike.
 *
 * "we have had big issues with the batch doors never exiting in the past
 * make sure it doesnt come back" (the sysop, 2026-09-14). A door that never
 * exits is bounded by the per-door timeout below; a PILE of them is bounded
 * here. And a run already waiting for the SAME file is not queued twice -
 * three quick logoffs regenerate the bulletins once, not three times.
 */
let batchChain: Promise<void> = Promise.resolve();
const batchWaiting = new Set<string>();
let batchRunning = 0;

/** How many batch runs are queued or running - for logs and tests. */
export function batchQueueDepth(): number {
  return batchWaiting.size + batchRunning;
}

/**
 * The queue itself: run `work` after everything already queued, one at a time.
 *
 * Resolves when THIS run has finished, or at once with the run already waiting
 * when `key` is still queued and not yet started - a run that is waiting is a
 * run that will happen, and queueing it again only adds a copy. Never
 * rejects: work that throws is logged and the queue moves on, because a
 * wedged queue would stop every later logoff from regenerating anything.
 *
 * Kept apart from `runBatchFile` so the ordering can be tested with a
 * controllable stand-in rather than an emulator.
 */
export function enqueueBatch(key: string, label: string, work: () => Promise<void>): Promise<void> {
  if (batchWaiting.has(key)) {
console.log(`[BatchScheduler] ${label} is already waiting; not queued twice`);
    return batchChain;
  }
  batchWaiting.add(key);
  const depth = batchQueueDepth();
  if (depth > 1) {
console.log(`[BatchScheduler] ${label} queued behind ${depth - 1} other batch run(s)`);
  }

  const run = batchChain.then(async () => {
    batchWaiting.delete(key);
    batchRunning++;
    try {
      await work();
    } catch (err) {
console.error(`[BatchScheduler] ${label} failed:`, err);
    } finally {
      batchRunning--;
    }
  });
  batchChain = run;
  return run;
}

/** `runBatchFile`, through the queue. Every batch path uses this. */
export function runBatchFileQueued(batchPath: string, nodeId: number): Promise<void> {
  return enqueueBatch(
    `${batchPath}#${nodeId}`,
    `${path.basename(batchPath)} for node ${nodeId}`,
    () => runBatchFile(batchPath, nodeId),
  );
}

export async function runBatchFile(batchPath: string, nodeId: number): Promise<void> {
  // `batch1` or `Batch1` - the file is the sysop's, and so is its spelling.
  if (!amigafs.existsSync(batchPath)) {
    return;
  }

  const contents = amigafs.readFileSync(batchPath, 'utf-8') as string;
  const lines = contents.split(/\r?\n/);

  /*
   * A BATCH THAT ONLY PARTLY RAN MUST SAY SO.
   *
   * Every line is tried and a failure never stops the ones after it, which is
   * right - one broken door must not cost the board its other bulletins. But
   * the outcome was never reported, so a run that did two of eight things
   * looked exactly like a run that did all eight: the only trace was one
   * `Error executing line` somewhere in a log full of emulator output.
   *
   * On 2026-09-14 a logoff rebuilt bull1 and bull2 and stopped. Nothing said
   * whether the rest had failed, been skipped, or never been reached, and the
   * container was recreated before the window could be read - so the cause is
   * still unknown and had to be left open. A line at the end naming the
   * counts is what makes the NEXT partial run diagnose itself.
   *
   * Counted here rather than inside executeLine because only this loop knows
   * how many lines the file actually had.
   */
  let ran = 0;
  let failed = 0;
  const broken: string[] = [];

  for (const rawLine of lines) {
    // A comment or a blank is not a step, and counting them would make every
    // batch look busier than it is.
    const step = rawLine.trim();
    if (!step || step.startsWith(';') || step.startsWith('#')) continue;
    try {
      await executeLine(rawLine, nodeId);
      ran++;
    } catch (err) {
      failed++;
      broken.push(step);
console.error(`[BatchScheduler] Error executing line "${rawLine}":`, err);
    }
  }

  const name = path.basename(batchPath);
  if (failed > 0) {
console.error(`[BatchScheduler] ${name} finished INCOMPLETE for node ${nodeId}: ${ran} of ${ran + failed} steps ran, ${failed} failed: ${broken.join(' | ')}`);
  } else {
console.log(`[BatchScheduler] ${name} finished for node ${nodeId}: ${ran} steps, all ran`);
  }
}

/**
 * THERE IS NO LOGIN-SIDE BATCH RUNNER, AND THERE MUST NOT BE ONE.
 *
 * `BBS:Batch<weekday>` is reached in express.e from exactly one place - the
 * logoff sys-commands `LOGOFF` and `LOGOFF<node>` (express.e:8222,
 * 8230-8231), which on this board resolve to `LOCATION=BBS:Batch<n>`. At
 * logon express.e runs `runExecuteOn('LOGON')` (express.e:6715) and nothing
 * else; the live `BBSConfig.info` declares no `EXECUTE_ON_*` at all.
 *
 * `runLoginBatches()` used to fire the same file from `login-post.service.ts`
 * on every successful login. It had no express.e counterpart and it was
 * VISIBLE: today's `batch1` runs `doors:multitop/mtop` five times, once per
 * design, so a caller watched MultiTop-II paint five screens on the way in
 * (sysop, 2026-09-14) - plus QuickNew, ByteKillHandler, GLCUpdater and
 * SAmiLog, five 68K emulator spawns of it, all repeating what the logoff had
 * already done.
 *
 * It also needed a per-node reentrancy guard that nothing else needs: a fast
 * reconnect to the same node fired it twice and orphaned duplicate QuickNew
 * emulators - 5 on the live board inside 20 seconds, ~2GB RSS, contributing
 * to two OOM kills. The guard went with the function; the logoff path runs
 * once per caller leaving, which is not a race.
 *
 * `tests/services/a-login-does-not-run-the-logoff-batch.test.ts` drives the
 * real login pipeline and asks whether the batch file was read.
 */

/**
 * Has this session's logoff batch already run?
 *
 * TWO PATHS REACH THE SAME BATCH, and only one of them is express.e's. A
 * deliberate `G` runs `processSysCommand('LOGOFF')` and `LOGOFF<node>`
 * (express.e:8222, 8231), which resolve to `BBS:Batch<n>`; the disconnect
 * handler then runs `runLogoffBatches` as well, because a caller whose
 * carrier drops never reaches the `G` path and his batch has to run
 * somewhere. On a clean logoff both fired and the batch ran TWICE - the
 * bulletins regenerated twice per logoff (sysop's live log, 2026-09-14).
 *
 * The sys-command path marks the session when it has run them, so the
 * mirror stands down. The mark - and not `cleanLogoff` - because what
 * matters is whether the BATCH ran, not how the caller left: if the
 * sys-command path ever stops running them, the mirror picks them up again
 * with no second change.
 */
export function logoffBatchesAlreadyRan(session: { logoffBatchesRan?: boolean } | null | undefined): boolean {
  return session?.logoffBatchesRan === true;
}

/**
 * Run logoff batches (same batch0–batch6/000 set as logon).
 * AmiExpress runs these at logoff via system commands; mirror that behavior here.
 */
export async function runLogoffBatches(nodeId: number): Promise<void> {
  const baseDir = config.getConfig().dataDir;
  const bbsRoot = process.env.BBS_ROOT || baseDir || path.resolve(process.cwd(), '..');
  const appRoot = process.cwd(); // App root where batch files live
  const day = getSystemTime().getDay(); // 0-6, Sunday = 0
  const batchName = `batch${day}`;
  const batch000 = 'batch000';

console.log(`[BatchScheduler] Running logoff batches for node ${nodeId}, day=${day} (${batchName})`);

  const candidates = [
    path.join(appRoot, batchName),           // App root batch files (primary)
    path.join(baseDir, batchName),           // Data dir batch files
    path.join(bbsRoot, `Node${nodeId}`, batchName),
    path.join(appRoot, batch000),            // App root batch000
    path.join(baseDir, batch000),
    path.join(bbsRoot, `Node${nodeId}`, batch000),
  ];

  for (const candidate of candidates) {
    if (!amigafs.existsSync(candidate)) continue;
console.log(`[BatchScheduler] Found batch file: ${candidate}`);
    // Through the queue: this mirror and the LOGOFF<n> sys-command must never
    // run emulators side by side.
    await runBatchFileQueued(candidate, nodeId || 1);
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

  // Read OVERCLOCK tooltype from the door's .info so batch invocations
  // honour the same speed boost interactive doors get. Without this,
  // every batch door runs at DoorLifecycleManager's 100x default — fine
  // for tiny utilities, far too slow for ones that walk large data
  // (mtop reads the full user.data; SAmiLog scans every CallersLog).
  //
  // Heavy-utility name overrides (last-resort floor): even if a door's
  // own .info ships a conservative OVERCLOCK, these names are known to
  // be safe to run very fast since they do pure file I/O, no input.
  const HEAVY_BATCH_OVERRIDES: Record<string, number> = {
    mtop: 5000,
    multitop: 5000,
    // ByteKillHandler walks the entire bytefile listing on logoff;
    // QuickNew scans every NEW message base. Both timed out at the
    // default 100x floor / 30s budget. Bench data (report-overclock.json)
    // shows both safe at 100000x, so 5000x is conservative-safe.
    bytekillhandler: 5000,
    quicknew: 5000,
  };
  let batchOverclock: number | undefined;
  try {
    const infoPath = doorPath + '.info';
    if (fs.existsSync(infoPath)) {
      const buf = fs.readFileSync(infoPath);
      const parser = new InfoFileParser();
      const parsed = parser.parse(buf);
      const raw = parsed.toolTypes.get('OVERCLOCK');
      if (raw) {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) batchOverclock = n;
      }
    }
  } catch { /* fall through to default */ }
  const heavyFloor = HEAVY_BATCH_OVERRIDES[path.basename(doorPath).toLowerCase()];
  if (heavyFloor !== undefined) {
    batchOverclock = Math.max(batchOverclock ?? 0, heavyFloor);
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
    if (batchOverclock !== undefined) {
      console.log(`[BatchScheduler] Running door ${path.basename(doorPath)} as type ${doorType} (overclock=${batchOverclock}x)`);
    } else {
      console.log(`[BatchScheduler] Running door ${path.basename(doorPath)} as type ${doorType}`);
    }
    const toolTypes = {}; // Use DoorLifecycleManager defaults
    const execArgs = useTsRunner
      ? ['tsx', resolvedRunner, doorPath, String(nodeId), ...args, '--assigns', JSON.stringify(assigns), '--tooltypes', JSON.stringify(toolTypes), '--doortype', doorType]
      : [resolvedRunner, doorPath, String(nodeId), ...args, '--assigns', JSON.stringify(assigns), '--tooltypes', JSON.stringify(toolTypes), '--doortype', doorType];

    const spawnEnv: Record<string, string | undefined> = {
      ...process.env,
      ...envOverrides,
      TS_NODE_TRANSPILE_ONLY: 'true',
    };
    if (useTsRunner) {
      // cwd below is deliberately the door's own directory (doors expect to
      // find/write their data files there), but tsx resolves its tsconfig
      // from cwd - so it never found web/backend/tsconfig.json's
      // experimentalDecorators:true, and any door pulling in a decorated
      // class (ChatHandler's @injectable/@inject) crashed on transform.
      // Point tsx at the right tsconfig directly, independent of cwd.
      spawnEnv.TSX_TSCONFIG_PATH = path.join(appRootPath, 'web', 'backend', 'tsconfig.json');
    }
    if (batchOverclock !== undefined && spawnEnv.DOOR_OVERCLOCK === undefined) {
      // DoorLifecycleManager checks DOOR_OVERCLOCK first and falls back to
      // config.overclockFactor — passing as env keeps the existing
      // priority chain intact without touching the runner's CLI.
      spawnEnv.DOOR_OVERCLOCK = String(batchOverclock);
    }
    console.log(`[BatchScheduler] spawn env DOOR_OVERCLOCK=${spawnEnv.DOOR_OVERCLOCK ?? '(unset)'} for ${path.basename(doorPath)}`);
    const child: any = require('child_process').spawn(command, execArgs, {
      // The TS runner MUST run from web/backend: tsx resolves tsconfig by
      // walking up from cwd, and from a door's own directory it finds the
      // repo root's config, which has no experimentalDecorators - the
      // runner then dies on chat.handler.ts before doing anything, on
      // every scheduler tick ("[runner:mtop] ... Parameter decorators only
      // work when experimental decorators are enabled"). Dev-only in
      // practice: the container ships dist/ and takes the node branch.
      // Every path the runner receives is absolute, so cwd carries no
      // meaning for it beyond config resolution.
      cwd: useTsRunner ? path.join(appRootPath, 'web', 'backend') : (cwd || path.dirname(doorPath)),
      env: spawnEnv,
      detached: true, // Create new process group so we can kill the entire tree
    });
    // run-amiga-door.ts waits for stdin EOF when not a TTY (to support
    // scripted-input from the corpus runner). Batch doors have no input
    // script — close stdin immediately so the runner doesn't block forever.
    child.stdin?.end();

    // Timeout to prevent stuck doors from running forever
    // - XIM doors (interactive): 300s to allow for user interaction
    // - SIM doors (utilities): 30s since they should complete quickly
    // - mtop is an exception - it's XIM and needs 300s for large user databases
    const doorName = path.basename(doorPath).toLowerCase();
    const isSimUtility = doorType === 'SIM';
    // mtop walks the entire user.data — on a real BBS with hundreds of users
    // this can take well past 30s under the 68K emulator. Give it the same
    // 300s budget XIM doors get even though its .info classifies it as SIM.
    const needsLongTimeout =
      doorName === 'mtop' ||
      doorName === 'multitop' ||
      doorName === 'bytekillhandler' ||
      doorName === 'quicknew';
    const BATCH_DOOR_TIMEOUT = (isSimUtility && !needsLongTimeout) ? 30000 : 300000;
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
    // stderr = debug/log output from the runner. Don't include in the
    // redirect file (which captures door-emitted content), but DO surface
    // it to the parent backend log so we can see runner-side errors and
    // verify env propagation (e.g. [DoorLifecycleManager] Overclocking).
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      if (line.trim().length > 0) {
        process.stderr.write(`[runner:${path.basename(doorPath)}] ${line}`);
      }
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
          /*
           * THROUGH amigafs, BECAUSE A BATCH LINE IS AMIGA-CASED AND LINUX IS
           * NOT.
           *
           * This board's batch line is `>bbs:screens/quicknew.txt` and the
           * directory on the volume is `Screens`. Plain `fs` would take the
           * spelling literally, `mkdirSync` would CREATE a second lowercase
           * `screens/`, and the door's output would land in a directory the
           * board never reads - while the screen resolver, which IS
           * case-insensitive, went on showing the old file. That is the "two
           * quicknew files" this repo has seen before.
           *
           * `amigafs.writeFileSync` and `mkdirSync` resolve existing ancestors
           * case-insensitively and only create what genuinely does not exist,
           * which is the same rule the door's own file handling uses.
           */
          const amigafs = require('../utils/amigafs');
          amigafs.mkdirSync(path.dirname(resolved), { recursive: true });
          amigafs.writeFileSync(resolved, output, 'utf8');
console.log(`[BatchScheduler] Redirected output to ${resolved}`);
        } catch (err) {
console.error('[BatchScheduler] Failed to write redirect file:', err);
        }
      }
      resolve();
    });
  });
}
