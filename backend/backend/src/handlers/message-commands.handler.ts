/**
 * Message Commands Handler
 *
 * Implements message base and conference management commands as 1:1 ports from express.e:
 * - JM (Join Message Base) - Switch message bases within conference - express.e:25185-25238
 * - NM (Node Management) - SYSOP multi-node management - express.e:25281-25370
 * - CM (Conference Maintenance) - SYSOP conference settings - express.e:24843-24852
 */

import { LoggedOnSubState } from '../constants/bbs-states';
import { ACSPermission } from '../constants/acs-permissions';
import { checkSecurity } from '../utils/acs.util';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { ParamsUtil } from '../utils/params.util';

// Types
interface BBSSession {
  user?: any;
  currentConf?: number;
  currentMsgBase?: number;
  confRJoin?: number;
  msgBaseRJoin?: number;
  subState: string;
  menuPause?: boolean;
  expertMode?: boolean;
  [key: string]: any;
}

interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
}

interface Conference {
  id: number;
  name: string;
}

// Dependencies injected from index.ts
let _messageBases: MessageBase[] = [];
let _conferences: Conference[] = [];
let _joinConference: (socket: any, session: BBSSession, confId: number, msgBaseId: number) => Promise<boolean>;
let _displayScreen: (socket: any, session: BBSSession, screenName: string) => boolean;

/**
 * Set dependencies for message commands (called from index.ts)
 */
export function setMessageCommandsDependencies(deps: {
  messageBases: MessageBase[];
  conferences: Conference[];
  joinConference: typeof _joinConference;
  displayScreen: typeof _displayScreen;
}) {
  _messageBases = deps.messageBases;
  _conferences = deps.conferences;
  _joinConference = deps.joinConference;
  _displayScreen = deps.displayScreen;
}

/**
 * JM Command - Join Message Base
 *
 * From express.e:25185-25238 (internalCommandJM)
 *
 * Allows users to switch between message bases within the current conference.
 * If conference has multiple message bases, shows JoinMsgBase screen and prompts.
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param params - Optional message base number (e.g., "2") or conference.msgbase (e.g., "1.2")
 */
export function handleJoinMessageBaseCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Check security - express.e:25191
  if (!checkSecurity(session.user, ACSPermission.JOIN_CONFERENCE)) {
    ErrorHandler.permissionDenied(socket, 'join message base', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Join');

  const parsedParams = ParamsUtil.parse(params);
  let newMsgBase = -1;

  // If params contain ".", delegate to J command (join conference) - express.e:25197-25200
  if (parsedParams.length > 0 && parsedParams[0].includes('.')) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.warningLine('Use J command to join conferences (e.g., "J 1.2")'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Parse message base number from params - express.e:25202-25203
  if (parsedParams.length > 0) {
    const num = ParamsUtil.extractNumber(parsedParams);
    if (num !== null) {
      newMsgBase = num;
    }
  }

  // Get message bases for current conference - express.e:25205-25210
  const currentConfBases = _messageBases.filter(mb => mb.conferenceId === session.currentConf);

  if (currentConfBases.length === 0) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('This conference does not contain multiple message bases'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const msgBaseCount = currentConfBases.length;

  // If no valid message base number, show screen and prompt - express.e:25215-25227
  if (newMsgBase < 1 || newMsgBase > msgBaseCount) {
    // Try to display JoinMsgBase screen (conference-specific or generic)
    _displayScreen(socket, session, 'JOINMSGBASE');

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Available message bases:\r\n');
    currentConfBases.forEach((mb, index) => {
      const num = index + 1;
      const currentIndicator = mb.id === session.currentMsgBase ? AnsiUtil.colorize(' <-- Current', 'green') : '';
      socket.emit('ansi-output', `${num}. ${mb.name}${currentIndicator}\r\n`);
    });

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: 'Message Base Number ', color: 'white' },
      { text: `(1-${msgBaseCount})`, color: 'cyan' },
      { text: ': ', color: 'white' }
    ]));

    // Wait for input
    session.subState = 'JM_INPUT';
    session.tempData = { messageBaseSelect: true, currentConfBases };
    return;
  }

  // Validate and clamp message base number - express.e:25229-25230
  if (newMsgBase < 1) newMsgBase = 1;
  if (newMsgBase > msgBaseCount) newMsgBase = msgBaseCount;

  // Map from display number (1-based) to actual message base
  const selectedBase = currentConfBases[newMsgBase - 1];

  if (selectedBase) {
    // Join the message base - express.e:25232
    _joinConference(socket, session, session.currentConf!, selectedBase.id);

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.successLine(`Joined message base: ${selectedBase.name}`));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  } else {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Invalid message base number'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  }

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Handle JM command input (message base number)
 */
export function handleJMInput(socket: any, session: BBSSession, input: string): void {
  const tempData = session.tempData || {};
  const currentConfBases = tempData.currentConfBases || [];

  socket.emit('ansi-output', '\r\n');

  // If empty input, cancel
  if (!input.trim()) {
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const msgBaseNum = parseInt(input.trim());

  if (isNaN(msgBaseNum) || msgBaseNum < 1 || msgBaseNum > currentConfBases.length) {
    socket.emit('ansi-output', AnsiUtil.errorLine('Invalid message base number'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const selectedBase = currentConfBases[msgBaseNum - 1];

  if (selectedBase) {
    _joinConference(socket, session, session.currentConf!, selectedBase.id);
    socket.emit('ansi-output', AnsiUtil.successLine(`Joined message base: ${selectedBase.name}`));
  } else {
    socket.emit('ansi-output', AnsiUtil.errorLine('Invalid message base'));
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  delete session.tempData;
}

/**
 * NM Command - Node Management (SYSOP)
 *
 * From express.e:25281-25370 (internalCommandNM)
 *
 * Original AmiExpress: Allows sysop to manage multi-node BBS system:
 * - View all nodes and their status
 * - Take nodes offline/bring online
 * - Disconnect users from specific nodes
 *
 * Web Implementation: Stubbed (single-node web version, no multi-node infrastructure)
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleNodeManagementCommand(socket: any, session: BBSSession): void {
  // Check sysop security - express.e:25282
  if (!checkSecurity(session.user, ACSPermission.SYSOP_COMMANDS)) {
    ErrorHandler.permissionDenied(socket, 'manage nodes', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Sysop');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Node Management'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:25281-25370):
  // - who(0) - shows all nodes
  // - Prompts which node to manage
  // - Options: take offline, bring online, disconnect user
  // - Uses AEServer message ports to communicate with nodes
  //
  // Web version is single-node, so this command is not applicable

  socket.emit('ansi-output', AnsiUtil.colorize('Node Management - Original AmiExpress Feature', 'yellow'));
  socket.emit('ansi-output', '\r\n\r\n');
  socket.emit('ansi-output', 'This command managed multi-node BBS systems in the original AmiExpress.\r\n');
  socket.emit('ansi-output', 'The web version is single-node, so this feature is not applicable.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Features in original:', 'cyan'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - View all node status\r\n');
  socket.emit('ansi-output', '  - Take nodes offline/bring online\r\n');
  socket.emit('ansi-output', '  - Disconnect users from specific nodes\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * CM Command - Conference Maintenance (SYSOP)
 *
 * From express.e:24843-24852 (internalCommandCM)
 *
 * Original AmiExpress: Opens full-screen ANSI conference configuration menu.
 * See conferenceMaintenance() at express.e:22686+ for full implementation.
 *
 * Features 13+ options:
 * 1. Ratio settings
 * 2. Ratio type
 * 3. Reset new mail scan pointers
 * 4. Reset last message read pointers
 * 5. Dump all user stats to Conf.Stats
 * 6. Set default new mail scan
 * 7. Set default new file scan
 * 8. Set default zoom flag
 * 9. Reset messages posted
 * A. Reset voting booth
 * B. Modify next message number
 * C. Modify lowest message number
 * D. Set conference capacity
 *
 * Web Implementation: Stubbed (complex ANSI menu system, requires implementation)
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleConferenceMaintenanceCommand(socket: any, session: BBSSession): void {
  // Check sysop security - express.e:24844
  if (!checkSecurity(session.user, ACSPermission.SYSOP_COMMANDS)) {
    ErrorHandler.permissionDenied(socket, 'access conference maintenance', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Sysop');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Conference Maintenance'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:22686+):
  // Full-screen ANSI menu with 13+ configuration options
  // Includes:
  // - Message pointer management
  // - User statistics
  // - Default scan settings
  // - Voting booth reset
  // - Conference capacity settings

  socket.emit('ansi-output', AnsiUtil.colorize('Conference Maintenance - Requires Implementation', 'yellow'));
  socket.emit('ansi-output', '\r\n\r\n');
  socket.emit('ansi-output', 'This opens a full-screen ANSI menu for conference configuration.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Original features (13+ options):', 'cyan'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  1. Ratio settings\r\n');
  socket.emit('ansi-output', '  2. Ratio type\r\n');
  socket.emit('ansi-output', '  3. Reset new mail scan pointers\r\n');
  socket.emit('ansi-output', '  4. Reset last message read pointers\r\n');
  socket.emit('ansi-output', '  5. Dump all user stats to Conf.Stats\r\n');
  socket.emit('ansi-output', '  6. Set default new mail scan\r\n');
  socket.emit('ansi-output', '  7. Set default new file scan\r\n');
  socket.emit('ansi-output', '  8. Set default zoom flag\r\n');
  socket.emit('ansi-output', '  9. Reset messages posted\r\n');
  socket.emit('ansi-output', '  A. Reset voting booth\r\n');
  socket.emit('ansi-output', '  B. Modify next message number\r\n');
  socket.emit('ansi-output', '  C. Modify lowest message number\r\n');
  socket.emit('ansi-output', '  D. Set conference capacity\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.warningLine('Requires full conferenceMaintenance() implementation (500+ lines)'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}
