/**
 * Menu Display Functions
 * Handles main menu display and prompt generation
 * Based on express.e:28555-28648
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { displayScreen, doPause, hasKeysFile, hasKeysFileForResolvedPath } from '../screen.handler';
import { ShortcutMap } from '../../utils/shortcut.util';
import {
  getConfig,
  getMessageBases,
  getProcessOlmMessageQueue,
  getScreenMenu
} from './dependency-injection';
import { parseMciCodes } from '../screen.handler';
import { getConferenceToolFlags } from '../../utils/conference-tooltypes.util';
import { emitText, emitPrompt } from '../../utils/output.util';
import { updateTimeUsed, getTimeRemainingMinutes } from '../../utils/time-tracking.util';
import { checkTimeUsed } from '../time-limit.handler';
import { buildMenuPrompt } from '../../utils/menu-prompt.util';
import { recordPromptColumn, SAVE_CURSOR } from '../../utils/line-input.util';
import { setEnvStat } from '../../utils/acs.util';
import { EnvStat } from '../../constants/env-codes';
import { drainAchievementNotices } from '../../achievements/notices';
import { drainNotifyInbox } from '../../notify/board';
import { displayModeOf } from '../../amiga-emulation/xim/display-mode.util';
import { doorRefusedForWidth } from '../../utils/door-min-columns.util';
import { effectiveStyle } from '../../services/menu-catalogue/build';
import { menuCallerFromSession, storeMenuStylePref } from '../../services/menu-catalogue/caller';
import { menuStyleNotice, menuStyleTabLine, nextMenuStyle } from '../../screens/menu-config/menu-config';
import { readMenuConfig } from '../../services/menu-config.service';
import { boardRoot } from '../../utils/board-root.util';

/**
 * The main menu is a door when one is registered (plan M19, sysop 2026-10-15:
 * "the door IS the BBS main menu"); Menu.txt is the fallback when it is not
 * installed or cannot run for this caller. Returns 'ran' when the door ran (or
 * was parked for the exit-tail loop, M7) - the caller then draws nothing.
 *
 * WEB_: board-own; express.e:28586 draws SCREEN_MENU and `?` (express.e:24594-24599)
 * only redraws it for experts.
 */
export async function launchMenuDoor(socket: any, session: BBSSession, site: 'display-flow' | 'question-mark'): Promise<'ran' | 'dismissed' | 'fallback'> {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { commandCache, revalidateBbsCommandsIfChanged, doorLevelForCommandAccess } = require('../command-execution.handler');
  const exit = require('../commands/menu-door-exit');
  const { config } = require('../../config');
  /* eslint-enable @typescript-eslint/no-var-requires */
  if ((session as any).inConfScan) return 'fallback';
  // WEB_: express.e:28586 draws SCREEN_MENU as a file and has no door; a teletext or RIP caller keeps
  // the art menu (Sysop review 2), which is the same SCREEN_MENU lookup that picks their own variant.
  const mode = displayModeOf(session as never);
  if (mode === 'teletext' || mode === 'rip') return 'fallback';
  if (exit.menuDoorFailed(session)) return 'fallback';                            // it already failed once this session
  revalidateBbsCommandsIfChanged(config.get('dataDir'), session.currentConf, session.nodeId ?? 0);
  const def = commandCache.bbscmd.get('MENU');
  if (!def) return 'fallback';
  if (doorLevelForCommandAccess(def.access) > (session.user?.secLevel ?? 0)) return 'fallback';
  if (doorRefusedForWidth(def as never, session as never)) return 'fallback';
  // WEB_MENU_STYLE: a caller (or board default) on "Classic screen" gets express.e's own menu: express.e:28586
  // draws SCREEN_MENU with no door. Decided after the MENU-def/access checks, so a missing door logs as before.
  if (effectiveStyle(menuCallerFromSession(session), readMenuConfig(boardRoot(), 'MAIN').config) === 'classic') return 'fallback';
  if (site === 'display-flow' && exit.takeMenuDoorDismissed(session)) return 'dismissed';
  // WEB_: `?` means "open it", so a pending Esc from the last visit is spent here (Decision 37).
  if (site === 'question-mark') exit.takeMenuDoorDismissed(session);
  // A launch whose door has not reached its tail yet is a failure handler redrawing the menu
  // (executeAmigaDoor's catch), also while a parked relaunch is draining: the art menu serves it and
  // the door is not entered or parked again.
  if (exit.menuLaunchUnstarted(session)) { exit.markMenuReentered(session); return 'fallback'; }
  if (exit.inExitTail(session)) {
    if (!exit.doorBinaryExists(def.location)) return 'fallback';
    exit.parkDoor(session, 'MENU');
    return 'ran';
  }
  if (exit.menuLaunchInFlight(session)) { exit.markMenuReentered(session); return 'fallback'; }
  // Decision 12: Menu.txt is the fallback when the door cannot run (binary missing, crash, or a launch that
  // returns without a word, express.e:4257-4262). One guarded launch, shared with the parked relaunch.
  const outcome = await exit.runMenuDoor(socket, session);
  return outcome === 'failed' ? 'fallback' : 'ran';
}

/**
 * WEB_MENU_STYLE: Tab on an empty command line while the caller's style is classic (sysop 2026-10-17) stores the
 * next style in the cycle and arms the menu door to name it as it opens; the caller then runs MENU. False (Tab
 * keeps its completion meaning) for any other style, or when no MENU door is registered. express.e's lineInput
 * has no Tab case, so this adds a meaning rather than changing one.
 */
export async function promptTabLeavesClassic(session: BBSSession): Promise<boolean> {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { commandCache } = require('../command-execution.handler');
  const exit = require('../commands/menu-door-exit');
  /* eslint-enable @typescript-eslint/no-var-requires */
  if (!session.user || !commandCache.bbscmd.get('MENU')) return false;
  if (effectiveStyle(menuCallerFromSession(session), readMenuConfig(boardRoot(), 'MAIN').config) !== 'classic') return false;
  const next = nextMenuStyle('classic');
  await storeMenuStylePref(session, next);
  exit.armMenuNotice(session, menuStyleNotice(next));
  return true;
}

/** This call draws the prompt itself: a display-flow pass still pending for DISPLAY_MENU is a duplicate. */
function armDisplayFlowSkip(session: BBSSession): void {
  session.skipNextDisplayFlowMenu = true;
  session.manualMenuTargetState = LoggedOnSubState.READ_COMMAND;
}

/**
 * Display main menu (express.e:28586)
 * menuPause controls whether we show a pause prompt before the menu; display is gated by expert/door flags.
 * forceMenuDisplay bypasses expert-mode suppression (used by ? command).
 * bypassDebounce skips the 500ms anti-double-render guard but still respects expert mode —
 * use this when you want to GUARANTEE the prompt re-renders (e.g. after saving a message)
 * without overriding the user's "expert" preference, which would draw the full ANSI menu.
 */
export async function displayMainMenu(
  socket: any,
  session: BBSSession,
  forceMenuDisplay: boolean = false,
  bypassDebounce: boolean = false,
  /** WEB_: true only from executeAmigaDoor's catch - the one caller allowed to draw while the MENU door's launch is in flight. */
  failureHandler: boolean = false,
) {
  // A foreign caller (timer, olm, another handler) while the MENU door is still starting or running:
  // the door owns the screen, so there is nothing to draw (plan M19 review).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  if (!failureHandler && require('../commands/menu-door-exit').menuLaunchUnstarted(session)) return;
  // WEB_MENU_STYLE: the menu door's Tab just stored classic: the screen is drawn whatever the expert flag says,
  // with the line naming the style under it (sysop 2026-10-17).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const classicLanded: boolean = require('../commands/menu-door-exit').takeMenuClassicLanded(session);
  if (classicLanded) { forceMenuDisplay = true; bypassDebounce = true; }
  // Skip during conference scan - doors complete after each conference but we only
  // want to show the menu once after the entire scan finishes
  if ((session as any).inConfScan && !forceMenuDisplay) {
console.log('[menu] displayMainMenu SKIPPED (in confScan)');
    return;
  }

  // WEB_: MODERN_* — 500ms debounce prevents duplicate menu display on rapid door-completion/state-transition races; no express.e equivalent.
  // forceMenuDisplay implies bypassDebounce (callers that need to override the expert check
  // are also asserting "show this regardless"), but bypassDebounce can be set on its own.
  const now = Date.now();
  const lastMenuTime = (session as any)._lastMainMenuTime || 0;
  if (now - lastMenuTime < 500 && !forceMenuDisplay && !bypassDebounce) {
console.log('[menu] displayMainMenu SKIPPED (debounce - last menu was', now - lastMenuTime, 'ms ago)');
    return;
  }
  (session as any)._lastMainMenuTime = now;

  const processOlmMessageQueue = getProcessOlmMessageQueue();
  const SCREEN_MENU = getScreenMenu();
  const relConfNumber = session.relConfNum || 1;
  const forceMenus = getConferenceToolFlags(relConfNumber).forceMenus;

  // Reset shortcuts before menu logic (express.e:6567)
  session.cmdShortcuts = false;
  if (session.shortcuts?.clear) {
    session.shortcuts.clear();
  }
  // Clear any leftover pagination/pause state so the next keypress is not consumed
  session.paginatedScreen = undefined;
  session.lastScreenHadPause = false;

  const shouldDisplayMenu = forceMenuDisplay || (((session.user?.expert || 'N') === 'N' && !session.doorExpertMode) || forceMenus);

  // Default to line input unless a MENU.keys is loaded below
  session.cmdShortcuts = false;
  if (session.shortcuts?.clear) {
    session.shortcuts.clear();
  }

  // Put the terminal's attributes back before drawing anything.
  //
  // A door that exits without resetting leaves whatever it last set still
  // in effect, and ESC[2J erases in the CURRENT background - so the next
  // clear paints the WHOLE screen in that colour. Reported as "some of our
  // telnet doors do this when they exit, they set the bg to blue", with a
  // screenshot of an entirely blue board.
  //
  // The reset belongs here rather than in each door's teardown: there are
  // eight places a door session ends, doors are written by other people,
  // and a 68K door cannot be made to promise anything. This is the one
  // point every door returns through. Four bytes, once per menu.
  //
  // Same lesson the C door's ansi.c carries, where clearing defends itself
  // for exactly this reason.
  emitText(socket, '\x1b[0m');

  if (shouldDisplayMenu && session.menuPause) {
    doPause(socket, session);
    session.menuPause = false;
  }

  let screenDisplayed = false;
  if (shouldDisplayMenu) {
    // WEB_: the main menu is the MENU door when one is registered and can run for this
    // caller (plan M19); express.e:28586 draws SCREEN_MENU here, which stays the fallback.
    // 'dismissed' = the caller left the door with Esc: prompt only, once (Decision 37).
    const handover = await launchMenuDoor(socket, session, 'display-flow');
    // The door owns the screen and draws no prompt here, so the duplicate guard below is not armed: armed, it
    // outlived the door and swallowed the prompt after a picked command (R, then Enter at the reader's end).
    if (handover === 'ran') return;
    armDisplayFlowSkip(session);
    if (handover !== 'dismissed') screenDisplayed = await displayScreen(socket, session, SCREEN_MENU);
    if (classicLanded) emitText(socket, `\r\n\x1b[36m${menuStyleTabLine('classic')}\x1b[0m`);

    // Clear any pagination that displayScreen might have set up - the menu prompt
    // handles input, not paginated screen continuation. This fixes the "enter twice" bug
    // where the first keypress after ? command was consumed by pagination handler.
    session.paginatedScreen = undefined;
    session.lastScreenHadPause = false;

    // Load MENU .keys if present (express.e:6567-6573)
    session.cmdShortcuts = false;
    if (session.shortcuts) session.shortcuts.clear();

    if (screenDisplayed) {
      const resolvedPath = session.lastScreenFilePath;
      if (resolvedPath) {
        const keysPath = `${resolvedPath}.keys`;
        const fs = require('fs');
        if (fs.existsSync(keysPath)) {
          const loader = new ShortcutMap();
          loader.load(keysPath);
          loader.entries().forEach(([k, v]: [string, string]) => session.shortcuts!.set(k, v));
          session.cmdShortcuts = true;
        }
      }
    }
  } else {
    armDisplayFlowSkip(session);
    // WEB_: an expert who opened the door with `?` and left it with Esc is not shown it here;
    // the flag is spent now so a later forced display still opens the door (Decision 37).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../commands/menu-door-exit').takeMenuDoorDismissed(session);
  }

  // express.e:28588 - doorExpertMode:=FALSE; aePuts('\b\n')
  // Note: express.e uses '\b\n' where \b is carriage return in E language, maps to \r\n
  session.doorExpertMode = false;
  socket.emit('ansi-output', '\r\n');

  // express.e:28590 - IF checkOnlineStatus()<>RESULT_SUCCESS THEN reqState:=REQ_STATE_LOGOFF
  // Map carrier check to socket connected state: if socket is gone, set LOGOFF and bail out.
  if (!socket.connected) {
    session.subState = LoggedOnSubState.LOGOFF;
    return;
  }

  // express.e:28591 - updateTimeUsed()
  updateTimeUsed(socket, session);

  // express.e:28592 - checkTimeUsed()
  // If time exceeded, checkTimeUsed displays the time-expired message and sets subState=LOGOFF.
  const timeUp = await checkTimeUsed(socket, session);
  if (timeUp) {
    return;
  }

  // express.e:28593-28594 - show queued olm messages
  if (typeof processOlmMessageQueue === 'function') {
    processOlmMessageQueue(socket, session, true);
  }

  // express.e:28596 - setEnvStat(ENV_IDLE) before menu prompt
  setEnvStat(session, EnvStat.IDLE);

  // WEB_: achievements (SP2, S6). The one place an unlock or the link
  // explanation is drawn - after the menu, before the prompt, never
  // mid-door or between a prompt and its answer. Non-throwing.
  drainAchievementNotices(socket, session as any);
  // NOTIFY door's Board channel: same boundary, same rules.
  drainNotifyInbox(socket, session as any);

  // Always show menu prompt (express.e calls displayMenuPrompt regardless of expert/menu display).
  // A display the caller asked for carries its bypass through to the prompt:
  // the menu screen may be a duplicate, the prompt he is waiting on is not.
  displayMenuPrompt(socket, session, bypassDebounce || forceMenuDisplay);

  // Like AmiExpress: Check cmdShortcuts to determine input mode (express.e:28598-28603)
  // After prompt, choose input mode based on MENU.keys
  session.subState = session.cmdShortcuts ? LoggedOnSubState.READ_SHORTCUTS : LoggedOnSubState.READ_COMMAND;
  session.manualMenuTargetState = session.subState;
}

/**
 * Display menu prompt (displayMenuPrompt equivalent)
 * Shows BBS name, conference info, and time remaining
 */
/**
 * THE 500ms GUARD, AND THE ONE THING IT MUST NEVER SWALLOW.
 *
 * Two of these exist - one on the menu SCREEN, one here on the prompt - and
 * both were added against duplicate renders from door-completion and
 * state-transition races. The screen's could be bypassed; this one could not,
 * so a prompt the CALLER had just asked for was dropped whenever a second one
 * followed inside half a second.
 *
 * That is what the sysop saw, 2026-09-23: "the prompt jumps down to the next
 * line sometimes instead of drawing a new prompt". RETURN at the menu echoes
 * `\r\n` first (`handleReadCommand`) and the prompt is supposed to follow it;
 * press twice quickly and the echo went out with nothing behind it, so the
 * cursor walked down the screen a line at a time. The faster he typed, the
 * more of them piled up, which is why it read as random.
 *
 * `force` is the caller's own keystroke. A caller is always owed a prompt; a
 * race is not.
 */
export function promptDebounceBlocks(session: BBSSession, force = false, now = Date.now()): boolean {
  const last = (session as unknown as { _lastMenuPromptTime?: number })._lastMenuPromptTime || 0;
  if (!force && now - last < 500) return true;
  (session as unknown as { _lastMenuPromptTime?: number })._lastMenuPromptTime = now;
  return false;
}

/**
 * The built-in menu prompt as text: `BBS [conf:name] Menu (n mins. left):` for
 * an 80-column caller, its 40-column form for a PETSCII one. AEW_MENU hands it
 * to the menu door (xim/menu.ts) so the door's prompt row is the board's.
 * A conference MENU_PROMPT tooltype is MCI and asynchronous: menuPromptTextAsync
 * answers that one; this is the built-in form.
 */
export function menuPromptText(session: BBSSession): string {
  const config = getConfig();
  const messageBases = getMessageBases() || [];
  // Like AmiExpress: Use BBS name, relative conference number, conference name
  const bbsName = config.get('bbsName');
  // Calculate time remaining in minutes (express.e:28417,28419)
  const timeLeft = getTimeRemainingMinutes(session);

  // Check if multiple message bases in conference (like getConfMsgBaseCount in AmiExpress)
  const msgBasesInConf = messageBases.filter(mb => mb.conferenceId === session.currentConf);
  const currentMsgBase = messageBases.find(mb => mb.id === session.currentMsgBase);

  // express.e:28417-28420: [0m[35m{bbsName} [0m[[36m{confNum}[34m:[36m{confName}[0m] Menu ([33m{time}[0m mins. left):
  // buildMenuPrompt owns the format. It returns those bytes unchanged for
  // every 80-column caller and a 40-column form without the board name for a
  // PETSCII one - C64/40-col plan, Task 4b (sysop, 2026-09-02).
  const displayName =
    msgBasesInConf.length > 1 && currentMsgBase
      ? `${session.currentConfName} - ${currentMsgBase.name}`
      : `${session.currentConfName}`;
  return buildMenuPrompt(
    {
      bbsName,
      relConfNum: session.relConfNum,
      confDisplayName: displayName,
      timeLeft,
    },
    session
  );
}

/**
 * The prompt the board would draw right now, as text: the conference's
 * MENU_PROMPT tooltype through the MCI engine when it has one (express.e:28409-28412),
 * else the built-in form. The menu door's prompt row is this, so it matches the board's.
 */
export async function menuPromptTextAsync(session: BBSSession): Promise<string> {
  const custom = getConferenceToolFlags(session.relConfNum || 1).menuPrompt;
  if (!custom || custom.length === 0) return menuPromptText(session);
  try { return (await parseMciCodes(custom, session)).parsed + ' '; }
  catch { return custom + ' '; }
}

export function displayMenuPrompt(socket: any, session: BBSSession, force = false) {
  // Put the colours back, unconditionally and before anything else.
  //
  // displayMainMenu() resets too, but it returns early in several cases -
  // expert mode, the conference-scan skip, the debounce - and the prompt is
  // the one thing drawn on EVERY pass. A door that exits leaving magenta
  // set (the selected row of a themed list) leaked pink over the board
  // until this ran. express.e does the same thing at 28409 for the
  // MENU_PROMPT path; this is that, for every path.
  emitText(socket, '\x1b[0m');

  // Skip during conference scan - doors complete after each conference but we only
  // want to show the menu prompt once after the entire scan finishes
  if ((session as any).inConfScan) {
console.log('[menu] displayMenuPrompt SKIPPED (in confScan)');
    return;
  }

  // Skip when session is mid-prompt for an interactive flow whose
  // own input handler owns the prompt (resumeStuff Y/N, file
  // upload/download transfer prompts, etc). Emitting the menu
  // prompt on top of them overwrites the user-facing prompt and
  // breaks the input handler that's expecting Y/N/A keystrokes.
  const sub = session.subState;
  if (
    sub === LoggedOnSubState.UPLOAD_RESUME_PROMPT ||
    sub === LoggedOnSubState.UPLOAD_RESUME_DELETE ||
    sub === LoggedOnSubState.UPLOAD_RENAME_PROMPT ||
    sub === LoggedOnSubState.FILES_UPLOAD ||
    sub === LoggedOnSubState.FILES_DOWNLOAD ||
    sub === LoggedOnSubState.DOWNLOAD_PGOODBYE
  ) {
    console.log(`[menu] displayMenuPrompt SKIPPED (subState=${sub})`);
    return;
  }

  if (promptDebounceBlocks(session, force)) {
console.log('[menu] displayMenuPrompt SKIPPED (debounce)');
    return;
  }

console.log(`[menu] displayMenuPrompt called subState=${session.subState}`);
console.log(`[menu]   stack: ${new Error().stack?.split('\n').slice(2, 12).join('\n          ')}`);

  const config = getConfig();
  const messageBases = getMessageBases() || [];

  if (!config || typeof config.get !== 'function') {
console.warn('[Menu Prompt] Config not injected; skipping menu prompt render.');
    return;
  }

console.log('  - bbsName:', config.get('bbsName'));
console.log('  - currentConf:', session.currentConf);
console.log('  - currentConfName:', session.currentConfName);
console.log('  - relConfNum:', session.relConfNum);
console.log('  - currentMsgBase:', session.currentMsgBase);
console.log('  - timeRemaining:', session.timeRemaining);

  // Update time used before displaying prompt (express.e:28591-28592)
  updateTimeUsed(socket, session);

  // Process queued OLM messages before showing prompt - express.e:1464-1473
  const { processOlmQueue } = require('../transfer/olm.handler');
  if (processOlmQueue) {
    processOlmQueue(socket, session);
  }

  // express.e:28409-28412 — if conference has MENU_PROMPT tooltype, display it through
  // the MCI engine instead of the standard prompt (aePuts('[0m'); processMci(menuPrompt); aePuts(' '))
  const confToolFlags = getConferenceToolFlags(session.relConfNum || 1);
  if (confToolFlags.menuPrompt && confToolFlags.menuPrompt.length > 0) {
    emitText(socket, '\x1b[0m');
    // MCI is async; the parsed string plus ' ' (express.e:28412) - menuPromptTextAsync, shared with the menu door
    menuPromptTextAsync(session).then((text) => {
      emitPrompt(socket, recordPromptColumn(session as any, text));
      emitText(socket, SAVE_CURSOR);
    });
    return;
  }

  emitPrompt(socket, recordPromptColumn(session as any, menuPromptText(session)));
  emitText(socket, SAVE_CURSOR);

}


