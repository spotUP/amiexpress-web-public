/**
 * Navigation Commands Handler - Conference/message base navigation and utilities
 *
 * Implements navigation and utility commands from express.e:
 * - T: Time/Date display (internalCommandT - express.e:25622-25644)
 * - N: New Files (internalCommandN - express.e:25275-25279)
 * - <: Previous Conference (internalCommandLT - express.e:24529-24546)
 * - >: Next Conference (internalCommandGT - express.e:24548-24564)
 * - <<: Previous Message Base (internalCommandLT2 - express.e:24566-24578)
 * - >>: Next Message Base (internalCommandGT2 - express.e:24580-24592)
 */

import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { finalizeCommand } from '../../utils/command-response.util';
import { getSystemTime } from '../../utils/date-time.util';
import { formatDateDash } from '../../utils/date-format.util';

import type { BBSSession } from '../../index';

interface Conference {
  id: number;
  name: string;
}

interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
}

// Injected dependencies
let _conferences: Conference[] = [];
let _messageBases: MessageBase[] = [];
let _joinConference: (socket: any, session: BBSSession, confId: number, msgBaseId: number) => Promise<boolean>;
let _checkConfAccess: (user: any, confNum: number) => boolean;
let _displayNewFiles: (socket: any, session: BBSSession, params: string) => Promise<void>;

// Injection function
export function setNavigationCommandsDependencies(deps: {
  conferences: Conference[];
  messageBases: MessageBase[];
  joinConference: typeof _joinConference;
  checkConfAccess: typeof _checkConfAccess;
  displayNewFiles: typeof _displayNewFiles;
}) {
  _conferences = deps.conferences;
  _messageBases = deps.messageBases;
  _joinConference = deps.joinConference;
  _checkConfAccess = deps.checkConfAccess;
  _displayNewFiles = deps.displayNewFiles;
}

/**
 * Handle T command - Time/Date Display
 * 1:1 port from express.e:25622-25644 internalCommandT()
 */
export function handleTimeCommand(socket: any, session: BBSSession): void {
  // express.e:25625-25627 - DateStamp(dt.stamp)
  const now = getSystemTime();

  // express.e:25629 - dt.format:=FORMAT_USA (MM-DD-YY format)
  // express.e:25632-25633 - dt.strdate:=datestring, dt.strtime:=timestring
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const dateString = `${month}-${day}-${year}`;

  // AmigaOS FORMAT_USA time is HH:MM:SS (24-hour)
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timeString = `${hours}:${minutes}:${seconds}`;

  // express.e:25636-25640 - aePuts('\b\nIt is ') + datestring + ' ' + timestring + '\b\n'
  socket.emit('ansi-output', '\r\nIt is ');
  socket.emit('ansi-output', dateString);
  socket.emit('ansi-output', ' ');
  socket.emit('ansi-output', timeString);
  socket.emit('ansi-output', '\r\n');

  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Handle N command - New Files
 * 1:1 port from express.e:25275-25279 internalCommandN()
 */
export async function handleNewFilesCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  // express.e:25276 - Check ACS_FILE_LISTINGS permission
  if (!checkSecurity(session.user, ACSPermission.FILE_LISTINGS)) {
    ErrorHandler.permissionDenied(socket, 'view file listings', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25278 - setEnvStat(ENV_FILES)
console.log('[ENV] Files - New Files');

  // express.e:25279 - myNewFiles(params)
  if (_displayNewFiles) {
    await _displayNewFiles(socket, session, params);
    // displayNewFiles handles its own pause/prompt and state management
  } else {
    // Fallback: implement new files display inline (express.e:27831-28023)
    await handleNewFilesDisplay(socket, session);
  }
}

/**
 * Display new files since last login or specified date
 * express.e:27831-28023 myNewFiles()
 */
async function handleNewFilesDisplay(socket: any, session: BBSSession): Promise<void> {
  const { db } = require('../../database');
  const { AnsiUtil } = require('../../utils/ansi.util');

  socket.emit('ansi-output', '\r\n');

  // express.e:27850-27853 - Check if conference has file areas
  const conferenceId = session.currentConference || 1;
  const fileAreas = await db.getFileAreas(conferenceId);

  if (fileAreas.length === 0) {
    // express.e myError(ERR_NOFILES=5): 'No files available in this conference.\b\n\b\n'
    socket.emit('ansi-output', 'No files available in this conference.\r\n\r\n');
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // express.e:27855 - Use user's last login date as default
  const lastLogin = session.user.lastLogin || new Date(0);
  const defaultDate = formatDate(lastLogin);

  socket.emit('ansi-output', `Date as (mm-dd-yy) to search from (Enter)=${defaultDate}: `);

  // For now, use default date (in full implementation would wait for user input)
  // This matches "S" parameter behavior in express.e:27862-27863
  const searchDate = lastLogin;

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `Directory Scan for (${defaultDate})\r\n\r\n`);

  // express.e:27906-28019 - Loop through file areas and display new files
  let filesFound = 0;

  for (const area of fileAreas) {
    socket.emit('ansi-output', `Scanning ${area.name}...\r\n`);

    // Get all files in this area uploaded after search date
    const files = await db.getFilesByArea(area.id);
    const newFiles = files.filter((f: any) => new Date(f.uploadDate) >= searchDate);

    if (newFiles.length > 0) {
      for (const file of newFiles) {
        // express.e:27993-27994 - Display file information
        const fileDate = formatDate(new Date(file.uploadDate));
        const fileSize = formatFileSize(file.size);
        const desc = file.description || '';

        socket.emit('ansi-output', `  ${file.filename.padEnd(20)} ${fileSize.padStart(10)} ${fileDate} ${desc}\r\n`);
        filesFound++;
      }
      socket.emit('ansi-output', '\r\n');
    }
  }

  if (filesFound === 0) {
    socket.emit('ansi-output', 'No new files found.\r\n');
  } else {
    socket.emit('ansi-output', `\r\nTotal new files: ${filesFound}\r\n`);
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

// formatDate imported from '../../utils/date-format.util' as formatDateDash
const formatDate = formatDateDash;

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)}MB`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  } else {
    return `${bytes}B`;
  }
}

/**
 * Handle < command - Previous Conference
 * 1:1 port from express.e:24529-24546 internalCommandLT()
 */
export async function handlePreviousConferenceCommand(socket: any, session: BBSSession): Promise<void> {
  // express.e:24530 - Check ACS_JOIN_CONFERENCE permission
  if (!checkSecurity(session.user, ACSPermission.JOIN_CONFERENCE)) {
    ErrorHandler.permissionDenied(socket, 'join conference', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:24531 - saveMsgPointers(currentConf, currentMsgBase)
  // This is handled by joinConference function

  // express.e:24533 - setEnvStat(ENV_JOIN)
console.log('[ENV] Join - Previous Conference');

  // express.e:24534-24538 - Find previous accessible conference
  let newConf = (session.currentConf || 1) - 1;

  while (newConf > 0 && !_checkConfAccess(session.user, newConf)) {
    newConf--;
  }

  // express.e:24540-24544 - Join conference or prompt if none found
 if (newConf < 1) {
    // Mirror express.e: fall back to J prompt when no previous conference
    const { handleJoinConferenceCommand } = require('./user-commands.handler');
    await handleJoinConferenceCommand(socket, session, '');
    return;
  } else {
    // Get first message base in conference
    const confMessageBases = _messageBases.filter(mb => mb.conferenceId === newConf);
    const msgBaseId = confMessageBases.length > 0 ? confMessageBases[0].id : 1;

    await _joinConference(socket, session, newConf, msgBaseId);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

/**
 * Handle > command - Next Conference
 * 1:1 port from express.e:24548-24564 internalCommandGT()
 */
export async function handleNextConferenceCommand(socket: any, session: BBSSession): Promise<void> {
  // express.e:24549 - Check ACS_JOIN_CONFERENCE permission
  if (!checkSecurity(session.user, ACSPermission.JOIN_CONFERENCE)) {
    ErrorHandler.permissionDenied(socket, 'join conference', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:24550 - saveMsgPointers(currentConf, currentMsgBase)
  // This is handled by joinConference function

  // express.e:24552 - setEnvStat(ENV_JOIN)
console.log('[ENV] Join - Next Conference');

  // express.e:24553-24557 - Find next accessible conference
  let newConf = (session.currentConf || 1) + 1;
  const numConferences = _conferences.length;

  while (newConf <= numConferences && !_checkConfAccess(session.user, newConf)) {
    newConf++;
  }

  // express.e:24559-24563 - Join conference or prompt if none found
  if (newConf > numConferences) {
    // Mirror express.e: fall back to J prompt when no next conference
    const { handleJoinConferenceCommand } = require('./user-commands.handler');
    await handleJoinConferenceCommand(socket, session, '');
    return;
  } else {
    // Get first message base in conference
    const confMessageBases = _messageBases.filter(mb => mb.conferenceId === newConf);
    const msgBaseId = confMessageBases.length > 0 ? confMessageBases[0].id : 1;

    await _joinConference(socket, session, newConf, msgBaseId);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

/**
 * Handle << command - Previous Message Base
 * 1:1 port from express.e:24566-24578 internalCommandLT2()
 */
export async function handlePreviousMessageBaseCommand(socket: any, session: BBSSession): Promise<void> {
  // express.e:24567 - saveMsgPointers(currentConf, currentMsgBase)
  // This is handled by joinConference function

  // express.e:24569 - setEnvStat(ENV_JOIN)
console.log('[ENV] Join - Previous Message Base');

  // express.e:24570 - Get previous message base
  const currentConfId = session.currentConf || 1;
  const confMessageBases = _messageBases.filter(mb => mb.conferenceId === currentConfId);

  // Find current message base index
  const currentIndex = confMessageBases.findIndex(mb => mb.id === session.currentMsgBase);
  const newIndex = currentIndex - 1;

  // express.e:24572-24576 - Join previous message base or prompt
  if (newIndex < 0) {
    // Mirror express.e: fall back to JM prompt
    const { handleJoinMessageBaseCommand } = require('./message-commands.handler');
    handleJoinMessageBaseCommand(socket, session, '');
    return;
  } else {
    const newMsgBase = confMessageBases[newIndex];
    await _joinConference(socket, session, currentConfId, newMsgBase.id);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

/**
 * Handle >> command - Next Message Base
 * 1:1 port from express.e:24580-24592 internalCommandGT2()
 */
export async function handleNextMessageBaseCommand(socket: any, session: BBSSession): Promise<void> {
  // express.e:24581 - saveMsgPointers(currentConf, currentMsgBase)
  // This is handled by joinConference function

  // express.e:24583 - setEnvStat(ENV_JOIN)
console.log('[ENV] Join - Next Message Base');

  // express.e:24584 - Get next message base
  const currentConfId = session.currentConf || 1;
  const confMessageBases = _messageBases.filter(mb => mb.conferenceId === currentConfId);

  // Find current message base index
  const currentIndex = confMessageBases.findIndex(mb => mb.id === session.currentMsgBase);
  const newIndex = currentIndex + 1;

  // express.e:24586-24590 - Join next message base or prompt
  if (newIndex >= confMessageBases.length) {
    // Mirror express.e: fall back to JM prompt
    const { handleJoinMessageBaseCommand } = require('./message-commands.handler');
    handleJoinMessageBaseCommand(socket, session, '');
    return;
  } else {
    const newMsgBase = confMessageBases[newIndex];
    await _joinConference(socket, session, currentConfId, newMsgBase.id);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}
