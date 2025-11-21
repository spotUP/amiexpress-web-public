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
import { getConferenceToolFlags } from '../../utils/conference-tooltypes.util';

/**
 * Display main menu (express.e:28586)
 * menuPause controls whether we show a pause prompt before the menu; display is gated by expert/door flags.
 */
export async function displayMainMenu(socket: any, session: BBSSession) {
  const processOlmMessageQueue = getProcessOlmMessageQueue();
  const SCREEN_MENU = getScreenMenu();
  const relConfNumber = session.relConfNum || 1;
  const forceMenus = getConferenceToolFlags(relConfNumber).forceMenus;

  const shouldDisplayMenu = ((session.user?.expert || 'N') === 'N' && !session.doorExpertMode) || forceMenus;

  if (shouldDisplayMenu && session.menuPause) {
    doPause(socket, session);
  }

  if (shouldDisplayMenu) {
    const screenDisplayed = await displayScreen(socket, session, SCREEN_MENU);

    // Like express.e:6572-6573 - check for .keys file and set cmdShortcuts accordingly
    if (screenDisplayed) {
      const resolvedPath = session.lastScreenFilePath;
      const hasKeys =
        (resolvedPath && hasKeysFileForResolvedPath(resolvedPath)) ||
        hasKeysFile(SCREEN_MENU, session.currentConf);
      if (hasKeys) {
        session.cmdShortcuts = true;

        // Load shortcuts (express.e loadShortcuts)
        if (!session.shortcuts) {
          session.shortcuts = new Map();
        }
        session.shortcuts.clear();
        if (resolvedPath) {
          const path = require('path');
          const { findCaseInsensitive } = require('../../utils/fs-amiga.util');
          const dir = path.dirname(resolvedPath);
          const base = path.basename(resolvedPath);
          const candidate = `${base}.keys`;
          const keyPath = findCaseInsensitive(dir, candidate);
          if (keyPath) {
            const loader = new ShortcutMap();
            loader.load(keyPath);
            loader.entries().forEach(([k, v]) => session.shortcuts!.set(k, v));
          }
        }
      } else {
        session.cmdShortcuts = false;
        if (session.shortcuts) session.shortcuts.clear();
      }
    }
  }

  if (typeof processOlmMessageQueue === 'function') {
    processOlmMessageQueue(socket, session, true);
  }

  displayMenuPrompt(socket, session);

  // Reset doorExpertMode after menu display (express.e:28586)
  session.doorExpertMode = false;

  // Like AmiExpress: Check cmdShortcuts to determine input mode (express.e:28598-28603)
  if (session.cmdShortcuts === false) {
    session.subState = LoggedOnSubState.READ_COMMAND;
  } else {
    session.subState = LoggedOnSubState.READ_SHORTCUTS;
  }
}

/**
 * Display menu prompt (displayMenuPrompt equivalent)
 * Shows BBS name, conference info, and time remaining
 */
export function displayMenuPrompt(socket: any, session: BBSSession) {
  console.log('[menu] displayMenuPrompt called');

  const config = getConfig();
  const messageBases = getMessageBases() || [];

  if (!config || typeof config.get !== 'function') {
    console.warn('[Menu Prompt] Config not injected; skipping menu prompt render.');
    session.subState = LoggedOnSubState.READ_COMMAND;
    return;
  }

  console.log('  - bbsName:', config.get('bbsName'));
  console.log('  - currentConf:', session.currentConf);
  console.log('  - currentConfName:', session.currentConfName);
  console.log('  - relConfNum:', session.relConfNum);
  console.log('  - currentMsgBase:', session.currentMsgBase);
  console.log('  - timeRemaining:', session.timeRemaining);

  // Process queued OLM messages before showing prompt - express.e:1464-1473
  const { processOlmQueue } = require('../olm.handler');
  if (processOlmQueue) {
    processOlmQueue(socket, session);
  }

  // Like AmiExpress: Use BBS name, relative conference number, conference name
  const bbsName = config.get('bbsName');
  const timeLeft = Math.floor(session.timeRemaining);

  // Check if multiple message bases in conference (like getConfMsgBaseCount in AmiExpress)
  const msgBasesInConf = messageBases.filter(mb => mb.conferenceId === session.currentConf);
  const currentMsgBase = messageBases.find(mb => mb.id === session.currentMsgBase);

  console.log('  - msgBasesInConf.length:', msgBasesInConf.length);
  console.log('  - currentMsgBase found:', !!currentMsgBase);

  if (msgBasesInConf.length > 1 && currentMsgBase) {
    // Multiple message bases: show "ConfName - MsgBaseName"
    const displayName = `${session.currentConfName} - ${currentMsgBase.name}`;
    const prompt = `\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${displayName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `;
    console.log(' Sending multi-msgbase prompt:', prompt);
    socket.emit('ansi-output', prompt);
  } else {
    // Single message base: just show conference name
    const prompt = `\r\n\x1b[35m${bbsName} \x1b[36m[${session.relConfNum}:${session.currentConfName}]\x1b[0m Menu (\x1b[33m${timeLeft}\x1b[0m mins left): `;
    console.log(' Sending single-msgbase prompt:', prompt);
    socket.emit('ansi-output', prompt);
  }

  console.log(' Setting subState to READ_COMMAND');
  session.subState = LoggedOnSubState.READ_COMMAND;
}
