/**
 * Transfer & Miscellaneous Commands Handler
 * Handles file transfer variants and miscellaneous commands
 * 1:1 port from AmiExpress express.e commands
 */

import { BBSSession, LoggedOnSubState } from '../index';
import { checkSecurity } from '../utils/acs.util';
import { ACSCode } from '../constants/acs-codes';
import { EnvStat } from '../constants/env-codes';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';

// Dependencies (injected)
let _setEnvStat: any;
let _displayUploadInterface: any;
let _displayDownloadInterface: any;
let _fileAreas: any[] = [];

/**
 * Dependency injection setter
 */
export function setTransferMiscCommandsDependencies(deps: {
  setEnvStat: any;
  displayUploadInterface: any;
  displayDownloadInterface: any;
  fileAreas: any[];
}) {
  _setEnvStat = deps.setEnvStat;
  _displayUploadInterface = deps.displayUploadInterface;
  _displayDownloadInterface = deps.displayDownloadInterface;
  _fileAreas = deps.fileAreas;
}

/**
 * RZ Command: Zmodem Upload (internalCommandRZ)
 * Original: express.e:25608-25621
 *
 * Immediate Zmodem upload protocol initiation.
 * In AmiExpress, this called uploadaFile(1, cmdcode, FALSE) for Zmodem.
 * Web version: Shows file area selection for upload target.
 */
export function handleZmodemUploadCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:25609
  if (!checkSecurity(session, ACSCode.UPLOAD)) {
    ErrorHandler.permissionDenied(socket, 'upload files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:25610
  _setEnvStat(session, EnvStat.UPLOADING);

  console.log('[ENV] Uploading');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Zmodem Upload'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'This command starts an immediate Zmodem upload.\r\n');
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:25612-25618):
  // - Checks if BGFILECHECK is enabled for remote logon
  // - Calls uploadaFile(1, cmdcode, FALSE) where 1 = Zmodem protocol
  // - Returns RESULT_GOODBYE if modem should hang up
  // Web version: Show file area selection

  // Check if there are file directories to upload to
  const uploadFileAreas = _fileAreas.filter((area: any) => area.conferenceId === session.currentConf);
  if (uploadFileAreas.length === 0) {
    socket.emit('ansi-output', 'No file areas available in this conference.\r\n');
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  socket.emit('ansi-output', 'Available file areas:\r\n');
  uploadFileAreas.forEach((area: any, index: number) => {
    socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.complexPrompt([
    { text: 'Select file area ', color: 'white' },
    { text: `(1-${uploadFileAreas.length})`, color: 'cyan' },
    { text: ' or press Enter to cancel: ', color: 'white' }
  ]));

  session.subState = LoggedOnSubState.FILE_AREA_SELECT;
  session.tempData = { rzUploadMode: true, fileAreas: uploadFileAreas };
}

/**
 * US Command: Sysop Upload (internalCommandUS)
 * Original: express.e:25660-25665
 *
 * Special upload mode for sysops that bypasses ratio checks.
 * In AmiExpress, this called sysopUpload() with no restrictions.
 * Web version: Shows upload interface with sysop privileges.
 */
export function handleSysopUploadCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Check security - express.e:25661
  if (!checkSecurity(session, ACSCode.SYSOP_COMMANDS)) {
    ErrorHandler.permissionDenied(socket, 'use sysop upload', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:25662
  _setEnvStat(session, EnvStat.UPLOADING);

  console.log('[ENV] Uploading');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Sysop Upload'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Special sysop upload mode - bypasses ratio checks.\r\n');
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:25664):
  // - Calls sysopUpload()
  // - No ratio checks
  // - No security restrictions beyond ACS_SYSOP_COMMANDS
  // Web version: Call upload interface

  _displayUploadInterface(socket, session, params);
}

/**
 * UP Command: Node Uptime (internalCommandUP)
 * Original: express.e:25667-25673
 *
 * Displays when the node was started and current uptime.
 * In AmiExpress, this showed nodeStart time formatted.
 * Web version: Shows when the node started and total uptime.
 */
export function handleNodeUptimeCommand(socket: any, session: BBSSession): void {
  console.log('[ENV] Stats');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Node Uptime'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:25670-25672):
  // - formatLongDateTime(nodeStart, tempStr2)
  // - StringF(tempStr, 'Node %d was started at %s.', node, tempStr2)
  // - aePuts(tempStr)

  // Web version: Show node start time and uptime
  const nodeStartTime = session.nodeStartTime || Date.now();
  const startTime = new Date(nodeStartTime).toLocaleString();
  const uptimeMs = Date.now() - nodeStartTime;
  const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
  const uptimeMins = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));

  socket.emit('ansi-output', AnsiUtil.colorize('Node 1 was started at ', 'cyan'));
  socket.emit('ansi-output', AnsiUtil.colorize(startTime, 'yellow'));
  socket.emit('ansi-output', '.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Uptime: ', 'cyan'));
  socket.emit('ansi-output', AnsiUtil.colorize(`${uptimeHours}h ${uptimeMins}m`, 'green'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * VO Command: Voting Booth (internalCommandVO)
 * Original: express.e:25700-25710
 *
 * BBS voting/polling system for user feedback.
 * In AmiExpress, this called either voteMenu() (sysops) or vote() (users).
 * Web version: Not yet implemented, stubbed with explanation.
 */
export function handleVotingBoothCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:25701
  if (!checkSecurity(session, ACSCode.VOTE)) {
    ErrorHandler.permissionDenied(socket, 'access voting booth', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:25703
  _setEnvStat(session, EnvStat.DOORS);

  console.log('[ENV] Doors');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Voting Booth'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:25704-25709):
  // - setEnvMsg('Voting Booth')
  // - If user has ACS_MODIFY_VOTE: call voteMenu() (create/edit votes)
  // - Otherwise: call vote() (participate in votes)
  //
  // This requires:
  // - Vote database tables
  // - Vote creation interface (for sysops)
  // - Vote participation interface (for users)
  // - Multi-choice voting support
  // - Vote results display

  socket.emit('ansi-output', AnsiUtil.colorize('Voting Booth - Original AmiExpress Feature', 'yellow'));
  socket.emit('ansi-output', '\r\n\r\n');
  socket.emit('ansi-output', 'This system allows users to participate in polls and surveys.\r\n');
  socket.emit('ansi-output', 'The web version does not yet have voting booth functionality.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Features in original:', 'cyan'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - Create and manage polls (sysops)\r\n');
  socket.emit('ansi-output', '  - Vote on active polls (users)\r\n');
  socket.emit('ansi-output', '  - Multi-choice voting support\r\n');
  socket.emit('ansi-output', '  - View voting results\r\n');
  socket.emit('ansi-output', '  - Security-based access control\r\n');
  socket.emit('ansi-output', '\r\n');

  // Check if user has modify vote permission
  const canModify = checkSecurity(session, ACSCode.MODIFY_VOTE);
  if (canModify) {
    socket.emit('ansi-output', AnsiUtil.colorize('You have permission to create and edit votes.', 'green'));
    socket.emit('ansi-output', '\r\n');
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * DS Command: Download with Status (variant of D command)
 * Original: express.e:28302 (mapped to internalCommandD)
 *
 * Download files with status/progress display.
 * In AmiExpress, DS was just an alias to D command.
 * Web version: Shows download interface (same as D command).
 */
export function handleDownloadWithStatusCommand(socket: any, session: BBSSession, params: string = ''): void {
  // DS is handled by same function as D in express.e
  // The difference is DS shows download status/progress
  // express.e:28302 maps DS -> internalCommandD

  console.log('[ENV] Files');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Download Files (with status)'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress:
  // DS is just an alias to D command with status display enabled
  // Web version: Call download interface

  _displayDownloadInterface(socket, session, params);
}
