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
import { updateTimeUsed, checkTimeUsed, getTimeRemainingMinutes } from '../../utils/time-tracking.util';
import { setEnvStat } from '../../utils/acs.util';
import { EnvStat } from '../../constants/env-codes';

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
) {
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
  session.skipNextDisplayFlowMenu = true;
  session.manualMenuTargetState = LoggedOnSubState.READ_COMMAND;

  // Default to line input unless a MENU.keys is loaded below
  session.cmdShortcuts = false;
  if (session.shortcuts?.clear) {
    session.shortcuts.clear();
  }

  if (shouldDisplayMenu && session.menuPause) {
    doPause(socket, session);
    session.menuPause = false;
  }

  let screenDisplayed = false;
  if (shouldDisplayMenu) {
    screenDisplayed = await displayScreen(socket, session, SCREEN_MENU);

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

  // Always show menu prompt (express.e calls displayMenuPrompt regardless of expert/menu display)
  displayMenuPrompt(socket, session);

  // Like AmiExpress: Check cmdShortcuts to determine input mode (express.e:28598-28603)
  // After prompt, choose input mode based on MENU.keys
  session.subState = session.cmdShortcuts ? LoggedOnSubState.READ_SHORTCUTS : LoggedOnSubState.READ_COMMAND;
  session.manualMenuTargetState = session.subState;
}

/**
 * Display menu prompt (displayMenuPrompt equivalent)
 * Shows BBS name, conference info, and time remaining
 */
export function displayMenuPrompt(socket: any, session: BBSSession) {
  // Skip during conference scan - doors complete after each conference but we only
  // want to show the menu prompt once after the entire scan finishes
  if ((session as any).inConfScan) {
console.log('[menu] displayMenuPrompt SKIPPED (in confScan)');
    return;
  }

  // WEB_: MODERN_* — 500ms debounce prevents duplicate menu prompts on rapid state-transition races; no express.e equivalent
  const now = Date.now();
  const lastPromptTime = (session as any)._lastMenuPromptTime || 0;
  if (now - lastPromptTime < 500) {
console.log('[menu] displayMenuPrompt SKIPPED (debounce - last prompt was', now - lastPromptTime, 'ms ago)');
    return;
  }
  (session as any)._lastMenuPromptTime = now;

console.log('[menu] displayMenuPrompt called');

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
    // parseMciCodes is async; resolve the parsed string and append ' ' (express.e:28412)
    parseMciCodes(confToolFlags.menuPrompt, session).then((result) => {
      emitPrompt(socket, result.parsed + ' ');
    }).catch(() => {
      emitPrompt(socket, confToolFlags.menuPrompt + ' ');
    });
    return;
  }

  // Like AmiExpress: Use BBS name, relative conference number, conference name
  const bbsName = config.get('bbsName');
  // Calculate time remaining in minutes (express.e:28417,28419)
  const timeLeft = getTimeRemainingMinutes(session);

  // Check if multiple message bases in conference (like getConfMsgBaseCount in AmiExpress)
  const msgBasesInConf = messageBases.filter(mb => mb.conferenceId === session.currentConf);
  const currentMsgBase = messageBases.find(mb => mb.id === session.currentMsgBase);

console.log('  - msgBasesInConf.length:', msgBasesInConf.length);
console.log('  - currentMsgBase found:', !!currentMsgBase);

  // express.e:28417-28420: [0m[35m{bbsName} [0m[[36m{confNum}[34m:[36m{confName}[0m] Menu ([33m{time}[0m mins. left):
  if (msgBasesInConf.length > 1 && currentMsgBase) {
    const displayName = `${session.currentConfName} - ${currentMsgBase.name}`;
    const prompt = `\x1b[0m\x1b[35m${bbsName} \x1b[0m[\x1b[36m${session.relConfNum}\x1b[34m:\x1b[36m${displayName}\x1b[0m] Menu (\x1b[33m${timeLeft}\x1b[0m mins. left): `;
    emitPrompt(socket, prompt);
  } else {
    const prompt = `\x1b[0m\x1b[35m${bbsName} \x1b[0m[\x1b[36m${session.relConfNum}\x1b[34m:\x1b[36m${session.currentConfName}\x1b[0m] Menu (\x1b[33m${timeLeft}\x1b[0m mins. left): `;
    emitPrompt(socket, prompt);
  }

}
