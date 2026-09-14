/**
 * Command Handler
 * Central command router and menu system
 * Handles all BBS command processing and routing
 * 1:1 port from AmiExpress express.e command processing
 */

import { BBSSession } from '../index';
import { petsciiColumnsOf } from '../amiga-emulation/xim/screen-width.util';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import { RESULT_NOT_ALLOWED, InternalCommandResult } from '../constants/command-results';
import { higherAccess } from '../utils/error-handling.util';
import { inputKeys } from '../utils/input-chunks.util';
import { EnvStat } from '../constants/env-codes';
import { validateFilename, checkForFile } from '../utils/file-upload.util';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { setEnvStat } from '../utils/acs.util';
import { resetPetsciiModel } from '../utils/petscii-session-model';
import { beginLogoff } from '../server/logoff';
import { ANSI_GRAPHICS_PROMPT } from '../services/login-connect.service';
import * as path from 'path';
import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';

// Import from other handlers
import { displayScreen, doPause } from './screen.handler';
import { displayConferenceBulletins, joinConference, FORCE_MAILSCAN_SKIP } from './operations/conference.handler';
import { displayMainMenu as menuDisplayMainMenu, displayMenuPrompt as menuDisplayMenuPrompt } from './command-handler/menu';
import { routeStateInput, isRoutedState } from './command-handler/state-router';
import { INTERNAL_COMMAND_NAMES } from './command-handler/internal-command-names';
import { displayModeOf } from '../amiga-emulation/xim/display-mode.util';
import { displayDoorMenu, executeDoor, doorAvailableTo } from './door.handler';
import { startSysopPage } from './chat/chat.handler';
import {
  displayFileMaintenance,
  displayFileStatus,
  displayNewFiles,
  displayUploadInterface,
  displayDownloadInterface,
  startFileDownload,
  handleFileDeleteConfirmation,
  handleFileMoveConfirmation,
  matchesWildcard,
} from './file/file.handler';
import {
  displayAccountEditingMenu,
  displayUserList
} from './user/account.handler';
import {
  FileMaintenanceHandler,
  setFileMaintenanceDependencies
} from './file/file-maintenance.handler';
import {
  handleCFFlagSelectInput,
  handleCFConfSelectInput
} from './commands/advanced-commands.handler';
import {
  handleUserStatsCommand,
  handleJoinConferenceCommand,
  handleUploadCommand,
  handleDownloadCommand,
  setUserCommandsDependencies
} from './commands/user-commands.handler';
import {
  handleGoodbyeCommand,
  handleQuietModeCommand,
  handleHelpCommand,
  handleReadMessagesCommand,
  handleEnterMessageCommand,
  setSystemCommandsDependencies
} from './commands/system-commands.handler';
import { WebhookCommandsHandler } from './commands/webhook-commands.handler';
import { DiscordLinkCommandsHandler } from './commands/discord-link-commands.handler';
import {
  handleTimeCommand,
  handleNewFilesCommand,
  handlePreviousConferenceCommand,
  handleNextConferenceCommand,
  handlePreviousMessageBaseCommand,
  handleNextMessageBaseCommand,
  setNavigationCommandsDependencies
} from './commands/navigation-commands.handler';
import {
  handleQuestionMarkCommand,
  handleFileListCommand,
  handleFileListRawCommand,
  handleAlterFlagsCommand,
  handleFlagInput,
  handleFileStatusCommand,
  handleReadBulletinCommand,
  handleBulletinInput as handleBulletinInputFromDisplayFileCommands,
  setDisplayFileCommandsDependencies
} from './commands/display-file-commands.handler';
import {
  handleAnsiModeCommand,
  handleExpertModeCommand,
  handleCommentToSysopCommand,
  setPreferenceChatCommandsDependencies
} from './chat/preference-chat-commands.handler';
import { handlePageSysopCommand } from './command-handler/page-sysop-command';
import { processBatchFile } from '../server/file-socket-handlers';
import { config } from '../config';
import { loadBBSConfig } from '../services/bbs-config-file.service';
import { parseInfoFile } from '../utils/amiga-command-parser.util';
import {
  handleLiveChatCommand
} from './chat/chat-commands.handler';
import {
  handleGreetingsCommand,
  handleMailScanCommand,
  handleConferenceFlagsCommand,
  setAdvancedCommandsDependencies
} from './commands/advanced-commands.handler';
import {
  handleJoinMessageBaseCommand,
  handleNodeManagementCommand,
  handleConferenceMaintenanceCommand,
  handleJMInput,
  handleNMInput,
  handleNMConfirm,
  handleCMInput,
  handleCMNumericInput,
  setMessageCommandsDependencies
} from './message/message-commands.handler';
import {
  handleVersionCommand,
  handleWhoCommand,
  handleWhoDetailedCommand,
  handleWriteUserParamsCommand,
  handleWOptionSelectInput,
  handleWEditNameInput,
  handleWEditEmailInput,
  handleWEditRealnameInput,
  handleWEditInternetnameInput,
  handleWEditLocationInput,
  handleWEditPhoneInput,
  handleWEditPasswordInput,
  handleWEditPasswordConfirmInput,
  handleWEditLinesInput,
  handleWEditComputerInput,
  handleWEditScreentypeInput,
  handleWEditProtocolInput,
  handleWEditTranslatorInput,
  handleWEditModemSpeedInput,
  handleWEditFontInput,
  setInfoCommandsDependencies
} from './commands/info-commands.handler';
import {
  handleRelogonCommand,
  handleViewFileCommand,
  handleZippySearchCommand,
  handleZoomCommand,
  handleHelpFilesCommand,
  handleRelogonConfirm,
  handleViewFileInput,
  handleZippySearchInput,
  setUtilityCommandsDependencies
} from './commands/utility-commands.handler';
import {
  handleRemoteShellCommand,
  handleAccountEditingCommand,
  handleCallersLogCommand,
  handleEditDirectoryFilesCommand,
  handleEditAnyFileCommand,
  handleChangeDirectoryCommand,
  setSysopCommandsDependencies
} from './commands/sysop-commands.handler';
import {
  handleZmodemUploadCommand,
  handleSysopUploadCommand,
  handleNodeUptimeCommand,
  handleVotingBoothCommand,
  handleVoteTopicSelect,
  handleVoteAnswerInput,
  handleVoteMenuChoice,
  handleDownloadWithStatusCommand,
  setTransferMiscCommandsDependencies
} from './commands/transfer-misc-commands.handler';
import {
  handleReadMessagesFullCommand,
  handleEnterMessageFullCommand,
  handleMessageReaderNav,
  handleMsgListStartInput,
  setMessagingDependencies,
  setMoveEditDependencies,
  handleMsgMoveConfInput,
  handleMsgMoveMsgBaseInput,
  handleMsgMoveConfirm,
  handleMsgEditHeaderFrom,
  handleMsgEditHeaderTo,
  handleMsgEditHeaderSubject,
  handleMsgEditHeaderPrivate,
  handleChooseTranslatorInput
} from './message/messaging.handler';
import {
  runSysCommand as execSysCommand,
  runBbsCommand as execBbsCommand,
  loadCommands,
  setCommandExecutionDependencies,
  handleCommandPasswordInput
} from './command-execution.handler';
import { getConferenceToolFlags } from '../utils/conference-tooltypes.util';
import type { LineInputOptions } from '../utils/line-input.util';
// express.e:2335 - a prompt refuses the key that would overflow its field.
import {
  MAX_COMMAND_LINE, MAX_MSG_LINE_NUMBER, MAX_MSG_LINE_TEXT,
  MAX_MSG_TO, MAX_MSG_SUBJECT, MAX_DOOR_PASSWORD,
  redrawFromSavedStart, acceptTypedChar, acceptBackspace, SAVE_CURSOR,
  backspaceEcho, recordPromptColumn, ANSI_PROMPT_MAX_LEN,
} from '../utils/line-input.util';

// Import security/ACS system
import { ACSCode } from '../constants/acs-codes';
import {
  handleMessageToInput,
  handleMessageSubjectInput,
  handleMessagePrivateInput,
  handleMessageBodyInput,
  handleMessageOptionsInput,
  handleMessageAbortConfirm,
  handleMessageQuoteReplyConfirm,
  handleMessageDeleteLineInput,
  handleMessageDeleteConfirm,
  handleMessageEditLineInput,
  handleMessageEditLineContent,
  handleMessageAttachFileInput,
  handleMessageAttachDeleteConfirm,
  handleMessageReplaceSearchInput,
  handleMessageReplaceWithInput,
  handleMessageInsertLineInput,
  handleMessageInsertTextInput,
  handleQuoteRangeInput,
  handleUploadFileInput,
  handleForwardMessageToInput,
  handleForwardMessageSubjectInput,
  handleForwardMessagePrivateInput,
  handleForwardMessageDeleteOriginalInput,
  handleReplyDeleteOriginalInput
} from './message/message-entry.handler';

import { finalizeCommand } from '../utils/command-response.util';

// Import utilities
import { AnsiUtil } from '../utils/ansi.util';
import { emitText, emitPrompt, flushOutput } from '../utils/output.util';
import { nodeFileManager } from '../services/NodeFileManager';
import { callersLogManager } from '../services/CallersLogManager';
import { runLoginBatches } from '../services/batch-scheduler';
import { initializeSecurity } from '../utils/security.util';

// Dependencies (injected)

// Import getters from dependency-injection module (eliminates duplicate variables)
import { getSystemTime, dateTimeToDateStamp } from '../utils/date-time.util';
import {
  getDatabase,
  getConfig,
  getConferences,
  getMessageBases,
  getFileAreas,
  getDoors
} from './command-handler/dependency-injection';

// Re-export dependency injection for external modules (backward compatibility)
export {
  setDatabase,
  setConfig,
  setConferences,
  setMessageBases,
  setFileAreas,
  setProcessOlmMessageQueue,
  setCheckSecurity,
  setSetEnvStat,
  setGetRecentCallerActivity,
  setDoors,
  setConstants
} from './command-handler/dependency-injection';

// Re-export command loading functions for index.ts
export { loadCommands, setCommandExecutionDependencies } from './command-execution.handler';

// Constants (injected)
let SCREEN_MENU: string = 'MENU';

const displayFlowStates = new Set<LoggedOnSubState>([
  LoggedOnSubState.DISPLAY_BULL,
  LoggedOnSubState.DISPLAY_NODE_BULL,
  LoggedOnSubState.DISPLAY_ACHIEVE_BULL,
  LoggedOnSubState.EXEC_QUICKNEW,
  LoggedOnSubState.CONF_SCAN,
  LoggedOnSubState.DISPLAY_CONF_BULL,
  LoggedOnSubState.AUTO_REJOIN,  // express.e:5066-5088 - auto-rejoin with S stats
  LoggedOnSubState.DISPLAY_MENU,
]);
console.log('[command.handler] displayFlowStates:', Array.from(displayFlowStates));
const DISPLAY_FLOW_LOG_ENABLED = process.env.SCREEN_DEBUG !== '0';
const displayFlowLog = (...args: any[]) => {
  if (DISPLAY_FLOW_LOG_ENABLED) {
console.log('[DISPLAY FLOW]', ...args);
  }
};

export function isDisplayFlowState(subState?: LoggedOnSubState) {
  return typeof subState !== 'undefined' && displayFlowStates.has(subState);
}

/**
 * TIP runs last, right before the menu - not at EXECUTE_ON_LOGON time.
 * The early hook fires before the LOGON screen and bulletins, so a tip
 * there is buried; here it is the last thing before the prompt. Once
 * per login (tempData, not storage: this is flow position, not rotation -
 * the door owns seen-ids), skipped on quick ('Q') logins, and skipped
 * silently when TIP is not installed (no retry loop, no error - the
 * board without the door is a board without the tip).
 */
export function tipDoorBeforeMenu(
  session: BBSSession,
  doors: Array<{ command?: string; enabled?: boolean; accessLevel?: number; conferenceId?: number | null }>,
): boolean {
  if ((session as any).quickFlag) return false;
  if (session.tempData?.tipShown) return false;
  // A door the caller could not open from the DOORS menu is not run AT them
  // on the way to it. doorAvailableTo is the same answer that menu uses -
  // switching TIP off in the admin parks its ACCESS, and before this the
  // login hook read neither the level nor the switch.
  return doors.some(
    (d) => (d.command ?? '').toUpperCase() === 'TIP' && doorAvailableTo(d, session),
  );
}

async function handleMessageEntryInput(socket: any, session: BBSSession, data: string) {
  switch (session.subState) {
    case LoggedOnSubState.POST_MESSAGE_TO:
      // express.e:10779 — lineInput('','',30,...) caps at 30 chars; reject extra keystrokes silently
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        await handleMessageToInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) {
          session.inputBuffer = session.inputBuffer.slice(0, -1);
          emitText(socket, '\b \b');
        }
      } else if (data.length === 1 && data >= ' ' && data <= '~') {
        if ((session.inputBuffer || '').length < 30) {
          session.inputBuffer = (session.inputBuffer || '') + data;
          emitText(socket, data);
        }
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_SUBJECT:
      // express.e:10847 — lineInput('','',30,...) caps subject at 30 chars
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        await handleMessageSubjectInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) {
          session.inputBuffer = session.inputBuffer.slice(0, -1);
          emitText(socket, '\b \b');
        }
      } else if (data.length === 1 && data >= ' ' && data <= '~') {
        if ((session.inputBuffer || '').length < 30) {
          session.inputBuffer = (session.inputBuffer || '') + data;
          emitText(socket, data);
        }
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_PRIVATE:
      // express.e yesNo(2): single-char read, no Enter needed; default=N on CR
      await handleMessagePrivateInput(socket, session, data);
      return;
    case LoggedOnSubState.POST_MESSAGE_BODY: {
      // Line-input editor with cursor-position tracking — express.e edit()
      // at 10168+. session.inputBuffer holds the line content; an x cursor
      // (session.bodyCursorX) tracks where edits + arrow keys land within
      // that buffer. Without x tracking, arrow keys would do nothing and
      // DEL/insert-mid-line would be broken.
      if (!session.inputBuffer) {
        session.inputBuffer = '';
      }
      if (typeof (session as any).bodyCursorX !== 'number') {
        (session as any).bodyCursorX = 0;
      }
      const buf = () => session.inputBuffer || '';
      const setBuf = (v: string) => { session.inputBuffer = v; };
      let x: number = (session as any).bodyCursorX;
      const setX = (v: number) => { x = v; (session as any).bodyCursorX = v; };

      if (data === '\r' || data === '\n') {
        const line = buf();
        setBuf('');
        setX(0);
        emitText(socket, '\r\n'); // Move to the next line like express.e
        await handleMessageBodyInput(socket, session, line);
      } else if (data === '\x1e' || data === '\x18') {
        // express.e:10195-10205 — Ctrl-X clears current line. Move cursor
        // back to column 0, erase visible chars, reset buffer + x.
        const len = buf().length;
        if (len > 0) {
          let erase = '';
          // Move cursor to start, then erase to end-of-line, then position 0.
          // Use \b \b walk so we don't depend on terminal CSI.
          // First walk back from current x to 0:
          for (let i = 0; i < x; i++) erase += '\b';
          // Then erase len chars and walk back:
          for (let i = 0; i < len; i++) erase += ' ';
          for (let i = 0; i < len; i++) erase += '\b';
          emitText(socket, erase);
          setBuf('');
          setX(0);
        }
      } else if (data === '\x7f' || data === '\b') {
        // express.e:10207-10224 backspace — delete CHAR BEFORE cursor.
        if (x > 0) {
          const cur = buf();
          const before = cur.slice(0, x - 1);
          const after = cur.slice(x);
          setBuf(before + after);
          setX(x - 1);
          // Re-render: backspace, erase tail with spaces, restore cursor.
          let out = '\b' + after + ' ';
          for (let i = 0; i < after.length + 1; i++) out += '\b';
          emitText(socket, out);
        }
      } else if (data === '\x1b[3~' || data === '\x7e') {
        // express.e:10226-10240 DEL — delete CHAR AT cursor (forward).
        // Standard xterm sends ESC[3~ for DEL key.
        if (x < buf().length) {
          const cur = buf();
          const before = cur.slice(0, x);
          const after = cur.slice(x + 1);
          setBuf(before + after);
          // Render: emit chars after cursor, blank-pad, walk back.
          let out = after + ' ';
          for (let i = 0; i < after.length + 1; i++) out += '\b';
          emitText(socket, out);
        }
      } else if (data === '\x1b[D' || data === '\x1bOD') {
        // express.e:10166 rawArrow=TRUE — left arrow moves cursor.
        if (x > 0) {
          setX(x - 1);
          emitText(socket, '\x1b[D');
        }
      } else if (data === '\x1b[C' || data === '\x1bOC') {
        // Right arrow moves cursor (bounded by buffer end).
        if (x < buf().length) {
          setX(x + 1);
          emitText(socket, '\x1b[C');
        }
      } else if (data === '\x1b[H' || data === '\x01') {
        // Home / Ctrl-A → start of line.
        if (x > 0) {
          emitText(socket, `\x1b[${x}D`);
          setX(0);
        }
      } else if (data === '\x1b[F' || data === '\x05') {
        // End / Ctrl-E → end of line.
        const len = buf().length;
        if (x < len) {
          emitText(socket, `\x1b[${len - x}C`);
          setX(len);
        }
      } else if (data === '\t') {
        // express.e:10242-10257 Tab — expand to next 8-column boundary by
        // padding spaces. Truncated if it would exceed maxLineLen-3.
        const maxLineLen = 75;
        const tabStop = (Math.floor(x / 8) + 1) * 8;
        if (tabStop <= maxLineLen - 3) {
          const pad = ' '.repeat(tabStop - x);
          const cur = buf();
          setBuf(cur.slice(0, x) + pad + cur.slice(x));
          setX(x + pad.length);
          emitText(socket, pad);
        }
      } else if (data === '\x1b') {
        // ESC alone — ignored. Multi-byte escape sequences are matched
        // explicitly above (cursor/Home/End/DEL).
      } else if (data.length === 1 && data >= ' ' && data <= '~') {
        // Insert printable char at cursor position.
        const cur = buf();
        const before = cur.slice(0, x);
        const after = cur.slice(x);
        setBuf(before + data + after);
        setX(x + 1);
        if (after.length === 0) {
          emitText(socket, data);
        } else {
          // Re-render: char + tail, then walk cursor back over tail.
          let out = data + after;
          for (let i = 0; i < after.length; i++) out += '\b';
          emitText(socket, out);
        }
      } else if (data.length > 1) {
        // express.e:10118 ED_ANSI_ALLOWED — accept multi-byte ANSI in line
        // buffer at cursor position. We've already handled known cursor/edit
        // sequences above; anything left through here is treated as content.
        const cleaned = data.replace(/[\x00-\x08\x0a-\x1a\x1c-\x1f\x7f]/g, '');
        if (cleaned) {
          const cur = buf();
          const before = cur.slice(0, x);
          const after = cur.slice(x);
          setBuf(before + cleaned + after);
          setX(x + cleaned.length);
          if (after.length === 0) {
            emitText(socket, cleaned);
          } else {
            let out = cleaned + after;
            for (let i = 0; i < after.length; i++) out += '\b';
            emitText(socket, out);
          }
        }
      }
      return;
    }
    case LoggedOnSubState.POST_MESSAGE_OPTIONS:
      await handleMessageOptionsInput(socket, session, data.trim());
      return;
    case LoggedOnSubState.POST_MESSAGE_QUOTE_REPLY_CONFIRM:
      await handleMessageQuoteReplyConfirm(socket, session, data.trim());
      return;
    case LoggedOnSubState.POST_MESSAGE_ABORT_CONFIRM:
      await handleMessageAbortConfirm(socket, session, data.trim());
      return;
    case LoggedOnSubState.POST_MESSAGE_DELETE_LINE:
      // express.e: lineInput('','',5,...) — line-buffered, user types number then Enter
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        emitText(socket, '\r\n');
        await handleMessageDeleteLineInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) { session.inputBuffer = session.inputBuffer.slice(0, -1); emitText(socket, '\b \b'); }
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_MSG_LINE_NUMBER) {
        session.inputBuffer = (session.inputBuffer || '') + data; emitText(socket, data);
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_DELETE_CONFIRM:
      // express.e yesNo(0): single char, no Enter needed — pass directly
      await handleMessageDeleteConfirm(socket, session, data.trim());
      return;
    case LoggedOnSubState.POST_MESSAGE_EDIT_LINE:
      // express.e: lineInput('','',5,...) — line-buffered, user types number then Enter
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        emitText(socket, '\r\n');
        await handleMessageEditLineInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) { session.inputBuffer = session.inputBuffer.slice(0, -1); emitText(socket, '\b \b'); }
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_MSG_LINE_NUMBER) {
        session.inputBuffer = (session.inputBuffer || '') + data; emitText(socket, data);
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_EDIT_LINE_CONTENT:
      // express.e: lineInput('\b\n    ',temp,maxLineLen,...) — full line replacement, line-buffered
      if (data === '\r' || data === '\n') {
        const input = session.inputBuffer || '';
        session.inputBuffer = '';
        emitText(socket, '\r\n');
        await handleMessageEditLineContent(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) { session.inputBuffer = session.inputBuffer.slice(0, -1); emitText(socket, '\b \b'); }
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_MSG_LINE_TEXT) {
        session.inputBuffer = (session.inputBuffer || '') + data; emitText(socket, data);
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_ATTACH_FILE:
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        await handleMessageAttachFileInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) session.inputBuffer = session.inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_COMMAND_LINE) {
        session.inputBuffer = (session.inputBuffer || '') + data;
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_ATTACH_DELETE_CONFIRM:
      await handleMessageAttachDeleteConfirm(socket, session, data.trim());
      return;
    case LoggedOnSubState.POST_MESSAGE_REPLACE_SEARCH:
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        await handleMessageReplaceSearchInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) session.inputBuffer = session.inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_MSG_LINE_TEXT) {
        session.inputBuffer = (session.inputBuffer || '') + data;
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_REPLACE_WITH:
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        await handleMessageReplaceWithInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) session.inputBuffer = session.inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_MSG_LINE_TEXT) {
        session.inputBuffer = (session.inputBuffer || '') + data;
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_INSERT_LINE:
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        emitText(socket, '\r\n');
        await handleMessageInsertLineInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) { session.inputBuffer = session.inputBuffer.slice(0, -1); emitText(socket, '\b \b'); }
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_MSG_LINE_NUMBER) {
        session.inputBuffer = (session.inputBuffer || '') + data; emitText(socket, data);
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_INSERT_TEXT:
      if (data === '\r' || data === '\n') {
        const input = session.inputBuffer || '';
        session.inputBuffer = '';
        emitText(socket, '\r\n');
        await handleMessageInsertTextInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) { session.inputBuffer = session.inputBuffer.slice(0, -1); emitText(socket, '\b \b'); }
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_MSG_LINE_TEXT) {
        session.inputBuffer = (session.inputBuffer || '') + data; emitText(socket, data);
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_UPLOAD_FILE:
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        await handleUploadFileInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) session.inputBuffer = session.inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_COMMAND_LINE) {
        session.inputBuffer = (session.inputBuffer || '') + data;
        emitText(socket, data);
      }
      return;
    case LoggedOnSubState.POST_MESSAGE_QUOTE_RANGE:
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        await handleQuoteRangeInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) session.inputBuffer = session.inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_MSG_LINE_TEXT) {
        session.inputBuffer = (session.inputBuffer || '') + data;
        emitText(socket, data); // Echo printable characters
      }
      return;

    // Account Editor - Single-key editing (express.e:21228-21650)
    case LoggedOnSubState.ACCOUNT_EDITOR_EDIT:
      const { handleAccountEditInput } = require('./user/account-edit-input.handler');
      await handleAccountEditInput(socket, session, data);
      return;

    // User Notes View (express.e:21679-21739)
    case LoggedOnSubState.USER_NOTES_VIEW:
      const { handleUserNotesInput, handleUserNotesLineInput } = require('./user/account-edit-input.handler');
      // Check if in notes editing mode (line input)
      if (session.tempData?.notesEditing) {
        if (data === '\r' || data === '\n') {
          const line = (session.inputBuffer || '').trim();
          session.inputBuffer = '';
          await handleUserNotesLineInput(socket, session, line);
        } else if (data === '\x7f' || data === '\b') {
          if (session.inputBuffer?.length) {
            session.inputBuffer = session.inputBuffer.slice(0, -1);
            emitText(socket, '\b \b');
          }
        } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_COMMAND_LINE) {
          session.inputBuffer = (session.inputBuffer || '') + data;
          emitText(socket, data);
        }
      } else {
        // Single-key command mode
        await handleUserNotesInput(socket, session, data);
      }
      return;

    // Conference Accounting (express.e:22045-22250)
    case LoggedOnSubState.CONF_ACCOUNTING_VIEW:
      const { handleConferenceAccountingInput } = require('./user/account-edit-input.handler');
      await handleConferenceAccountingInput(socket, session, data);
      return;

    // Credit Maintenance (express.e:21884-22042) - the handler owns its own
    // digit-buffering for the numeric field edits, like conf accounting.
    case LoggedOnSubState.CREDIT_MAINTENANCE_VIEW:
      const { handleCreditMaintenanceInput } = require('./user/account-edit-input.handler');
      await handleCreditMaintenanceInput(socket, session, data);
      return;

    // User Answers (express.e:21319-21326) - read-only; any key returns.
    case LoggedOnSubState.USER_ANSWERS_VIEW:
      const { handleUserAnswersInput } = require('./user/account-edit-input.handler');
      handleUserAnswersInput(socket, session, data);
      return;

    // Forward message states (express.e forwardMSG:9807-9871)
    case LoggedOnSubState.FORWARD_MESSAGE_TO:
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        await handleForwardMessageToInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) session.inputBuffer = session.inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_MSG_TO) {
        session.inputBuffer = (session.inputBuffer || '') + data;
        emitText(socket, data); // Echo printable characters
      }
      return;
    case LoggedOnSubState.FORWARD_MESSAGE_SUBJECT:
      if (data === '\r' || data === '\n') {
        const input = (session.inputBuffer || '').trim();
        session.inputBuffer = '';
        await handleForwardMessageSubjectInput(socket, session, input);
      } else if (data === '\x7f' || data === '\b') {
        if (session.inputBuffer?.length) session.inputBuffer = session.inputBuffer.slice(0, -1);
      } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_MSG_SUBJECT) {
        session.inputBuffer = (session.inputBuffer || '') + data;
        emitText(socket, data); // Echo printable characters
      }
      return;
    case LoggedOnSubState.FORWARD_MESSAGE_PRIVATE:
      await handleForwardMessagePrivateInput(socket, session, data.toUpperCase());
      return;
    case LoggedOnSubState.FORWARD_MESSAGE_DELETE_ORIGINAL:
      await handleForwardMessageDeleteOriginalInput(socket, session, data.toUpperCase());
      return;
    case LoggedOnSubState.REPLY_DELETE_ORIGINAL:
      await handleReplyDeleteOriginalInput(socket, session, data.toUpperCase());
      return;
    case LoggedOnSubState.MSG_CAPTURE_REAL_NAME: {
      const { handleCaptureRealNameInput } = require('./message/message-entry.handler');
      await handleCaptureRealNameInput(socket, session, data);
      return;
    }
    case LoggedOnSubState.MSG_CAPTURE_INTERNET_NAME: {
      const { handleCaptureInternetNameInput } = require('./message/message-entry.handler');
      await handleCaptureInternetNameInput(socket, session, data);
      return;
    }

    default:
      return;
  }
}

function pauseDisplayFlow(socket: any, session: BBSSession, forcePrompt: boolean = false): boolean {
  // If a screen already installed a pause (e.g., ~SP or pagination), honor it
  if (session.paginatedScreen) {
    return true;
  }

  // Honor express.e doPause between screens in the display flow
  // express.e:28556-28557: IF (displayScreen(SCREEN_BULL)) THEN doPause()
  // NOTE: Don't pass an onComplete callback - handleCommand (line 692-693) automatically
  // calls advanceDisplayFlow() when pagination completes in a display flow state.
  // Passing a callback would cause DOUBLE advancement (screen displays twice with two pauses).
  const { doPause } = require('./screen.handler');
  try {
    doPause(socket, session);
    // If a pause was installed, stop advancing until the user presses a key
    if (session.paginatedScreen) {
      return true;
    }
  } catch (error) {
console.error('[pauseDisplayFlow] Error during pause:', error);
  }
  return false;
}

// Dependency injection setters
export async function advanceDisplayFlow(socket: any, session: BBSSession): Promise<void> {
  let loopCount = 0;
  const maxLoops = 20; // Prevent infinite loops
  try {
    while (isDisplayFlowState(session.subState)) {
      loopCount++;
      if (loopCount > maxLoops) {
        console.error(`[DISPLAY FLOW] LOOP DETECTED! Breaking after ${maxLoops} iterations. subState=${session.subState}`);
        session.subState = LoggedOnSubState.READ_COMMAND;
        break;
      }
      displayFlowLog(
        'advance',
        `state=${session.subState}`,
        `menuPause=${session.menuPause ? 'Y' : 'N'}`,
        `queued=${session.queuedScreenCommands?.length || 0}`,
        `pending=${!!session.pendingScreenCommand}`
      );
      /*
       * A SCREEN SPLIT BY ~SP IS NOT FINISHED, AND MUST NOT BE ADVANCED PAST.
       *
       * displayScreen renders the FIRST segment, parks the rest on
       * session.screenSegments, and deliberately sets lastScreenHadPause=false
       * because "pauseDisplayFlow will handle the pause"
       * (screen.handler.ts:2322). Nothing did. The flow advanced to the menu
       * and every segment after the first was dropped on the floor.
       *
       * On this board that silently killed the `~CC_ctop` at the end of every
       * conference bulletin - the sysop's own Conftop hook, which lives after
       * the ~SP - with no symptom to point at: the art draws, the caller
       * reaches the menu, and a door quietly never runs.
       *
       * THE CHECK BELONGS HERE, not in the DISPLAY_CONF_BULL branch where I
       * first put it. A caller reaches a conference two ways - the login flow
       * and the `J` command - and only the first passes through that state.
       * The live log showed the second failing identically with my fix in
       * place (2026-09-14, subState=process_command). This loop is the one
       * place both routes meet.
       *
       * Arming the pause is the whole fix: the keypress path completes the
       * pagination and then drains the remaining segments
       * (screen.handler.ts:3160-3170), the route a paginated screen already
       * takes. doPause always installs one, so this cannot spin.
       */
      if (session.screenSegments && session.screenSegments.segments.length > 0
          && !session.paginatedScreen) {
        if (pauseDisplayFlow(socket, session)) {
          return;      // waiting on a key; the segments run when it arrives
        }
      }

      // Clear any pending pause once a key arrives
      // If a previous screen queued commands, execute them before advancing
      if (session.queuedScreenCommands && session.queuedScreenCommands.length > 0) {
        const { runQueuedScreenCommands } = require('./screen.handler');
        try {
          await runQueuedScreenCommands(socket, session);
        } catch (error) {
console.error('[handleCommand] Error running queued screen commands:', error);
          session.queuedScreenCommands = [];
          session.pendingScreenCommand = undefined;
          session.screenCommandResolver = null;
        }
        displayFlowLog('queued commands completed', `state=${session.subState}`);
        if (!isDisplayFlowState(session.subState)) {
          return;
        }
        continue;
      }

      // Initialize session.currentConf at the start of display flow if not already set
      // This ensures conference scan doors have the correct conference number
      if (!session.currentConf) {
        session.currentConf = session.user?.confRJoin || 1;
      }
      if (!session.currentMsgBase) {
        session.currentMsgBase = session.user?.msgBaseRJoin || 1;
      }

      const confNumber = session.currentConf || session.user?.confRJoin || 1;
      const toolFlags = getConferenceToolFlags(confNumber);

      if (session.subState === LoggedOnSubState.DISPLAY_BULL) {
        // express.e:28556 - IF (displayScreen(SCREEN_BULL)) THEN doPause()
        // Note: quickFlag does NOT skip BULL — it only skips LOGON (express.e:29853)
        displayFlowLog('showing BULL');
        const shown = await displayScreen(socket, session, 'BULL', true, /* silent */ true);
        if (shown && pauseDisplayFlow(socket, session)) {
          session.subState = LoggedOnSubState.DISPLAY_NODE_BULL;
          displayFlowLog('pause after BULL');
          return;
        }
        session.subState = LoggedOnSubState.DISPLAY_NODE_BULL;
        continue;
      }

      if (session.subState === LoggedOnSubState.EXEC_QUICKNEW) {
        // Skip EXEC_QUICKNEW - quicknew is displayed via ~SS_BBS:screens/quicknew.txt MCI code
        // in the LOGON security screens (logon10.txt, logon20.txt, etc.)
        // The batch jobs (batch0-batch6) run periodically to regenerate quicknew.txt
        session.subState = LoggedOnSubState.DISPLAY_BULL;
        continue;
      }

      if (session.subState === LoggedOnSubState.DISPLAY_NODE_BULL) {
        // express.e:28557 - IF (displayScreen(SCREEN_NODE_BULL)) THEN doPause()
        // SCREEN_NODE_BULL looks in NodeN/Screens/ for BULL.TXT (express.e:6551-6553)
        // Optional — a missing file is normal, silence the sysop alert.
        displayFlowLog('showing NODE_BULL');
        const shown = await displayScreen(socket, session, 'NODE_BULL', true, /* silent */ true);
        if (shown && pauseDisplayFlow(socket, session)) {
          session.subState = LoggedOnSubState.DISPLAY_ACHIEVE_BULL;
          displayFlowLog('pause after NODE_BULL');
          return;
        }
        session.subState = LoggedOnSubState.DISPLAY_ACHIEVE_BULL;
        continue;
      }

      if (session.subState === LoggedOnSubState.DISPLAY_ACHIEVE_BULL) {
        // The achievements leaderboards, written by achievements/bulletin.ts
        // into Screens/AchieveTop.txt on its own timer. Silent and skipped
        // when the file is not there, which is every board that has no
        // achievements server configured - same contract as NODE_BULL.
        displayFlowLog('showing ACHIEVETOP');
        const shown = await displayScreen(socket, session, 'ACHIEVETOP', true, /* silent */ true);
        if (shown && pauseDisplayFlow(socket, session)) {
          session.subState = LoggedOnSubState.CONF_SCAN;
          displayFlowLog('pause after ACHIEVETOP');
          return;
        }
        session.subState = LoggedOnSubState.CONF_SCAN;
        continue;
      }

      if (session.subState === LoggedOnSubState.CONF_SCAN) {
        // express.e:28073 - displayScreen(SCREEN_MAILSCAN) — always shown before scan/prompt
        await displayScreen(socket, session, 'MAILSCAN');
        // express.e:28075 - IF (checkToolTypeExists(TOOLTYPE_NODE,node,'MAILSCAN_PROMPT'))
        const nodeInfoPath = path.join(config.get('dataDir'), `Node${session.nodeId}.info`);
        let hasMailscanPrompt = false;
        try {
          const tooltypes = parseInfoFile(nodeInfoPath);
          hasMailscanPrompt = tooltypes.has('MAILSCAN_PROMPT');
        } catch (_e) {
          // no node info file — no prompt
        }
        if (hasMailscanPrompt) {
          displayFlowLog('CONF_SCAN: MAILSCAN_PROMPT tooltype found, showing prompt');
          // Pre-init confScanState with promptShown=TRUE so advanceConferenceScan
          // knows to skip per-conf checkMailConfScan() when user answers Y.
          if (!session.tempData) session.tempData = {};
          if (!session.tempData.confScanState) {
            session.tempData.confScanState = {
              confIndex: 0,
              mscan: true,
              promptShown: true,   // express.e:28075 prompt=TRUE
              fileScanDone: false,
              pendingConf: 0,
              pendingMsgBase: 0,
              pendingMessages: []
            };
          } else {
            session.tempData.confScanState.promptShown = true;
          }
          // express.e:28076 aePuts('\b\n[0mScan for Mail ') then yesNo(1) → (Y/n)?
          emitText(socket, '\r\n\x1b[0mScan for Mail \x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mn\x1b[32m)?\x1b[0m ');
          session.subState = LoggedOnSubState.MAILSCAN_PROMPT_INPUT;
          return;
        }
        displayFlowLog('CONF_SCAN: performing conference scan');
        const { performConferenceScan } = require('./message/message-scan.handler');
        await performConferenceScan(socket, session);
        // express.e: confScan uses nonStopMail flag but returns to DISPLAY_CONF_BULL.
        // NOTE: performConferenceScan may have yielded mid-scan (CONF_SCAN_MAIL_PROMPT),
        // or may have already advanced to DISPLAY_CONF_BULL via finishConferenceScan.
        // Only set DISPLAY_CONF_BULL ourselves when no yield happened.
        if (session.subState === LoggedOnSubState.CONF_SCAN) {
          session.menuPause = true;
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
          continue;
        }
        return; // subState was changed by performConferenceScan — stop display-flow loop
      }

      if (session.subState === LoggedOnSubState.DISPLAY_CONF_BULL) {
        // express.e:28573-28574 — SUBSTATE_DISPLAY_CONF_BULL calls joinConf() directly.
        // CONF_BULL is shown inside joinConference (express.e:5058, when confScan=FALSE).
        // There is no separate displayConferenceBulletins call — that was showing the wrong
        // (global) CONF_BULL before joinConference showed the correct per-conference one.
        session.subState = LoggedOnSubState.AUTO_REJOIN;
        continue;
      }

      // express.e:28573-28574 - After CONF_BULL, auto-rejoin with user stats
      // express.e: joinConf(loggedOnUser.confRJoin,loggedOnUser.msgBaseRJoin,FALSE,FORCE_MAILSCAN_SKIP)
      if (session.subState === LoggedOnSubState.AUTO_REJOIN) {
        // Resolve the rejoin target FIRST so we can pre-set currentConf before
        // CONF_BULL renders. Without this, ~CC_CONFTOP and any other
        // conf-scoped MCI codes inside the bulletin screen would resolve in
        // the prior (login-default) conference and report wrong data
        // (e.g. "Conference Top Uploaders is not installed").
        const confId = session.user?.confRJoin || session.currentConf || 1;
        // express.e:4995 - IF (msgBaseNum<1) OR (msgBaseNum>getConfMsgBaseCount(conf)) THEN msgBaseNum:=1
        // msgBaseRJoin is a RELATIVE number (1 = first message base), not a database ID
        const confMsgBases = getMessageBases().filter((mb: any) => mb.conferenceId === confId);
        let msgBaseNum = session.user?.msgBaseRJoin || session.msgBaseRJoin || 1;
        if (msgBaseNum < 1 || msgBaseNum > confMsgBases.length) {
          msgBaseNum = 1;
        }
        const msgBaseId = confMsgBases.length > 0 ? confMsgBases[msgBaseNum - 1]?.id || confMsgBases[0].id : 1;
        const targetConfName = getConferences().find((c: any) => c.id === confId)?.name || '';

        // express.e:5056-5061 — joinConf shows CONF_BULL and calls doPause() BEFORE
        // emitting "Joining Conference". We do it here in the display-flow loop so the
        // doPause correctly gates the output: show CONF_BULL now, return (waiting for
        // Pre-set ALL conf-identifying session fields so CONF_BULL's MCI
        // codes inside joinConference (~CC_CONFTOP, ~CC_*) and the menu
        // prompt format ([relConfNum:currentConfName]) resolve to the
        // rejoin target. ~CC_CONFTOP runs the conftop door which reads
        // Conf<relConfNum>/ctop.data; without relConfNum it would look
        // in conf 0 and report "not installed" even when ctop.data
        // exists for the target conf. joinConference below re-sets the
        // full state authoritatively.
        session.currentConf = confId;
        session.relConfNum = confId;
        session.conferenceId = confId;
        session.currentConference = confId;
        session.currentMsgBase = msgBaseId;
        if (targetConfName) session.currentConfName = targetConfName;
        // CONF_BULL is now displayed by joinConference itself
        // (express.e:5056-5061 1:1), so the AUTO_REJOIN block no
        // longer pre-displays it. The earlier pre-display caused the
        // banner to render twice (once here, once inside joinConf).

        displayFlowLog('AUTO_REJOIN: calling joinConference');
        displayFlowLog(`AUTO_REJOIN: confId=${confId}, msgBaseNum=${msgBaseNum}, msgBaseId=${msgBaseId}`);

        // express.e:28574 - joinConf(loggedOnUser.confRJoin, loggedOnUser.msgBaseRJoin, FALSE, FORCE_MAILSCAN_SKIP)
        // auto=FALSE per express.e:28574; auto=TRUE would trigger S command and Auto-ReJoined display which does NOT happen here
        const joinSuccess = await joinConference(socket, session, confId, msgBaseId, false, false, FORCE_MAILSCAN_SKIP);

        session.blockOLM = false;

        // CRITICAL: If joinConference fails, skip to DISPLAY_MENU to avoid infinite loop
        if (!joinSuccess) {
          displayFlowLog('AUTO_REJOIN: joinConference failed, skipping to DISPLAY_MENU');
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          continue;
        }

        // joinConference sets subState to DISPLAY_MENU and menuPause to true
        if (pauseDisplayFlow(socket, session)) {
          displayFlowLog('pause after auto-rejoin');
          // Clear menuPause since we already paused here - prevents double pause in DISPLAY_MENU
          session.menuPause = false;
          return;
        }
        continue;
      }

      if (session.subState === LoggedOnSubState.DISPLAY_MENU) {
        if (session.skipNextDisplayFlowMenu) {          displayFlowLog(
            'skipping duplicate MENU display after manual render',
            `dest=${session.manualMenuTargetState}`
          );
          session.skipNextDisplayFlowMenu = false;
          session.subState = session.manualMenuTargetState || LoggedOnSubState.READ_COMMAND;
          session.manualMenuTargetState = undefined;
          return;
        }
        // TIP last: the tip door runs here, after bulletins, scans and
        // rejoin, with the menu one keypress behind it. Marked shown
        // BEFORE running so a door that errors cannot loop the login;
        // a failed tip falls through to the menu, never strands it.
        if (tipDoorBeforeMenu(session, getDoors())) {
          if (!session.tempData) session.tempData = {};
          session.tempData.tipShown = true;
          const tip = getDoors().find(
            (d) => (d.command ?? '').toUpperCase() === 'TIP' && doorAvailableTo(d, session),
          );
          if (tip) {
            displayFlowLog('running TIP before MENU');
            try {
              await executeDoor(socket, session, tip);
            } catch (error) {
              console.error('[DISPLAY FLOW] TIP door failed, continuing to menu:', (error as Error)?.message);
            }
            session.subState = LoggedOnSubState.DISPLAY_MENU;
            continue;
          }
        }
        const relConfNumber = session.relConfNum || 1;
        const forceMenus = getConferenceToolFlags(relConfNumber).forceMenus;
        const shouldDisplayMenu = ((session.user?.expert || 'N') === 'N' && !session.doorExpertMode) || forceMenus;

        if (shouldDisplayMenu && session.menuPause) {
          // express.e: menuPause triggers a pause before menu display
          const { doPause } = require('./screen.handler');
          doPause(socket, session);
          session.menuPause = false;
          // CRITICAL: Return after installing pause - don't continue to display menu until pause dismissed
          displayFlowLog('pause before MENU (menuPause was true)');
          return;
        }

        // express.e: checkScreenClear + displayScreen(MENU) when menu is shown
        if (shouldDisplayMenu) {
          const { checkScreenClear } = require('./screen.handler');
          if (typeof checkScreenClear === 'function') {
            checkScreenClear(socket, session);
          }
        }

        displayFlowLog('displaying MENU', `forceMenus=${forceMenus ? 'Y' : 'N'}`, `expert=${session.user?.expert}`);
        await menuDisplayMainMenu(socket, session);
        return;
      }

      return;
    }
  } catch (error: any) {
console.error('Error in display state handling:', error);
if (typeof error === 'object' && error !== null) {
  console.error('Stack:', error.stack);
}
// Log to file for retrieval
try {
  const fs = require('fs');
  fs.appendFileSync('debug-display-flow.log', `[${new Date().toISOString()}] Error in display state handling: ${error?.message || error}\nStack: ${error?.stack}\nSession: ${JSON.stringify({ state: session.state, subState: session.subState, currentConf: session.currentConf })}\n`);
} catch (e) {
  // ignore
}
    emitText(socket, '\r\n\x1b[31mAn error occurred. Returning to main menu...\x1b[0m\r\n');
    emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
 }
}

// ===== Exported Functions =====
export const displayMainMenu = menuDisplayMainMenu;

/**
 * Draw the menu if a command just ended, instead of leaving it pending.
 *
 * DISPLAY_MENU only repaints when the NEXT keystroke arrives (see the
 * transition near the bottom of handleCommand). A command that finishes
 * inside processCommand is fine - the after-command flow draws it - but one
 * that finishes inside an INPUT branch, as the flag and download prompts
 * do, leaves the user looking at a screen with no prompt on it.
 *
 * Reported twice: "i have to press enter twice" at the flag prompt, and
 * "i downloaded two files now i have to press enter to return to the bbs
 * prompt... it was stuck with no prompt".
 */
async function repaintMenuIfPending(socket: any, session: BBSSession): Promise<void> {
  if ((session.subState as LoggedOnSubState) !== LoggedOnSubState.DISPLAY_MENU) return;
  session.menuPause = false;
  await menuDisplayMainMenu(socket, session);
}
export const displayMenuPrompt = menuDisplayMenuPrompt;

/**
 * Return to the menu after command execution when the command did not change state.
 * menuPauseDefault mirrors express.e: TRUE for line input commands, FALSE for shortcuts.
 */
function showMenuAfterCommand(socket: any, session: BBSSession, menuPauseDefault: boolean) {
  session.commandText = undefined;

  if (session.inDoorManager) {
    return;
  }

  if (session.subState === LoggedOnSubState.PROCESS_COMMAND) {
    session.menuPause = menuPauseDefault;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    menuDisplayMainMenu(socket, session);
  }
}

/**
 * Shared tail of the real-C64 fast path (task 6 / audit F1-F3): honour the
 * system-password gate, then either park at SYSTEM_PASSWORD_INPUT or go
 * straight to BBSTITLE -> LOGON. Mirrors the dead pre-login.ts:54-84
 * branch (handlePreLoginInput is never called from the live dispatcher).
 * Called from both the DISPLAY_CONNECT short-circuit (fast typers,
 * classified within telnet-server.ts's 500ms TTYPE window) and the
 * ANSI_PROMPT short-circuit (slower typers, classified once the graphics
 * prompt is already on screen) so there is exactly one copy of this
 * sequence instead of a third hand-rolled duplicate.
 */
async function completeRealC64Connect(socket: any, session: BBSSession): Promise<void> {
  // Resync the session's PETSCII oracle before anything else is written.
  // The welcome banner, node list and graphics prompt that already reached
  // this caller (both the DISPLAY_CONNECT and ANSI_PROMPT c64 branches run
  // AFTER those) went out through the non-PETSCII 'ansi-output' path,
  // since terminalType only just flipped to 'c64' - the transducer never
  // saw any of it and its oracle still thinks the cursor is at (0,0) on a
  // blank screen. Node1/BBSTITLE.SEQ starts with plain spaces, not $93, so
  // observe() cannot resync it either. Emitting the clear+home here does
  // double duty: it wipes whatever ANSI left on the real C64's screen AND
  // - because this goes through the transducer, not connection.write -
  // brings the oracle's cursor/bank state back to a known (0,0) origin
  // before BBSTITLE.SEQ's absolute positioning is computed against it.
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  session.tempData = { inputBuffer: '' };
  const { getSystemPassword } = require('./command-handler/pre-login');
  const sysPassC64 = getSystemPassword();
  if (sysPassC64.length > 0) {
    session.tempData.systemPasswordAttempts = 0;
    session.subState = LoggedOnSubState.SYSTEM_PASSWORD_INPUT;
    socket.emit('petscii-output', '\r\n');
    await displayScreen(socket, session, 'PRIVATE');
    socket.emit('petscii-output', '>: ');
    socket.emit('mask-input', true);
    return;
  }

  await displayScreen(socket, session, 'BBSTITLE');
  session.paginatedScreen = undefined;
  session.lastScreenHadPause = false;
  session.state = BBSState.LOGON;
  session.subState = undefined;
  session.tempData = session.tempData || {};
  session.tempData.loginPhase = 'username';
  socket.emit('petscii-output', '\r\n\r\n');
  socket.emit('prompt-login');
}

// Handle user commands (processCommand equivalent)
export async function handleCommand(socket: any, session: BBSSession, data: string, io?: any) {
console.log('=== handleCommand called ===');
console.log('data:', JSON.stringify(data));
console.log('session.state:', session.state);
console.log('session.subState:', session.subState);
  // If the menu was just displayed and the user pressed *anything* (including Enter),
  // drop into READ_COMMAND so the keystroke is handled instead of being eaten by the
  // display-flow loop. We only keep DISPLAY_MENU when handleCommand is invoked with
  // an empty string (internal advanceDisplayFlow tick).
  // IMPORTANT: Skip this shortcut when paginatedScreen is set — that means we are
  // paused before the menu (e.g. the menuPause doPause after conference join). The
  // paginatedScreen handler below will dismiss the pause and then call advanceDisplayFlow
  // which shows the menu. Prematurely changing subState to READ_COMMAND here would make
  // isDisplayFlowState() return false afterwards, so advanceDisplayFlow would be skipped
  // and the user would see no menu until they pressed Enter a second time.
  if (session.subState === LoggedOnSubState.DISPLAY_MENU && data !== '' && !session.paginatedScreen) {
    session.subState = LoggedOnSubState.READ_COMMAND;
    // Display the menu once BEFORE allowing command input IF we are in an internal tick (data === '').
    // But since we are here with data !== '', we just transition to READ_COMMAND
    // and let the character be processed normally.
    session.menuPause = false;
    // NO 'await displayMainMenu(socket, session);' here - it would redraw the prompt.
  }

  // A PROMPT express.e READS WITH lineInput() IS HANDED A LINE, NOT A KEYSTROKE.
  //
  // The transport gives this function one character per call
  // (server/socket-handlers.ts:818 iterates the input string), so a branch
  // that answers with `handler(socket, session, data.trim())` runs its handler
  // on the FIRST key pressed. The sysop's report, 2026-09-06: "z takes a
  // hotkey instead of a string" - at the Z prompt `C` became the whole search
  // string, `H` became the whole directory span, and `ASE` was then typed at
  // the menu. 6c021d85e is what made Z reach this code (a door refused for
  // width now falls through to the internal command); the branch had always
  // read one key.
  //
  // The fix is not per-branch. `LINE_PROMPT_SUBSTATES` (utils/line-input.util)
  // is the ONE declaration of which sub-states are line prompts, and this is
  // the ONE place that acts on it: keystrokes are collected here - echoed,
  // backspace honoured, Enter ending the line - and the branch below is then
  // entered exactly once with the completed line in `data`. A branch cannot
  // lose its line-ness by being written in the shorter shape, and a new prompt
  // needs no input code at all, only an entry in that table.
  //
  // Not applied to an EMPTY tick: advanceDisplayFlow, BBSApi and the post-pause
  // resume all call handleCommand with '' to nudge the state machine, and those
  // are not the caller typing.
  const { LINE_PROMPT_SUBSTATES, collectLine } = require('../utils/line-input.util');
  const linePrompt: LineInputOptions | undefined =
    data !== '' && !session.executingScreenCommand
      ? LINE_PROMPT_SUBSTATES.get(session.subState as string)
      : undefined;
  if (linePrompt) {
    let completedLine: string | undefined;
    const lineIsComplete = await collectLine(
      socket,
      session,
      data,
      (line: string) => { completedLine = line; },
      linePrompt
    );
    // Still being typed - the keystroke has been echoed and buffered, and must
    // not reach any branch below.
    if (!lineIsComplete) return;
    data = completedLine ?? '';
  }

  const trimmedScreenCommand = (data || '').trim();
  const isAwaitScreenRunning = session.pendingScreenCommand && session.executingScreenCommand;
  const allowScreenCommand = !!(session.executingScreenCommand && trimmedScreenCommand.length > 1);
  const isScreenDoorsPath = /^DOORS:/i.test(trimmedScreenCommand);
  if (allowScreenCommand) {
console.log('[handleCommand] Executing screen-initiated command (state bypass enabled)');
  }

  // Highest priority: message entry states must never fall through to menu/command handling
  const messageSubStates = new Set<string>([
    LoggedOnSubState.POST_MESSAGE_TO,
    LoggedOnSubState.POST_MESSAGE_SUBJECT,
    LoggedOnSubState.POST_MESSAGE_PRIVATE,
    LoggedOnSubState.POST_MESSAGE_BODY,
    LoggedOnSubState.POST_MESSAGE_OPTIONS,          // single-char: A/C/D/E/L/S/?
    LoggedOnSubState.POST_MESSAGE_ABORT_CONFIRM,    // single-char yesNo(0)
    LoggedOnSubState.POST_MESSAGE_QUOTE_REPLY_CONFIRM, // single-char yesNo(2)
    LoggedOnSubState.POST_MESSAGE_DELETE_LINE,
    LoggedOnSubState.POST_MESSAGE_DELETE_CONFIRM,
    LoggedOnSubState.POST_MESSAGE_EDIT_LINE,
    LoggedOnSubState.POST_MESSAGE_EDIT_LINE_CONTENT,
    LoggedOnSubState.POST_MESSAGE_SAVE,
    LoggedOnSubState.POST_MESSAGE_ATTACH_FILE,
    LoggedOnSubState.POST_MESSAGE_ATTACH_DELETE_CONFIRM,
    LoggedOnSubState.POST_MESSAGE_QUOTE_RANGE,
    LoggedOnSubState.POST_MESSAGE_REPLACE_SEARCH,
    LoggedOnSubState.POST_MESSAGE_REPLACE_WITH,
    LoggedOnSubState.POST_MESSAGE_INSERT_LINE,
    LoggedOnSubState.POST_MESSAGE_INSERT_TEXT
  ]);

  if (messageSubStates.has(session.subState as string)) {
    const prevMessageSubState = session.subState;
    await handleMessageEntryInput(socket, session, data);
    // Locked-out comment form (login-post accountLocked/pwd-change-denied):
    // express.e runs C to completion before Thanks + logoff, but the
    // immediate beginLogoff used to fire 1.5 s after the form opened,
    // cutting it off mid-fill. Fire the deferred Thanks + logoff when the
    // flow lands back on the menu instead of advancing into it.
    if (session.logoffAfterComment && session.subState === LoggedOnSubState.DISPLAY_MENU) {
      session.logoffAfterComment = false;
      socket.emit('ansi-output', '\r\nThanks you will now be disconnected...\r\n\r\n');
      beginLogoff(socket, session, { finalState: BBSState.AWAIT, readDelayMs: 1500 });
      return;
    }
    // express.e yesNo()/abort/save all return to the menu immediately — no extra keypress needed.
    // If the handler left us in a display-flow state (e.g. DISPLAY_MENU after abort Y or save),
    // advance now so the menu appears without requiring the user to press an extra key.
    if (prevMessageSubState !== session.subState && isDisplayFlowState(session.subState)) {
      await advanceDisplayFlow(socket, session);
    }
    return;
  }

  // express.e:28075-28080 - MAILSCAN_PROMPT yesNo(1): Y/Enter=yes (scan), N=no (skip), loop on unknown
  if (session.subState === LoggedOnSubState.MAILSCAN_PROMPT_INPUT) {
    const ch = (data[0] || '').toUpperCase();
    if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
      return; // loop — yesNo(1) ignores unknown chars
    }
    const doScan = (ch !== 'N'); // default yes: Y or Enter = scan
    // Use direct emit (not emitText) so the echo lands BEFORE the
    // subsequent "Scanning conferences…" lines that performConferenceScan
    // emits directly. emitText is 16ms-buffered; the scan flushes ahead
    // of it and the user sees a delayed "Yes" trailing the scan output.
    socket.emit('ansi-output', doScan ? 'Yes\r\n' : 'No\r\n');

    // express.e:28079 - mscan:=(mystat=1)
    // Propagate the Y/N answer into confScanState so advanceConferenceScan can
    // gate the file scan phase (express.e:28082 IF (prompt=FALSE) OR (mscan=TRUE)).
    if (!session.tempData) session.tempData = {};
    if (session.tempData.confScanState) {
      session.tempData.confScanState.mscan = doScan;
    }

    if (doScan) {
      // express.e:28082-28085 — mscan=TRUE: show "Scanning conferences..." and do scan
      const { performConferenceScan } = require('./message/message-scan.handler');
      await performConferenceScan(socket, session);
      // performConferenceScan may have yielded mid-scan (CONF_SCAN_MAIL_PROMPT)
      // or already advanced to DISPLAY_CONF_BULL via finishConferenceScan.
      // Only transition ourselves when scan finished synchronously.
      if (session.subState === LoggedOnSubState.MAILSCAN_PROMPT_INPUT ||
          session.subState === LoggedOnSubState.CONF_SCAN) {
        session.menuPause = true;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        await advanceDisplayFlow(socket, session);
      }
      return;
    }
    // express.e:28082 - (prompt=TRUE AND mscan=FALSE): skip entire scan block
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    await advanceDisplayFlow(socket, session);
    return;
  }

  // express.e:11739 - per-conference "Would you like to read it now (Y/n)?"
  // Yielded from advanceConferenceScan when new mail is found in a conference.
  if (session.subState === LoggedOnSubState.CONF_SCAN_MAIL_PROMPT) {
    const ch = (data[0] || '').toUpperCase();
    if (ch !== 'Y' && ch !== 'N' && ch !== 'Q' && ch !== '\r' && ch !== '\n' && ch !== '') {
      return; // loop — yesNo(1) ignores unknown chars
    }
    if (ch === 'Q') {
      // Q - Quit mail scan entirely, skip to file scan phase
      // Clear pending mail state and jump to file scan phase
      if (session.tempData?.confScanState) {
        session.tempData.confScanState.mscan = false;
        session.tempData.confScanState.confIndex = session.tempData.confScanState.confIndex + 1;
      }
      const { advanceConferenceScan } = require('./message/message-scan.handler');
      await advanceConferenceScan(socket, session);
      return;
    }
    const doRead = (ch !== 'N'); // default yes
    // See MAILSCAN_PROMPT_INPUT above — direct emit so the echo doesn't
    // get reordered after subsequent buffered output.
    socket.emit('ansi-output', doRead ? 'Yes\r\n' : 'No\r\n');

    if (doRead && session.tempData?.confScanState?.pendingMessages?.length > 0) {
      const state = session.tempData.confScanState;
      const pendingConf: number = state.pendingConf;
      const bbsDataPath = config.get('dataDir');
      const { readMessageFile } = require('../utils/message-file.util');
      const fullMessages: any[] = [];

      for (const m of state.pendingMessages) {
        try {
          const msg = await readMessageFile(pendingConf, m.msgNum, bbsDataPath);
          if (msg) {
            fullMessages.push({
              id: m.msgNum,
              msgNumber: m.msgNum,
              subject: msg.subject,
              body: msg.body,
              author: msg.from,
              toUser: msg.to,
              timestamp: new Date(msg.date),
              isPrivate: msg.isPrivate
            });
          }
        } catch (_e) { /* skip unreadable messages */ }
      }

      if (fullMessages.length > 0) {
        session.tempData.msgReaderMessages = fullMessages;
        session.tempData.msgReaderIndex = 0;
        session.tempData.msgReaderHighestRead = session.lastMsgReadConf || 0;
        session.tempData.confScanReturnAfterRead = true;
        session.subState = LoggedOnSubState.MSG_READER_NAV;
        const { displaySingleMessage } = require('./message/messaging.handler');
        await displaySingleMessage(socket, session, 0);
      } else {
        // Headers found but no readable files — continue scan
        const { advanceConferenceScan } = require('./message/message-scan.handler');
        await advanceConferenceScan(socket, session);
      }
    } else {
      // N pressed or no pending messages — continue scan
      const { advanceConferenceScan } = require('./message/message-scan.handler');
      await advanceConferenceScan(socket, session);
    }
    return;
  }

  // Handle DOOR_SELECT state (arrow key navigation for DOORS command)
  if (session.subState === LoggedOnSubState.DOOR_SELECT) {
    const { handleDoorSelectInput } = require('./door.handler');
    await handleDoorSelectInput(socket, session, data);
    return;
  }

  // WEB_: GDPR Phase 2 backfill consent for pre-GDPR users on next login.
  // Line-input: accumulate chars until Enter, then dispatch. Blank Enter
  // accepts by default (Y is the default — prompt shows Y/n).
  if (session.subState === LoggedOnSubState.GDPR_BACKFILL) {
    if (data === '\r' || data === '\n') {
      const gbInput = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      const { handleGdprBackfillInput } = require('./user/gdpr.handler');
      await handleGdprBackfillInput(socket, session, gbInput);
    } else if (data === '\x7f' || data === '\b') {
      if (session.inputBuffer?.length) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        emitText(socket, '\b \b');
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_COMMAND_LINE) {
      session.inputBuffer = (session.inputBuffer || '') + data;
      emitText(socket, data);
    }
    return;
  }

  // If we are already logged off/awaiting and at logoff prompt, ignore stray input
  if (session.state === BBSState.AWAIT && session.subState === LoggedOnSubState.LOGOFF) {
    return;
  }

  // If a message entry session is active but subState was lost/reset, force it back
  const messageEntry = session.tempData?.messageEntry;
  if (messageEntry && !messageSubStates.has(session.subState as string)) {
    // Recover to the correct message-entry substate based on progress
    if (!messageEntry.toUser) {
      session.subState = LoggedOnSubState.POST_MESSAGE_TO;
    } else if (!messageEntry.subject) {
      session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
    } else if (typeof messageEntry.isPrivate === 'undefined') {
      session.subState = LoggedOnSubState.POST_MESSAGE_PRIVATE;
    } else {
      session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    }
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }
  }

  // If a door is active but has lost its handler, clear door state so BBS input resumes
  if (session.inDoorManager && !session.doorInputHandler) {
    session.inDoorManager = false;
    session.mouseEventsEnabled = false; // Reset mouse events when door state is cleared
    if (session.subState === LoggedOnSubState.DOOR_RUNNING) {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    }
  }

  // NOTE: Door input routing is handled in socket-handlers.ts (checks doorInputHandler)
  // This function should only be called for non-door input

console.log(`[handleCommand] ENTRY: data="${data}" subState=${session.subState} paginatedScreen=${!!session.paginatedScreen} inDoorManager=${session.inDoorManager}`);

  // If user is responding to a paginated screen prompt, handle that first
  if (session.paginatedScreen) {
console.log(`[handleCommand] Has paginatedScreen - calling handlePaginatedScreenInput`);
    const { handlePaginatedScreenInput } = require('./screen.handler');
    try {
      const handled = await handlePaginatedScreenInput(socket, session, data);
console.log(`[handleCommand] handlePaginatedScreenInput returned: handled=${handled} paginatedScreen=${!!session.paginatedScreen}`);
      if (handled) {
        // If pagination finished and we're still in a display-flow state, resume it
        if (!session.paginatedScreen && isDisplayFlowState(session.subState)) {
console.log(`[handleCommand] Pagination finished, resuming display flow (subState=${session.subState})`);
          await advanceDisplayFlow(socket, session);
        }
        return;
      }
    } catch (error) {
console.error('[handleCommand] Error handling paginated screen input:', error);
      session.paginatedScreen = undefined;
      session.queuedScreenCommands = [];
    }
  }

  // Special handling for WHO2 helper tools (NI/NO) - these must run without authentication
  // NI (NodeIn) executes on connection, NO (NodeOut) executes on logout
  // They create tracking files that WHO2 door reads to display connected users
  // NOTE: This is a generic feature - any door can use this pattern for node tracking
  if (data === 'DOORS:who/NI' || data === 'DOORS:who/No') {
console.log(`[WHO2] Executing helper tool: ${data}`);
    const nodeId = session.nodeId || 0;
    const username = session.user?.username || 'Guest';
    // Use proper BBS data directory resolution instead of hardcoded relative path
    const dataDir = config.get('dataDir') || process.cwd();
    const whoDir = path.join(dataDir, 'Doors', 'who');

    try {
      // Ensure directory exists (use amigafs for case-insensitive matching)
      if (!amigafs.existsSync(whoDir)) {
        amigafs.mkdirSync(whoDir, { recursive: true });
      }

      if (data === 'DOORS:who/NI') {
        // NodeIn - create node tracking file on connection
        const nodeFile = path.join(whoDir, `node${nodeId}.txt`);
        const nodeData = `Node: ${nodeId}\nUser: ${username}\nConnected: ${getSystemTime().toISOString()}\n`;
        amigafs.writeFileSync(nodeFile, nodeData);
console.log(`[WHO2] NI created tracking file: ${nodeFile}`);
      } else {
        // NodeOut - remove node tracking file on logout
        const nodeFile = path.join(whoDir, `node${nodeId}.txt`);
        if (amigafs.existsSync(nodeFile)) {
          amigafs.unlinkSync(nodeFile);
console.log(`[WHO2] NO removed tracking file: ${nodeFile}`);
        }
      }
    } catch (error) {
console.error(`[WHO2] Error executing ${data}:`, error);
    }
    return; // Done - don't process further
  }

  // Screen-triggered commands (from ~CC_ / ~XC_ MCI codes) need to run even if the
  // session is still in AWAIT states (ANSI prompt, etc.). Allow them to bypass the
  // usual subState gating as long as they are not raw DOORS: helper paths.
  if (allowScreenCommand && trimmedScreenCommand.length > 0 && !isScreenDoorsPath) {
    const normalized = trimmedScreenCommand.toUpperCase();
    const parts = normalized.split(/\s+/);
    const command = parts[0];
    const params = parts.slice(1).join(' ');
console.log('[handleCommand] Running screen command immediately:', command, params);
    try {
      await processCommand(socket, session, command, params);
    } catch (error) {
console.error('[handleCommand] Screen command failed:', error);
    }
    return;
  }

  // Handle pre-login connection flow (AWAIT state)
  if (!allowScreenCommand && session.state === BBSState.AWAIT) {
    if (session.subState === LoggedOnSubState.DISPLAY_CONNECT) {
      // Task 6 / audit F1-F3: real C64 detected via TTYPE (telnet-server.ts)
      // or the DEL-probe (index.ts's connection.on('data') hook, before
      // this handler ever runs — see c64-detect.util.ts). Skip the
      // graphics prompt entirely and go straight to PETSCII mode. Mirrors
      // the dead pre-login.ts:54-84 branch (this is the LIVE dispatcher;
      // handlePreLoginInput in pre-login.ts is never called).
      if (session.terminalType === 'c64') {
console.log('[C64] Real C64 terminal detected - auto-enabling PETSCII mode');
        session.petsciiMode = true;
        session.ansiEnabled = false; // C64 uses raw PETSCII, not ANSI
        session.screenWidth = 40;
        session.screenHeight = 25;
        // The flip: from here the model describes a fresh 40x25 screen. The
        // DEL-probe stamped terminalType='c64' in index.ts one dispatch ago,
        // so anything still draining out of the 16ms AnsiBuffer since then -
        // the connect screen's tail, a graphics prompt deferred behind
        // session.pendingScreenCommand - was transduced into the model with
        // sessionWantsPetscii already true. completeRealC64Connect's own
        // ESC[2J ESC[H resync transduces on top of this, which is idempotent.
        // Task OC-5.
        resetPetsciiModel(session);
        await completeRealC64Connect(socket, session);
        return;
      }

      // User pressed key after connection screen (welcome + node list)
      // reference-board BBS layout: everything shown on connect, now just show ANSI prompt
      // express.e:29528 - ANSI prompt
console.log(' Connection screen viewed, showing ANSI prompt');
      session.subState = LoggedOnSubState.ANSI_PROMPT;
      session.tempData = { inputBuffer: '' }; // Initialize input buffer
      if (session.pendingScreenCommand) {
console.log('[handleCommand] Await screen command still running, deferring prompt');
        session.pendingScreenCommand.then(() => {
          if (session.subState === LoggedOnSubState.ANSI_PROMPT) {
            emitPrompt(socket, recordPromptColumn(session as any, ANSI_GRAPHICS_PROMPT)); emitText(socket, SAVE_CURSOR);
          }
        }).catch(error => {
console.error('[handleCommand] Pending screen command rejected:', error);
          emitPrompt(socket, recordPromptColumn(session as any, ANSI_GRAPHICS_PROMPT)); emitText(socket, SAVE_CURSOR);
        });
      } else {
        emitPrompt(socket, recordPromptColumn(session as any, ANSI_GRAPHICS_PROMPT)); emitText(socket, SAVE_CURSOR);
      }
      return;
    }

    if (session.subState === LoggedOnSubState.ANSI_PROMPT) {
      // Task 6 / audit F1-F3: a slower human C64 caller lands here once
      // telnet-server.ts's 500ms TTYPE window has already expired and
      // shown the graphics prompt. That prompt's first keypress doubles
      // as the DEL-probe too — index.ts's connection.on('data') hook runs
      // classifyFirstKeypress on the raw byte before this handler ever
      // sees it, and may have just flipped terminalType to 'c64'. Apply
      // PETSCII immediately instead of treating the probe byte as part of
      // the graphics-answer buffer.
      if (session.terminalType === 'c64' && !session.petsciiMode) {
console.log('[C64] DEL-probe classified caller as C64 at ANSI_PROMPT - auto-enabling PETSCII mode');
        const { applyGraphicsAnswer } = require('./command-handler/pre-login');
        applyGraphicsAnswer(socket, session, 'P');
        // applyGraphicsAnswer's PETSCII branch leaves ansiEnabled=true
        // (SyncTERM-style PETSCII clients still want ANSI color codes) —
        // a real C64 needs raw PETSCII with no ANSI escape parsing at all.
        session.ansiEnabled = false;
        // Same flip, same window, one dispatch later: this caller was still
        // being classified while the graphics prompt was already on screen.
        // applyGraphicsAnswer above resets too and nothing model-visible is
        // emitted between the two calls (terminal-resize is not), so this is
        // a no-op in this order - it is here so the two flip branches cannot
        // drift apart when one of them changes. Task OC-5.
        resetPetsciiModel(session);
        await completeRealC64Connect(socket, session);
        return;
      }

      if (session.pendingScreenCommand) {
console.log('[handleCommand] ANSI prompt input ignored until screen command completes');
        return;
      }
      // Telnet often sends CR followed by NUL; strip NULs for control handling.
      const cleanData = data.replace(/\0/g, '');

      // Multi-char input path (debug-mcp, paste, or telnet line-buffered
      // delivery of "answer\r" in one chunk): accumulate printable chars
      // into the buffer and re-dispatch a bare CR to this same handler
      // so the Enter-path below runs exactly once. Recursing preserves
      // the single-char fast path everyone else still uses.
      if (cleanData.length > 1) {
        const crIdx = cleanData.search(/[\r\n]/);
        const head = crIdx === -1 ? cleanData : cleanData.slice(0, crIdx);
        for (const ch of head) {
          if (ch >= ' ' && ch <= '~') {
            session.tempData = session.tempData || {};
            session.tempData.inputBuffer = (session.tempData.inputBuffer || '') + ch;
            emitText(socket, ch);
          }
        }
        if (crIdx !== -1) {
          return handleCommand(socket, session, '\r');
        }
        return;
      }

      // express.e:29530-29546 - Line input for ANSI prompt (not single keypress!)
      // Buffer input until Enter is pressed
      if (cleanData === '\r' || cleanData === '\n' || cleanData === '\r\n') {
        // Enter pressed - process the buffered input
        const answer = (session.tempData?.inputBuffer || '').toUpperCase();
console.log(' Graphics prompt response:', answer || '(empty = ANSI)');

        // express.e:29538-29546 - one shared implementation; the copy that
        // used to live here set only tempData.ripMode "for future use", so
        // answering R never reached the screen loader.
        const { applyGraphicsAnswer } = require('./command-handler/pre-login');
        applyGraphicsAnswer(socket, session, answer);

        // Sysop addendum (task 6 fix round): a web/modern-terminal caller
        // answering P gets ANSI-simulated PETSCII, not real C64 hardware —
        // say so explicitly. Real C64s (terminalType === 'c64') never reach
        // this Enter-path: they take the ANSI_PROMPT short-circuit above on
        // their very first keypress, so this line is web/modern-terminal
        // only by construction — it must never fire for a genuine C64.
        if (session.petsciiMode && session.terminalType !== 'c64') {
          // ...and say which screen. `P8` is a C128's 80-column screen, not a
          // C64's, and telling that caller he is being simulated at 40x25 was
          // simply untrue.
          const columns = petsciiColumnsOf(session);
          emitText(socket, `PETSCII: SIMULATING ${columns === 80 ? 'C128 DISPLAY (80X25)' : 'C64 DISPLAY (40X25)'}\r\n`);
        }

console.log(' Graphics mode set:', session.petsciiMode ? 'PETSCII' : session.texttvMode ? 'TELETEXT' : session.ripMode ? 'RIP' : session.ansiEnabled ? 'ANSI' : 'None');

        // express.e:29548-29550 — Not(STEALTH_MODE) path: doSystemPassword() before BBSTITLE.
        // STEALTH_MODE is a per-node tooltype (Node{N}.info) that suppresses the
        // system password gate for trusted nodes. Sysops use this on internal/LAN
        // node configs where the system password is already vouched for at the
        // network layer.
        session.tempData.inputBuffer = ''; // Clear buffer
        {
          const { loadBBSConfig } = require('../services/bbs-config-file.service');
          const path = require('path');
          const fsSync = require('fs');
          const bbsRoot = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../..');
          let diskCfg: any = {};
          try { diskCfg = loadBBSConfig(bbsRoot); } catch { /* non-fatal */ }
          const sysPass = (diskCfg.system_password || '').trim();
          // express.e:29548 IF (Not(checkToolTypeExists(TOOLTYPE_NODE,node,'STEALTH_MODE')))
          // Read the per-node icon's tooltype set; presence of STEALTH_MODE bypasses the gate.
          let stealthMode = false;
          try {
            const nodeId = session.nodeId || 0;
            const nodeIconPath = path.join(bbsRoot, `Node${nodeId}.info`);
            if (fsSync.existsSync(nodeIconPath)) {
              const buf = fsSync.readFileSync(nodeIconPath);
              // Cheap scan — STEALTH_MODE appears as ASCII in the tooltype block
              if (buf.includes(Buffer.from('STEALTH_MODE'))) stealthMode = true;
            }
          } catch { /* tooltype probe failed — treat as not-stealth */ }
          if (sysPass.length > 0 && !stealthMode) {
            // System password configured — enter gate (express.e:29329-29356)
            session.tempData.systemPasswordAttempts = 0;
            session.subState = LoggedOnSubState.SYSTEM_PASSWORD_INPUT;
            emitText(socket, '\r\n');
            const { displayScreen: ds } = require('./screen.handler');
            await ds(socket, session, 'PRIVATE'); // express.e:29336 — optional PRIVATE screen
            emitText(socket, '>: ');              // express.e:29332 — default SYS_PWRD_PROMPT
            socket.emit('mask-input', true);
            return;
          }
        }

        // No system password — display BBSTITLE then transition to login (express.e:29552)
        const { displayScreen } = require('./screen.handler');
        await displayScreen(socket, session, 'BBSTITLE');

        // Clear pagination state so next input goes to login prompt (express.e:29551)
        session.paginatedScreen = undefined;
        session.lastScreenHadPause = false;

        // Immediately transition to login state (no key press required)
        session.state = BBSState.LOGON;
        session.subState = undefined;
        session.tempData = session.tempData || {};
        session.tempData.loginPhase = 'username';
        emitPrompt(socket, '\r\n\r\nUsername: ');
        socket.emit('prompt-login'); // Tell frontend to show login form
        return;
      } else if (data === '\x7f' || data === '\b') {
        // Backspace, wrap-aware. This prompt is 78 columns on its last row,
        // so on anything narrower than that it has ALREADY wrapped before
        // the caller types a character, and a bare `\b \b` strands the row
        // above (the sysop, 2026-09-13, twice).
        {
          const had = (session.tempData?.inputBuffer as string) || '';
          const edit = acceptBackspace(had);
          if (edit.echo) {
            session.tempData.inputBuffer = edit.buffer;
            emitText(socket, backspaceEcho(had, edit.buffer, session as any));
          }
        }
        return;
      } else if (data.length === 1 && data >= ' ' && data <= '~') {
        // Printable, and only while the field has room - express.e:2335,
        // with the length express gives this prompt (29530: maxLen 10).
        {
          const edit = acceptTypedChar(
            (session.tempData?.inputBuffer as string) || '', data, ANSI_PROMPT_MAX_LEN,
          );
          session.tempData.inputBuffer = edit.buffer;
          if (edit.echo) emitText(socket, edit.echo);
        }
        return;
      }
      // Ignore other control characters
      return;
    }

    // express.e:29329-29356 doSystemPassword() gate — masked line input, up to 3 attempts
    if (session.subState === LoggedOnSubState.SYSTEM_PASSWORD_INPUT) {
      // Initialize password buffer if needed
      if (!session.tempData) session.tempData = { inputBuffer: '' };
      if (session.tempData.inputBuffer === undefined) session.tempData.inputBuffer = '';

      // Telnet: strip NUL bytes from telnet line-mode delivery
      const spData = data.replace(/\0/g, '');

      if (spData === '\r' || spData === '\n') {
        socket.emit('mask-input', false);
        const entered = (session.tempData.inputBuffer || '') as string;
        session.tempData.inputBuffer = '';
        emitText(socket, '\r\n');

        // Read system password fresh on each attempt
        const { loadBBSConfig } = require('../services/bbs-config-file.service');
        const path = require('path');
        const bbsRoot = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../..');
        let diskCfg2: any = {};
        try { diskCfg2 = loadBBSConfig(bbsRoot); } catch { /* non-fatal */ }
        const sysPass2 = (diskCfg2.system_password || '').trim();

        if (entered === sysPass2) {
          // express.e:29355 — aePuts('\b\n') then proceed to BBSTITLE
          emitText(socket, '\r\n');
          const { displayScreen: dsBBSTITLE } = require('./screen.handler');
          await dsBBSTITLE(socket, session, 'BBSTITLE');
          session.paginatedScreen = undefined;
          session.lastScreenHadPause = false;
          session.state = BBSState.LOGON;
          session.subState = undefined;
          session.tempData = session.tempData || {};
          session.tempData.loginPhase = 'username';
          emitPrompt(socket, '\r\n\r\nUsername: ');
          socket.emit('prompt-login');
          return;
        }

        // Wrong password — express.e:29343-29346
        const spAttempts = ((session.tempData.systemPasswordAttempts as number) || 0) + 1;
        session.tempData.systemPasswordAttempts = spAttempts;
        emitText(socket, 'Invalid PassWord\r\n');
console.log(`[SYSTEM_PASSWORD] Failed attempt ${spAttempts}/3`);

        if (spAttempts >= 3) {
          // express.e:29349-29353 — SYSPWDFAIL syscmd + disconnect
console.log('[SYSTEM_PASSWORD] 3 failures — disconnecting (express.e:29349-29353)');
          try {
            const { runSysCommand: spRunSys } = require('./command-execution.handler');
            await spRunSys(socket, session, 'SYSPWDFAIL', '');
          } catch { /* syscmd optional */ }
          socket.disconnect();
          return;
        }

        // Prompt again (express.e:29336 displayScreen(SCREEN_PRIVATE) each attempt)
        const { displayScreen: dsPrivate } = require('./screen.handler');
        await dsPrivate(socket, session, 'PRIVATE');
        emitText(socket, '>: ');
        socket.emit('mask-input', true);
        return;
      } else if (spData === '\x7f' || spData === '\b') {
        if (session.tempData.inputBuffer && (session.tempData.inputBuffer as string).length > 0) {
          session.tempData.inputBuffer = (session.tempData.inputBuffer as string).slice(0, -1);
          emitText(socket, '\b \b');
        }
        return;
      } else if (spData.length === 1 && spData >= ' ') {
        session.tempData.inputBuffer = ((session.tempData.inputBuffer as string) || '') + spData;
        // No echo — password masking is active
        return;
      }
      return;
    }

    if (session.subState === LoggedOnSubState.DISPLAY_BBSTITLE) {
      // User pressed key after BBSTITLE, now ready for login
console.log(' BBSTITLE viewed, transitioning to login');
      session.state = BBSState.LOGON;
      session.subState = undefined;
      session.tempData = session.tempData || {};
      session.tempData.loginPhase = 'username';
      /*
       * CLEAR FIRST. BBSTITLE is the tallest thing this board draws: 69 lines
       * of art, eleven of them wider than any terminal - one is 1,427
       * characters - so an 80-column caller gets each of those folded into a
       * dozen rows or more and the screen scrolls several times over. Printing
       * the welcome underneath continues that scroll, and the tail of the
       * title stays above the login for the rest of the session: "the bbstitle
       * is very tall and the upper part is not cleared on my mobile so its
       * always visible above the bbs content" (sysop, 2026-09-14, on a phone,
       * where 25 rows make it unmissable).
       *
       * `2J` erases what is on screen, `3J` drops what scrolled off - a swipe
       * on a touch screen brings that straight back otherwise - and `H` puts
       * the welcome at the top.
       */
      emitText(socket, '\x1b[2J\x1b[3J\x1b[H');
      emitText(socket, '\r\n\r\n\x1b[36m-= Welcome to AmiExpress-Web =-\x1b[0m\r\n\r\n');
      emitText(socket, '\x1b[32mPlease login to continue.\x1b[0m\r\n\r\n');
      emitPrompt(socket, 'Username: ');
      socket.emit('prompt-login'); // Tell frontend to show login form
      return;
    }

    return;
  }

  // Allow LOGGEDON, LOGON, and REGISTERING states to continue
  // LOGON is allowed temporarily due to session state race conditions
  if (!allowScreenCommand &&
    session.state !== BBSState.LOGGEDON &&
    session.state !== BBSState.LOGON &&
    session.state !== BBSState.REGISTERING) {
console.log(' Not in LOGGEDON/LOGON or REGISTERING state, ignoring command');
console.log('   Current state:', session.state);
    return;
  }

  // Login-prompt adapters (services/login-prompt.service.ts) install a
  // `loginInputHandler` to own input fully during a multi-step pre-login
  // flow (forced password change, email reset, GDPR backfill). Must run
  // BEFORE the LOGON state machine so the adapter doesn't recurse into
  // the username/password loop. Web's frontend handles these flows via
  // socket events, so loginInputHandler stays unset there.
  if (session.loginInputHandler) {
    session.loginInputHandler(data);
    return;
  }

/**
 * The password phase is over: stop masking, and tell the caller's terminal.
 *
 * One place, because the phase has five exits - a blank username, a bad
 * password, a completed reset, a successful login, and a thrown error - and a
 * mask left on after any of them types the caller's next line as asterisks.
 */
function endPasswordMask(socket: any, session: BBSSession): void {
  session.maskInput = false;
  socket.emit('mask-input', false);
}

  // LOGIN FLOW (telnet/SSH): line-buffered username/password when in LOGON state
  // Frontend socket clients use prompt-login events; telnet/SSH need server-side buffering.
  if (session.state === BBSState.LOGON) {
    /**
     * TP-9a: EVERY TRANSPORT COMES THROUGH HERE.
     *
     * This branch used to return immediately for `connectionType === 'web'`,
     * because the browser ran a login line editor of its own
     * (`packages/terminal/src/utils/login-key-machine.ts`) and drove the
     * server through `check-username` / `new-user-response` socket events. Two
     * implementations of one state machine is the shape this whole plan
     * exists to remove, and the server's is the one that keeps: its success
     * path already calls the same `runPostAuthLogin` the web handler calls,
     * and its failure path the same `promptPasswordReset` and
     * `runPwfailAndLogoff`. Nothing had to be ported into it.
     *
     * The browser's half is retired in TP-9b, and the pair ships together: a
     * web caller sees DOUBLED echo while both are live.
     */
    // Ensure tempData exists
    session.tempData = session.tempData || {};
    const phase = session.tempData.loginPhase || 'username';

    // Telnet often appends NUL to CR; normalize before key handling
    const cleanData = typeof data === 'string' ? data.replace(/\0/g, '') : data;

    // Helper to append to buffer
    const appendChar = (ch: string) => {
      session.tempData.inputBuffer = (session.tempData.inputBuffer || '') + ch;
    };

    // Backspace handling
    if (cleanData === '\x7f' || cleanData === '\b') {
      if (session.tempData?.inputBuffer?.length) {
        session.tempData.inputBuffer = session.tempData.inputBuffer.slice(0, -1);
        emitText(socket, '\b \b');
      }
      return;
    }

    // Enter key ends the current phase input
    // Handle CR, LF, or CR+LF - normalize all line endings to a single action
    // Telnet can send: CR alone, LF alone, CR+LF together, or CR+NUL
    // Input may also include text before the line ending (e.g., "password\r\n")

    // Skip if this is just LF following a previous CR (CR+LF split across calls)
    if (cleanData === '\n' && session.tempData.lastCharWasCR) {
      session.tempData.lastCharWasCR = false;
      return;
    }

    // Extract any printable characters before line endings and add to buffer
    const lineEndIndex = cleanData.search(/[\r\n]/);
    if (lineEndIndex > 0) {
      // There's text before the line ending - add it to buffer
      const textPart = cleanData.substring(0, lineEndIndex);
      for (const char of textPart) {
        if (char >= ' ' && char <= '~') {
          appendChar(char);
          // ONE mask switch (TP-9a). `session.maskInput` is the field the
          // whole board already echoes by - command.handler's three other echo
          // sites, gdpr.handler and new-user.handler all read it - so the
          // system-password gate and the forced-password-change adapter mask
          // through the same switch as the password phase rather than each
          // testing a phase name of its own.
          emitText(socket, session.maskInput ? '*' : char);
        }
      }
    }

    const hasCR = cleanData.includes('\r');
    const hasLF = cleanData.includes('\n');
    const isLineEnding = hasCR || hasLF;

    // Track if this ends with CR (for split CR+LF detection)
    session.tempData.lastCharWasCR = cleanData.endsWith('\r');

    if (isLineEnding) {
      const input = session.tempData.inputBuffer || '';
      session.tempData.inputBuffer = '';

      if (phase === 'username') {
        const typed = input.trim();
        session.tempData.loginUsername = typed;

        /**
         * A NAME THIS BOARD DOES NOT KNOW (TP-9a, express.e:29622-29651).
         *
         * `startNewUserRegistration` had exactly ONE caller in the whole
         * backend - the web-only `new-user-response` socket handler - so a
         * telnet or SSH caller who typed an unknown name was told `Invalid
         * PassWord` after the password prompt and could never create an
         * account. The whole NEW_USER_* substate machine he needed already
         * existed and is dispatched from this same handler; only the door
         * into it was web-only.
         *
         * The prompt text and the R/C semantics are the web path's, so both
         * transports ask the same question in the same words.
         */
        /**
         * express.e:29598 - USERNUMBER_LOGIN.
         *
         *     userNum := Val(userName)
         *     IF checkToolTypeExists(TOOLTYPE_NODE, node, 'USERNUMBER_LOGIN')
         *        AND (userNum > 0)
         *       loadAccount(userNum, ...)
         *
         * A board with the tooltype set lets a caller type his slot number
         * instead of his name, which is how regulars log on quickly. The
         * tooltype had no reader here, so a number was looked up as a NAME,
         * found nothing, and the caller was offered a new account.
         */
        if (typed.length > 0 && /^\d+$/.test(typed)) {
          const { nodeFlag } = require('../utils/node-tooltypes.util');
          if (nodeFlag(session.nodeId || 1, 'USERNUMBER_LOGIN')) {
            const bySlot = await getDatabase().getUserBySlotNumber(Number.parseInt(typed, 10));
            if (bySlot) {
              // The rest of the login speaks in names.
              session.tempData.loginUsername = bySlot.username;
              session.tempData.loginPhase = 'password';
              // The same three steps the name path takes below: the mask
              // switch, the browser's echo suppression, and the prompt.
              // Setting only the first would echo the password.
              session.maskInput = true;
              socket.emit('mask-input', true);
              emitPrompt(socket, '\r\nPassword: ');
              return;
            }
          }
        }

        if (typed.length > 0) {
          const existing = await getDatabase().getUserByUsername(typed);
          if (!existing) {
            session.tempData.loginPhase = 'new-user-confirm';
            emitPrompt(
              socket,
              typed.toUpperCase() === 'NEW'
                ? '\r\n[C]ontinue as a new user? '
                : `\r\nThe name ${typed} is not used on this BBS.\r\n[R]etry your name or [C]ontinue as a new user? `,
            );
            return;
          }
        }

        session.tempData.loginPhase = 'password';
        // The board's one mask switch, set here rather than inferred from the
        // phase name: the echo sites, the browser's local echo suppression
        // and the transport adapter all read this single field.
        session.maskInput = true;
        socket.emit('mask-input', true);
        emitPrompt(socket, '\r\nPassword: ');
        return;
      }

      /**
       * The answer to that question. `C` or Enter creates the account through
       * the SAME `startNewUserRegistration` the web path calls; anything else
       * is a retry, and five of those is express.e's disconnect
       * (`:29633-29637`).
       */
      if (phase === 'new-user-confirm') {
        const answer = input.trim().toUpperCase();
        const wanted = (session.tempData.loginUsername || '').trim();
        if (answer === 'C' || answer === '') {
          session.tempData.loginPhase = 'username';
          const { startNewUserRegistration } = require('./user/new-user.handler');
          await startNewUserRegistration(socket, session, wanted);
          return;
        }
        // express.e:29610-29637 keeps TWO counters, and this is the first of
        // them: `retryCount`, in-session, capped at 5, bumped by a username
        // that is not found and by declining the new-user prompt. The second
        // is `userMisc.invalidAttempts`, which is persisted on the account and
        // governs lockout. Sharing one counter between them meant a few
        // mistyped usernames spent the caller's password attempts.
        session.usernameRetryCount = (session.usernameRetryCount || 0) + 1;
        if (session.usernameRetryCount >= 5) {
          const { beginLogoff } = require('../server/logoff');
          beginLogoff(socket, session, { message: '\r\nToo Many Errors, Goodbye!\r\n' });
          return;
        }
        session.tempData.loginPhase = 'username';
        session.tempData.loginUsername = '';
        emitPrompt(socket, '\r\nUsername: ');
        return;
      }

      if (phase === 'password') {
        const username = (session.tempData.loginUsername || '').trim();
        // For C64/PETSCII terminals in unshifted mode, input is UPPERCASE only
        // Convert to lowercase since most passwords are stored in lowercase
        // Also try original case as fallback for mixed-case passwords
        const password = input;
        const passwordLower = input.toLowerCase();

        if (!username) {
          endPasswordMask(socket, session);
          emitPrompt(socket, '\r\nUsername: ');
          session.tempData.loginPhase = 'username';
          return;
        }

        // Authenticate using use case service (Clean Architecture)
        try {
          const { container } = await import('../container');
          const { AuthenticationUseCase } = await import('../services/use-cases/authentication.use-case');
          const authUseCase = container.resolve(AuthenticationUseCase);

          const result = await authUseCase.authenticate(username, password);

          if (!result.success) {
            // express.e:29207-29208 — log each invalid attempt (masked).
            // Web mirrors this at auth-socket-handlers.ts; aligning the
            // two transports per the unification plan.
            const { callersLogManager: clm } = require('../services/CallersLogManager');
            // express.e:30030 - SHOWPWFAIL on the node's icon logs what was
            // actually typed; without it the attempt is masked. A sysop turns
            // it on to see whether a caller is fumbling his own password or
            // somebody is guessing.
            const { nodeFlag } = require('../utils/node-tooltypes.util');
            const failureText = nodeFlag(session.nodeId || 1, 'SHOWPWFAIL')
              ? `\tPassword Failure (${password})`
              : '\tPassword Failure (xxxx)';
            clm.logActivity(session.nodeId || 1, failureText);
            session.loginRetryCount = (session.loginRetryCount || 0) + 1;

            const { getMaxPasswordFails } = require('../services/password-policy.util');
            const maxFails = getMaxPasswordFails();

            // express.e:1008-1016 counts the failure on the ACCOUNT and locks
            // it there. Until now this port counted only in the session, so
            // `accountLocked` - which login already honours at
            // login-post.service.ts (express.e:29775) - could never be set by
            // anything except a sysop editing the account by hand: a real gate
            // that nothing could trip, and a lockout a caller escaped by
            // hanging up.
            try {
              const failedUser = await getDatabase().getUserByUsername(username);
              if (failedUser?.slotNumber && failedUser.slotNumber > 0) {
                const { userDatabaseManager } = require('../services/UserDatabaseManager');
                userDatabaseManager.recordPasswordFailure(failedUser.slotNumber, maxFails);
              }
            } catch (err) {
              // A failure to record must never block the login flow itself.
              console.warn('[AUTH] Could not record password failure:', err);
            }
            if (maxFails >= 0 && session.loginRetryCount >= maxFails) {
              // express.e:29152-29213 — try the email-based password reset
              // flow first (parity with web). If MAIL_ON_PWD_FAIL is
              // enabled, SMTP is configured, AND the user has an email
              // on file, offer them the reset Y/n; on success they can
              // log in with the new password. On user-declined or any
              // hard failure the adapter calls beginLogoff itself and
              // we just return.
              const existingUser = await getDatabase().getUserByUsername(username);
              const { isPasswordResetAvailable, promptPasswordReset } =
                await import('../services/login-prompt.service');
              if (await isPasswordResetAvailable(existingUser?.email)) {
                session.passwordResetUsername = username;
                const resetResult = await promptPasswordReset(socket, session);
                if (resetResult.ok) {
                  // Re-prompt for username/password from the top.
                  endPasswordMask(socket, session);
                  emitPrompt(socket, '\r\n\r\nUsername: ');
                  session.tempData.loginPhase = 'username';
                  session.tempData.loginUsername = '';
                }
                return;
              }

              // No reset available — express.e:29193-29195 + 29263-29264:
              // PWFAIL syscmd then logoffErr writes '\t* Password
              // Failure *' and disconnects. Same path web takes at
              // auth-socket-handlers.ts:458-462.
              emitText(socket, '\r\n\x1b[33mExcessive Password Failure\x1b[0m\r\n\r\n');
              const { runPwfailAndLogoff } = await import('../services/login-post.service');
              await runPwfailAndLogoff(
                socket,
                session,
                '\r\nToo Many Errors, Goodbye!\r\n',
              );
              return;
            }

            endPasswordMask(socket, session);
            emitPrompt(socket, '\r\nInvalid PassWord\r\nUsername: ');
            session.tempData.loginPhase = 'username';
            session.tempData.loginUsername = '';
            return;
          }

          const user = result.user;
          const db = getDatabase(); // For remaining database calls

          // Successful login: hand off to the shared post-auth pipeline.
          // Same code web hits at auth-socket-handlers.ts ~588 — keeps
          // MULTICOM / webhook / forced-pwd-change / GDPR / LOGON screen
          // / bulletin flow consistent across all three transports.
          session.loginRetryCount = 0;
          // express.e:1018 — the ELSE of the failure comparison: a correct
          // password zeroes the persisted counter. Without this a caller who
          // mistyped twice, then got it right, carried those failures until
          // the next sysop edit touched his record.
          try {
            const okUser = await getDatabase().getUserByUsername(username);
            if (okUser?.slotNumber && okUser.slotNumber > 0) {
              const { userDatabaseManager } = require('../services/UserDatabaseManager');
              userDatabaseManager.clearPasswordFailures(okUser.slotNumber);
            }
          } catch (err) {
            // A failure to clear must never block the login flow itself.
            console.warn('[AUTH] Could not clear password failures:', err);
          }
          const lastLoginBeforeUpdate = user.lastLogin ? new Date(user.lastLogin) : new Date(0);
          endPasswordMask(socket, session);
          const { runPostAuthLogin } = await import('../services/login-post.service');
          const postAuthResult = await runPostAuthLogin(socket, session, user, {
            io,
            lastLoginBeforeUpdate,
          });
          if (!postAuthResult.ok) {
            // Shared pipeline already issued the disconnect / forced-
            // pwd-change prompt / chat-only door launch / quick-logon
            // menu jump. Nothing more to do here.
            return;
          }
        } catch (err: any) {
console.error('[LOGIN] Error during login:', err?.message || err);
          endPasswordMask(socket, session);
          emitPrompt(socket, '\r\n\x1b[31mLogin failed, please try again.\x1b[0m\r\nUsername: ');
          session.tempData.loginPhase = 'username';
          session.tempData.loginUsername = '';
        }
        return;
      }

      return;
    }

    // Collect printable characters for current phase
    // Handle both single chars and multi-char input (telnet may buffer)
    for (const char of cleanData) {
      if (char >= ' ' && char <= '~') {
        // Reset CR tracking for non-line-ending characters
        session.tempData.lastCharWasCR = false;

        appendChar(char);
        // Echo by the board's one mask switch; see the note at the other echo
        // site above.
        emitText(socket, session.maskInput ? '*' : char);
      }
    }

    return;
  }

  // PRIORITY 1: Handle internode chat mode input - REAL-TIME keystroke transmission
  // When user is in active chat session, transmit each keystroke immediately
  if (session.subState === LoggedOnSubState.CHAT) {
console.log(' [COMMAND] User in CHAT mode, real-time input');

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    const { handleChatKeystroke } = require('./chat/internode-chat.handler');
    const {
      shouldOpenPicker,
      createPickerState,
      renderPicker,
      handlePickerInput,
      savePickerArea,
      restorePickerArea
    } = require('../utils/smiley-picker.util');

    // Handle smiley picker mode
    if (session.smileyPickerState?.isOpen) {
      const result = handlePickerInput(session.smileyPickerState, data);
      session.smileyPickerState = result.newState;

      if (result.action === 'select' && result.smiley) {
        // Insert smiley into input buffer
        session.inputBuffer += result.smiley;
        // Restore screen and echo smiley
        emitText(socket, restorePickerArea() + result.smiley);
        // Transmit smiley to partner
        for (const char of result.smiley) {
          await handleChatKeystroke(socket, session, { keystroke: char });
        }
      } else if (result.action === 'cancel') {
        // Just restore screen
        emitText(socket, restorePickerArea());
      } else {
        // Update picker display
        emitText(socket, renderPicker(session.smileyPickerState));
      }
      return;
    }

    // Ctrl+E opens smiley picker
    if (shouldOpenPicker(data)) {
      const pickerState = createPickerState();
      pickerState.isOpen = true;
      session.smileyPickerState = pickerState;
      emitText(socket, savePickerArea() + renderPicker(pickerState));
      return;
    }

    // Handle arrow keys for cursor movement (left/right navigation)
    if (data === '\x1b[D') {
      // Left arrow - just move cursor left locally (don't transmit)
      emitText(socket, '\x1b[D');
      return;
    }
    else if (data === '\x1b[C') {
      // Right arrow - just move cursor right locally (don't transmit)
      emitText(socket, '\x1b[C');
      return;
    }
    // Ignore up/down arrows
    else if (data === '\x1b[A' || data === '\x1b[B') {
      return;
    }

    // Handle Enter key - finalize message
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();

      // Echo newline to move cursor to next line (express.e:2342)
      emitText(socket, '\r\n');

      // Check for /END or /EXIT command
      if (input.toUpperCase() === '/END' || input.toUpperCase() === '/EXIT') {
console.log(' [COMMAND] User wants to end chat');
        const { handleChatEnd } = require('./chat/internode-chat.handler');
        await handleChatEnd(socket, session);
        return;
      }

      // Check for /HELP command
      if (input.toUpperCase() === '/HELP') {
console.log(' [COMMAND] User requested help');
        emitText(socket,
          '\r\n' +
          '\x1b[36mChat Mode Commands:\x1b[0m\r\n' +
          '  \x1b[33m/END\x1b[0m or \x1b[33m/EXIT\x1b[0m  - End chat session\r\n' +
          '  \x1b[33m/HELP\x1b[0m             - Show this help\r\n' +
          '  \x1b[33mCtrl+E\x1b[0m            - Open smiley picker\r\n' +
          '  \x1b[33m<text>\x1b[0m            - Send message (max 500 chars)\r\n' +
          '\r\n'
        );
        session.inputBuffer = '';
        return;
      }

      // Regular message - finalize and send to scroll area
      if (input.length > 0) {
console.log(' [COMMAND] Finalizing message:', input);
        const { handleChatMessage } = require('./chat/internode-chat.handler');
        await handleChatMessage(socket, session, { message: input });
        session.inputBuffer = ''; // Clear buffer after sending
      }
    }
    // Handle Backspace - real-time transmission
    else if (data === '\x7f' || data === '\b') {
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Echo backspace to local terminal (express.e:2307-2319)
        emitText(socket, '\b \b');
        // Don't transmit backspace if we're typing a command
        const isCommand = session.inputBuffer.trim().startsWith('/');
        if (!isCommand) {
          await handleChatKeystroke(socket, session, { keystroke: '\x7f' });
        }
      }
    }
    // Handle printable characters - real-time transmission
    else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character to local terminal (express.e:2342)
      emitText(socket, data);
      // Don't transmit commands (starting with /) to partner
      const isCommand = session.inputBuffer.trim().startsWith('/');
      if (!isCommand) {
        await handleChatKeystroke(socket, session, { keystroke: data });
      }
    }
    return;
  }

  // PRIORITY 1.5: Handle operator chat input
  // When user is waiting for sysop or in active chat, intercept all input
  if (session.subState === LoggedOnSubState.OPERATOR_CHAT_WAITING) {
console.log(' [COMMAND] User in OPERATOR_CHAT_WAITING state');
    const input = data.trim().toUpperCase();

    // Allow user to cancel with CTRL+C (code 3), Q, /QUIT, or /CANCEL
    // express.e checks for stat=3 (CTRL+C) and shows "Aborted!"
    if (data === '\x03' || input === 'Q' || input === '/QUIT' || input === '/CANCEL') {
      // Resolve the repository through the database (the same path every other
      // OperatorChat caller uses — index.ts, config-routes, and the
      // OPERATOR_CHAT_ACTIVE branch below). The previous tsyringe-based
      // `container.resolve(OperatorChatRepository)` threw "TypeInfo not known"
      // because the class isn't decorated with @injectable() — every cancel
      // attempt crashed the command handler, the [ERROR] message got printed
      // and the user was eventually disconnected.
      const { handleUserCancelPage } = require('./operator-chat.handler');
      const { getDatabase } = require('./command-handler/dependency-injection');
      const db = getDatabase();
      const repository = db?.getOperatorChatRepository();
      if (repository) {
        await handleUserCancelPage(socket.server, repository, session, socket);
      } else {
        // Database unavailable — fall back to clearing the session state so
        // the user isn't stuck in OPERATOR_CHAT_WAITING forever.
        emitText(socket, '\r\n\x1b[33mAborted!\x1b[0m\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
      }
    } else if (input) {
      // Any other input while waiting - remind user they're waiting
      emitText(socket, '\r\n\x1b[33mWaiting for sysop... Press CTRL+C or Q to cancel.\x1b[0m\r\n');
    }
    return;
  }

  if (session.subState === LoggedOnSubState.OPERATOR_CHAT_ACTIVE) {
console.log(' [COMMAND] User in OPERATOR_CHAT_ACTIVE state, real-time input');

    // A PASTE IS ONE EVENT CARRYING MANY KEYS. Everything below is written
    // against a keyboard - chatAcceptsKeystroke refuses anything but a single
    // character - so a pasted line failed every branch and was dropped without
    // a word (reported live 2026-09-13: "pasting to the bbs is very slow as
    // well"; it was not slow, it was doing nothing, and the caller retyped).
    //
    // BY RUN, NOT BY KEY. Feeding each character back through this handler
    // fixed the drop and bought a stall: every character paid for the whole
    // preamble, an awaited room emit and its own socket frame, so the first
    // character appeared at once and the rest arrived as a long pause ("the
    // first character gets visible directly and then there is a long pause
    // when i paste"). The line model is still built one character at a time -
    // it has to be, it wraps at column 78 - but the wire sees one frame per
    // run, and only a line break costs a pass through this handler.
    const pastedKeys = inputKeys(data);
    if (pastedKeys.length > 1) {
      const { callerTypedRun, chatAcceptsKeystroke: accepts } = require('./operator-chat.handler');
      const { handleOperatorChatKeystroke: keystroke } = require('./operator-chat.handler');
      let run = '';
      const flushRun = async () => {
        if (!run) return;
        session.inputBuffer += run;
        (session as any).chatCursor = session.inputBuffer.length;
        callerTypedRun(socket.server, session, run);
        if (!session.inputBuffer.trim().startsWith('/')) {
          await keystroke(socket.server, session, run);
        }
        run = '';
      };
      for (const key of pastedKeys) {
        if (key === '\r' || key === '\n') {
          await flushRun();
          await handleCommand(socket, session, '\r', io);
        } else if (accepts(key)) {
          run += key;
        }
      }
      await flushRun();
      return;
    }

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    const { handleOperatorChatKeystroke, handleUserChatMessage, handleUserQuitChat } = require('./operator-chat.handler');
    const { getDatabase } = require('./command-handler/dependency-injection');
    const db = getDatabase();
    const repository = db?.getOperatorChatRepository();
    const { callerTypedChar, callerBackspaced, callerPressedReturn, callerLineEntered, scheduleSendHint, cancelSendHint, chatAcceptsKeystroke } = require('./operator-chat.handler');

    // express.e chat() 6101-6223: the caller's keys go onto the ONE shared
    // line and back to their own terminal as pressed (6172), in the caller's
    // colour when the sender changes (6168-6171); backspace rubs one out
    // (6143-6152); return is a newline (6130-6141); CTRL-C (ACS_BREAK_CHAT,
    // 6118) leaves the chat. No input line, no picker, no scroll region.
    if (data === '\x03') {
      await handleUserQuitChat(socket.server, repository, session, socket);
      return;
    }

    // THE LINE THE CALLER IS STILL TYPING can be moved about in. express has
    // no line editor - the arrows were dropped here - but a caller who typoes
    // the first word of a long question should not have to rub out the line
    // ("arrow keys and backspace needs to work in chats too", 2026-09-13).
    // chatLineEditKey owns the cursor and says every edit in the model's own
    // two primitives, so the shared line's wrap accounting cannot drift.
    {
      const { callerEditedLine } = require('./operator-chat.handler');
      const before = session.inputBuffer || '';
      const cursor = typeof (session as any).chatCursor === 'number'
        ? (session as any).chatCursor
        : before.length;
      const edit = callerEditedLine(socket.server, session, before, cursor, data);
      if (edit) {
        session.inputBuffer = edit.buffer;
        (session as any).chatCursor = edit.cursor;
        // The sysop's panel follows the MESSAGE, not the cursor: it is told a
        // character went in or came out, never which way an arrow moved.
        if (edit.buffer !== before && !edit.buffer.trim().startsWith('/')) {
          const grew = edit.buffer.length > before.length;
          await handleOperatorChatKeystroke(socket.server, session, grew ? data : '\x7f');
        }
        return;
      }
    }

    // Return ends the line. Some terminals send CR LF together.
    if (data === '\r' || data === '\n' || data === '\r\n') {
      const input = (session.inputBuffer || '').trim();

      // Clear keystroke buffer on sysop panel
      await handleOperatorChatKeystroke(socket.server, session, '\r');

      session.inputBuffer = '';
      (session as any).chatCursor = 0;

      callerPressedReturn(socket.server, session);

      if (input.toUpperCase() === '/QUIT' || input.toUpperCase() === '/END') {
        await handleUserQuitChat(socket.server, repository, session, socket);
        return;
      }

      if (input.toUpperCase() === '/HELP') {
        emitText(socket, '\x1b[36mType, press return twice to send. /quit or CTRL-C ends the chat.\x1b[0m\r\n');
        return;
      }

      // Return twice sends: a line with text is kept, an empty line hands
      // over what was kept as one message (see callerLineEntered).
      const { send } = callerLineEntered(session, input);
      if (send) {
        cancelSendHint(session);
        await handleUserChatMessage(socket.server, repository, session, send);
      } else if (input) {
        // Kept, not sent: if the caller now goes quiet, they are waiting for
        // an answer and do not know the convention. Tell them, once.
        scheduleSendHint(socket.server, session);
      }
    }
    // Backspace and printable characters are the line editor's above: it owns
    // the cursor, and two ways of editing one line is how a model and a screen
    // drift apart. Latin-1 included - the predicate it uses is the same
    // chatAcceptsKeystroke that kept Swedish åäö alive here.
    return;
  }

  // PRIORITY 2: Handle group chat room mode input
  // When user is in a chat room, intercept all input
  if (session.subState === LoggedOnSubState.CHAT_ROOM) {
console.log(' User in CHAT_ROOM mode, handling room input');
    const input = data.trim();

    // Check for /LEAVE or /EXIT command
    if (input.toUpperCase() === '/LEAVE' || input.toUpperCase() === '/EXIT') {
      const { handleRoomLeave } = require('./chat/group-chat.handler');
      await handleRoomLeave(socket, session);
      return;
    }

    // Check for /WHO command
    if (input.toUpperCase() === '/WHO') {
      const { container } = await import('../container');
      const { ChatRoomUseCase } = await import('../services/use-cases/chat-room.use-case');
      const chatRoomUseCase = container.resolve(ChatRoomUseCase);

      const members = await chatRoomUseCase.getRoomMembers(session.currentRoomId || 'default');
      const output = chatRoomUseCase.formatMembersList(members);
      emitText(socket, output);
      return;
    }

    // Check for /HELP command
    if (input.toUpperCase() === '/HELP') {
      emitText(socket,
        '\r\n' +
        '\x1b[36mChat Room Commands:\x1b[0m\r\n' +
        '  \x1b[33m/LEAVE\x1b[0m or \x1b[33m/EXIT\x1b[0m  - Leave the room\r\n' +
        '  \x1b[33m/WHO\x1b[0m               - List users in room\r\n' +
        '  \x1b[33m/HELP\x1b[0m              - Show this help\r\n' +
        '  \x1b[33m<text>\x1b[0m             - Send message (max 500 chars)\r\n' +
        '\r\n'
      );
      return;
    }

    // Regular message - send to room
    if (input.length > 0) {
      const { handleRoomMessage } = require('./chat/group-chat.handler');
      await handleRoomMessage(socket, session, { message: input });
    }
    return;
  }

  // PRIORITY 3: Handle LIVECHAT user selection
  // When user is selecting from numbered list
  if (session.subState === LoggedOnSubState.LIVECHAT_SELECT_USER) {
console.log(' [LIVECHAT] User selecting from numbered list');
    const { handleLiveChatSelection } = require('./chat/chat-commands.handler');
    await handleLiveChatSelection(socket, session, data);
    return;
  }

  // PRIORITY 4: Handle LIVECHAT invitation Y/n response
  // When user is responding to a chat invitation
  if (session.subState === LoggedOnSubState.LIVECHAT_INVITATION_RESPONSE) {
console.log(' [LIVECHAT] User responding to invitation with Y/n');
    const { handleLiveChatInvitationResponse } = require('./chat/chat-commands.handler');
    await handleLiveChatInvitationResponse(socket, session, data);
    return;
  }

  // PRIORITY 5: Handle OLM node input
  // When user is entering node number for OLM (line-buffered)
  if (session.subState === LoggedOnSubState.OLM_NODE_INPUT) {
console.log(' [OLM] User entering node number');

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer || '';
      session.inputBuffer = '';

      const { handleOlmNodeInput } = require('./transfer/olm.handler');
      await handleOlmNodeInput(socket, session, input);
    } else if (data === '\x7f' || data === '\b') { // Backspace (express.e:2304-2320)
      // express.e:2306 - IF curpos>0 THEN (only backspace if buffer has content)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // express.e:2307-2319 - Send backspace sequence: BS + space + BS
        // This moves cursor back, overwrites char with space, moves cursor back again
        emitText(socket, '\b \b');
      }
      // If buffer is empty, ignore backspace (prevents erasing prompt)
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342) - backend handles ALL echo
      emitText(socket, session.maskInput ? '*' : data);
    }
    return;
  }

  // PRIORITY 6: Handle OLM message composition
  // When user is composing OLM message (line-buffered like READ_COMMAND)
  if (session.subState === LoggedOnSubState.OLM_COMPOSE) {
console.log(' [OLM] User composing message');

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer || '';
      session.inputBuffer = '';

      const { handleOlmComposeInput } = require('./transfer/olm.handler');
      await handleOlmComposeInput(socket, session, input);
    } else if (data === '\x7f' || data === '\b') { // Backspace (express.e:2304-2320)
      // express.e:2306 - IF curpos>0 THEN (only backspace if buffer has content)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // express.e:2307-2319 - Send backspace sequence: BS + space + BS
        // This moves cursor back, overwrites char with space, moves cursor back again
        emitText(socket, '\b \b');
      }
      // If buffer is empty, ignore backspace (prevents erasing prompt)
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342) - backend handles ALL echo
      emitText(socket, session.maskInput ? '*' : data);
    }
    return;
  }

  // PRIORITY 7-16: Handle New User Registration states (express.e:30115-30310)
  if (session.state === BBSState.REGISTERING) {
console.log(' [REGISTRATION] Handling input for subState:', session.subState);
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }
    // Ensure shortcut mode is disabled during registration
    session.cmdShortcuts = false;
    if (session.shortcuts && typeof session.shortcuts.clear === 'function') {
      session.shortcuts.clear();
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer || '';
      session.inputBuffer = '';

      const newUserHandler = require('./user/new-user.handler');

      switch (session.subState) {
        case LoggedOnSubState.NEW_USER_GDPR_CONSENT:
          await newUserHandler.handleGdprConsentInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_NAME:
          await newUserHandler.handleNameInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_ACCESS_PASSWORD:
          await newUserHandler.handleAccessPasswordInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_AUTOVAL:
          await newUserHandler.handleAutoValidationInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_LOCATION:
          await newUserHandler.handleLocationInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_PHONE:
          await newUserHandler.handlePhoneInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_EMAIL:
          await newUserHandler.handleEmailInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_PASSWORD:
          await newUserHandler.handlePasswordInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_PASSWORD_CONFIRM:
          await newUserHandler.handlePasswordConfirm(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_LINES:
          await newUserHandler.handleLinesInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_COMPUTER:
          await newUserHandler.handleComputerInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_SCREEN_CLEAR:
          await newUserHandler.handleScreenClearInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_CONFIRM:
          await newUserHandler.handleConfirmInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_REALNAME:
          await newUserHandler.handleRealnameInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_SEXAGE:
          await newUserHandler.handleSexAgeInput(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_SCRIPT:
          await newUserHandler.handleQuestionnaireAnswer(socket, session, input);
          break;
        case LoggedOnSubState.NEW_USER_SCRIPT_CONFIRM:
          await newUserHandler.handleQuestionnaireConfirmInput(socket, session, input);
          break;
      }
    } else if (data === '\x7f' || data === '\b') { // Backspace (express.e:2304-2320)
      // express.e:2306 - IF curpos>0 THEN (only backspace if buffer has content)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // express.e:2307-2319 - Send backspace sequence: BS + space + BS
        // This moves cursor back, overwrites char with space, moves cursor back again
        emitText(socket, '\b \b');
      }
      // If buffer is empty, ignore backspace (prevents erasing prompt)
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342) - backend handles ALL echo
      emitText(socket, session.maskInput ? '*' : data);
    }
    return;
  }

  // PRIORITY 8: Handle DOWNLOAD_FILENAME_INPUT (line-buffered input like lineInput in express.e:20124)
  // express.e:20124 - status:=lineInput('','',200,INPUT_TIMEOUT,tempStr2)
  if (session.subState === LoggedOnSubState.DOWNLOAD_FILENAME_INPUT) {
console.log(' [DOWNLOAD] User entering filename (line-buffered)');

    // This block is where collectLine came from; it calls the shared copy
    // now so the two prompts cannot drift apart.
    const { collectLine } = require('../utils/line-input.util');
    await collectLine(socket, session, data, async (input: string) => {
      const { DownloadHandler } = require('./file/download.handler');
      await DownloadHandler.handleFilenameInput(socket, session, input);
    });
    await repaintMenuIfPending(socket, session);
    return;
  }

  // PRIORITY 9: Handle DOWNLOAD_CONFIRM_INPUT (Y/N confirmation - single char hotkey OK)
  if (session.subState === LoggedOnSubState.DOWNLOAD_CONFIRM_INPUT) {
console.log(' [DOWNLOAD] User confirming download');
    // Y/N confirmation can be hotkey mode
    const { DownloadHandler } = require('./file/download.handler');
    await DownloadHandler.handleConfirmInput(socket, session, data);
    // Confirming is what starts the transfer, so this is where a finished
    // batch download lands.
    await repaintMenuIfPending(socket, session);
    return;
  }

  // PRIORITY 9b: Handle DOWNLOAD_PGOODBYE (express.e:13750 pGoodbye countdown)
  if (session.subState === LoggedOnSubState.DOWNLOAD_PGOODBYE) {
    const { DownloadHandler } = require('./file/download.handler');
    await DownloadHandler.handlePGoodbyeInput(socket, session, data);
    // Answering "no" to the goodbye countdown returns to the menu.
    await repaintMenuIfPending(socket, session);
    return;
  }

  // PRIORITY 9c: Handle UPLOAD_RESUME_PROMPT / UPLOAD_RESUME_DELETE
  // (express.e:18119 resumeStuff per-partial prompt loop). The service
  // installs session.uploadResumeInputHandler when the loop is active.
  if (
    (session.subState === LoggedOnSubState.UPLOAD_RESUME_PROMPT ||
     session.subState === LoggedOnSubState.UPLOAD_RESUME_DELETE) &&
    (session as any).uploadResumeInputHandler
  ) {
    (session as any).uploadResumeInputHandler(data);
    return;
  }

  // PRIORITY 9d: Handle UPLOAD_RENAME_PROMPT (express.e:19192-19256
  // long-filename rename loop). startRenamePrompt installs the handler.
  if (
    session.subState === LoggedOnSubState.UPLOAD_RENAME_PROMPT &&
    (session as any).uploadRenameInputHandler
  ) {
    (session as any).uploadRenameInputHandler(data);
    return;
  }

  // Handle substate-specific input
  // If menu is waiting to display and the user pressed any key (including Enter),
  // immediately drop to READ_COMMAND so input is not lost to the display flow loop.
  if (session.subState === LoggedOnSubState.DISPLAY_MENU && data !== '') {
    session.subState = LoggedOnSubState.READ_COMMAND;
    // Actually display the menu when transitioning from DISPLAY_MENU
    // This ensures the menu is shown after pressing any key
    session.menuPause = false;
    await displayMainMenu(socket, session);
    return;
  }

  // Handle return to webhook menu / webhook action menu ("Press any key
  // to continue..." after an info screen like "No webhooks configured").
  // MUST run before the isDisplayFlowState() check below: DISPLAY_CONF_BULL
  // is reused here the same way FILE_DIR_SELECT is reused elsewhere for a
  // generic prompt substate, but DISPLAY_CONF_BULL is ALSO a real,
  // unconditionally-checked login-flow state (isDisplayFlowState() below
  // matches on subState alone, no tempData gating) - pressing Enter at the
  // webhook "Press any key" prompt was being swallowed by the login
  // display-flow advancer instead, kicking the session into the normal
  // post-login bulletin/conference-join sequence (reported live: exiting
  // "No webhooks configured" showed ASCII-art login bulletins instead of
  // returning to the WEBHOOK menu).
  if (session.tempData?.returnToWebhookMenu && (session.subState as any) === LoggedOnSubState.DISPLAY_CONF_BULL) {
    delete session.tempData;
    await WebhookCommandsHandler.handleWebhookCommand(socket, session);
    return;
  }

  if (session.tempData?.returnToWebhookActionMenu && (session.subState as any) === LoggedOnSubState.DISPLAY_CONF_BULL) {
    const menuData = session.tempData.returnToWebhookActionMenu;
    await WebhookCommandsHandler.showWebhookActions(socket, session, menuData.webhookId);
    return;
  }

  if (isDisplayFlowState(session.subState)) {
console.log('[handleCommand] Display flow branch, subState=', session.subState);
    await advanceDisplayFlow(socket, session);
    return;
  }

  // Handle batch download file selection (FILES_DOWNLOAD_SELECT)
  // Supports: space-separated numbers, ranges (1-5), or filenames
  if (session.subState === LoggedOnSubState.FILES_DOWNLOAD_SELECT) {
    const input = data.trim();

    // Empty input or Q/A to abort - express.e:20140-20142
    if (input === '' || input.toUpperCase() === 'Q' || input.toUpperCase() === 'A') {
      emitText(socket, '\r\n\x1b[33mDownload cancelled.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }

    const areaFiles = session.tempData?.areaFiles || [];
    const selectedFiles: any[] = [];
    const errors: string[] = [];

    // Parse input: space-separated items which can be numbers, ranges (1-5), or filenames
    const items = input.split(/\s+/).filter((s: string) => s.length > 0);

    for (const item of items) {
      // Check for range format (e.g., 1-5)
      const rangeMatch = item.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        if (start >= 1 && end <= areaFiles.length && start <= end) {
          for (let i = start; i <= end; i++) {
            const file = areaFiles[i - 1];
            if (file && !selectedFiles.includes(file)) {
              selectedFiles.push(file);
            }
          }
        } else {
          errors.push(`Invalid range: ${item}`);
        }
        continue;
      }

      // Check for number
      const num = parseInt(item);
      if (!isNaN(num) && num >= 1 && num <= areaFiles.length) {
        const file = areaFiles[num - 1];
        if (file && !selectedFiles.includes(file)) {
          selectedFiles.push(file);
        }
        continue;
      }

      // Treat as filename - search for matches (supports wildcards)
      const matches = areaFiles.filter((f: any) => {
        const name = f.filename || f.name;
        if (item.includes('*') || item.includes('?')) {
          return matchesWildcard(name, item);
        }
        return name.toLowerCase() === item.toLowerCase();
      });

      if (matches.length > 0) {
        for (const match of matches) {
          if (!selectedFiles.includes(match)) {
            selectedFiles.push(match);
          }
        }
      } else {
        errors.push(`File not found: ${item}`);
      }
    }

    // Report errors
    for (const err of errors) {
      emitText(socket, `\r\n\x1b[31m${err}\x1b[0m`);
    }

    if (selectedFiles.length === 0) {
      emitText(socket, '\r\n\x1b[31mNo valid files selected.\x1b[0m\r\n');
      emitPrompt(socket, '\x1b[32mSelect files to download: \x1b[0m');
      return;
    }

    // Show selected files and confirm
    emitText(socket, `\r\n\x1b[32mFiles selected for download (${selectedFiles.length}):\x1b[0m\r\n`);
    selectedFiles.forEach((file: any, index: number) => {
      const name = file.filename || file.name;
      const size = file.size || 0;
      emitText(socket, `  ${index + 1}. ${name} (${size} bytes)\r\n`);
    });

    const totalSize = selectedFiles.reduce((sum: number, f: any) => sum + (f.size || 0), 0);
    emitText(socket, `\r\n\x1b[32mTotal size: ${totalSize} bytes\x1b[0m\r\n`);
    emitPrompt(socket, '\r\n\x1b[36mDownload these files? (Y/N): \x1b[0m');

    session.subState = LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM;
    session.tempData = {
      ...session.tempData,
      downloadFileList: selectedFiles,
      downloadBatch: selectedFiles.length > 1
    };
    return;
  }

  // Handle upload filename input (express.e:17658-17687)
  if (session.subState === LoggedOnSubState.UPLOAD_FILENAME_INPUT) {
    const input = data.trim();

    // Check for abort (A or a alone) - express.e:17668-17670
    // express.e: aePuts('\b\n'); RETURN RESULT_FAILURE -> caller cleanItUp + return -> main loop redisplays menu
    if ((input === 'A' || input === 'a') && input.length === 1) {
      emitText(socket, '\r\n');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }

    // Blank line — exit filename loop (express.e:17673-17675)
    // express.e: brk=(StrLen(str)=0); IF(brk) THEN aePuts('\b\n'); EXIT brk
    // Then after ENDLOOP: aePuts('\b\n') — blank line before Okay prompt (line 17762)
    if (input === '') {
      emitText(socket, '\r\n');  // echo of blank line (express.e:17674)
      // express.e:17762-17769: blank line then Okay prompt (single-char read)
      emitText(socket, '\r\nOkay:   (Enter) to Start, (G)oodbye after transfer, (A)bort? ');
      session.subState = LoggedOnSubState.UPLOAD_OKAY_CONFIRM;
      return;
    }

    // Validate filename (express.e:17680-17684, 19212-19231)
    // express.e:17681 aePuts('Files longer than 12 characters are not allowed.\b\n')
    // No leading \b\n — message is emitted directly, then loop re-prompts with \b\nFileName \d:
    const validation = validateFilename(input);
    if (!validation.valid) {
      emitText(socket, `${validation.error}\r\n`);
      emitText(socket, `\r\nFileName ${session.tempData.uploadCount}: `);
      return;
    }

    // Check for duplicates (express.e:17685-17689). The node goes in because
    // FILESNOTALLOWED lives on the node's icon (ACP.e:2665); the board root is
    // checkForFile's own default now, which is what this call was missing -
    // without it every filesystem check sat behind an `if (bbsDataPath)` and
    // this prompt could only ever answer from the database.
    const isDuplicate = await checkForFile(input, session.currentConf, undefined, session.nodeId || 0);
    if (isDuplicate) {
      emitText(socket, 'File Exists, or has a symbol (#?*).\r\n');
      emitText(socket, `\r\nFileName ${session.tempData.uploadCount}: `);
      return;
    }

    // Apply filename capitalization if configured (express.e:19253)
    // Reads LVL_CAPITOLS_in_FILE from bbsConfig.info
    const { loadBBSConfig } = require('../services/bbs-config-file.service');
    const bbsRoot = require('../config').config.get('bbsRoot') || process.cwd();
    const bbsConfig = loadBBSConfig(bbsRoot);
    const capitalizeFilenames = bbsConfig.capitalize_filenames ?? false; // Default to false
    const finalFilename = capitalizeFilenames ? input.toUpperCase() : input;

    // Store current filename
    session.tempData.currentFilename = finalFilename;

    // Prompt for description (express.e:17689-17698)
    const maxDescLines = 10; // max_desclines from config
    emitText(socket, `\r\nPlease enter a description, you only have ${maxDescLines} lines.\r\n`);
    emitText(socket, 'Press return alone to end.  Begin  with (/) to make upload \'Private\' to Sysop.\r\n');
    emitText(socket, '                                [--------------------------------------------]\r\n');
    emitText(socket, `\x1b[13D${input.padEnd(13)}\x1b[0m:`); // Show filename with cursor at description start

    // Initialize description storage
    session.tempData.currentDescription = [];
    session.tempData.maxDescLines = maxDescLines;
    session.tempData.descLineCount = 0;

    session.subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
    return;
  }

  // Handle upload description input (express.e:17700-17717)
  if (session.subState === LoggedOnSubState.UPLOAD_DESC_INPUT) {
    // Initialize line buffer if needed
    if (!session.tempData.currentLineBuffer) {
      session.tempData.currentLineBuffer = '';
    }

    // Handle backspace
    if (data === '\x7f' || data === '\b') {
      if (session.tempData.currentLineBuffer.length > 0) {
        session.tempData.currentLineBuffer = session.tempData.currentLineBuffer.slice(0, -1);
        emitText(socket, '\b \b'); // Echo backspace (move back, space, move back)
      }
      return;
    }

    // Handle Enter - complete the line
    if (data === '\r' || data === '\n') {
      const input = session.tempData.currentLineBuffer;
      session.tempData.currentLineBuffer = ''; // Clear buffer

      // Blank line ends description (express.e:17704-17707)
      if (input.trim() === '') {
      // Web upload mode: process uploaded file immediately
      if (session.tempData?.webUploadMode && session.tempData?.currentUploadedFile) {
        const uploadedFile = session.tempData.currentUploadedFile;

        // Add file to batch with description
        session.tempData.uploadBatch.push({
          filename: uploadedFile.filename,
          description: session.tempData.currentDescription.join('\n'),
          isPrivate: session.tempData.currentDescription[0]?.startsWith('/')
        });

        // Use sequential counter instead of array index (consistent with refactored code)
        session.tempData.currentUploadIndex = session.tempData.filesProcessedCount || 0;
        session.tempData.filesProcessedCount = (session.tempData.filesProcessedCount || 0) + 1;

        // Trigger file processing by calling processBatchFile directly
        emitText(socket, '\r\n\r\n\x1b[36mProcessing upload...\x1b[0m\r\n');

        // Process the upload directly (not via socket event - that doesn't work)
        await processBatchFile(socket, session, {
          filename: uploadedFile.filename,
          originalname: uploadedFile.filename,
          size: uploadedFile.size,
          path: uploadedFile.path
        }, config);
        return;
      }

      // Original batch mode: Save file to upload batch
      session.tempData.uploadBatch.push({
        filename: session.tempData.currentFilename,
        description: session.tempData.currentDescription.join('\n'),
        isPrivate: session.tempData.currentDescription[0]?.startsWith('/')
      });

      // Move to next filename
      session.tempData.uploadCount++;
      emitText(socket, `\r\nFileName ${session.tempData.uploadCount}: `);
      session.subState = LoggedOnSubState.UPLOAD_FILENAME_INPUT;
      return;
    }

    // Store description line (max 44 chars as shown in express.e:17699)
    const descLine = input.substring(0, 44);
    session.tempData.currentDescription.push(descLine);
    session.tempData.descLineCount++;

    // Check if reached max lines
    if (session.tempData.descLineCount >= session.tempData.maxDescLines) {
      // Save file to upload batch
      session.tempData.uploadBatch.push({
        filename: session.tempData.currentFilename,
        description: session.tempData.currentDescription.join('\n'),
        isPrivate: session.tempData.currentDescription[0]?.startsWith('/')
      });

      // Move to next filename
      session.tempData.uploadCount++;
      emitText(socket, `\r\nFileName ${session.tempData.uploadCount}: `);
      session.subState = LoggedOnSubState.UPLOAD_FILENAME_INPUT;
      return;
    }

      // Prompt for next description line (express.e:19326)
      // Format: newline + 32 spaces + ':' (aligns with first line at column 33)
      emitText(socket, '\r\n                                :');
      return;
    }

    // Regular character - add to buffer and echo to terminal
    if (data.length === 1 && data >= ' ' && data <= '~') {
      session.tempData.currentLineBuffer += data;
      emitText(socket, data); // Echo character to terminal
    }
    return;
  }

  // Handle file upload state
  if (session.subState === LoggedOnSubState.FILES_UPLOAD) {
    // In web upload mode, ignore key presses - wait for file-uploaded event
    // User is interacting with browser file picker, not terminal
    if (session.tempData?.webUploadMode) {
console.log(' In web upload mode - ignoring key press (waiting for file-uploaded event)');
      return;
    }

    // In terminal mode, any key press cancels upload
console.log(' In file upload state - canceling upload');
    emitText(socket, '\r\n\x1b[33mUpload canceled\x1b[0m\r\n');
    emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Handle upload "Okay:" confirm — express.e:17763-17796 (single-char read)
  // Options: Enter=start transfer, G=goodbye after, A=abort; loop on anything else
  if (session.subState === LoggedOnSubState.UPLOAD_OKAY_CONFIRM) {
    const ch = data[0] || '';
    if (ch === 'A' || ch === 'a') {
      // express.e:17781-17783: aePuts('Abort!\b\n\b\n'); RETURN RESULT_FAILURE
      emitText(socket, 'Abort!\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
    } else if (ch === 'G' || ch === 'g') {
      // express.e:17791-17793: aePuts('Goodbye!\b\n\b\n'); RETURN 2 (goodbye after transfer)
      emitText(socket, 'Goodbye!\r\n\r\n');
      startBatchUploadTransfer(socket, session, true);
    } else if (ch === '\r' || ch === '\n' || ch === '') {
      // express.e:17794-17796: aePuts('\b\n\b\n') then fall through to transfer
      emitText(socket, '\r\n\r\n');
      startBatchUploadTransfer(socket, session, false);
    }
    // All other chars: loop (express.e REPEAT...UNTIL)
    return;
  }

  // Note: USER CONFIGURATION numbered parameter selection (0-14) removed
  // This was unreachable dead code - no code in the system sets session.tempData.userParameters
  // User configuration is handled via dedicated preference commands (SC command, etc.)

  // Handle WEBHOOK menu input (main menu with arrow navigation)
  if (session.subState === LoggedOnSubState.FILE_DIR_SELECT && session.tempData?.webhookMenu) {
    await WebhookCommandsHandler.handleWebhookMenuInput(socket, session, data);
    return;
  }

  // Handle WEBHOOK list menu input (arrow selection of webhooks)
  if (session.subState === LoggedOnSubState.FILE_DIR_SELECT && session.tempData?.webhookListMenu) {
    await WebhookCommandsHandler.handleWebhookListInput(socket, session, data);
    return;
  }

  // Handle WEBHOOK actions menu input (enable/disable/test/delete)
  if (session.subState === LoggedOnSubState.FILE_DIR_SELECT && session.tempData?.webhookActionsMenu) {
    await WebhookCommandsHandler.handleWebhookActionsInput(socket, session, data);
    return;
  }

  // Handle Add Webhook's type picker (Discord/Slack arrow menu)
  if (session.subState === LoggedOnSubState.FILE_DIR_SELECT && session.tempData?.webhookAddTypeSelect) {
    await WebhookCommandsHandler.handleAddWebhookTypeSelectInput(socket, session, data);
    return;
  }

  // Handle Add Webhook's trigger picker (multi-select arrow menu)
  if (session.subState === LoggedOnSubState.FILE_DIR_SELECT && session.tempData?.webhookAddTriggersSelect) {
    await WebhookCommandsHandler.handleAddWebhookTriggersSelectInput(socket, session, data);
    return;
  }

  // Handle webhook add input (text input for new webhook).
  // Line-input: accumulate chars until Enter, then dispatch - same pattern
  // as GDPR_BACKFILL above. socket-handlers.ts forwards every keystroke as
  // its own event (no client-side line buffering exists anywhere in this
  // BBS); only states that explicitly buffer, like this one, ever see a
  // complete line. Without this, handleAddWebhookInput() was called once
  // per keystroke, each one treated as a "complete" answer - the FIRST
  // character typed for "Webhook Name" immediately advanced to the next
  // prompt. Merely routing through a different subState (FILE_DIR_SELECT
  // instead of READ_COMMAND) does not add buffering by itself - only
  // READ_COMMAND/GDPR_BACKFILL happen to already have their own.
  // Door-filter input reuses the identical line-buffering contract below;
  // handled first because both set tempData and only one is ever active.
  if (session.tempData?.webhookDoorFilter || session.tempData?.webhookTierFilter) {
    if (data === '\r' || data === '\n') {
      const dfInput = (session.inputBuffer || '');
      session.inputBuffer = '';
      if (session.tempData?.webhookTierFilter) await WebhookCommandsHandler.handleTierFilterInput(socket, session, dfInput);
      else await WebhookCommandsHandler.handleDoorFilterInput(socket, session, dfInput);
    } else if (data === '\x7f' || data === '\b') {
      if (session.inputBuffer?.length) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        socket.emit('ansi-output', '\b \b');
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_COMMAND_LINE) {
      session.inputBuffer = (session.inputBuffer || '') + data;
      socket.emit('ansi-output', data);
    }
    return;
  }

  if (session.tempData?.webhookAdd) {
    if (data === '\r' || data === '\n') {
      const whInput = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await WebhookCommandsHandler.handleAddWebhookInput(socket, session, whInput);
    } else if (data === '\x7f' || data === '\b') {
      if (session.inputBuffer?.length) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // webhook-commands.handler.ts's whole flow uses raw
        // socket.emit('ansi-output', ...) throughout, never the buffered
        // ansi-buffer queue emitText()/emitPrompt() use elsewhere in this
        // file. Echoing via the buffered API here raced against the
        // handler's own unbuffered "Webhook URL:" emit on Enter - the
        // buffered echo could still be queued (16ms/60fps batching) when
        // the unbuffered next-prompt text was already delivered, so the
        // prompt visibly landed before the just-typed characters caught
        // up. Match this flow's own convention (raw emit) instead of
        // GDPR_BACKFILL's (which stays internally consistent because its
        // own handler also uses the buffered API).
        socket.emit('ansi-output', '\b \b');
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_COMMAND_LINE) {
      session.inputBuffer = (session.inputBuffer || '') + data;
      socket.emit('ansi-output', data);
    }
    return;
  }

  // Handle file list directory input (F command continuation)
  if (session.subState === LoggedOnSubState.FILE_LIST_DIR_INPUT) {
    const { FileListingHandler } = require('./file/file-listing.handler');
    await FileListingHandler.handleFileListDirInput(socket, session, data.trim());
    return;
  }

  // Handle flag input (A command continuation)
  //
  // LINE-buffered, because express.e reads this prompt with lineInput()
  // (express.e:12599). Handing the handler each keystroke as it arrived
  // made every character its own answer: typing a filename flagged one
  // "file" per letter - the sysop's flag list read "W 1 D A Q" - and
  // reprinted the prompt after each one.
  if (session.subState === LoggedOnSubState.FLAG_INPUT ||
      session.subState === LoggedOnSubState.FLAG_CLEAR_INPUT ||
      session.subState === LoggedOnSubState.FLAG_FROM_INPUT) {
    const { collectLine } = require('../utils/line-input.util');
    await collectLine(
      socket,
      session,
      data,
      async (line: string) => {
        const { AlterFlagsHandler } = require('./operations/alter-flags.handler');
        await AlterFlagsHandler.handleFlagInput(socket, session, line.trim());
      },
      // lineInput echoes the Enter as a line break - see express.e:30376.
      { echoNewline: true }
    );

    await repaintMenuIfPending(socket, session);
    return;
  }

  // NOTE: DOWNLOAD_FILENAME_INPUT and DOWNLOAD_CONFIRM_INPUT are handled earlier
  // in the line-buffered input section (lines 1391-1427)

  // Handle view file input (V command continuation)
  if (session.subState === LoggedOnSubState.VIEW_FILE_INPUT) {
    const { ViewFileHandler } = require('./content/view-file.handler');
    await ViewFileHandler.handleFilenameInput(socket, session, data.trim());
    return;
  }

  // Handle command password input (express.e:4716-4730)
  if (session.subState === LoggedOnSubState.COMMAND_PASSWORD_INPUT) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleCommandPasswordInput(socket, session, input);
    } else if (data === '\x7f' || data === '\b') {
      if (session.inputBuffer?.length) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        emitText(socket, '\b \b');
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_DOOR_PASSWORD) {
      session.inputBuffer = (session.inputBuffer || '') + data;
      emitText(socket, '*'); // Mask password characters
    }
    return;
  }

  // Handle zippy search input (Z command continuation - express.e:26150-26157)
  if (session.subState === LoggedOnSubState.ZIPPY_SEARCH_INPUT) {
    const { ZippySearchHandler } = require('./content/zippy-search.handler');
    await ZippySearchHandler.handleSearchInput(socket, session, data.trim());
    return;
  }

  // Handle zippy dir span input (Z command getDirSpan prompt - express.e:26162-26168)
  if (session.subState === LoggedOnSubState.ZIPPY_DIR_SPAN_INPUT) {
    const { ZippySearchHandler } = require('./content/zippy-search.handler');
    await ZippySearchHandler.handleDirSpanInput(socket, session, data.trim());
    return;
  }

  // Handle batch download confirmation
  // express.e:24490 - "Which node to view?" for the CL command.
  if (session.subState === LoggedOnSubState.CALLERSLOG_NODE_INPUT) {
    const { handleCallersLogNodeInput } = require('./commands/sysop-commands.handler');
    await handleCallersLogNodeInput(socket, session, data.trim());
    return;
  }

  if (session.subState === LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM) {
    const { BatchDownloadHandler } = require('./transfer/batch-download.handler');
    await BatchDownloadHandler.handleBatchConfirm(socket, session, data.trim());
    return;
  }

  // Handle file maintenance operations
  if (session.tempData?.operation === 'delete_files') {
    await handleFileDeleteConfirmation(socket, session, data.trim());
    return;
  }

  if (session.tempData?.operation === 'move_files') {
    await handleFileMoveConfirmation(socket, session, data.trim());
    return;
  }

  // Handle account editing operations (delegate to account editor menu)
  if (session.tempData?.accountEditingMenu) {
    await handleAccountEditingCommand(socket, session);
    return;
  }

  if (session.tempData?.editUserAccount) {
    await handleAccountEditingCommand(socket, session);
    return;
  }

  if (session.tempData?.viewUserStats) {
    await handleAccountEditingCommand(socket, session);
    return;
  }

  if (session.tempData?.changeSecLevel || session.tempData?.toggleUserFlags || session.tempData?.deleteUserAccount || session.tempData?.searchUsers) {
    await handleAccountEditingCommand(socket, session);
    return;
  }

  // Handle conference selection
  if (session.subState === LoggedOnSubState.CONFERENCE_SELECT) {
console.log(' In conference selection state');
    const input = data.trim();

    // Check if this is message base selection (from JM command)
    if (session.tempData?.messageBaseSelect) {
      const msgBaseId = parseInt(input);
      if (isNaN(msgBaseId) || msgBaseId === 0) {
        // Empty input or invalid - return to menu
        emitText(socket, '\r\nReturning to main menu...\r\n');
        session.menuPause = true;
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.tempData = undefined;
        return;
      }

      const currentConfBases = session.tempData.currentConfBases;
      const selectedBase = currentConfBases.find((mb: any) => mb.id === msgBaseId);
      if (!selectedBase) {
        emitText(socket, '\r\nInvalid message base number.\r\n');
        emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
        return;
      }

      // Join the selected message base
      session.currentMsgBase = msgBaseId;
      emitText(socket, `\r\n\x1b[32mJoined message base: ${selectedBase.name}\x1b[0m\r\n`);
      emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    // Regular conference selection
    const relConfNum = parseInt(input); // Relative conference number (1-based)
    if (isNaN(relConfNum) || relConfNum === 0) {
      // Empty input or invalid - return to menu
      emitText(socket, '\r\nReturning to main menu...\r\n');
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Validate relative conference number and convert to conference object
    if (relConfNum < 1 || relConfNum > getConferences().length) {
      emitText(socket, '\r\nInvalid conference number.\r\n');
      emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    const selectedConf = getConferences()[relConfNum - 1]; // Convert to 0-based index
    const confId = selectedConf.id; // Get actual database ID

    // Find first message base for this conference (express.e uses first base as default)
    const confMessageBases = getMessageBases().filter(mb => mb.conferenceId === confId);
    if (confMessageBases.length === 0) {
      emitText(socket, '\r\n\x1b[31mNo message bases available in this conference!\x1b[0m\r\n');
      emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }
    const firstMsgBaseId = confMessageBases[0].id; // Use first message base

    // Join the selected conference
    if (await joinConference(socket, session, confId, firstMsgBaseId)) {
      emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    }
    return;
  }

  // Handle message entry substates (E command flow)
  // These states require LINE-BUFFERED input, not single-key hotkeys
  // Initialize inputBuffer if needed
  if (!session.inputBuffer && (
    session.subState === LoggedOnSubState.POST_MESSAGE_TO ||
    session.subState === LoggedOnSubState.POST_MESSAGE_SUBJECT ||
    session.subState === LoggedOnSubState.POST_MESSAGE_PRIVATE
  )) {
    session.inputBuffer = '';
  }

  if (session.subState === LoggedOnSubState.POST_MESSAGE_TO) {
    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      // handleMessageToInput is async (DB lookup for chooseAName + checkConfAccess).
      void handleMessageToInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Client handles backspace echo
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
      // Client handles character echo, don't send back
    }
    return;
  }

  if (session.subState === LoggedOnSubState.POST_MESSAGE_SUBJECT) {
    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageSubjectInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Client handles backspace echo
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
      // Client handles character echo, don't send back
    }
    return;
  }

  if (session.subState === LoggedOnSubState.POST_MESSAGE_PRIVATE) {
    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessagePrivateInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // Client handles backspace echo
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
      // Client handles character echo, don't send back
    }
    return;
  }

  if (session.subState === LoggedOnSubState.POST_MESSAGE_BODY) {
    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const line = session.inputBuffer;
      session.inputBuffer = '';
      emitText(socket, '\r\n'); // Move to next line
      await handleMessageBodyInput(socket, session, line);
    } else if (data === '\x7f' || data === '\b') { // Backspace (express.e:2304-2320)
      // express.e:2306 - IF curpos>0 THEN (only backspace if buffer has content)
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        // express.e:2307-2319 - Send backspace sequence: BS + space + BS
        // This moves cursor back, overwrites char with space, moves cursor back again
        emitText(socket, '\b \b');
      }
      // If buffer is empty, ignore backspace (prevents erasing prompt)
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      // Echo character back to terminal (express.e:2342) - backend handles ALL echo
      emitText(socket, data);
    }
    return;
  }

  // Handle message editor delete line prompt
  if (session.subState === LoggedOnSubState.POST_MESSAGE_DELETE_LINE) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageDeleteLineInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message editor delete confirmation
  if (session.subState === LoggedOnSubState.POST_MESSAGE_DELETE_CONFIRM) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageDeleteConfirm(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message editor edit line prompt
  if (session.subState === LoggedOnSubState.POST_MESSAGE_EDIT_LINE) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageEditLineInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message editor edit line content
  if (session.subState === LoggedOnSubState.POST_MESSAGE_EDIT_LINE_CONTENT) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '');
      session.inputBuffer = '';
      handleMessageEditLineContent(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message editor file attachment input (express.e:10515-10556)
  if (session.subState === LoggedOnSubState.POST_MESSAGE_ATTACH_FILE) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMessageAttachFileInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message editor file attachment delete confirmation (express.e:10538-10549)
  if (session.subState === LoggedOnSubState.POST_MESSAGE_ATTACH_DELETE_CONFIRM) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageAttachDeleteConfirm(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle /R (Replace Text) - Search String Input
  if (session.subState === LoggedOnSubState.POST_MESSAGE_REPLACE_SEARCH) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageReplaceSearchInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle /R (Replace Text) - Replacement String Input
  if (session.subState === LoggedOnSubState.POST_MESSAGE_REPLACE_WITH) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '');  // Don't trim - allow empty replacement
      session.inputBuffer = '';
      handleMessageReplaceWithInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle /I (Insert Line) - Line Number Input
  if (session.subState === LoggedOnSubState.POST_MESSAGE_INSERT_LINE) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      handleMessageInsertLineInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle /I (Insert Line) - Text Input
  if (session.subState === LoggedOnSubState.POST_MESSAGE_INSERT_TEXT) {
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '');  // Don't trim - preserve spaces
      session.inputBuffer = '';
      handleMessageInsertTextInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle message reader navigation (R command)
  // express.e:11046 — single-character getMSGCommand, not line input.
  // The web port used line-input (buffering until Enter) which silently
  // ate single-letter commands like Q, N, A. Check for a single known
  // command character first; multi-character commands (NS, RE, etc.) still
  // need Enter.
  const SINGLE_CHAR_NAV_COMMANDS = new Set(['Q', 'N', 'A', 'R', 'L', 'K', 'F', '?']);
  if (session.subState === LoggedOnSubState.MSG_READER_NAV) {
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Single-char dispatch for well-known commands — express.e getMSGCommand
    // is single-character, not line-input. Q, N, A, R, L, K, F, ? work
    // immediately without Enter.
    if (data.length === 1 && data >= ' ' && data <= '~') {
      const ch = data.toUpperCase();
      if (SINGLE_CHAR_NAV_COMMANDS.has(ch)) {
        session.inputBuffer = '';
        if (ch === '?') {
          // '?' shows short help, '??' shows full help — but since we
          // dispatch '?' immediately, '??' never arrives. Check for a
          // second '?' in the next tick by appending to buffer.
          // Actually, just show short help for '?' and full help for '??'
          // which arrives as two separate '?' chars. For the first '?',
          // display short help immediately.
          const { handleMessageReaderNav } = require('./message/messaging.handler');
          await handleMessageReaderNav(socket, session, '?');
          return;
        }
        const { handleMessageReaderNav } = require('./message/messaging.handler');
        await handleMessageReaderNav(socket, session, ch);
        return;
      }
    }

    // Buffer characters until Enter is pressed (for multi-char commands)
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMessageReaderNav(socket, session, input);
    } else if (data === '\x7f' || data === '\b') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        emitText(socket, '\b \b');
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
      emitText(socket, data);
    }
    return;
  }

  // Handle listMSGs start message number input - express.e:8833-8843
  if (session.subState === LoggedOnSubState.MSG_LIST_START_INPUT) {
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMsgListStartInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle M (Move Message) conference input - express.e:27024-27049
  if (session.subState === LoggedOnSubState.MSG_MOVE_CONF_INPUT) {
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMsgMoveConfInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle M (Move Message) msgbase input - express.e:27058-27084
  if (session.subState === LoggedOnSubState.MSG_MOVE_MSGBASE_INPUT) {
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMsgMoveMsgBaseInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle M (Move Message) confirmation - express.e:11846-11849
  if (session.subState === LoggedOnSubState.MSG_MOVE_CONFIRM) {
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMsgMoveConfirm(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle EH (Edit Header) From input - express.e:11611-11621
  if (session.subState === LoggedOnSubState.MSG_EDIT_HEADER_FROM) {
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMsgEditHeaderFrom(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle EH (Edit Header) To input - express.e:11623-11629
  if (session.subState === LoggedOnSubState.MSG_EDIT_HEADER_TO) {
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMsgEditHeaderTo(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle EH (Edit Header) Subject input - express.e:11630-11634
  if (session.subState === LoggedOnSubState.MSG_EDIT_HEADER_SUBJECT) {
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMsgEditHeaderSubject(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle EH (Edit Header) Private Y/N - express.e:11636-11648
  if (session.subState === LoggedOnSubState.MSG_EDIT_HEADER_PRIVATE) {
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleMsgEditHeaderPrivate(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle TS (Choose Translator) input - express.e:11391-11417
  if (session.subState === LoggedOnSubState.MSG_CHOOSE_TRANSLATOR) {
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
      await handleChooseTranslatorInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
    }
    return;
  }

  // Handle J (Join Conference) input
  if (session.subState === LoggedOnSubState.JOIN_CONF_INPUT) {
console.log(' In JOIN_CONF_INPUT state');
    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';
console.log(' Conference number entered:', input);

      if (input.length === 0) {
        finalizeCommand(socket, session, 'Conference join cancelled');
        return;
      }

      // express.e:25150 - newConf:=getInverse(Val(newStr))
      // Delegate to handleJoinConferenceCommand which applies getInverse, validates access,
      // and handles the JOINCONF re-prompt loop identically to express.e:25140-25183.
      const { handleJoinConferenceCommand: joinCmd } = require('./commands/user-commands.handler');
      await joinCmd(socket, session, input);
      if (!isDisplayFlowState(session.subState)) {
        session.menuPause = true;
        session.subState = LoggedOnSubState.DISPLAY_MENU;
      }
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer && session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        emitText(socket, '\b \b');
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer = (session.inputBuffer || '') + data;
      emitText(socket, data);
    }
    return;
  }

  // Handle JM (Join Message Base) input
  if (session.subState === LoggedOnSubState.JM_INPUT) {
    console.log(' In JM input state');
    handleJMInput(socket, session, data.trim());
    return;
  }

  // Handle NM (Node Management) input - express.e:25294-25366
  if (session.subState === LoggedOnSubState.NM_INPUT) {
    console.log(' In NM input state');
    handleNMInput(socket, session, data.trim());
    return;
  }

  // Handle NM confirmation (Y/n) - express.e:25326-25363
  if (session.subState === LoggedOnSubState.NM_CONFIRM) {
    console.log(' In NM confirm state');
    handleNMConfirm(socket, session, data.trim());
    return;
  }

  // Handle RL (Relogon) confirmation
  if (session.subState === LoggedOnSubState.RL_CONFIRM) {
console.log(' In RL confirmation state');
    handleRelogonConfirm(socket, session, data.trim());
    return;
  }

  // CM (Conference Maintenance) states are handled by state-router
  // See: command-handler/conference-maint-states.ts

  // VO (Voting Booth) states are handled by state-router
  // See: command-handler/voting-states.ts

  // Handle message posting workflow (line-based input like login system)
console.log(' Checking if in POST_MESSAGE_SUBJECT state:', (session.subState as any) === LoggedOnSubState.POST_MESSAGE_SUBJECT);
  if ((session.subState as any) === LoggedOnSubState.POST_MESSAGE_SUBJECT) {
console.log(' ENTERED message subject input handler');
console.log(' Data received:', JSON.stringify(data), 'type:', typeof data);
console.log(' Data === "\\r":', data === '\r');
console.log(' Data === "\\n":', data === '\n');
console.log(' Data.charCodeAt(0):', data.charCodeAt ? data.charCodeAt(0) : 'no charCodeAt');

    // Handle line-based input like the login system
    if (data === '\r' || data === '\n') { // Handle both carriage return and newline
console.log(' ENTER CONDITION MET!');
      // Enter pressed - process the input
      const input = session.inputBuffer.trim();
console.log(' ENTER PRESSED - Processing input:', JSON.stringify(input), 'length:', input.length);

      // Check if this is private message recipient input
      if (session.tempData?.isPrivate && !session.messageRecipient) {
        if (input.length === 0) {
console.log(' Recipient is empty, aborting private message posting');
          emitText(socket, '\r\nPrivate message posting aborted.\r\n');
          emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.menuPause = false;
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
          session.inputBuffer = '';
          session.tempData = undefined;
          return;
        }
console.log(' Recipient accepted:', JSON.stringify(input), '- now prompting for subject');
        session.messageRecipient = input;
        emitPrompt(socket, '\r\nEnter your message subject (or press Enter to abort): ');
        session.inputBuffer = '';
        return;
      }

      // Check if this is comment to sysop (skip recipient, go directly to subject)
      if (session.tempData?.isCommentToSysop && !session.messageRecipient) {
console.log(' Comment to sysop - setting recipient to SYSOP');
        session.messageRecipient = 'SYSOP';
        // Continue with subject input
      }

      // Handle subject input
      if (input.length === 0) {
console.log(' Subject is empty, aborting message posting');
        emitText(socket, '\r\nMessage posting aborted.\r\n');
        emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.inputBuffer = '';
        session.tempData = undefined;
        return;
      }
console.log(' Subject accepted:', JSON.stringify(input), '- moving to message body input');
      session.messageSubject = input;
      emitPrompt(socket, '\r\nEnter your message (press Enter twice to finish):\r\n> ');
      session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
      session.inputBuffer = '';
console.log(' Changed state to POST_MESSAGE_BODY');
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        emitText(socket, '\b \b'); // Erase character from terminal
console.log(' Backspace - buffer now:', JSON.stringify(session.inputBuffer));
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') { // Only printable characters
      // Regular character - add to buffer and echo
      session.inputBuffer += data;
      emitText(socket, data);
console.log(' Added character to buffer, current buffer:', JSON.stringify(session.inputBuffer));
    } else {
console.log(' Ignoring non-printable character:', JSON.stringify(data), 'charCode:', data.charCodeAt ? data.charCodeAt(0) : 'N/A');
    }
console.log(' EXITING message subject handler');
    return;
  }

  if ((session.subState as any) === LoggedOnSubState.POST_MESSAGE_BODY) {
console.log(' In message body input state, received:', JSON.stringify(data));

    // Handle line-based input for message body
    if (data === '\r' || data === '\n') {
      // Enter pressed - check if this is an empty line (end of message)
      if (session.inputBuffer.trim().length === 0) {
        // Empty line - end message posting
        const body = (session.messageBody || '').trim();
        if (body.length === 0) {
          emitText(socket, '\r\nMessage posting aborted.\r\n');
        } else {
          // Store message in database
          try {
            const db = getDatabase();
            await db.createMessage({
              subject: session.messageSubject || 'No Subject',
              body: body,
              author: session.user?.username || 'Anonymous',
              timestamp: getSystemTime(),
              conferenceId: session.currentConf,
              messageBaseId: session.currentMsgBase,
              isPrivate: session.tempData?.isPrivate || false,
              toUser: session.messageRecipient,
              parentId: session.tempData?.parentId
            });
            emitText(socket, '\r\nMessage posted successfully!\r\n');

            // Log message posting activity
console.log(`[Message] Posted by ${session.user?.username} in conf ${session.currentConf}: ${session.messageSubject}`);
          } catch (error) {
console.error('[Message] Failed to store message:', error);
            emitText(socket, '\r\n\x1b[31mError posting message.\x1b[0m\r\n');
          }
        }
        emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;

        // Clear message data
        session.messageSubject = undefined;
        session.messageBody = undefined;
        session.messageRecipient = undefined;
        session.inputBuffer = '';
        session.tempData = undefined;
        return;
      } else {
        // Non-empty line - add to message body
        if (session.messageBody) {
          session.messageBody += '\r\n' + session.inputBuffer;
        } else {
          session.messageBody = session.inputBuffer;
        }
        emitPrompt(socket, '\r\n> '); // New line prompt
        session.inputBuffer = '';
      }
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        emitText(socket, '\b \b'); // Erase character from terminal
      }
    } else {
      // Regular character - add to buffer and echo
      session.inputBuffer += data;
      emitText(socket, data);
    }
    return;
  }

  // FM Command (File Maintenance) states are handled by state-router
  // See: command-handler/file-maintenance-states.ts

  // CF Command (Conference Flags) Input Handlers
  // express.e:24672-24841

  if (session.subState === LoggedOnSubState.CF_FLAG_SELECT_INPUT) {
    // M/A/F/Z flag type selection
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleCFFlagSelectInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  if (session.subState === LoggedOnSubState.CF_CONF_SELECT_INPUT) {
    // Conference numbers input
    if (!session.inputBuffer) session.inputBuffer = '';
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleCFConfSelectInput(socket, session, input);
    } else if (data === '\x7f') {
      if (session.inputBuffer.length > 0) session.inputBuffer = session.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  }

  // Use state router for modularized state handling
  // This handles W_EDIT_*, FM_*, CM_*, VO_* states
  if (isRoutedState(session.subState as LoggedOnSubState)) {
    const routeResult = await routeStateInput(socket, session, data);
    if (routeResult.handled && !routeResult.continueProcessing) {
      return;
    }
  }

  // W Command (Write User Parameters) states are handled by state-router
  // See: command-handler/user-edit-states.ts

  // Safety: if shortcuts mode is active but no shortcuts are loaded or the flag is off,
  // fall back to normal line input (prevents unwanted single-key triggering).
  if (
    session.subState === LoggedOnSubState.READ_SHORTCUTS &&
    (!session.cmdShortcuts || !session.shortcuts || session.shortcuts.size === 0)
  ) {
    session.subState = LoggedOnSubState.READ_COMMAND;
  }

  if (session.subState === LoggedOnSubState.READ_COMMAND) {
console.log(' In READ_COMMAND state, reading line input');
    // Express.e:28619-28633 - Read command text using lineInput (line-buffered)

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Handle command history navigation (express.e:2236-2291)
    // Up Arrow - previous command (express.e:2258-2274)
    if (data === '\x1b[A') {
      const { getPreviousCommand } = require('../utils/command-history.util');
      const previousCmd = getPreviousCommand(session);
      if (previousCmd) {
        // Clear current line (express.e:2260-2267) — cursor may be mid-buffer,
        // so first move to end before backspacing.
        const cur = (session as any)._readCommandCurpos ?? session.inputBuffer.length;
        const moveRight = '\x1b[C'.repeat(Math.max(0, session.inputBuffer.length - cur));
        let clearSequence = moveRight;
        for (let i = 0; i < session.inputBuffer.length; i++) {
          clearSequence += '\b \b';
        }
        emitText(socket, clearSequence);

        // Display previous command (express.e:2268, 2272)
        session.inputBuffer = previousCmd;
        emitText(socket, previousCmd);
        (session as any)._readCommandCurpos = previousCmd.length;
      }
      return;
    }
    // Down Arrow - next command (express.e:2275-2291)
    else if (data === '\x1b[B') {
      const { getNextCommand } = require('../utils/command-history.util');
      const nextCmd = getNextCommand(session);
      if (nextCmd) {
        // Clear current line (express.e:2277-2284)
        const cur = (session as any)._readCommandCurpos ?? session.inputBuffer.length;
        const moveRight = '\x1b[C'.repeat(Math.max(0, session.inputBuffer.length - cur));
        let clearSequence = moveRight;
        for (let i = 0; i < session.inputBuffer.length; i++) {
          clearSequence += '\b \b';
        }
        emitText(socket, clearSequence);

        // Display next command (express.e:2285, 2289)
        session.inputBuffer = nextCmd;
        emitText(socket, nextCmd);
        (session as any)._readCommandCurpos = nextCmd.length;
      }
      return;
    }
    // Ctrl-B - clear history (express.e:2236-2239)
    else if (data === '\x02') {
      const { clearHistory } = require('../utils/command-history.util');
      clearHistory(session);
console.log('[CommandHistory] History cleared by user (Ctrl-B)');
      return;
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      let input = (session.inputBuffer || '').trim();

      // ENTER accepts the grey suggestion, so `doo` + RETURN runs the
      // command that was being offered rather than failing on a half-typed
      // word. Only when a ghost was actually SHOWN - what fires is what was
      // on screen, never a completion nobody could see.
      //
      // This cannot hijack a command typed in full: candidates are ordered
      // shortest-first, so an exact command is always the first candidate
      // and its ghost is empty. Typing `J` where `JM` also exists shows
      // nothing and runs J.
      if ((session as any)._promptGhostShown && input.length > 0) {
        const { promptComplete } = require('./command-handler/prompt-completion');
        const completed = (await promptComplete(config.get('dataDir'), input)).trim();
        if (completed && completed !== input) {
          // Repaint the line so what runs is what is left on screen, in
          // normal colour rather than as a grey offer.
          emitText(socket, '\b'.repeat(input.length) + '\x1b[K' + completed);
          input = completed;
        }
      }
      (session as any)._promptGhostShown = false;
      (session as any)._promptCycle = undefined;

      session.inputBuffer = '';

      // Check for pending input handlers
      if (session.tempData?.waitingForJoinMsgBase) {
        const { handleJoinMsgBaseInput } = require('./commands/user-commands.handler');
        await handleJoinMsgBaseInput(socket, session, input);
        return;
      }

      if (input.length > 0) {
        // Add command to history (express.e:2158-2168)
        const { addToHistory } = require('../utils/command-history.util');
        addToHistory(session, input);

        // Store command text in session for PROCESS_COMMAND state
        session.commandText = input.toUpperCase();
console.log(' Command text stored:', session.commandText);
        // Transition to PROCESS_COMMAND (express.e:28638)
        session.subState = LoggedOnSubState.PROCESS_COMMAND;
        // Process the command in the next event cycle
        setTimeout(() => {
          handleCommand(socket, session, '');  // Trigger process command
        }, 0);
      } else {
        // express.e:28228 - Empty command, just redisplay menu
console.log(' Empty command, redisplaying menu');
        session.menuPause = false;
        // Immediately display the menu/prompt instead of waiting for another key
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        await menuDisplayMainMenu(socket, session);
      }
    }
    // express.e:2236-2400 lineInput supports curpos-based editing.
    // Track cursor position so left/right arrows move within the buffer and
    // backspace/insert work at the cursor (not always at end-of-buffer).
    let curpos: number = (session as any)._readCommandCurpos ?? session.inputBuffer.length;
    if (curpos > session.inputBuffer.length) curpos = session.inputBuffer.length;

    if (data === '\x1b[D') {
      // Left arrow — move cursor left if not at start
      if (curpos > 0) {
        curpos--;
        emitText(socket, '\x1b[D');
        (session as any)._readCommandCurpos = curpos;
      }
      return;
    }
    if (data === '\x1b[C') {
      // Right arrow — move cursor right if not at end
      if (curpos < session.inputBuffer.length) {
        curpos++;
        emitText(socket, '\x1b[C');
        (session as any)._readCommandCurpos = curpos;
      }
      return;
    }
    // TAB accepts the grey suggestion, if a completer door is installed and
    // is offering one. TAB does nothing at this prompt otherwise, here and
    // on a real Amiga alike (express.e's lineInput has no TAB case), so
    // this adds a meaning rather than changing one.
    if (data === '\t') {
      const { promptCompleteNth, promptGhost, renderGhost } = require('./command-handler/prompt-completion');

      // Pressing TAB again on the SAME word advances to the next candidate
      // rather than repeating the first. "do" is ambiguous between DOOR,
      // DOORREPO and DOORS, so the first answer cannot always be the wanted
      // one; the state resets the moment the line is edited.
      const cycle = (session as any)._promptCycle;
      const sameWord = cycle && cycle.result === session.inputBuffer;
      const press = sameWord ? cycle.press + 1 : 0;
      const from = sameWord ? cycle.from : (session.inputBuffer || '');

      const { line: completed } = await promptCompleteNth(config.get('dataDir'), from, press);
      (session as any)._promptCycle = { from, press, result: completed };
      if (completed !== session.inputBuffer) {
        // Redraw the WHOLE word rather than appending the tail: the
        // completion uses the command's own spelling, so accepting "do"
        // gives "DOOR", not "doOR". Back over what was typed, erase the
        // grey suggestion with it, and write the command out.
        const typed = session.inputBuffer || '';
        session.inputBuffer = completed;
        (session as any)._readCommandCurpos = completed.length;
        emitText(socket, '\b'.repeat(typed.length) + '\x1b[K' + completed);
        emitText(socket, renderGhost(await promptGhost(config.get('dataDir'), completed)));
      }
      return;
    }

    if (data === '\x7f' || data === '\b') { // Backspace at cursor
      if (curpos > 0) {
        const buf = session.inputBuffer;
        const tail = buf.slice(curpos);
        const edited = buf.slice(0, curpos - 1) + tail;
        session.inputBuffer = edited;
        const was = curpos;
        curpos--;
        /**
         * A WRAPPED line is redrawn, not stepped back through.
         *
         * This prompt takes 255 characters (express.e:28624) and an
         * 80-column terminal wraps at 80, so the line routinely spans rows.
         * `\b` and `ESC[D` both stop dead at column 0, which left every
         * character on the first row impossible to delete - the sysop, on
         * the live board: "it wraps to the next line and i cant backspace
         * to delete on the first line". express has the same limit and no
         * answer to it, so this is a WEB_ deviation, asked for directly
         * ("yes make climb the wrap").
         *
         * rewrapEcho returns '' when the line fits on one row, and the
         * cheap BS-tail-space below runs exactly as before: a board does
         * not repaint a row for every keystroke.
         */
        /**
         * The menu line redraws from the cursor the prompt saved (ESC 7),
         * not from arithmetic. Width and column are exactly what this
         * feature kept getting wrong; the terminal knows both already.
         */
        const rewrap = ((session as any).petsciiMode === true
          || (session as any).promptCursorSaved !== true)
          ? ''
          : redrawFromSavedStart({ text: edited, curpos });
        if (rewrap) {
          emitText(socket, rewrap);
        } else {
          // Redraw: BS + tail + space (to erase last char position) + move cursor back
          emitText(socket, '\b' + tail + ' ' + '\x1b[D'.repeat(tail.length + 1));
        }
        (session as any)._readCommandCurpos = curpos;
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~' && (session.inputBuffer?.length ?? 0) < MAX_COMMAND_LINE) {
      const buf = session.inputBuffer;
      if (curpos === buf.length) {
        // Append at end (fast path)
        session.inputBuffer = buf + data;
        emitText(socket, data);
      } else {
        // Insert at cursor and redraw tail
        const tail = buf.slice(curpos);
        session.inputBuffer = buf.slice(0, curpos) + data + tail;
        emitText(socket, data + tail + '\x1b[D'.repeat(tail.length));
      }
      curpos++;
      (session as any)._readCommandCurpos = curpos;
    }
    // Reset curpos when buffer is empty (e.g., after submit)
    if (session.inputBuffer.length === 0) {
      (session as any)._readCommandCurpos = 0;
    }

    // Any edit that is not TAB ends the cycle: the candidate list is about
    // the word that was typed, and the word just changed.
    (session as any)._promptCycle = undefined;

    // The grey tail, redrawn after every change to the line. Only when the
    // cursor is at the END: mid-line editing has text to the right of the
    // cursor, and a suggestion drawn there would overwrite it.
    //
    // Costs nothing when no completer door is installed - promptGhost
    // returns '' and renderGhost emits a bare erase-to-end-of-line, which
    // is what the prompt would look like anyway.
    if ((session as any)._readCommandCurpos === session.inputBuffer.length) {
      const { promptGhost, renderGhost } = require('./command-handler/prompt-completion');
      const ghost = await promptGhost(config.get('dataDir'), session.inputBuffer);
      if (ghost || (session as any)._promptGhostShown) {
        emitText(socket, renderGhost(ghost));
        (session as any)._promptGhostShown = ghost.length > 0;
      }
    }
    return;
  } else if (session.subState === LoggedOnSubState.READ_SHORTCUTS) {
    // readChar equivalent: single-key input, translate, process command, then return to menu
    if (!session.cmdShortcuts || !session.shortcuts || session.shortcuts.size === 0) {
      session.subState = LoggedOnSubState.READ_COMMAND;
      await handleCommand(socket, session, data);
      return;
    }

    const keyRaw = data.length > 0 ? data[0] : '';
    if (!keyRaw) {
      return;
    }

    const translateKey = (val: string): string => {
      const ch = val.length > 0 ? val.charAt(0) : '';
      const code = ch.charCodeAt(0);
      switch (code) {
        case 13:
          return 'RET';
        case 127:
          return 'DEL';
        case 8:
          return 'BACK';
        case 9:
          return 'TAB';
        case 27:
          return 'ESC';
        case 32:
          return 'SPACE';
        default:
          return ch.toUpperCase();
      }
    };

    const key = translateKey(keyRaw);
    let translated = '';
    if (session.shortcuts && session.shortcuts.size > 0) {
      const lookup = session.shortcuts.get(key);
      if (lookup) {
        translated = lookup;
      }
    }

    const commandToRun = translated || key;
    // Execute shortcut command and return to menu
    session.commandText = commandToRun.toUpperCase();
    session.subState = LoggedOnSubState.PROCESS_COMMAND;
    await processCommand(socket, session, commandToRun, '');
    // Only reset to DISPLAY_MENU if the command didn't transition
    // into an interactive sub-flow (resume prompt, transfer, etc).
    // Without this guard the unconditional reset clobbered states
    // set by handlers like startResumeStuff, making their prompts
    // disappear immediately under the menu re-render.
    if (session.subState === LoggedOnSubState.PROCESS_COMMAND) {
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    }
    return;
  } else if (session.subState === LoggedOnSubState.PROCESS_COMMAND) {
    // Express.e:28639-28642 - Process the command with priority system
console.log(' In PROCESS_COMMAND state, executing command:', session.commandText);
    if (session.commandText) {
      const parts = session.commandText.split(' ');
      const command = parts[0];
      const params = parts.slice(1).join(' ');
      try {
        // Express.e:28244-28256 - Command priority: SysCommand  BbsCommand  InternalCommand
        const result = await processCommand(socket, session, command, params);
        if (result === 'NOT_ALLOWED') {
          // express.e:28647-28648 - menuPause:=TRUE, subState:=DISPLAY_MENU.
          // Audit B-4 flagged the previous shape (DISPLAY_CONF_BULL with
          // menuPause=false) — that dropped the user back at the
          // conference bulletin instead of the menu, and skipped the
          // menu pause that prevents prompt clobber.
          //
          // NO MESSAGE HERE. express.e's main loop (28646) discards
          // processCommand's result and prints nothing; higherAccess() is
          // called by whichever tier refused - express.e:4705 for a
          // SYSCMD/BBSCMD door, express.e:28400 for an internal command.
          // This line used to emit it as well, so a refused door said
          // "Command requires higher access." twice: once per tier.
          session.menuPause = true;
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          return;
        }
      } catch (error) {
console.error('Error processing command:', error);
        emitText(socket, '\r\n\x1b[31mError processing command.\x1b[0m\r\n');
        emitPrompt(socket, '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }
    }
    // After processing: If still in PROCESS_COMMAND, fall back to menu (express.e:28641-28642)
    if (session.subState === LoggedOnSubState.PROCESS_COMMAND) {
      showMenuAfterCommand(socket, session, true);
      return;
    }
    // Otherwise honor the command-changed subState (e.g., pause or door); menu loop will pick it up.
    return;
  } else if (session.subState === LoggedOnSubState.USER_STATS_MENU) {
    // Handle user stats menu input (F=Font, Q=Quit)
console.log(' In USER_STATS_MENU state, processing input');
    const { handleUserStatsMenuInput } = require('./commands/user-commands.handler');
    handleUserStatsMenuInput(socket, session, data);
    return;
  } else if (session.subState === LoggedOnSubState.FONT_SELECTION) {
    // Handle font selection input (1-8 or Q)
console.log(' In FONT_SELECTION state, buffering input');

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '').trim();
      session.inputBuffer = '';

      const { handleFontSelectionInput } = require('./commands/user-commands.handler');
      handleFontSelectionInput(socket, session, input);
    } else if (data === '\x7f') { // Backspace
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
    }
    return;
  } else if (session.subState === LoggedOnSubState.BULLETIN_INPUT) {
    // Handle bulletin input (number, ?, or Enter to exit)
console.log(' In BULLETIN_INPUT state, buffering input');

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Buffer characters until Enter is pressed
    if (data === '\r' || data === '\n') {
      const input = (session.inputBuffer || '');
      session.inputBuffer = '';
      emitText(socket, '\r\n');

      handleBulletinInputFromDisplayFileCommands(socket, session, input);
    } else if (data === '\x7f' || data === '\b') { // Backspace
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        emitText(socket, '\b \b');
      }
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      emitText(socket, data);
    }
    return;
   } else {
    if (
      session.subState === LoggedOnSubState.DISPLAY_MENU ||
      session.subState === LoggedOnSubState.ACCOUNT_EDITOR_MENU
    ) {
      session.subState = LoggedOnSubState.READ_COMMAND;
      // Actually display the menu when transitioning from DISPLAY_MENU
      session.menuPause = false;
      await displayMainMenu(socket, session);
      return;
    } else {
console.log(' Not in command input state, current subState:', session.subState, '- IGNORING COMMAND');
console.log('=== handleCommand end ===\n');
      return;
    }
  }
console.log('=== handleCommand end ===\n');
}

// express.e:17794+ — start the actual batch upload transfer after Okay confirm
function startBatchUploadTransfer(socket: any, session: BBSSession, goodbyeAfter: boolean): void {
  // Set the goodbye flag on tempData BEFORE the batch-length branch.
  // express.e:25657 — `IF stat=RESULT_GOODBYE THEN modemOffHook()`. The flag
  // must be honored regardless of whether files were pre-queued or whether
  // any actually transferred (express.e:19543-19547 checks gstat=2 after
  // upload completion, and pGoodbye fires whether or not bytes moved).
  // Earlier the flag was only set in the non-empty-batch path, so a user
  // who pressed Enter at "FileName 1:" then G saw "Goodbye!" but never
  // disconnected.
  if (session.tempData) {
    session.tempData.goodbyeAfterTransfer = goodbyeAfter;
  }
  // All transports — telnet, SSH, web — use ZMODEM via startZmodemUpload.
  // Web ZMODEM bridges through the `transfer-raw:*` socket channel to the
  // browser-side zmodem.js Sentry; telnet/SSH use their PTY directly.
  //
  // Prior to 2026-05-19 this path emitted `show-file-upload` for web,
  // routing through HTTP /api/upload + `file-upload-ready`. Phase 4
  // cleanup (c67e50385) removed the BBS-user branch of
  // `processFileUpload`, so the HTTP-picker path silently dropped every
  // file (logged 'unexpected invocation… Ignoring.'). The frontend then
  // waited forever for the next show-file-upload event and the UI
  // appeared stuck after picking >1 file. Unifying all transports onto
  // ZMODEM matches the handoff intent ("ZMODEM web unification").
  const { startZmodemUpload } = require('./commands/user-commands.handler');
  startZmodemUpload(socket, session);
}

// Command Priority System - Express.e:28228-28282
// Priority order: SysCommand  BbsCommand  InternalCommand

// Check for System Command (express.e:4813-4819)
export async function runSysCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  // Use the command-execution handler for SYSCMD lookup and execution
  const result = await execSysCommand(socket, session, command, params);

  // Convert numeric result codes to strings for compatibility
  if (result === 0) return 'SUCCESS';
  if (result === -2) return 'NOT_ALLOWED';
  return 'FAILURE';
}

// Check for BBS Command (express.e:4807-4811)
export async function runBbsCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  // Use the command-execution handler for BBSCMD lookup and execution
  const result = await execBbsCommand(socket, session, command, params);

  // Convert numeric result codes to strings for compatibility
  if (result === 0) return 'SUCCESS';
  if (result === -2) return 'NOT_ALLOWED';
  return 'FAILURE';
}

// Process command with priority system (express.e:28229-28257)
// allowSyscmd=FALSE matches express.e default: SYSCMD is never searched for interactive
// user menu input. Pass allowSyscmd=TRUE only for internal BBS system calls (batch
// scripts, AREXX, door callbacks, ~CC_ MCI codes) — express.e:28249.
export async function processCommand(socket: any, session: BBSSession, command: string, params: string, allowSyscmd: boolean = false, privcmd: boolean = false): Promise<string> {
  // Ignore command processing if no longer logged on (e.g., after logoff)
  if (session.state !== BBSState.LOGGEDON) {
    return 'IGNORED';
  }

  // Tell the admin's Activity feed what the user is doing.
  //
  // Only for commands this handles ITSELF. A command that turns out to name a
  // door is reported by the door's own entered/exited event, and emitting
  // here as well put every door in the feed twice - once as "Ran FROGGER in
  // Amiga Warez!" and again as "Started a game of FROGGER", which is the
  // better line of the two.
  //
  // The command NAME only - never `params`. A command line can carry a
  // password, this is broadcast to every admin socket, and anything written
  // to disk is displayed by the Configuration Files page.
  const reportCommand = () => {
    try {
      const { emitCommand } = require('../services/bbs-event-emitter');
      emitCommand({
        username: session.user?.username || 'Unknown',
        nodeId: Number(session.nodeId ?? 0),
        command: String(command || '').toUpperCase(),
        conferenceId: session.currentConference,
        timestamp: Date.now(),
      });
    } catch {
      // A feed that cannot be told must never stop the command running.
    }
  };

console.log(`[CommandPriority] Processing command: ${command} with params: ${params} allowSyscmd: ${allowSyscmd}`);

  // SPECIAL CASE: "J" command with numeric params should use internal handler directly
  // This handles RETURNCOMMAND "j 2" from JoinCnf door - it means "join conference 2"
  // NOT "run JoinCnf door again with arg 2" (which causes infinite loop/hang)
  // express.e behavior: J with number = direct join, J without params = show door/selection
  const trimmedParams = params.trim();
  if (command === 'J' && trimmedParams && /^\d+(\.\d+)?$/.test(trimmedParams)) {
console.log(`[CommandPriority] J with numeric param "${trimmedParams}" - using internal handler directly`);
    reportCommand();
    await processBBSCommand(socket, session, command, params);
    // After join completes, trigger display flow to show menu
    // Clear skipNextDisplayFlowMenu flag that may have been set by previous menu display
    session.skipNextDisplayFlowMenu = false;
    if (isDisplayFlowState(session.subState)) {
      await advanceDisplayFlow(socket, session);
    }
    return 'SUCCESS';
  }

  // WIDTH-GATE FALL-THROUGH (open backlog 11.1, sysop-decided 2026-09-06).
  //
  // The bug: `Commands/BBSCmd/f.info`, `fr.info` and `scan.info` register the
  // 68K door AquaScan over F/FR/N/Z, BBSCMD is asked before the internal
  // switch (express.e:28228), and executeDoor's MIN_COLUMNS gate then refuses
  // the door to a 40-column PETSCII caller. The command ENDED there - notice,
  // menu - even though this board renders those listings at 40 columns one
  // tier below. Three days of "I cannot list files on my C64".
  //
  // Where the decision lives, and why here. Not at the gate: executeDoor is
  // also entered from the DOORS menu, a ~CC_ screen command and login-post,
  // and firing an internal handler from inside a door launcher would change
  // all of those too. Not inside `runBbsCommand`'s numeric contract either:
  // that signature is shared with SYSCMD, PWFAIL and a door's RETURNCOMMAND,
  // which have no next tier to fall to. It belongs HERE, in the one function
  // that owns express.e's SYSCMD -> BBSCMD -> internal priority: a door the
  // width gate refused simply did not execute the command, so priority falls
  // through to the tier below, exactly as a missing registration would.
  //
  // The predicate is not re-derived. `executeDoor`'s gate stays the only
  // answer to "is this door too narrow"; it reports through
  // session.widthGateFallThrough, which is armed only for the launch this
  // dispatcher initiates.
  //
  // NO internal equivalent -> nothing is armed -> the gate prints
  // THIS DOOR NEEDS AN 80 COLUMN SCREEN and returns to the menu, byte for
  // byte as before. A refusal never becomes silence. The membership test is
  // INTERNAL_COMMAND_NAMES, which `tests/handlers/prompt-completion.test.ts`
  // re-parses out of processBBSCommand's own switch below, so this is the
  // switch answering for itself rather than a second list to keep in step.
  const hasInternalEquivalent = INTERNAL_COMMAND_NAMES.includes(
    String(command || '').toUpperCase()
  );
  const widthGateRefused = () => session.widthGateFallThrough === 'REFUSED';
  const runInternalTier = async (): Promise<string> => {
    reportCommand();
    // express.e:28256 - `ENDPROC processInternalCommand(cmdcode,cmdparams)`:
    // processCommand hands the internal tier's result straight back to its
    // caller. RESULT_NOT_ALLOWED has already spoken for itself inside
    // processBBSCommand (express.e:28400); this only carries the outcome so
    // the PROCESS_COMMAND loop can pause the menu.
    const res = await processBBSCommand(socket, session, command, params, privcmd);
    return res === RESULT_NOT_ALLOWED ? 'NOT_ALLOWED' : 'SUCCESS';
  };

  // Both answers are armed, because the gate cannot work either out for
  // itself: 'ARMED' says "there is a tier below, report instead of printing",
  // 'NO_EQUIVALENT' says "there is not, so say so as well as printing". A
  // route into executeDoor that is not a typed command (the DOORS menu, a
  // ~CC_ screen command, login-post) arms neither and refuses exactly as it
  // always did. Which of the two a name gets is INTERNAL_COMMAND_NAMES'
  // answer, the same list the switch below is re-parsed into.
  session.widthGateFallThrough = hasInternalEquivalent ? 'ARMED' : 'NO_EQUIVALENT';

  try {
    // Try SysCommand first — only when allowSyscmd=TRUE (express.e:28249)
    // Interactive user menu input always uses allowSyscmd=FALSE (express.e:28229 default)
    if (allowSyscmd) {
      const sysResult = await runSysCommand(socket, session, command, params);
      if (widthGateRefused()) {
console.log('[CommandPriority] SysCommand door refused by the width gate - falling through to InternalCommand');
        return await runInternalTier();
      }
      if (sysResult === 'SUCCESS') {
console.log('[CommandPriority] Executed as SysCommand');
        return 'SUCCESS';
      }
      if (sysResult === 'NOT_ALLOWED') {
console.log('[CommandPriority] SysCommand denied by permissions');
        return 'NOT_ALLOWED';
      }
    }

    /*
     * A TELETEXT CALLER TAKES THE BOARD'S OWN SCREEN OVER AN ADAPTED DOOR.
     *
     * The frame adapter makes a wide 68K door LEGIBLE at forty columns: it
     * replays the door's frames onto a virtual grid and reduces each one.
     * What it cannot do is make the door teletext. A teletext caller who
     * types J got Joincnf's eighty-column ANSI banner squeezed to forty,
     * while this board's own conference page - drawn in mosaics, headed like
     * a teletext page - sat one tier below and was never reached (sysop,
     * 2026-09-14: "the j door ... looks like it did before").
     *
     * So for a teletext session the internal tier wins any command it has an
     * equivalent for. Only teletext: a C64 caller keeps every adapted door
     * exactly as today, because this board has PETSCII art for almost
     * nothing and an adapted door beats no door at all. When the .seq art
     * exists, the same clause can take `petscii`.
     *
     * A command with NO internal equivalent still runs its door, adapted, as
     * it always has - this is a preference between tiers, never a refusal.
     */
    if (hasInternalEquivalent && displayModeOf(session as any) === 'teletext') {
console.log('[CommandPriority] Teletext caller - the board\'s own screen outranks an adapted door');
      return await runInternalTier();
    }

    // Try BbsCommand second
    const bbsResult = await runBbsCommand(socket, session, command, params);
    if (widthGateRefused()) {
console.log('[CommandPriority] BbsCommand door refused by the width gate - falling through to InternalCommand');
      return await runInternalTier();
    }
    if (bbsResult === 'SUCCESS') {
console.log('[CommandPriority] Executed as BbsCommand');
      return 'SUCCESS';
    }
    if (bbsResult === 'NOT_ALLOWED') {
console.log('[CommandPriority] BbsCommand denied by permissions');
      return 'NOT_ALLOWED';
    }

    // Try InternalCommand last
console.log('[CommandPriority] Trying as InternalCommand');
    return await runInternalTier();
  } finally {
    // The arm belongs to this dispatch and nothing else: a command that never
    // reached a door must not leave it set for the next launch on this session.
    session.widthGateFallThrough = undefined;
  }
}

/**
 * The internal command tier - express.e:28285-28402 processInternalCommand().
 *
 * express.e splits this into a body and a tail, and so does this port:
 *
 *   PROC processInternalCommand(cmdcode,cmdparams,privcmd=FALSE)
 *     ...res := internalCommandXXX(...)...          <- dispatchInternalCommand
 *     IF ((res=RESULT_NOT_ALLOWED) AND (privcmd=FALSE)) THEN higherAccess()
 *   ENDPROC res                                     <- express.e:28400
 *
 * The tail is the whole point. Not one internalCommandXXX prints anything
 * when it refuses - they are all a bare
 * `IF checkSecurity(...)=FALSE THEN RETURN RESULT_NOT_ALLOWED` - so the
 * caller's "Command requires higher access." comes from here, once, whichever
 * internal command was refused. Before this existed the switch returned
 * `void`, RESULT_NOT_ALLOWED had nowhere to go, and eight handlers invented
 * their own "Permission denied." / "Access denied." instead.
 *
 * `privcmd` is express.e's suppression flag: TRUE when the command was NOT
 * typed by the user. `session.executingScreenCommand` (a ~CC_ / ~XC_ / ~XI
 * screen command) is the same condition and is folded in, which is also what
 * gates express.e:28397's "No such command!!" at the bottom of the switch.
 * It matters beyond tidiness: a hidden sysop command fired from a screen or a
 * door must not answer an ordinary caller with "Command requires higher
 * access.", because that answer tells him the command exists.
 *
 * @returns RESULT_NOT_ALLOWED if the command refused the caller, else void.
 */
export async function processBBSCommand(
  socket: any,
  session: BBSSession,
  command: string,
  params: string = '',
  privcmd: boolean = false
): Promise<InternalCommandResult> {
  const res = await dispatchInternalCommand(socket, session, command, params);

  // express.e:28400. The message and nothing else: `menuPause` and the return
  // to DISPLAY_MENU stay in the PROCESS_COMMAND loop (express.e:28647-28648),
  // which runs for every command however it ended.
  if (res === RESULT_NOT_ALLOWED && !(privcmd || session.executingScreenCommand)) {
    higherAccess(socket);
  }

  return res;
}

async function dispatchInternalCommand(
  socket: any,
  session: BBSSession,
  command: string,
  params: string = ''
): Promise<InternalCommandResult> {
  /*
   * express.e's `commandText` - the line the caller actually typed - which
   * `customMsgbaseCmd(..., passCmdLine=1)` hands to a conference's message-base
   * door (express.e:12427-12428). `R 42` must reach the door as `R 42`, or it
   * opens on the wrong message.
   */
  const commandLine = params ? `${command} ${params}` : command;

  const { tryCustomMsgbase, MailFunction } = require('../services/custom-msgbase');
  // Real AmiExpress prints command responses inline (no clear-between-commands).
  // We previously emitted a 30-line "soft clear" here so prior content scrolled
  // into xterm.js scrollback before the next response — but that left a column
  // of empty lines between every prompt and its response. Commands that genuinely
  // need a clear (e.g. menu redraw, CONFTOP banner, screen-file display) emit
  // their own ~f / ESC[2J / displayScreen() — they don't rely on this.

  // Map commands to internalCommandX functions from AmiExpress
  switch (command) {
    case 'D': // Download File(s) (internalCommandD) - express.e:24853-24857
      const { DownloadHandler } = require('./file/download.handler');
      await DownloadHandler.handleDownloadCommand(socket, session, params);
      return;

    case 'DS': // Download with Status (internalCommandD with DS flag) - express.e:28302-28303
      await handleDownloadWithStatusCommand(socket, session, params);
      return;

    case 'DB': // Download Batch - Download all flagged files
      const { BatchDownloadHandler } = require('./transfer/batch-download.handler');
      // express.e's `res:=internalCommandXXX(...)` - the refusal travels out
      // as a result code and processBBSCommand prints it once (28400).
      return await BatchDownloadHandler.handleBatchDownload(socket, session);

    case 'U': // Upload File(s) (internalCommandU) - express.e:25646-25658
      // Awaited: it shows NoUploads/UploadMsg before the interface, and
      // firing it off would race the screen against the prompt.
      await handleUploadCommand(socket, session);
      return;

    case 'UP': // Upload Status / Node Uptime (internalCommandUP) - express.e:25667
      handleNodeUptimeCommand(socket, session);
      return;

    case 'US': // Sysop Upload (internalCommandUS) - express.e:25660-25665
      handleSysopUploadCommand(socket, session, params);
      return;

    case '0': // Remote Shell (internalCommand0) - express.e:24424-24451
      handleRemoteShellCommand(socket, session);
      return;

    case '1': // Account Editing (internalCommand1) - express.e:24453-24459
      handleAccountEditingCommand(socket, session);
      return;

    case '2': // View Callers Log (internalCommand2) - express.e:24461-24509
      await handleCallersLogCommand(socket, session, params);
      return;

    case '3': // Edit Directory Files (internalCommand3) - express.e:24511-24515
      handleEditDirectoryFilesCommand(socket, session, params);
      return;

    case '4': // Edit Any File (internalCommand4) - express.e:24517-24521
      handleEditAnyFileCommand(socket, session, params);
      return;

    case '5': // Change Directory (internalCommand5) - express.e:24523-24527
      handleChangeDirectoryCommand(socket, session, params);
      return;

    case 'MS': // Mail Scan (internalCommandMS) - express.e:25250-25279
      handleMailScanCommand(socket, session);
      return;

    case 'OLM': // Online Message (internalCommandOLM) - express.e:25406-25503
      const { handleOlmCommand: handleOlm } = require('./transfer/olm.handler');
      // express.e:28359 - `res:=internalCommandOLM(cmdparams)`
      return await handleOlm(socket, session, params);

    case 'LIVECHAT': // Modern Real-Time Internode Chat (Enhancement)
console.log(' BEFORE calling handleLiveChatCommand, params:', params);
      try {
        await handleLiveChatCommand(socket, session, params);
console.log(' AFTER calling handleLiveChatCommand successfully');
      } catch (error) {
console.error(' ERROR in handleLiveChatCommand:', error);
        throw error;
      }
      return;

    case 'ROOM': // Group Chat Rooms (Modern Enhancement)
      const { handleRoomCommand } = require('./chat/room-commands.handler');
      await handleRoomCommand(socket, session, params);
      return;

    case 'Q': // Quiet Mode / Block OLM (internalCommandQ) - express.e:25505-25515
      const { handleQuietCommand } = require('./transfer/olm.handler');
      // express.e:28361 - `res:=internalCommandQ()`
      return await handleQuietCommand(socket, session);

    case 'RL': // RELOGON (internalCommandRL) - express.e:25534-25539
      handleRelogonCommand(socket, session, params);
      return;

    case 'RZ': // Zmodem Upload Command (internalCommandRZ) - express.e:25608-25621
      handleZmodemUploadCommand(socket, session);
      return;

    case 'S': // User Statistics (internalCommandS) - express.e:25540-25568
      handleUserStatsCommand(socket, session);
      return;

    case 'V': // View a Text File (internalCommandV) - express.e:25675-25687
      const { ViewFileHandler } = require('./content/view-file.handler');
      // express.e:28373 - `res:=internalCommandV(cmdcode,cmdparams)`
      return await ViewFileHandler.handleViewFileCommand(socket, session, params);

    case 'VS': // View Statistics - Same as V command (internalCommandV) - express.e:28376
      const { ViewFileHandler: ViewFileHandler2 } = require('./content/view-file.handler');
      // express.e:28377 - `res:=internalCommandV(cmdcode,cmdparams)`
      return await ViewFileHandler2.handleViewFileCommand(socket, session, params);

    case 'VO': // Voting Booth (internalCommandVO) - express.e:25700-25710
      await handleVotingBoothCommand(socket, session);
      return;

    case 'VER': // View ami-express version information (internalCommandVER) - express.e:25688-25699
      handleVersionCommand(socket, session);
      return;

    case 'W': // Write User Parameters (internalCommandW) - express.e:25712-25785
      handleWriteUserParamsCommand(socket, session);
      return;

    case 'WHO': // Node Information (internalCommandWHO) - express.e:26094-26102
      // The comment that used to sit here said WHO "should use a BBSCMD door
      // instead ... calls who(0) which launches door". express.e:24204's
      // `who(opt)` is an ordinary internal procedure that walks the node ports
      // and prints them - it launches nothing. And WHD, right below, is the
      // SAME procedure with opt=1: the board shipped the detailed variant and
      // hid the plain one, from one function in express.
      handleWhoCommand(socket, session);
      return;

    case 'WHD': // Who's Online - Detailed (internalCommandWHD) - express.e:26104-26112
      handleWhoDetailedCommand(socket, session);
      return;

    case 'COLOURS': { // WEB_: which sixteen colours his PETSCII screen uses
      const { handlePetsciiPaletteCommand } = require('./commands/user-commands.handler');
      await handlePetsciiPaletteCommand(socket, session, params);
      return;
    }

    case 'X': // Expert Mode Toggle (internalCommandX) - express.e:26113-26122
      await handleExpertModeCommand(socket, session);
      return;

    case 'Z': // Zippy Text Search (internalCommandZ) - express.e:26123-26213
      const { ZippySearchHandler } = require('./content/zippy-search.handler');
      // express.e:28389 - `res:=internalCommandZ(cmdparams)`
      return await ZippySearchHandler.handleZippySearchCommand(socket, session, params);

    case 'ZOOM': // Zoo Mail (internalCommandZOOM) - express.e:26215-26240
      await handleZoomCommand(socket, session);
      return;

    case 'R': // Read Messages (internalCommandR) - express.e:25518-25531
      // express.e:25525-25530 - a CUSTOM conference's message base is a door,
      // and reading it is that door's job (MAIL_READ).
      if (await tryCustomMsgbase(socket, session, MailFunction.READ, commandLine)) return;
      await handleReadMessagesFullCommand(socket, session, params);
      return;

    case 'A': // Alter Flags (file flagging) (internalCommandA) - express.e:24601-24605
      // express.e:28333 - `res:=internalCommandA(cmdparams)`
      return await handleAlterFlagsCommand(socket, session, params);

    case 'E': // Enter Message (internalCommandE) - express.e:24860-24872
      // express.e:24864-24869 - MAIL_CREATE, for the same reason.
      if (await tryCustomMsgbase(socket, session, MailFunction.CREATE, commandLine)) return;
      handleEnterMessageFullCommand(socket, session, params);
      return;

    case 'EALL': // Enter Message to EALL — equivalent to 'E EALL' (express.e:10800-10816)
      if (await tryCustomMsgbase(socket, session, MailFunction.CREATE, 'E EALL')) return;
      handleEnterMessageFullCommand(socket, session, 'EALL');
      return;

    case '<': // Previous Conference (internalCommandLT) - express.e:24529-24546
      // express.e:28323 - `res:=internalCommandLT()`
      return await handlePreviousConferenceCommand(socket, session);

    case '>': // Next Conference (internalCommandGT) - express.e:24548-24564
      // express.e:28327 - `res:=internalCommandGT()`
      return await handleNextConferenceCommand(socket, session);

    case '<<': // Previous Message Base (internalCommandLT2) - express.e:24566-24578
      await handlePreviousMessageBaseCommand(socket, session);
      return;

    case '>>': // Next Message Base (internalCommandGT2) - express.e:24580-24592
      await handleNextMessageBaseCommand(socket, session);
      return;

    case 'J': // Join Conference (internalCommandJ) - express.e:25113-25183
      await handleJoinConferenceCommand(socket, session, params);
      return;

    case 'JM': // Join Message Base (internalCommandJM) - express.e:25185-25238
      handleJoinMessageBaseCommand(socket, session, params);
      return;

    case 'F': // File Listings (internalCommandF) - express.e:24877-24881
      await handleFileListCommand(socket, session, params);
      return;

    case 'FR': // File Listings Raw (internalCommandFR) - express.e:24883-24887
      await handleFileListRawCommand(socket, session, params);
      return;

    case 'FI': // FILE INFO - one record from the last listing, on its own
      // screen. A C64 list row is identity fields at fixed columns and carries
      // no description, so this is where a caller reads what a file IS; the
      // ordinal the list prints is the argument. WEB-only: express.e has no
      // FI, because an 80-column listing already shows the description under
      // every record.
      {
        const { FileListingHandler } = require('./file/file-listing.handler');
        await FileListingHandler.handleFileInfoCommand(socket, session, params);
      }
      return;

    case 'FM': // File Maintenance (internalCommandFM) - express.e:24889-25045
      await FileMaintenanceHandler.handleFileMaintenanceCommand(socket, session, params);
      return;

    case 'FS': // File Status (internalCommandFS) - express.e:24872-24875
      await handleFileStatusCommand(socket, session);
      return;

    case 'N': // New Files (internalCommandN) - express.e:25275-25279
      await handleNewFilesCommand(socket, session, params);
      return;

    case 'O': // Page Sysop (internalCommandO) - express.e:25372-25404
      await handlePageSysopCommand(socket, session, socket.server);
      return;


    case 'T': // Time/Date Display (internalCommandT) - express.e:25622-25644
      handleTimeCommand(socket, session);
      return;

    case 'B': // Read Bulletin (internalCommandB) - express.e:24607-24656
      handleReadBulletinCommand(socket, session, params);
      return;

    case 'H': // Help (internalCommandH) - express.e:25075-25087
      handleHelpCommand(socket, session, params);
      return;

    case 'M': // Toggle ANSI Color (internalCommandM) - express.e:25239-25248
      handleAnsiModeCommand(socket, session);
      return;

    case 'NM': // Node Management (SYSOP) (internalCommandNM) - express.e:25281-25370
      handleNodeManagementCommand(socket, session);
      return;

    case 'CM': // Conference Maintenance (SYSOP) (internalCommandCM) - express.e:24843-24852
      await handleConferenceMaintenanceCommand(socket, session);
      return;

    case 'WEBHOOK': // Webhook Management (SYSOP) - Custom web command
      await WebhookCommandsHandler.handleWebhookCommand(socket, session);
      return;

    case 'LINKDISCORD': // Discord link code (WHIP mirror bot) - WEB_: no express.e counterpart
      await DiscordLinkCommandsHandler.handleLinkDiscordCommand(socket, session);
      return;

    case 'G': // Goodbye/Logoff (internalCommandG) - express.e:25047-25075
      handleGoodbyeCommand(socket, session, params);
      return;

    case 'GR': // Greetings (internalCommandGreets) - express.e:24411-24423
      handleGreetingsCommand(socket, session);
      return;

    case 'C': // Comment to Sysop (internalCommandC) - express.e:24658-24670
      // express.e:24664-24668 - MAIL_SYSOP_COMMENT. The door writes the
      // private message; the board's commentToSYSOP is for everybody else.
      if (await tryCustomMsgbase(socket, session, MailFunction.SYSOP_COMMENT, commandLine)) return;
      handleCommentToSysopCommand(socket, session, params);
      return;

    case 'CF': // Conference Flags (internalCommandCF) - express.e:24672-24841
      await handleConferenceFlagsCommand(socket, session);
      return;

    // (audit B-5) A second `case 'Q'` sat here and could never run: switch
    // dispatch takes the first match, which is the express.e:25505-25515 1:1
    // implementation above (handleQuietCommand, transfer/olm.handler). This
    // one routed to a stale handleQuietModeCommand alias.
    //
    // It was removed from command-handler/command-execution.ts - a DIFFERENT
    // live dispatcher - and left here, in the file server/initialization.ts
    // actually wires. That is the shape of half the findings in this audit.


    case '?': // Show Menu in Expert Mode (internalCommandQuestionMark) - express.e:24594-24599
      await handleQuestionMarkCommand(socket, session);
      return;

    case '^': // Upload Hat / Help Files (internalCommandUpHat) - express.e:25089-25111
      handleHelpFilesCommand(socket, session, params);
      return;

    // WEB_: TTX is the typable alias for ^ (help files). PETSCII has no ^
    // glyph at all, and phone keyboards bury it - without an alias a C64
    // caller can never ask for a help screen. Same handler, same params.
    case 'TTX':
      handleHelpFilesCommand(socket, session, params);
      return;

    // === CUSTOM WEB COMMANDS (Not in express.e) ===
    case 'AG': { // AmigaGuide reader - a door's own documentation, on the board
      const { handleAmigaGuideCommand } = require('./commands/amigaguide-commands.handler');
      await handleAmigaGuideCommand(socket, session, params);
      return;
    }

    case 'DOORS': // Door Games Menu - lists doors with arrow key navigation
      await displayDoorMenu(socket, session, params);
      return;

    // NOTE: Test door commands (GA, MULTITOP, WH) removed - door-specific hacks
    // Doors should be accessed through proper door system:
    // 1. Register door with .info file in Commands/
    // 2. Access via door menu (DOORS command) or command matching below

    default:
      // express.e:28228 - Command priority:
      // 1. SysCommand (SYSCMD) - system-level commands
      // 2. BbsCommand (BBSCMD) - door commands
      // 3. InternalCommand - built-in commands (already handled above)
      //
      // Check if command matches a door (BBSCMD)
console.log(`[Command Handler] Checking for door match: "${command}"`);
console.log(`[Command Handler] Available doors: ${getDoors().length}`);
      if (getDoors().length > 0) {
console.log(`[Command Handler] Sample door commands: ${getDoors().slice(0, 5).map(d => d.command).join(', ')}`);
      }

      const matchingDoor = getDoors().find(door =>
        door.command.toLowerCase() === command.toLowerCase()
      );

      if (matchingDoor) {
        // Execute the door
console.log(`[Command Handler] Found matching door: ${matchingDoor.name}`);
        await executeDoor(socket, session, matchingDoor);
        return;
      }

      // No matching door - unknown command
console.log(`[Command Handler] No matching door found for: ${command}`);

      // Sysop debug message (appears after "Unknown command" and before "Press any key")
      SysopDebugUtil.debug(
        socket,
        session,
        'COMMAND',
        `Command not found: ${command}`,
        { attemptedCommand: command },
        DebugSeverity.INFO
      );

      // Only show error message if NOT a screen-initiated command (~CC_, ~XI)
      // Screen commands should fail silently - user didn't explicitly type them
      if (!session.executingScreenCommand) {
        // express.e:28397 - "No such command!!  Use '?' for command list."
        emitText(socket, `\r\nNo such command!!  Use '?' for command list.\r\n\r\n`);
        // express.e:28647-28648 - After command, menuPause=TRUE, subState=DISPLAY_MENU
        session.menuPause = true;
        session.subState = LoggedOnSubState.DISPLAY_MENU;
      }
      break;
  }

  // Note: State transition is handled by PROCESS_COMMAND handler in handleCommand
  // Commands that use 'return' will skip this point
  // Commands that use 'break' or fall through will reach here
  // If no subState was set, PROCESS_COMMAND handler will default to DISPLAY_MENU
}
