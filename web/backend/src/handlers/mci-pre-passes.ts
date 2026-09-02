/**
 * ONE MCI pre-pass pipeline.
 *
 * Twenty MCI tokens never reach the tokenizer: they are consumed by regex
 * passes that run BEFORE `processMci`, because they either need their `~`
 * intact or carry multi-word arguments the tokenizer's space boundary would
 * split. A `.seq` renderer that called `processMci` alone would support none
 * of them, so the passes were lifted VERBATIM out of `parseMciCodes`
 * (screen.handler.ts) into this module and both callers run them.
 *
 * The rows, in source order:
 *   ~D<char> terminator, ~XC_<cmd>||, ~XI<door>, ~CL., ~CD., ~ML., ~MD.,
 *   %NODELIST, ~CR_<prompt>||, ~SM_<menu>||, ~CC_ (non-inline),
 *   ~SS_/~2S (non-inline), ~<n>SR_ (non-inline), ~SX_<base>|| (both modes),
 *   ~SMO<n>|, ~SMC|, ~SP., ~CR., ~NSF, bare `~` on a line.
 *
 * FLAVOUR DIFFERENCES - the complete list. Everything else is one shared
 * definition, byte for byte:
 *   - ~CL. / ~CD. / ~ML. / ~MD.: `flavour: 'petscii'` forces the `isNarrow`
 *     branch that already existed (a petsciiMode session takes it today) and
 *     strips its SGR runs, clipping each row with `narrowClip`. No new
 *     40-column builder, and no new `40` literal.
 *   - %NODELIST: its only ANSI is the `\x1b[32mYou\x1b[0m` marker, which
 *     becomes plain `You`. The rows are already under 40 columns.
 *   - the bare `~` line: `\x1b[2J\x1b[H` becomes `$93` (CLR).
 *
 * The ANSI path is pinned byte-for-byte by
 * `tests/handlers/mci-pre-passes.test.ts`, whose snapshot was generated
 * before this module existed.
 *
 * Plan: `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`, Task 4b.
 */
import { db } from '../database';
import { BBSPaths } from '../utils/bbs-paths.util';
import { sequentialFileManager, formatNumberedFilename } from '../services/SequentialFileManager';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { DebugLogger } from '../utils/debug-logger.util';
import { isNarrow, narrowClip } from '../utils/table-format.util';
import { AnsiUtil } from '../utils/ansi.util';
import { checkConfAccess } from './message/message-scan.handler';
import { getBoardConfig } from '../services/bbs-config-file.service';
import { config as appConfig } from '../config';
import { MCI_SENTINELS, type MciFlavour, type MciSentinels } from './mci-dispatch';

/**
 * PETSCII flavour only: the delimiters that mark a run of GENERATED text -
 * text this module composed (a conference list, the node list, a `~CR_`
 * prompt) rather than art the sysop drew.
 *
 * Why a marker and not a span list: these passes are a chain of regex
 * replaces, so an offset recorded by one pass is invalidated by the next, and
 * `processMci` then shifts every offset again. A NUL-delimited marker travels
 * WITH the text through every later pass and arrives in the tokenizer's
 * output still wrapped around exactly the characters it was put around - the
 * same trick `MCI_SENTINELS` already uses for structural tokens, and the
 * reason the renderer can trust it without any offset arithmetic.
 *
 * The `.seq` renderer (`petscii-screen.render.ts`) encodes what lies between
 * them through the ONE ASCII->PETSCII table, at the charset bank the art is
 * in at that point on the screen. Without it, generated ASCII is copied byte
 * for byte and lands on graphics glyphs in the `$0E` bank.
 *
 * ANSI flavour is untouched: `generated()` is the identity there, so the
 * `.TXT` path stays byte-identical.
 */
export const MCI_GENERATED = { START: '\x00G:', END: '\x00' } as const;

export interface MciPrePassOpts {
  flavour: MciFlavour;
  inlineMode: boolean;
  /** Defaults to the shared MCI_SENTINELS; only `SP` is read here. */
  sentinels?: MciSentinels;
}

export interface MciPrePassResult {
  text: string;
  terminator: string;
  hasPause: boolean;
  commandsToExecute: string[];
  filesToDisplay: string[];
  slowmo: number;
  slowmoCount: number;
}

/**
 * screen.handler imports THIS module at load time, so `loadScreenFile`,
 * `getConferences` and `screenDebug` cannot be imported at the top: the cycle
 * would close before either module finished evaluating. By the time any
 * pre-pass runs, screen.handler is fully loaded, so a lazy require is safe -
 * the same idiom screen.handler already uses for command.handler.
 */
function screenHandler(): typeof import('./screen.handler') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./screen.handler');
}

const screenDebug = (...args: any[]): void => screenHandler().screenDebug(...args);


/**
 * ASYNC for the same reason buildMciDispatch is: `~ML.` / `~MD.` await
 * `db.getMessageBases` and `%NODELIST` awaits `getBoardConfig`.
 */
export async function applyMciPrePasses(
  text: string,
  session: any,
  opts: MciPrePassOpts,
): Promise<MciPrePassResult> {
  const { flavour, inlineMode } = opts;
  const sentinels = opts.sentinels ?? MCI_SENTINELS;
  const petscii = flavour === 'petscii';

  // `narrow` opens the 40-column branches that already exist in the list
  // passes below; a petsciiMode session satisfies isNarrow today, and the
  // petscii flavour forces them open regardless of how the session is set up.
  const narrow = petscii || isNarrow(session);

  /** One rendered row: plain and clipped for a C64, untouched for ANSI. */
  const row = (value: string): string =>
    (petscii ? narrowClip(AnsiUtil.stripAnsi(value)) : value) + '\r\n';

  /**
   * Mark a run this module GENERATED, so the `.seq` renderer encodes it per
   * bank instead of copying it as art. Identity in the ANSI flavour.
   */
  const generated = (value: string): string =>
    petscii && value.length > 0 ? `${MCI_GENERATED.START}${value}${MCI_GENERATED.END}` : value;

  const content = text;
  let parsed = text;
  const commandsToExecute: string[] = [];
  // Files to display (~SS_, ~SX_, ~SR_) collected during the pre-
  // tokenizer pass and substituted later by the caller.
  const filesToDisplay: string[] = [];
  let hasPause = false;
  let slowmo = session?.slowmo || 0;
  let slowmoCount = session?.slowmoCount || 0;
  let slowmoApplied = slowmo;
  let slowmoAppliedCount = slowmoCount;

  // PHASE 5: ~Dx MCI Terminator Support (express.e:5651-5735)
  // Parse ~D<char> codes to change MCI terminator dynamically
  // Default terminator is |, but ~D. changes it to . for subsequent codes
  // Example: ~D. changes terminator to ., then ~c3RED~c4GREEN. uses . instead of |
  let mciTerminator = '|'; // Default MCI terminator

  // Extract all ~D terminator changes and apply them sequentially
  // This allows screen files to change terminators mid-stream
  const terminatorRegex = /~D(.)/g;
  let match;
  const terminatorChanges: Array<{index: number, char: string}> = [];

  while ((match = terminatorRegex.exec(parsed)) !== null) {
    terminatorChanges.push({
      index: match.index,
      char: match[1]
    });
  }

  // Remove ~D codes from output (they're control codes, not display codes)
  parsed = parsed.replace(terminatorRegex, (match, newTerm) => {
    screenDebug(`[MCI] Terminator changed from '${mciTerminator}' to '${newTerm}'`);
    mciTerminator = newTerm;
    return '';
  });

  // ~XC - Execute Command (CRITICAL for NI/NO tools)
  // Format: ~XC_<command> <params>||
  // Example: ~XC_DOORS:who/NI ~N||
screenDebug('[MCI] ========== PROCESSING MCI CODES ==========');
screenDebug('[MCI] Content length:', content.length);
screenDebug('[MCI] Looking for ~XC_ and ~XI codes...');

  // Debug log start of MCI parsing
  DebugLogger.mci((session as any).socket?.id || 'unknown', `Parsing MCI codes (${content.length} bytes)`);

  const xcRegex = /~XC_([^\|]+)\|\|/g;
  parsed = parsed.replace(xcRegex, (_fullMatch: string, commandStr: string) => {
    screenDebug('[MCI] *** FOUND ~XC_ COMMAND:', commandStr);
    commandsToExecute.push(commandStr.trim());
    screenDebug('[MCI] Added command to execution queue');
    DebugLogger.mci((session as any).socket?.id || 'unknown', `Found MCI: ~XC_ (Execute Command)`, { command: commandStr });
    return '';
  });

  // ~XI - Execute XIM door (express.e format: ~XI<doorpath>)
  // Format: ~XIDOORS:who/NI or ~XIDOORS:who/No
  // This executes XIM doors silently from screen files
  const xiRegex = /~XI([^\s\r\n]+)/g;
  parsed = parsed.replace(xiRegex, (_fullMatch: string, doorPath: string) => {
    screenDebug('[MCI] *** FOUND ~XI DOOR:', doorPath);
    commandsToExecute.push(doorPath.trim());
    screenDebug('[MCI] Added XIM door to execution queue');
    return '';
  });

screenDebug('[MCI] Total commands to execute:', commandsToExecute.length);
  if (commandsToExecute.length > 0) {
    screenDebug('[MCI] Commands:', commandsToExecute);
  }

  // Conference/Message Board Lists (express.e:5588-5620)
  const conferences = screenHandler().getConferences();

  if (parsed.includes('~CL.')) {
    // express.e:5588-5607 - ~CL: vertical list, one conf per row, filtered by access.
    // Format: "                     [32m<num>[3][33m) [35m<name padEnd 30>[36m[0m\r\n"
    // Only include conferences the user has access to (checkConfAccess per entry).
    let confList = '';
    let num = 0;
    for (let i = 0; i < conferences.length; i++) {
      const confId = conferences[i].id;
      if (!checkConfAccess(session.user, confId)) continue;
      num++;
      // C64/40-col Task 5c: narrow drops the 21-space centering indent and
      // clips the name to the room a 40-column row leaves.
      if (narrow) {
        confList += row(`  \x1b[32m${String(num).padStart(3)}\x1b[33m) \x1b[35m${conferences[i].name.substring(0, 33)}\x1b[0m`);
        continue;
      }
      const confName = conferences[i].name.padEnd(30, ' ');
      confList += `                     \x1b[32m${String(num).padStart(3)}\x1b[33m) \x1b[35m${confName}\x1b[36m\x1b[0m\r\n`;
    }
    parsed = parsed.replace(/~CL\./g, generated(confList));
  }

  if (parsed.includes('~CD.')) {
    // express.e:5608-5620 - ~CD: 2-column numbered list, filtered by access.
    // Format: "   [34m[[0m<num right-padded 3>[34m] [0m<name padEnd 30>" then \r\n every 2 entries.
    let confDir = '';
    let num = 0;
    for (let i = 0; i < conferences.length; i++) {
      const confId = conferences[i].id;
      if (!checkConfAccess(session.user, confId)) continue;
      num++;
      // C64/40-col Task 5c: narrow is a SINGLE column - two 33-column
      // entries per row cannot fit 40 whatever the names are.
      if (narrow) {
        confDir += row(`   \x1b[34m[\x1b[0m${String(num).padStart(3, '0')}\x1b[34m] \x1b[0m${conferences[i].name.substring(0, 31)}`);
        continue;
      }
      const confName = conferences[i].name.padEnd(30, ' ');
      // express.e:5615: \r\z\d[3] = right-justified zero-padded 3-digit number
      confDir += `   \x1b[34m[\x1b[0m${String(num).padStart(3, '0')}\x1b[34m] \x1b[0m${confName}`;
      if (num % 2 === 0) confDir += '\r\n';
    }
    // Add final newline if odd number of entries
    if (!narrow && num % 2 !== 0) confDir += '\r\n';
    parsed = parsed.replace(/~CD\./g, generated(confDir));
  }

  if (parsed.includes('~ML.')) {
    // ~ML. - Message Base List (express.e:5621-5635)
    let msgBaseList = '';
    try {
      const messageBases = await db.getMessageBases(session.currentConf);
      if (messageBases.length > 0) {
        for (let i = 0; i < messageBases.length; i++) {
          const num = i + 1;
          const name = messageBases[i].name || 'Default';
          if (narrow) {
            msgBaseList += row(`  \x1b[32m${num}\x1b[33m) \x1b[35m${name.substring(0, 33)}\x1b[0m`);
            continue;
          }
          const namePadded = name.padEnd(30, ' ');
          msgBaseList += `                     \x1b[32m${num}\x1b[33m) \x1b[35m${namePadded}\x1b[36m\x1b[0m\r\n`;
        }
      } else {
        // If no message bases, show default
        msgBaseList = row('                     \x1b[32m1\x1b[33m) \x1b[35mDefault                       \x1b[36m\x1b[0m');
      }
    } catch (error) {
console.error('[parseMciCodes] Error getting message base list:', error);
      SysopDebugUtil.debug(
        null,
        session,
        'MCI',
        'Error parsing ~ML. (message base list)',
        { error: (error as Error).message },
        DebugSeverity.WARNING
      );
      msgBaseList = row('                     \x1b[32m1\x1b[33m) \x1b[35mDefault                       \x1b[36m\x1b[0m');
    }
    parsed = parsed.replace(/~ML\./g, generated(msgBaseList));
  }

  if (parsed.includes('~MD.')) {
    // ~MD. - Message Base Description (express.e:5636-5650)
    let msgBaseDesc = '';
    try {
      const messageBases = await db.getMessageBases(session.currentConf);
      if (messageBases.length > 0) {
        for (let i = 0; i < messageBases.length; i++) {
          const num = i + 1;
          const name = messageBases[i].name || 'Default';
          if (narrow) {
            msgBaseDesc += row(`   \x1b[34m[\x1b[0m${num}\x1b[34m] \x1b[0m${name.substring(0, 31)}`);
            continue;
          }
          msgBaseDesc += `   \x1b[34m[\x1b[0m${num}\x1b[34m] \x1b[0m${name.padEnd(30, ' ')}`;
          if (num % 2 === 0) msgBaseDesc += '\r\n'; // Two per line
        }
        // Add final newline if odd number
        if (!narrow && messageBases.length % 2 !== 0) msgBaseDesc += '\r\n';
      } else {
        msgBaseDesc = row('   \x1b[34m[\x1b[0m1\x1b[34m] \x1b[0mDefault                       ');
      }
    } catch (error) {
console.error('[parseMciCodes] Error getting message base descriptions:', error);
      SysopDebugUtil.debug(
        null,
        session,
        'MCI',
        'Error parsing ~MD. (message base descriptions)',
        { error: (error as Error).message },
        DebugSeverity.WARNING
      );
      msgBaseDesc = row('   \x1b[34m[\x1b[0m1\x1b[34m] \x1b[0mDefault                       ');
    }
    parsed = parsed.replace(/~MD\./g, generated(msgBaseDesc));
  }

  // Process %NODELIST before %N to avoid collision
  if (parsed.includes('%NODELIST')) {
    let nodeList = '';
    const sysConfig = await getBoardConfig(appConfig.get('dataDir'));
    const totalNodes = sysConfig?.max_nodes || 255;
    const currentNode = session.nodeId || 0;
    
    // Import nodeStatusManager dynamically to avoid circular dependencies
    const { nodeStatusManager } = require('../nodes/NodeStatusManager');
    const activeNodes = nodeStatusManager.getActiveNodes();
    
    for (let i = 0; i < totalNodes; i++) {
      let status = 'Waiting';
      const nodeInfo = nodeStatusManager.getNodeInfo(i);
      
      if (i === currentNode) {
        status = petscii ? 'You' : '\x1b[32mYou\x1b[0m';
      } else if (nodeInfo && nodeInfo.status !== -1) { // -1 is NodeStatus.ENV_NOTACTIVE
        status = nodeInfo.handle || 'Active';
      }
      
      // Only show up to 10 nodes in this simple list to avoid blowing up the screen
      // unless specifically requested. AmiExpress usually only showed 8.
      if (i < 10 || (nodeInfo && nodeInfo.status !== -1)) {
        nodeList += `Node ${i}:  ${status}\r\n`;
      }
    }
    parsed = parsed.replace(/%NODELIST/g, generated(nodeList));
  }

  // ============================================================
  // Pre-tokenizer side-effecting MCI passes
  // ============================================================
  //
  // These codes either need their `~` intact (so strict fall-through
  // doesn't eat them), or have multi-word arguments that the
  // tokenizer's space-or-terminator boundary doesn't capture. They
  // run BEFORE the tokenizer so the strict-fall-through tokenizer
  // (non-inline mode) can safely consume any `~` it doesn't dispatch
  // — at this point every side-effecting form has already been
  // resolved.
  //
  // Inline mode runs the tokenizer in soft fall-through; the
  // sequential regex below picks up `~CC_`, `~SS_`, `~SR_`, `~SX_`,
  // `~f`, and `~SP` in document order with full pause-and-resume
  // semantics, so those forms must NOT be pre-substituted in inline
  // mode.

  if (!inlineMode) {
    // ~CR_<prompt>|| - prompted keypress (express.e:5571-5580).
    // Multi-word prompt; the tokenizer's space boundary would split
    // it, so handle here before the tokenizer.
    parsed = parsed.replace(/~CR_([^|]+)\|\|/g, (_match, promptText) => {
      hasPause = true;
      return generated(promptText);
    });

    // ~SM_<menuname>|| - set current menu name (express.e:5575-5585).
    parsed = parsed.replace(/~SM_([^|]+)\|\|/g, (_match, menuName) => {
      session.currentMenuName = menuName.trim();
      screenDebug(`[MCI] ~SM_ set menu name to: ${session.currentMenuName}`);
      return '';
    });

    // ~CC_<cmd>| / ~CC_<cmd>|| — non-inline command queue
    // (express.e:5555-5563). Inline mode runs ~CC_ synchronously in
    // the sequential pass below.
    parsed = parsed.replace(/~CC_([^\s|~\r\n]+)(\|{1,2})?/g, (_full, commandStr) => {
      commandsToExecute.push(commandStr.trim());
      return '';
    });

    // ~SS_<file> / ~2S<file> — non-inline file-display queue
    // (express.e:5496-5504). Replaces with `{{DISPLAY_FILE:N}}`
    // placeholders that pass through the tokenizer untouched and
    // get substituted with the loaded file content later. Pre-
    // tokenizer because strict fall-through would otherwise consume
    // the leading `~`. (Inline mode handles ~SS_ via sentinel
    // dispatch instead.)
    parsed = parsed.replace(/~(?:SS_|2S)([^\s|~\r\n]+)(?:\|{1,2})?/g, (_match, ref) => {
      const filename = String(ref).trim();
      filesToDisplay.push(filename);
      return `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}`;
    });

    // ~<n>SR_<basePath> — non-inline random numbered file
    // (express.e:5533-5554). Same pre-tokenizer placeholder pattern
    // as ~SS_. (Inline mode handles ~SR_ via sentinel dispatch.)
    parsed = parsed.replace(/~(\d*)SR_([^\s|~\r\n]+)(?:\|{1,2})?/g, (_full, maxCountRaw, refRaw) => {
      let basePath = String(refRaw).trim();
      if (basePath.includes(':')) {
        const { config: cfgMod } = require('../config');
        const baseDir = cfgMod.getConfig().dataDir;
        const bbsPaths = new BBSPaths(baseDir);
        basePath = bbsPaths.resolveAmigaPath(basePath, session?.nodeId || 0);
      }
      const maxCount = Math.max(1, maxCountRaw ? parseInt(maxCountRaw, 10) : 99);
      const randomNum = Math.floor(Math.random() * maxCount) + 1;
      const randomFile = formatNumberedFilename(basePath, randomNum);
      filesToDisplay.push(randomFile);
      return `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}`;
    });
  }

  // ~SX_<basePath>|| — sequential numbered file (express.e:5505-
  // 5530). Runs in BOTH modes (inline mode lets it through to the
  // walker, since the post-tokenizer pass is gone but the walker
  // doesn't know about SX_; we treat SX_ as a non-inline-style
  // placeholder substitution that runs in document order via the
  // loaded file content). Pre-tokenizer for the same reason as
  // ~SS_/~SR_ above.
  {
    const sxRegex = /~SX_([^|]+)\|\|/g;
    let sxMatch;
    while ((sxMatch = sxRegex.exec(parsed)) !== null) {
      let basePath = String(sxMatch[1]).trim();
      if (basePath.includes(':')) {
        const { config: cfgMod } = require('../config');
        const baseDir = cfgMod.getConfig().dataDir;
        const bbsPaths = new BBSPaths(baseDir);
        basePath = bbsPaths.resolveAmigaPath(basePath, session?.nodeId || 0);
      }
      const nextFile = sequentialFileManager.getNextFile(basePath);
      let foundFile = false;
      if (screenHandler().loadScreenFile(nextFile.filename, session.currentConf, 0, session)) {
        filesToDisplay.push(nextFile.filename);
        foundFile = true;
      } else {
        sequentialFileManager.resetCounter(basePath);
        const firstFile = sequentialFileManager.getNextFile(basePath);
        if (screenHandler().loadScreenFile(firstFile.filename, session.currentConf, 0, session)) {
          filesToDisplay.push(firstFile.filename);
          foundFile = true;
        }
      }
      const replacement = foundFile ? `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}` : '';
      parsed = parsed.replace(sxMatch[0], replacement);
      // Reset regex lastIndex since we mutated parsed
      sxRegex.lastIndex = 0;
    }
  }

  // ~SMO<n>| - slow mode on (express.e:5726-5736). Width prefix
  // semantics differ from the tokenizer's <digits>before-cmd model
  // (negative numbers, optional width), so handle as a regex.
  parsed = parsed.replace(/~SMO(-?\d*)\|/gi, (_m, digits) => {
    slowmoCount += 60;
    let speed = parseInt(digits, 10);
    if (!speed || Number.isNaN(speed)) speed = 1;
    if (speed > 5) speed = 1;
    if (speed === 0) speed = 1;
    if (speed < -3) speed = -3;
    slowmo = speed;
    slowmoApplied = slowmo;
    slowmoAppliedCount = slowmoCount;
    return '';
  });

  // ~SMC| - slow mode clear (express.e:5737-5739).
  parsed = parsed.replace(/~SMC\|/gi, () => {
    slowmo = 0;
    slowmoCount = 0;
    slowmoApplied = 0;
    slowmoAppliedCount = 0;
    return '';
  });

  // ~SP. - period-suffix pause variant. Tokenizer would parse cmd
  // as "SP." (period not a boundary); easier to handle as a regex.
  // Inline mode emits a SP sentinel so the walker triggers the same
  // pause-and-resume semantics as `~SP|` / `~SP\n`; non-inline sets
  // hasPause directly.
  parsed = parsed.replace(/~SP\./g, () => {
    if (inlineMode) return sentinels.SP;
    hasPause = true;
    return '';
  });

  // Note: `~SP\n` / `~SP\r` (bare-newline pause variant) used to be
  // pre-processed here, but the tokenizer's whitespace boundary now
  // treats \r and \n as cmd terminators (matches the leniency of
  // the previous inline-regex pipeline), so `~SP` followed by a
  // newline parses as cmd="SP" and is handled by the SP entry in
  // userInfoDispatch — sentinel for inline mode, hasPause flag for
  // non-inline.

  // ~CR. - silent character read (express.e:5462-5468). Web has no
  // mid-render keypress wait; the period suffix dodges the tokenizer
  // boundary so a regex is the simplest match.
  parsed = parsed.replace(/~CR\./g, () => '');

  // ~NSF - non-stop flag (sets nonStopText to suppress further pauses).
  parsed = parsed.replace(/~NSF/g, () => {
    if (session) {
      (session as any).nonStopText = true;
    }
    return '';
  });

  // Standalone ~ on a line — WEB extension for clear screen
  // (express.e has no equivalent). Pre-tokenizer so the strict
  // fall-through doesn't eat the lone `~`.
  const clearScreen = petscii ? '\x93' : '\x1b[2J\x1b[H';
  parsed = parsed.replace(/^~\s*$/gm, clearScreen);
  parsed = parsed.replace(/^~$/gm, clearScreen);

  return {
    text: parsed,
    terminator: mciTerminator,
    hasPause,
    commandsToExecute,
    filesToDisplay,
    slowmo: slowmoApplied,
    slowmoCount: slowmoAppliedCount,
  };
}
