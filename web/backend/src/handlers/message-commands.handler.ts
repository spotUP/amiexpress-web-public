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
let _resetNewMailScanPointers: (conferenceId: number, messageBaseId: number) => Promise<number>;
let _resetLastMessageReadPointers: (conferenceId: number, messageBaseId: number) => Promise<number>;
let _getConferenceStats: (conferenceId: number, messageBaseId: number) => Promise<any>;
let _updateMessageNumberRange: (conferenceId: number, messageBaseId: number, lowestKey?: number, highMsgNum?: number) => Promise<boolean>;
let _getMailStatFile: (conferenceId: number, messageBaseId: number) => Promise<any>;

/**
 * Set dependencies for message commands (called from index.ts)
 */
export function setMessageCommandsDependencies(deps: {
  messageBases: MessageBase[];
  conferences: Conference[];
  joinConference: typeof _joinConference;
  displayScreen: typeof _displayScreen;
  resetNewMailScanPointers: typeof _resetNewMailScanPointers;
  resetLastMessageReadPointers: typeof _resetLastMessageReadPointers;
  getConferenceStats: typeof _getConferenceStats;
  updateMessageNumberRange: typeof _updateMessageNumberRange;
  getMailStatFile: typeof _getMailStatFile;
}) {
  _messageBases = deps.messageBases;
  _conferences = deps.conferences;
  _joinConference = deps.joinConference;
  _displayScreen = deps.displayScreen;
  _resetNewMailScanPointers = deps.resetNewMailScanPointers;
  _resetLastMessageReadPointers = deps.resetLastMessageReadPointers;
  _getConferenceStats = deps.getConferenceStats;
  _updateMessageNumberRange = deps.updateMessageNumberRange;
  _getMailStatFile = deps.getMailStatFile;
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
 * From express.e:24843-24852 (internalCommandCM) and express.e:22686-22948 (conferenceMaintenance)
 *
 * Full-screen ANSI conference configuration menu with 13+ options for managing conferences.
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export async function handleConferenceMaintenanceCommand(socket: any, session: BBSSession): Promise<void> {
  // Check sysop security - express.e:24844
  if (!checkSecurity(session.user, ACSPermission.SYSOP_COMMANDS)) {
    ErrorHandler.permissionDenied(socket, 'access conference maintenance', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Sysop');

  // Initialize conference maintenance state
  session.tempData = session.tempData || {};
  session.tempData.cmConf = session.currentConf || 1;
  session.tempData.cmMsgBase = session.currentMsgBase || 1;

  // Enter the conference maintenance menu loop
  session.subState = 'CM_DISPLAY_MENU';
  await displayConferenceMaintenanceMenu(socket, session);
}

/**
 * Display the full-screen ANSI conference maintenance menu
 * From express.e:22686-22948
 */
async function displayConferenceMaintenanceMenu(socket: any, session: BBSSession): Promise<void> {
  const conf = session.tempData.cmConf;
  const msgBase = session.tempData.cmMsgBase;

  // Get conference and message base info
  const conference = _conferences.find(c => c.id === conf);
  const messageBase = _messageBases.find(mb => mb.conferenceId === conf && mb.id === msgBase);

  // Get statistics
  const stats = await _getConferenceStats(conf, msgBase);
  const mailStat = await _getMailStatFile(conf, msgBase);

  // Build conference string (express.e:22709-22716)
  const msgBaseCount = _messageBases.filter(mb => mb.conferenceId === conf).length;
  let confStr: string;
  let confTitle: string;

  if (msgBaseCount > 1 && messageBase) {
    confStr = `${conf}.${msgBase}`;
    confTitle = `${conference?.name || `Conf ${conf}`} - ${messageBase.name}`;
  } else {
    confStr = `${conf}`;
    confTitle = conference?.name || `Conference ${conf}`;
  }

  // Clear screen and display full-screen ANSI menu - express.e:22718-22777
  socket.emit('ansi-output', '\x1b[2J'); // Clear screen
  socket.emit('ansi-output', '\x1b[?25l'); // Hide cursor

  // Title - express.e:22720
  socket.emit('ansi-output', `\x1b[2;1H                      \x1b[33mCONFERENCE MAINTENANCE\x1b[0m\r\n`);

  // Conference header - express.e:22724-22725
  socket.emit('ansi-output', `\x1b[4;1H \x1b[32mConference \x1b[34m[\x1b[0m${confStr.padEnd(5)}\x1b[34m]\x1b[36m:\x1b[0m ${confTitle.padEnd(29)}\r\n`);

  // Warning - express.e:22726
  socket.emit('ansi-output', `\x1b[6;1H\x1b[0m THE FOLLOWING OPTIONS EFFECT ALL USERS FOR THIS CONFERENCE!\r\n`);

  // Left column options - express.e:22727-22734
  socket.emit('ansi-output', `\x1b[8;2H\x1b[33m1.>\x1b[32m Ratio\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[9;2H\x1b[33m2.>\x1b[32m Ratio Type\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[10;2H\x1b[33m3.>\x1b[32m Reset New Mail Scan Pointers\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[11;2H\x1b[33m4.>\x1b[32m Reset Last Message Read Pointers\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[12;2H\x1b[33m5.>\x1b[32m Dump all user stats to Conf.Stats\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[13;2H\x1b[33m6.>\x1b[32m Set Default New Mail Scan\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[14;2H\x1b[33m7.>\x1b[32m Set Default New File Scan\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[15;2H\x1b[33m8.>\x1b[32m Set Default Zoom Flag\x1b[0m\r\n`);

  // Right column options - express.e:22737-22751
  socket.emit('ansi-output', `\x1b[8;40H\x1b[33m9.>\x1b[32m Reset Messages Posted\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[9;40H\x1b[33mA.>\x1b[32m Reset Voting Booth\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[10;40H\x1b[33mB.>\x1b[32m Next   Msg # \x1b[0m${String(mailStat.highMsgNum || 0).padStart(8)}\r\n`);
  socket.emit('ansi-output', `\x1b[11;40H\x1b[33mC.>\x1b[32m Lowest Msg # \x1b[0m${String(mailStat.lowestKey || 0).padStart(8)}\r\n`);
  socket.emit('ansi-output', `\x1b[12;40H\x1b[33mD.>\x1b[32m Capacity \x1b[0m${String(stats.userCount).padStart(4)} \x1b[32mUsers\x1b[0m\r\n`);

  // Calculate percentage in use - express.e:22752-22765
  const totalUsers = stats.userCount;
  const capacity = 1000; // Default capacity
  let pctInUse = capacity > 0 ? (totalUsers / capacity * 100).toFixed(1) : '0.0';
  const pctColor = parseFloat(pctInUse) >= 90 ? '\x1b[31m' : '\x1b[33m'; // Red if >= 90%, yellow otherwise
  socket.emit('ansi-output', `\x1b[13;44H${pctColor}${pctInUse}% In use    \x1b[0m\r\n`);

  // Dir cache options - express.e:22767-22774 (disabled for web)
  socket.emit('ansi-output', `\x1b[14;40H\x1b[33mE.>\x1b[32m Ram Dir Cache(s) \x1b[0mDisabled\r\n`);
  socket.emit('ansi-output', `\x1b[15;40H\x1b[33m                        \r\n`);

  // Footer - express.e:22776
  socket.emit('ansi-output', `\x1b[17;2H\x1b[33m<TAB>\x1b[36m to exit \x1b[33m-/+\x1b[36m=\x1b[0mPrev/Next Conference \x1b[0m\r\n`);

  // Position cursor and show - express.e:22778-22779
  socket.emit('ansi-output', `\x1b[18;2H`);
  socket.emit('ansi-output', '\x1b[?25h'); // Show cursor
}

/**
 * Handle CM menu input
 */
export async function handleCMInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const choice = input.trim().toUpperCase();
  const conf = session.tempData.cmConf;
  const msgBase = session.tempData.cmMsgBase;

  // Handle choice - express.e:22781-22944
  switch (choice) {
    case '1': // Ratio
      socket.emit('ansi-output', '\x1b[0mRatio > ');
      session.subState = 'CM_INPUT_RATIO';
      return;

    case '2': // Ratio Type
      socket.emit('ansi-output', '\x1b[0mRatio Type > ');
      session.subState = 'CM_INPUT_RATIO_TYPE';
      return;

    case '3': // Reset New Mail Scan Pointers - express.e:22797-22799
      socket.emit('ansi-output', `\x1b[18;2H \x1b[0mWorking....\r\n`);
      await _resetNewMailScanPointers(conf, msgBase);
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '4': // Reset Last Message Read Pointers - express.e:22800-22802
      socket.emit('ansi-output', `\x1b[18;2H \x1b[0mWorking....\r\n`);
      await _resetLastMessageReadPointers(conf, msgBase);
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '5': // Dump user stats - express.e:22803-22805
      socket.emit('ansi-output', `\x1b[18;2H \x1b[0mWorking....\r\n`);
      // TODO: Implement dumpUserStats function
      socket.emit('ansi-output', `\x1b[18;2H \x1b[0mFeature not yet implemented\r\n`);
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '6': // Set Default New Mail Scan - express.e:22806-22814
    case '7': // Set Default New File Scan - express.e:22815-22823
    case '8': // Set Default Zoom Flag - express.e:22824-22832
      socket.emit('ansi-output', `\x1b[18;2H \x1b[0mFeature not yet implemented\r\n`);
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '9': // Reset Messages Posted - express.e:22833-22835
      socket.emit('ansi-output', `\x1b[18;2H \x1b[0mWorking....\r\n`);
      // TODO: Implement reset messages posted
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case 'A': // Reset Voting Booth - express.e:22836-22838
      socket.emit('ansi-output', `\x1b[18;2H \x1b[0mWorking....\r\n`);
      // TODO: Implement reset voting booth
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case 'B': // Modify next message number - express.e:22839-22844
      socket.emit('ansi-output', '\x1b[0mNext Message > ');
      session.subState = 'CM_INPUT_HIGH_MSG';
      return;

    case 'C': // Modify lowest message number - express.e:22845-22850
      socket.emit('ansi-output', '\x1b[0mLow Message  > ');
      session.subState = 'CM_INPUT_LOW_MSG';
      return;

    case 'D': // Set conference capacity - express.e:22851-22859
      socket.emit('ansi-output', '\x1b[0mSize in records > ');
      session.subState = 'CM_INPUT_CAPACITY';
      return;

    case '\t': // TAB - exit - express.e:22924-22925
    case 'Q':
    case '':
      socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen and home
      socket.emit('ansi-output', '\x1b[?25h'); // Show cursor
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      delete session.tempData.cmConf;
      delete session.tempData.cmMsgBase;
      return;

    case '-': // Previous conference/msgbase - express.e:22926-22935
      let newMsgBase = msgBase - 1;
      let newConf = conf;
      if (newMsgBase < 1) {
        newConf = conf - 1;
        if (newConf < 1) newConf = _conferences.length;
        const basesForConf = _messageBases.filter(mb => mb.conferenceId === newConf);
        newMsgBase = basesForConf.length;
      }
      session.tempData.cmConf = newConf;
      session.tempData.cmMsgBase = newMsgBase;
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '+': // Next conference/msgbase - express.e:22936-22944
      const currentBases = _messageBases.filter(mb => mb.conferenceId === conf);
      let nextMsgBase = msgBase + 1;
      let nextConf = conf;
      if (nextMsgBase > currentBases.length) {
        nextConf = conf + 1;
        if (nextConf > _conferences.length) nextConf = 1;
        nextMsgBase = 1;
      }
      session.tempData.cmConf = nextConf;
      session.tempData.cmMsgBase = nextMsgBase;
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    default:
      // Invalid option, redisplay menu
      await displayConferenceMaintenanceMenu(socket, session);
      return;
  }
}

/**
 * Handle CM numeric input (for B and C options)
 */
export async function handleCMNumericInput(socket: any, session: BBSSession, input: string, field: string): Promise<void> {
  const value = parseInt(input.trim());
  const conf = session.tempData.cmConf;
  const msgBase = session.tempData.cmMsgBase;

  if (!isNaN(value) && value >= 0) {
    if (field === 'HIGH_MSG') {
      await _updateMessageNumberRange(conf, msgBase, undefined, value);
    } else if (field === 'LOW_MSG') {
      await _updateMessageNumberRange(conf, msgBase, value, undefined);
    }
  }

  session.subState = 'CM_DISPLAY_MENU';
  await displayConferenceMaintenanceMenu(socket, session);
}
