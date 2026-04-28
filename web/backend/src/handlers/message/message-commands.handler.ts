/**
 * Message Commands Handler
 *
 * Implements message base and conference management commands as 1:1 ports from express.e:
 * - JM (Join Message Base) - Switch message bases within conference - express.e:25185-25238
 * - NM (Node Management) - SYSOP multi-node management - express.e:25281-25370
 * - CM (Conference Maintenance) - SYSOP conference settings - express.e:24843-24852
 */

import { LoggedOnSubState, BBSState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { emitText, emitPrompt, flushOutput } from '../../utils/output.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { ParamsUtil } from '../../utils/params.util';
import { normalizeForComparison } from '../../utils/input-normalizer.util';
import { getDatabase } from '../command-handler/dependency-injection';
import { getSystemTime } from '../../utils/date-time.util';
import { getActivityFromSubState, getSocketIdByNodeId, getSession } from '../../server/session-manager';
import { EnvStat, ENV_NAMES } from '../../constants/env-codes';

import type { BBSSession } from '../../index';
import type { Server as SocketIOServer } from 'socket.io';

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
let _sessions: Map<string, BBSSession> = new Map();
let _io: SocketIOServer | null = null;
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
  sessions?: Map<string, BBSSession>;
  io?: SocketIOServer;
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
  if (deps.sessions) _sessions = deps.sessions;
  if (deps.io) _io = deps.io;
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
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.warningLine('Use J command to join conferences (e.g., "J 1.2")'));
    emitText(socket, '\r\n');
    emitPrompt(socket, AnsiUtil.pressKeyPrompt());
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

  const normalizedNameParam = normalizeForComparison(params);

  // Get message bases for current conference - express.e:25205-25210
  const currentConfBases = _messageBases.filter(mb => mb.conferenceId === session.currentConf);

  if (currentConfBases.length === 0) {
    // express.e:25213: '\b\nThis conference does not contain multiple message bases\b\n\b\n'
    emitText(socket, '\r\nThis conference does not contain multiple message bases\r\n\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const msgBaseCount = currentConfBases.length;

  // Allow specifying message base by name (case-insensitive) before showing prompt
  if ((newMsgBase < 1 || newMsgBase > msgBaseCount) && normalizedNameParam) {
    const matchedBase = currentConfBases.find(mb => normalizeForComparison(mb.name) === normalizedNameParam);
    if (matchedBase) {
      newMsgBase = currentConfBases.indexOf(matchedBase) + 1;
    }
  }

  // If no valid message base number, show screen and prompt - express.e:25215-25227
  if (newMsgBase < 1 || newMsgBase > msgBaseCount) {
    // Try to display JoinMsgBase screen (conference-specific or generic)
    _displayScreen(socket, session, 'JOINMSGBASE');

    emitText(socket, '\r\n');
    emitText(socket, 'Available message bases:\r\n');
    currentConfBases.forEach((mb, index) => {
      const num = index + 1;
      const currentIndicator = mb.id === session.currentMsgBase ? AnsiUtil.colorize(' <-- Current', 'green') : '';
      emitText(socket, `${num}. ${mb.name}${currentIndicator}\r\n`);
    });

    // express.e:25224: 'Message Base Number (1-N): ' — plain text
    emitText(socket, `Message Base Number (1-${msgBaseCount}): `);

    // Wait for input
    session.subState = LoggedOnSubState.JM_INPUT;
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

    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.successLine(`Joined message base: ${selectedBase.name}`));
    emitText(socket, '\r\n');
    emitPrompt(socket, AnsiUtil.pressKeyPrompt());
  } else {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine('Invalid message base number'));
    emitText(socket, '\r\n');
    emitPrompt(socket, AnsiUtil.pressKeyPrompt());
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

  emitText(socket, '\r\n');

  // If empty input, cancel
  if (!input.trim()) {
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const msgBaseNum = parseInt(input.trim());

  if (isNaN(msgBaseNum) || msgBaseNum < 1 || msgBaseNum > currentConfBases.length) {
    emitText(socket, AnsiUtil.errorLine('Invalid message base number'));
    emitText(socket, '\r\n');
    emitPrompt(socket, AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const selectedBase = currentConfBases[msgBaseNum - 1];

  if (selectedBase) {
    _joinConference(socket, session, session.currentConf!, selectedBase.id);
    emitText(socket, AnsiUtil.successLine(`Joined message base: ${selectedBase.name}`));
  } else {
    emitText(socket, AnsiUtil.errorLine('Invalid message base'));
  }

  emitText(socket, '\r\n');
  emitPrompt(socket, AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  delete session.tempData;
}

/**
 * NM Command - Node Management (SYSOP)
 *
 * From express.e:25281-25370 (internalCommandNM)
 *
 * Allows sysop to manage multi-node BBS system:
 * - View all nodes and their status (who(0) display)
 * - Take nodes offline/bring online
 * - Disconnect users from specific nodes
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleNodeManagementCommand(socket: any, session: BBSSession): void {
  // Check sysop security - express.e:25288
  if (!checkSecurity(session.user, ACSPermission.SYSOP_COMMANDS)) {
    ErrorHandler.permissionDenied(socket, 'manage nodes', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Sysop');

  // Display node status (who(0)) - express.e:25295
  displayNodeStatus(socket, session);

  // Prompt for node selection - express.e:25298
  emitText(socket, '\r\n');
  emitPrompt(socket, 'Which to change <Q>=QUIT ? ');

  // Wait for input - express.e:25300
  session.subState = LoggedOnSubState.NM_INPUT;
  session.tempData = { nmAction: 'select' };
}

/**
 * Display WHO-style node status list
 * From express.e:24204-24380 (who function)
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
function displayNodeStatus(socket: any, session: BBSSession): void {
  emitText(socket, '\r\n\r\n');

  // Table header - enhanced design based on express.e:24219-24224
  emitText(socket, '\x1b[34m.-----+---------------------+---------------------+---------------------+------.\x1b[0m\r\n');
  emitText(socket, '\x1b[34m|\x1b[33m Nd# \x1b[34m|\x1b[36m Name/Handle         \x1b[34m|\x1b[36m Location            \x1b[34m|\x1b[36m Action              \x1b[34m|\x1b[36m Chat \x1b[34m|\x1b[0m\r\n');
  emitText(socket, '\x1b[34m)-----+---------------------+---------------------+---------------------+------(\x1b[0m\r\n');

  // Iterate over all sessions (keyed by nodeId)
  const nodeIds: number[] = [];
  for (const [key, sess] of _sessions.entries()) {
    const nodeId = parseInt(key);
    if (!isNaN(nodeId)) {
      nodeIds.push(nodeId);
    }
  }

  // Sort by node ID
  nodeIds.sort((a, b) => a - b);

  // Display each active node
  for (const nodeId of nodeIds) {
    const nodeSess = _sessions.get(nodeId.toString());
    if (!nodeSess) continue;

    // Get session info
    const handle = nodeSess.user?.username || '';
    const location = nodeSess.user?.location || '';
    const chatAvail = !nodeSess.blockOLM;
    const chatStr = chatAvail ? '\x1b[32m YES  ' : '\x1b[31m  NO  ';

    // Determine action/status
    let action = 'IDLE';
    const status = nodeSess.currentStat ?? EnvStat.IDLE;

    if (nodeSess.state === BBSState.LOGGEDON) {
      // Map currentStat to display string - express.e:24257-24368
      switch (status) {
        case EnvStat.IDLE:
          action = 'IDLE';
          break;
        case EnvStat.DOWNLOADING:
          action = 'DOWNLOADING';
          break;
        case EnvStat.UPLOADING:
          action = 'UPLOADING';
          break;
        case EnvStat.DOORS:
          action = nodeSess.inDoorManager ? 'MODULE' : 'WHO';
          break;
        case EnvStat.MAIL:
          action = 'READING MAIL';
          break;
        case EnvStat.STATS:
          action = 'REVIEWING STATS';
          break;
        case EnvStat.ACCOUNT:
          action = 'ACCOUNT EDITING';
          break;
        case EnvStat.ZOOM:
          action = 'ZOOMING';
          break;
        case EnvStat.FILES:
          action = 'VIEWING DIRS';
          break;
        case EnvStat.BULLETINS:
          action = 'READING BULLS';
          break;
        case EnvStat.VIEWING:
          action = 'VIEWING FILES';
          break;
        case EnvStat.ACCOUNTSEQ:
          action = 'ACCOUNT SEQUENCE';
          break;
        case EnvStat.LOGOFF:
          action = 'LOGGING OFF';
          break;
        case EnvStat.SYSOP:
          action = 'SYSOPING';
          break;
        case EnvStat.SHELL:
          action = 'USING SHELL';
          break;
        case EnvStat.EMACS:
          action = 'EDITING';
          break;
        case EnvStat.JOIN:
          action = 'JOINING CONF';
          break;
        case EnvStat.CHAT:
          action = 'CHATTING';
          break;
        case EnvStat.NOTACTIVE:
          action = 'NODE INACTIVE.';
          break;
        case EnvStat.REQ_CHAT:
          action = 'REQUESTING CHAT';
          break;
        case EnvStat.CONNECT:
          action = 'CONNECTING';
          break;
        case EnvStat.LOGGINGON:
          action = 'LOGGING ON';
          break;
        case EnvStat.AWAITCONNECT:
          action = 'AWAITING CONNECT';
          break;
        case EnvStat.SCANNING:
          action = 'SCANNING MAIL';
          break;
        case EnvStat.SHUTDOWN:
          action = 'SHUTDOWN';
          break;
        case EnvStat.MULTICHAT:
          action = 'MULTICHAT';
          break;
        case EnvStat.SUSPEND:
          action = 'SUSPENDED';
          break;
        case EnvStat.RESERVE:
          action = 'RESERVED';
          break;
        case EnvStat.ONLINEMSG:
          action = 'ONLINE MESSAGE';
          break;
        default:
          action = ENV_NAMES[status as EnvStat] || 'UNKNOWN';
      }
    } else if (nodeSess.state === BBSState.LOGON) {
      action = 'LOGGING ON';
    } else if (nodeSess.state === BBSState.AWAIT) {
      action = 'AWAITING CONNECT';
    } else if (nodeSess.state === BBSState.REGISTERING) {
      action = 'REGISTERING';
    }

    // Format row - express.e:24370-24375 (enhanced table design)
    const nodeStr = nodeId.toString().padStart(2, '0');
    const nameStr = handle.padEnd(19).slice(0, 19);
    const locStr = location.padEnd(19).slice(0, 19);
    const actStr = action.padEnd(19).slice(0, 19);

    emitText(socket, `\x1b[34m|\x1b[33m ${nodeStr}  \x1b[34m|\x1b[33m ${nameStr} \x1b[34m|\x1b[35m ${locStr} \x1b[34m|\x1b[0m ${actStr} \x1b[34m|${chatStr}\x1b[34m|\x1b[0m\r\n`);
  }

  // If no active nodes
  if (nodeIds.length === 0) {
    emitText(socket, '\x1b[34m|\x1b[33m  No active nodes                                                              \x1b[34m|\x1b[0m\r\n');
  }

  // Table footer - matches header width
  emitText(socket, '\x1b[34m`-----+---------------------+---------------------+---------------------+------\'\x1b[0m\r\n');
}

/**
 * Handle NM command input (node selection and confirmation)
 * From express.e:25300-25366
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param input - User input
 */
export function handleNMInput(socket: any, session: BBSSession, input: string): void {
  const tempData = session.tempData || {};

  emitText(socket, '\r\n');

  // Handle quit - express.e:25305
  if (input.toUpperCase() === 'Q' || input === '') {
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.tempData;
    return;
  }

  // Parse node number - express.e:25307
  const nodeNum = parseInt(input);

  if (isNaN(nodeNum)) {
    emitText(socket, '\r\n');
    // Loop back - display status and re-prompt
    displayNodeStatus(socket, session);
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Which to change <Q>=QUIT ? ');
    return;
  }

  // Cannot manage own node - express.e:25309-25310
  if (nodeNum === session.nodeId) {
    emitText(socket, 'You cannot perform actions on the node you are connected to.\r\n');
    emitText(socket, '\r\n');
    displayNodeStatus(socket, session);
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Which to change <Q>=QUIT ? ');
    return;
  }

  // Check valid node range - express.e:25311
  if (nodeNum < 0 || nodeNum >= 255) {
    emitText(socket, '\r\n');
    displayNodeStatus(socket, session);
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Which to change <Q>=QUIT ? ');
    return;
  }

  // Get target node session
  const targetSession = _sessions.get(nodeNum.toString());

  // If node doesn't exist in session map, just re-display
  if (!targetSession) {
    emitText(socket, `Node ${nodeNum} is not active.\r\n`);
    displayNodeStatus(socket, session);
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Which to change <Q>=QUIT ? ');
    return;
  }

  const status = targetSession.currentStat ?? EnvStat.NOTACTIVE;

  // Determine action based on node status - express.e:25323-25364
  if (status === EnvStat.NOTACTIVE || status === EnvStat.SHUTDOWN) {
    // Node is offline - offer to bring online - express.e:25340-25346
    emitText(socket, `Do you wish to bring node ${nodeNum} online `);
    emitPrompt(socket, '(Y/n)? ');
    session.tempData = { nmNode: nodeNum, nmOp: 'online' };
    session.subState = LoggedOnSubState.NM_CONFIRM;
  } else if (targetSession.state === BBSState.AWAIT || status === EnvStat.AWAITCONNECT) {
    // Node is waiting - offer to take offline - express.e:25323-25338
    emitText(socket, `Do you wish to take node ${nodeNum} offline `);
    emitPrompt(socket, '(Y/n)? ');
    session.tempData = { nmNode: nodeNum, nmOp: 'offline' };
    session.subState = LoggedOnSubState.NM_CONFIRM;
  } else if (status >= 0 && targetSession.state === BBSState.LOGGEDON) {
    // User connected - offer to disconnect - express.e:25348-25363
    const userName = targetSession.user?.username || 'user';
    emitText(socket, `Do you wish to disconnect ${userName} from node ${nodeNum} `);
    emitPrompt(socket, '(Y/n)? ');
    session.tempData = { nmNode: nodeNum, nmOp: 'kick' };
    session.subState = LoggedOnSubState.NM_CONFIRM;
  } else {
    // Unknown state - just re-display
    emitText(socket, '\r\n');
    displayNodeStatus(socket, session);
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Which to change <Q>=QUIT ? ');
  }
}

/**
 * Handle NM confirmation input (Y/n)
 * From express.e:25326-25363
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param input - User input (Y/n)
 */
export function handleNMConfirm(socket: any, session: BBSSession, input: string): void {
  const tempData = session.tempData || {};
  const nodeNum = tempData.nmNode;
  const operation = tempData.nmOp;

  // Default to No for safety
  const confirmed = input.toUpperCase() === 'Y';

  emitText(socket, '\r\n');

  if (confirmed && nodeNum !== undefined && operation) {
    switch (operation) {
      case 'online':
        // Bring node online - express.e:25344-25346
        // In web version, nodes are created on connection - nothing to do
        emitText(socket, `Node ${nodeNum} will accept connections.\r\n`);
        break;

      case 'offline':
        // Take node offline - express.e:25328-25337
        // In web version, we just mark it as shutdown
        const offlineSession = _sessions.get(nodeNum.toString());
        if (offlineSession) {
          offlineSession.currentStat = EnvStat.SHUTDOWN;
          emitText(socket, `Node ${nodeNum} has been taken offline.\r\n`);
        }
        break;

      case 'kick':
        // Disconnect user - express.e:25354-25362
        const targetSocketId = getSocketIdByNodeId(nodeNum);
        if (targetSocketId && _io) {
          const targetSocket = _io.sockets.sockets.get(targetSocketId);
          if (targetSocket) {
            // Mark target session as sysop-kicked to skip grace period
            // Use getSession(socketId) to get the same session object the disconnect handler uses
            const targetSession = getSession(targetSocketId);
            if (targetSession) {
              targetSession.sysopKicked = true;
console.log(`[NM KICK] Set sysopKicked=true on session for socket ${targetSocketId}, nodeId=${targetSession.nodeId}`);
            }
            // Notify user and disconnect
            targetSocket.emit('ansi-output', '\r\n\x1b[31m*** Disconnected by SYSOP ***\x1b[0m\r\n');
            setTimeout(() => {
              targetSocket.disconnect(true);
            }, 500);
            emitText(socket, `User on node ${nodeNum} has been disconnected.\r\n`);
          } else {
            emitText(socket, `Could not find socket for node ${nodeNum}.\r\n`);
          }
        } else {
          emitText(socket, `Could not disconnect node ${nodeNum} - no active connection.\r\n`);
        }
        break;
    }
  }

  // Return to node list after brief pause - express.e:25336,25346,25362
  // Set state immediately to prevent double-processing during timeout
  session.subState = LoggedOnSubState.NM_INPUT;
  delete session.tempData;

  setTimeout(() => {
    displayNodeStatus(socket, session);
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Which to change <Q>=QUIT ? ');
  }, 1000);
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
  session.subState = LoggedOnSubState.CM_DISPLAY_MENU;
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
  emitText(socket, '\x1b[2J'); // Clear screen
  emitText(socket, '\x1b[?25l'); // Hide cursor

  // Title - express.e:22720
  emitText(socket, `\x1b[2;1H                      \x1b[33mCONFERENCE MAINTENANCE\x1b[0m\r\n`);

  // Conference header - express.e:22724-22725
  emitText(socket, `\x1b[4;1H \x1b[32mConference \x1b[34m[\x1b[0m${confStr.padEnd(5)}\x1b[34m]\x1b[36m:\x1b[0m ${confTitle.padEnd(29)}\r\n`);

  // Warning - express.e:22726
  emitText(socket, `\x1b[6;1H\x1b[0m THE FOLLOWING OPTIONS EFFECT ALL USERS FOR THIS CONFERENCE!\r\n`);

  // Left column options - express.e:22727-22734
  emitText(socket, `\x1b[8;2H\x1b[33m1.>\x1b[32m Ratio\x1b[0m\r\n`);
  emitText(socket, `\x1b[9;2H\x1b[33m2.>\x1b[32m Ratio Type\x1b[0m\r\n`);
  emitText(socket, `\x1b[10;2H\x1b[33m3.>\x1b[32m Reset New Mail Scan Pointers\x1b[0m\r\n`);
  emitText(socket, `\x1b[11;2H\x1b[33m4.>\x1b[32m Reset Last Message Read Pointers\x1b[0m\r\n`);
  emitText(socket, `\x1b[12;2H\x1b[33m5.>\x1b[32m Dump all user stats to Conf.Stats\x1b[0m\r\n`);
  emitText(socket, `\x1b[13;2H\x1b[33m6.>\x1b[32m Set Default New Mail Scan\x1b[0m\r\n`);
  emitText(socket, `\x1b[14;2H\x1b[33m7.>\x1b[32m Set Default New File Scan\x1b[0m\r\n`);
  emitText(socket, `\x1b[15;2H\x1b[33m8.>\x1b[32m Set Default Zoom Flag\x1b[0m\r\n`);

  // Right column options - express.e:22737-22751
  emitText(socket, `\x1b[8;40H\x1b[33m9.>\x1b[32m Reset Messages Posted\x1b[0m\r\n`);
  emitText(socket, `\x1b[9;40H\x1b[33mA.>\x1b[32m Reset Voting Booth\x1b[0m\r\n`);
  emitText(socket, `\x1b[10;40H\x1b[33mB.>\x1b[32m Next   Msg # \x1b[0m${String(mailStat.highMsgNum || 0).padStart(8)}\r\n`);
  emitText(socket, `\x1b[11;40H\x1b[33mC.>\x1b[32m Lowest Msg # \x1b[0m${String(mailStat.lowestKey || 0).padStart(8)}\r\n`);
  emitText(socket, `\x1b[12;40H\x1b[33mD.>\x1b[32m Capacity \x1b[0m${String(stats.userCount).padStart(4)} \x1b[32mUsers\x1b[0m\r\n`);

  // Calculate percentage in use - express.e:22752-22765
  const totalUsers = stats.userCount;
  const capacity = 1000; // Default capacity
  let pctInUse = capacity > 0 ? (totalUsers / capacity * 100).toFixed(1) : '0.0';
  const pctColor = parseFloat(pctInUse) >= 90 ? '\x1b[31m' : '\x1b[33m'; // Red if >= 90%, yellow otherwise
  emitText(socket, `\x1b[13;44H${pctColor}${pctInUse}% In use    \x1b[0m\r\n`);

  // Dir cache options - express.e:22767-22774 (disabled for web)
  emitText(socket, `\x1b[14;40H\x1b[33mE.>\x1b[32m Ram Dir Cache(s) \x1b[0mDisabled\r\n`);
  emitText(socket, `\x1b[15;40H\x1b[33m                        \r\n`);

  // Footer - express.e:22776
  emitText(socket, `\x1b[17;2H\x1b[33m<TAB>\x1b[36m to exit \x1b[33m-/+\x1b[36m=\x1b[0mPrev/Next Conference \x1b[0m\r\n`);

  // Position cursor and show - express.e:22778-22779
  emitText(socket, `\x1b[18;2H`);
  emitText(socket, '\x1b[?25h'); // Show cursor
}

/**
 * Handle CM menu input
 */
export async function handleCMInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // Check if awaiting Y/N confirmation for cases 6, 7, 8
  if (session.tempData?.awaitingCMConfirm) {
    delete session.tempData.awaitingCMConfirm;
    await handleCMConfirmInput(socket, session, input);
    return;
  }

  const choice = input.trim().toUpperCase();
  const conf = session.tempData.cmConf;
  const msgBase = session.tempData.cmMsgBase;

  // Handle choice - express.e:22781-22944
  switch (choice) {
    case '1': // Ratio
      emitPrompt(socket, '\x1b[0mRatio > ');
      session.subState = LoggedOnSubState.CM_INPUT_RATIO;
      return;

    case '2': // Ratio Type
      emitPrompt(socket, '\x1b[0mRatio Type > ');
      session.subState = LoggedOnSubState.CM_INPUT_RATIO_TYPE;
      return;

    case '3': // Reset New Mail Scan Pointers - express.e:22797-22799
      emitText(socket, `\x1b[18;2H\x1b[K \x1b[33mResetting new mail scan pointers...\x1b[0m`);
      await _resetNewMailScanPointers(conf, msgBase);
      emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;32m[OK]\x1b[0m New mail scan pointers reset for all users\r\n`);
      await new Promise(r => setTimeout(r, 1200));
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '4': // Reset Last Message Read Pointers - express.e:22800-22802
      emitText(socket, `\x1b[18;2H\x1b[K \x1b[33mResetting last message read pointers...\x1b[0m`);
      await _resetLastMessageReadPointers(conf, msgBase);
      emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;32m[OK]\x1b[0m Last message read pointers reset for all users\r\n`);
      await new Promise(r => setTimeout(r, 1200));
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '5': // Dump user stats - express.e:22803-22805
      emitText(socket, `\x1b[18;2H\x1b[K \x1b[33mDumping user statistics...\x1b[0m`);
      try {
        const confId = session.tempData?.cmConf || session.currentConf || 1;
        const db = getDatabase();

        // Get conference user statistics - express.e:22521-22582
        // Output format: Name, Location, Access, Uploads, Downloads, Bytes Up/Down, Messages Posted
        // Note: ratio is per-conference (in conferences table), not per-user
        const stats = await db.query(`
          SELECT
            u.username,
            u.location,
            cb.conference_id,
            cb.upload as files_uploaded,
            cb.downloads as files_downloaded,
            cb.bytes_upload as bytes_uploaded,
            cb.bytes_download as bytes_downloaded,
            cb.messages_posted
          FROM conf_base cb
          JOIN users u ON cb.user_id = u.id
          WHERE cb.conference_id = $1
          ORDER BY u.username
        `, [confId]);

        // Get conference ratio settings
        const confSettings = await db.query(
          `SELECT ratio, ratiotype FROM conferences WHERE id = $1`,
          [confId]
        );
        const confRatio = confSettings.rows[0]?.ratio || 0;
        const confRatioType = confSettings.rows[0]?.ratiotype || 0;

        // Create output file: Conf{N}.Stats - express.e:22527-22530
        const { config } = require('../../config');
        const path = require('path');
        const fs = require('fs');
        const bbsRoot = config.get('bbsRoot') || process.cwd();
        const statsFile = path.join(bbsRoot, `Conf${confId}.Stats`);

        let output = '';
        output += `Conference ${confId} User Statistics\n`;
        output += `Generated: ${getSystemTime().toISOString()}\n`;
        output += `${'='.repeat(80)}\n\n`;

        // Write each user's statistics - express.e:22540-22580
        for (const row of stats.rows) {
          output += `User: ${row.username}\n`;
          output += `  Location: ${row.location || 'Unknown'}\n`;
          output += `  Conference Access: ${confId}\n`;
          output += `  Ratio: ${confRatio}\n`;
          output += `  Ratio Type: ${confRatioType}\n`;
          output += `  Files Uploaded: ${row.files_uploaded || 0}\n`;
          output += `  Files Downloaded: ${row.files_downloaded || 0}\n`;
          output += `  Bytes Uploaded: ${row.bytes_uploaded || 0}\n`;
          output += `  Bytes Downloaded: ${row.bytes_downloaded || 0}\n`;
          output += `  Messages Posted: ${row.messages_posted || 0}\n`;
          output += `${'-'.repeat(80)}\n`;
        }

        fs.writeFileSync(statsFile, output, 'utf8');

        emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;32m[OK]\x1b[0m Stats dumped to \x1b[1;33m${path.basename(statsFile)}\x1b[0m (${stats.rows.length} users)\r\n`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (error) {
        console.error('[CM] Error dumping user stats:', error);
        emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;31m[ERROR]\x1b[0m Failed to dump user stats\r\n`);
        await new Promise(r => setTimeout(r, 1500));
      }
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '6': // Set Default New Mail Scan - express.e:22798-22806
      emitText(socket, `\x1b[18;2H \x1b[0mDefault ON (Y/N)? `);
      session.tempData.cmAction = 'setMailScan';
      session.tempData.awaitingCMConfirm = true;
      return;

    case '7': // Set Default New File Scan - express.e:22807-22815
      emitText(socket, `\x1b[18;2H \x1b[0mDefault ON (Y/N)? `);
      session.tempData.cmAction = 'setFileScan';
      session.tempData.awaitingCMConfirm = true;
      return;

    case '8': // Set Default Zoom Flag - express.e:22816-22824
      emitText(socket, `\x1b[18;2H \x1b[0mDefault ON (Y/N)? `);
      session.tempData.cmAction = 'setZoomFlag';
      session.tempData.awaitingCMConfirm = true;
      return;

    case '9': // Reset Messages Posted - express.e:22833-22835
      emitText(socket, `\x1b[18;2H\x1b[K \x1b[33mResetting messages posted counters...\x1b[0m`);
      try {
        const confId = session.tempData?.cmConf || session.currentConf || 1;
        const db = getDatabase();
        // Reset messages posted counter for all users in this conference
        // express.e:22833-22835 calls updateAllUsers(conf, msgBase, UPDATE_MESSAGES_POSTED, 0)
        await db.run(
          `UPDATE conf_base SET messages_posted = 0 WHERE conference_id = $1`,
          [confId]
        );
        emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;32m[OK]\x1b[0m Messages posted counters reset for all users\r\n`);
        await new Promise(r => setTimeout(r, 1200));
      } catch (error) {
        console.error('[CM] Error resetting messages posted:', error);
        emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;31m[ERROR]\x1b[0m Failed to reset messages posted\r\n`);
        await new Promise(r => setTimeout(r, 1200));
      }
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case 'A': // Reset Voting Booth - express.e:22836-22838
      emitText(socket, `\x1b[18;2H\x1b[K \x1b[33mResetting voting booth...\x1b[0m`);
      try {
        const confId = session.tempData?.cmConf || session.currentConf || 1;
        const db = getDatabase();
        // Reset vote results and status for this conference (keeps topics/questions/answers)
        await db.run(`
          DELETE FROM vote_results
          WHERE topic_id IN (SELECT id FROM vote_topics WHERE conference_id = ?)
        `, [confId]);
        await db.run(`
          DELETE FROM vote_status
          WHERE topic_id IN (SELECT id FROM vote_topics WHERE conference_id = ?)
        `, [confId]);
        emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;32m[OK]\x1b[0m Voting booth reset - all votes cleared\r\n`);
        await new Promise(r => setTimeout(r, 1200));
        console.log(`[CM] Voting booth reset for conference ${confId}`);
      } catch (error) {
        console.error('[CM] Error resetting voting booth:', error);
        emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;31m[ERROR]\x1b[0m Failed to reset voting booth\r\n`);
        await new Promise(r => setTimeout(r, 1200));
      }
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case 'B': // Modify next message number - express.e:22839-22844
      emitPrompt(socket, '\x1b[0mNext Message > ');
      session.subState = LoggedOnSubState.CM_INPUT_HIGH_MSG;
      return;

    case 'C': // Modify lowest message number - express.e:22845-22850
      emitPrompt(socket, '\x1b[0mLow Message  > ');
      session.subState = LoggedOnSubState.CM_INPUT_LOW_MSG;
      return;

    case 'D': // Set conference capacity - express.e:22851-22859
      emitPrompt(socket, '\x1b[0mSize in records > ');
      session.subState = LoggedOnSubState.CM_INPUT_CAPACITY;
      return;

    case '\t': // TAB - exit - express.e:22924-22925
    case 'Q':
    case '':
      emitText(socket, '\x1b[2J\x1b[H'); // Clear screen and home
      emitText(socket, '\x1b[?25h'); // Show cursor
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
    const db = getDatabase();

    if (field === 'HIGH_MSG') {
      await _updateMessageNumberRange(conf, msgBase, undefined, value);
    } else if (field === 'LOW_MSG') {
      await _updateMessageNumberRange(conf, msgBase, value, undefined);
    } else if (field === 'RATIO') {
      // express.e:22781-22788 - Update ratio for conference
      await db.run(
        `UPDATE conferences SET ratio = $1 WHERE id = $2`,
        [value, conf]
      );
      emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;32m[OK]\x1b[0m Ratio updated to \x1b[1;33m${value}\x1b[0m\r\n`);
      await new Promise(r => setTimeout(r, 1200));
    } else if (field === 'RATIO_TYPE') {
      // express.e:22789-22796 - Update ratio type for conference
      await db.run(
        `UPDATE conferences SET ratiotype = $1 WHERE id = $2`,
        [value, conf]
      );
      const typeNames = ['None', 'Files', 'Bytes', 'Both'];
      const typeName = typeNames[value] || value;
      emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;32m[OK]\x1b[0m Ratio type set to \x1b[1;33m${typeName}\x1b[0m\r\n`);
      await new Promise(r => setTimeout(r, 1200));
    } else if (field === 'CAPACITY') {
      // express.e:22851-22859 - Set conference capacity (max users)
      // This would resize the conference database file in Amiga version
      // In our SQL version, we can track this as metadata
      await db.run(
        `UPDATE conferences SET max_users = $1 WHERE id = $2`,
        [value, conf]
      );
      emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;32m[OK]\x1b[0m Capacity set to \x1b[1;33m${value}\x1b[0m users\r\n`);
      await new Promise(r => setTimeout(r, 1200));
    }
  } else {
    emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;31m[!]\x1b[0m Invalid value - enter a number >= 0\r\n`);
    await new Promise(r => setTimeout(r, 1000));
  }

  session.subState = LoggedOnSubState.CM_DISPLAY_MENU;
  await displayConferenceMaintenanceMenu(socket, session);
}

/**
 * Handle conference maintenance Y/N confirmations
 * For cases 6, 7, 8 (set default scan flags)
 */
export async function handleCMConfirmInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const answer = input.trim().toUpperCase();
  const isYes = (answer === 'Y' || answer === 'YES');
  const action = session.tempData.cmAction;
  const confId = session.tempData.cmConf || session.currentConf || 1;

  // Map action to friendly name
  const actionNames: Record<string, string> = {
    'setMailScan': 'New Mail Scan',
    'setFileScan': 'New File Scan',
    'setZoomFlag': 'Zoom Flag'
  };
  const actionName = actionNames[action] || action;
  const status = isYes ? 'ON' : 'OFF';

  emitText(socket, `\x1b[18;2H\x1b[K \x1b[33mSetting ${actionName} to ${status}...\x1b[0m`);

  try {
    const db = getDatabase();

    // express.e:22459-22519 - updateAllUsers with bit flag operations
    switch (action) {
      case 'setMailScan': // Case 6 - express.e:22798-22806
        // UPDATE_NEW_MAIL_SCAN sets/clears MAIL_SCAN_MASK (bit 7, value 128)
        if (isYes) {
          await db.run(
            `UPDATE conf_base SET scan_flags = scan_flags | 128 WHERE conference_id = $1`,
            [confId]
          );
        } else {
          await db.run(
            `UPDATE conf_base SET scan_flags = scan_flags & ~128 WHERE conference_id = $1`,
            [confId]
          );
        }
        break;

      case 'setFileScan': // Case 7 - express.e:22807-22815
        // UPDATE_NEW_FILE_SCAN sets/clears FILE_SCAN_MASK (bit 6, value 64)
        if (isYes) {
          await db.run(
            `UPDATE conf_base SET scan_flags = scan_flags | 64 WHERE conference_id = $1`,
            [confId]
          );
        } else {
          await db.run(
            `UPDATE conf_base SET scan_flags = scan_flags & ~64 WHERE conference_id = $1`,
            [confId]
          );
        }
        break;

      case 'setZoomFlag': // Case 8 - express.e:22816-22824
        // UPDATE_DEFAULT_ZOOM_FLAG sets/clears ZOOM_SCAN_MASK (bit 1, value 2)
        if (isYes) {
          await db.run(
            `UPDATE conf_base SET scan_flags = scan_flags | 2 WHERE conference_id = $1`,
            [confId]
          );
        } else {
          await db.run(
            `UPDATE conf_base SET scan_flags = scan_flags & ~2 WHERE conference_id = $1`,
            [confId]
          );
        }
        break;
    }

    emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;32m[OK]\x1b[0m ${actionName} set to \x1b[1;33m${status}\x1b[0m for all users\r\n`);
    await new Promise(r => setTimeout(r, 1200));
  } catch (error) {
    console.error('[CM] Error updating default flags:', error);
    emitText(socket, `\x1b[18;2H\x1b[K \x1b[1;31m[ERROR]\x1b[0m Failed to update ${actionName}\r\n`);
    await new Promise(r => setTimeout(r, 1200));
  }

  delete session.tempData.cmAction;
  session.subState = LoggedOnSubState.CM_DISPLAY_MENU;
  await displayConferenceMaintenanceMenu(socket, session);
}
