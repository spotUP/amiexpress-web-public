/**
 * Message Commands Handler
 *
 * Implements message base and conference management commands as 1:1 ports from express.e:
 * - JM (Join Message Base) - Switch message bases within conference - express.e:25185-25238
 * - NM (Node Management) - SYSOP multi-node management - express.e:25281-25370
 * - CM (Conference Maintenance) - SYSOP conference settings - express.e:24843-24852
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  messagePointerFileManager,
  deserializeConfBase,
  CONFBASE_RECORD_SIZE,
} from '../../services/MessagePointerFileManager';
import { loadAccount } from './msg-names';
import { readPackedBCD } from '../../utils/bcd-math.util';
import { boardRoot } from '../../utils/board-root.util';
import { LoggedOnSubState, BBSState } from '../../constants/bbs-states';
import { isNarrow, narrowClip, narrowRule } from '../../utils/table-format.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { emitText, emitPrompt, flushOutput } from '../../utils/output.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { ParamsUtil } from '../../utils/params.util';
import { normalizeForComparison } from '../../utils/input-normalizer.util';
import { getDatabase } from '../command-handler/dependency-injection';
import { getActivityFromSubState } from '../../server/session-manager';
import { emitterForNodeId } from '../../server/session-emitter-registry';
import { EnvStat } from '../../constants/env-codes';
import { WHO_TABLE_TOP, WHO_TABLE_BOTTOM, whoRow } from '../../utils/who-table.util';
import { YES_NO_PROMPT } from '../../utils/await-input';

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
export async function handleJoinMessageBaseCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
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

  // If params contain ".", delegate to J command (join conference) - express.e:25203-25205
  // express.e just calls internalCommandJ(params) silently — no message
  if (parsedParams.length > 0 && parsedParams[0].includes('.')) {
    const { handleJoinConferenceCommand } = require('../commands/user-commands.handler');
    await handleJoinConferenceCommand(socket, session, params);
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

  // express.e:25232 joinConf() already outputs 'Joining Conference: ...' — no extra message
  } else {
    emitText(socket, '\r\nCommand requires higher access.\r\n');
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

  // express.e:25227 Val(newStr), then 25229-25230 clamp into 1..cnt: a
  // number out of range (or no number at all, Val = 0) joins the nearest
  // base. No error text and no pause - 25232 joinConf, then RESULT_SUCCESS.
  let msgBaseNum = parseInt(input.trim(), 10) || 0;
  if (msgBaseNum < 1) msgBaseNum = 1;
  if (msgBaseNum > currentConfBases.length) msgBaseNum = currentConfBases.length;

  const selectedBase = currentConfBases[msgBaseNum - 1];

  if (selectedBase) {
    // express.e:25232 joinConf() - outputs "Joining Conference: {name}" already
    _joinConference(socket, session, session.currentConf!, selectedBase.id);
  }

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

  // express.e:25294-25300: who(0), a blank line, the prompt, lineInput.
  promptNodeChange(socket, session);
  session.subState = LoggedOnSubState.NM_INPUT;
  session.tempData = { nmAction: 'select' };
}

/**
 * One node-status row (C64/40-col Task 5d).
 *
 * 80 columns: who(0)'s own row, express.e:24370-24375 (utils/who-table.util).
 * WEB_: no express.e equivalent for 40 columns. Narrow: two unboxed lines -
 * the box drawing alone costs 5 of 40 columns and there is no room for four
 * 19-column fields.
 */
export function buildNodeStatusRow(
  nodeId: number,
  name: string,
  location: string,
  action: string,
  chatEnabled: boolean,
  narrow: boolean
): string[] {
  if (!narrow) {
    return [whoRow(nodeId, name, location, action, chatEnabled)];
  }
  const nodeStr = String(nodeId).padStart(2, '0');
  const nameStr = name.substring(0, 19);
  const actStr = action.substring(0, 19);
  // Clip the PLAIN fields, then colour: narrowClip counts raw characters,
  // so clipping a string that already carries escapes would spend the row
  // budget on invisible bytes (and could sever an escape sequence).
  return [
    `\x1b[33m${narrowClip(`${nodeStr} ${nameStr.trimEnd()}`)}\x1b[0m`,
    `\x1b[0m${narrowClip(`   ${actStr.trimEnd()}`)}\x1b[0m`,
  ];
}

/**
 * Display WHO-style node status list
 * From express.e:24204-24380 (who function)
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
function displayNodeStatus(socket: any, session: BBSSession): void {
  const narrow = isNarrow(session);

  // express.e:24217-24224 - who(0)'s header, the same bytes WHO prints.
  if (narrow) {
    // WEB_: no express.e equivalent for 40 columns - the boxed header does not fit.
    emitText(socket, '\r\n\r\n');
    emitText(socket, `\x1b[34m${narrowRule()}\x1b[0m\r\n`);
    emitText(socket, '\x1b[36mNd# Name/Handle\x1b[0m\r\n');
    emitText(socket, `\x1b[34m${narrowRule()}\x1b[0m\r\n`);
  } else {
    for (const line of WHO_TABLE_TOP) emitText(socket, line);
  }

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
          // express.e:24366-24368 DEFAULT prints an empty action.
          action = '';
      }
    } else if (nodeSess.state === BBSState.LOGON) {
      action = 'LOGGING ON';
    } else if (nodeSess.state === BBSState.AWAIT) {
      action = 'AWAITING CONNECT';
    } else if (nodeSess.state === BBSState.REGISTERING) {
      action = 'REGISTERING';
    }

    // Row - express.e:24370-24375
    for (const line of buildNodeStatusRow(nodeId, handle, location, action, chatAvail, narrow)) {
      emitText(socket, narrow ? `${line}\r\n` : line);
    }
  }

  // express.e:24381-24383 - the closing rule and bottom border. An empty
  // table is just its frame: who() has no "no nodes" line.
  if (narrow) {
    emitText(socket, `\x1b[34m${narrowRule()}\x1b[0m\r\n`);
  } else {
    for (const line of WHO_TABLE_BOTTOM) emitText(socket, line);
  }
}

/**
 * express.e:25294-25298, the top of internalCommandNM's LOOP: who(0), a
 * blank line, then the prompt. Every branch of the loop comes back here and
 * prints nothing else on the way.
 */
function promptNodeChange(socket: any, session: BBSSession): void {
  displayNodeStatus(socket, session);
  emitText(socket, '\r\n');
  emitPrompt(socket, 'Which to change <Q>=QUIT ? ');
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

  // lineInput's line break (express.e:2378), then 25302's own.
  emitText(socket, '\r\n\r\n');

  // Handle quit - express.e:25305 StriCmp(str,'q'): only Q. RESULT_SUCCESS,
  // so the main loop pauses before the menu (28647 menuPause:=TRUE). An empty
  // line is Val()'s read=0 (25307) and loops back like any other non-number.
  if (input.toUpperCase() === 'Q') {
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.tempData;
    return;
  }

  // Parse node number - express.e:25307
  const nodeNum = parseInt(input);

  if (isNaN(nodeNum)) {
    // express.e:25307 read=0: straight back to the top of the loop.
    promptNodeChange(socket, session);
    return;
  }

  // Cannot manage own node - express.e:25309-25310
  if (nodeNum === session.nodeId) {
    emitText(socket, 'You cannot perform actions on the node you are connected to.\r\n');
    promptNodeChange(socket, session);
    return;
  }

  // Check valid node range - express.e:25311
  if (nodeNum < 0 || nodeNum >= 255) {
    promptNodeChange(socket, session);
    return;
  }

  // Get target node session
  const targetSession = _sessions.get(nodeNum.toString());

  // express.e:25312-25321: a node with no port reads status -1, which no
  // branch takes - the loop just comes round again, saying nothing.
  if (!targetSession) {
    promptNodeChange(socket, session);
    return;
  }

  const status = targetSession.currentStat ?? EnvStat.NOTACTIVE;

  // Determine action based on node status - express.e:25323-25364
  if (status === EnvStat.NOTACTIVE || status === EnvStat.SHUTDOWN) {
    // Node is offline - offer to bring online - express.e:25340-25346
    emitText(socket, `Do you wish to bring node ${nodeNum} online `);
    emitPrompt(socket, YES_NO_PROMPT[2]); // express.e:25343 yesNo(2)
    session.tempData = { nmNode: nodeNum, nmOp: 'online' };
    session.subState = LoggedOnSubState.NM_CONFIRM;
  } else if (targetSession.state === BBSState.AWAIT || status === EnvStat.AWAITCONNECT) {
    // Node is waiting - offer to take offline - express.e:25323-25338
    emitText(socket, `Do you wish to take node ${nodeNum} offline `);
    emitPrompt(socket, YES_NO_PROMPT[2]); // express.e:25326 yesNo(2)
    session.tempData = { nmNode: nodeNum, nmOp: 'offline' };
    session.subState = LoggedOnSubState.NM_CONFIRM;
  } else if (status >= 0 && targetSession.state === BBSState.LOGGEDON) {
    // User connected - offer to disconnect - express.e:25348-25363
    // express.e:25349 names no one: "the current user".
    emitText(socket, `Do you wish to disconnect the current user from node ${nodeNum} `);
    emitPrompt(socket, YES_NO_PROMPT[2]); // express.e:25351 yesNo(2)
    session.tempData = { nmNode: nodeNum, nmOp: 'kick' };
    session.subState = LoggedOnSubState.NM_CONFIRM;
  } else {
    // Unknown state - no branch of express.e:25323-25364 takes it.
    promptNodeChange(socket, session);
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

  // express.e:2129-2157 yesNo(2): only y, n or Return end it (Return means
  // no), and it answers Yes or No. Any other key is read and ignored.
  const key = input.toLowerCase();
  if (key !== 'y' && key !== 'n' && input !== '') return;
  const confirmed = key === 'y';

  emitText(socket, confirmed ? 'Yes\r\n' : 'No\r\n');

  if (confirmed && nodeNum !== undefined && operation) {
    switch (operation) {
      case 'online':
        // Bring node online - express.e:25344-25346, which prints nothing.
        // In web version, nodes are created on connection - nothing to do
        break;

      case 'offline':
        // Take node offline - express.e:25328-25337
        // In web version, we just mark it as shutdown
        const offlineSession = _sessions.get(nodeNum.toString());
        if (offlineSession) {
          // express.e:25328-25337 sends SV_EXITNODE and prints nothing.
          offlineSession.currentStat = EnvStat.SHUTDOWN;
        }
        break;

      case 'kick':
        // Disconnect user - express.e:25354-25362
        //
        // TP-10: resolved through the ONE session-emitter registry, which
        // knows a telnet/SSH caller's connection emitter as well as a web
        // caller's live socket. This used to be
        // an io-namespace lookup on getSocketIdByNodeId(nodeNum), a map that
        // holds socket.io sockets and nothing else - so a telnet caller could
        // not be kicked at all: the sysop was told "Could not find socket for
        // node N" and the caller stayed online.
        const kickTarget = emitterForNodeId(nodeNum, _io);
        if (kickTarget) {
          // Mark target session as sysop-kicked to skip grace period. The
          // registry returns the session it resolved the emitter from, which
          // IS the object the disconnect handler holds - the same guarantee
          // the old getSession(socketId) lookup was making.
          kickTarget.session.sysopKicked = true;
console.log(`[NM KICK] Set sysopKicked=true on session for node ${nodeNum}, nodeId=${kickTarget.session.nodeId}`);
          // express.e:7945-7954: SV_KICKUSER drops carrier - the caller is
          // told nothing, and 25354-25362 tells the sysop nothing either.
          setTimeout(() => {
            kickTarget.emitter.disconnect(true);
          }, 500);
        }
        break;
    }
  }

  // Return to node list after brief pause - express.e:25336,25346,25362
  // Set state immediately to prevent double-processing during timeout
  session.subState = LoggedOnSubState.NM_INPUT;
  delete session.tempData;

  setTimeout(() => {
    promptNodeChange(socket, session);
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
/**
 * The message base a Conference Maintenance ordinal names.
 *
 * `cmMsgBase` counts 1..n WITHIN a conference - express.e's `msgBase`, which
 * is what `-`/`+` step and what the header prints as "1.2". Every other layer
 * of this port takes the message base's own id (`mail_stats.message_base_id`,
 * the scan pointers, `joinConference`), and the loader hands out those ids
 * SEQUENTIALLY ACROSS ALL CONFERENCES - so base 1 of conference 2 is id 3, not
 * id 1.
 *
 * The two were used interchangeably here: the menu looked the base up by
 * `mb.id === ordinal` (so on any conference past the first it found nothing,
 * and the header lost its "conf.base" form and its name), and B and C wrote
 * the next/lowest message number of whatever base happened to hold that id -
 * another conference's. This is the one place that translates.
 */
function cmMessageBase(conf: number, ordinal: number): {
  bases: any[];
  base: any | undefined;
  /** What every other layer means by "message base". */
  id: number;
} {
  const bases = _messageBases.filter(mb => mb.conferenceId === conf);
  const base = bases[ordinal - 1];
  return { bases, base, id: base?.id ?? ordinal };
}

/**
 * express.e:22521-22585 dumpUserStats: `<board>/Conf<n>.Stats`, one block
 * per Conf.DB record whose account slot loads, in express's own labels.
 * Nothing is printed on screen - the caller has already said Working....
 */
export function dumpUserStats(conf: number): void {
  // 22530-22532: the file is created even when the database cannot be read.
  const statsFile = path.join(boardRoot(), `Conf${conf}.Stats`);
  const lines: string[] = [];
  const dbPath = messagePointerFileManager.getConfDbPath(conf);
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    const count = Math.floor(buf.length / CONFBASE_RECORD_SIZE);
    lines.push(`Conference Name: ${_conferences.find(c => c.id === conf)?.name ?? ''}`);
    lines.push('='.repeat(42));
    for (let n = 1; n <= count; n++) {
      const account = loadAccount(n);
      if (!account) continue;
      const cb = deserializeConfBase(buf, (n - 1) * CONFBASE_RECORD_SIZE);
      const access = account.user.conferenceAccess;
      const accessText = (Buffer.isBuffer(access) ? access : Buffer.from(String(access ?? ''), 'latin1'))
        .toString('latin1').split('\0')[0];
      lines.push(`Name            : ${account.user.name}`);
      lines.push(`Location        : ${account.user.location}`);
      lines.push(`Area Access     : ${accessText}`);
      lines.push(`Ratio           : ${cb.ratio}`);
      lines.push(`RatioType       : ${cb.ratioType}`);
      lines.push(`Files Uploaded  : ${cb.upload}`);
      lines.push(`Files Downloaded: ${cb.downloads}`);
      lines.push(`Bytes Uploaded  : ${readPackedBCD(cb.uploadBytesBCD, 0).toString()}`);
      lines.push(`Bytes Downloaded: ${readPackedBCD(cb.downloadBytesBCD, 0).toString()}`);
      lines.push(`Messages Posted : ${cb.messagesPosted}`);
      lines.push('-'.repeat(42));
    }
  }
  // fileWriteLn (MiscFuncs.e:472) ends every line with a bare LF.
  fs.writeFileSync(statsFile, lines.map(l => `${l}\n`).join(''), 'latin1');
}

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
  // express.e:22699-22700: conference maintenance always opens on 1.1, not
  // on the caller's own conference.
  session.tempData.cmConf = 1;
  session.tempData.cmMsgBase = 1;

  // Enter the conference maintenance menu loop
  session.subState = LoggedOnSubState.CM_DISPLAY_MENU;
  await displayConferenceMaintenanceMenu(socket, session);
}

/** StringF `\s[w]` (and `\d[w]`): left-justified in w columns, cut at w. */
function sField(s: string, w: number): string {
  return s.substring(0, w).padEnd(w);
}

/** StringF `\z\r\d[w]`: zero-filled, right-justified in w columns, cut at w. */
function zrField(n: number, w: number): string {
  return String(n).slice(0, w).padStart(w, '0');
}

/** What every conference maintenance action prints while it runs (express.e:22782). */
const CM_WORKING = '\x1b[18;2H \x1b[0mWorking....';

/** express.e:22937: the prompt row blanked at the end of every pass. */
const CM_ROW_BLANK = '\x1b[18;2H                                     ';

/** express.e numberInputNoDefault (21085-21088): `Val(tempStr) AND $FFFF`. */
function numberInputNoDefault(input: string): number {
  return (parseInt(input.trim(), 10) || 0) & 0xffff;
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
  const { bases, base: messageBase, id: msgBaseId } = cmMessageBase(conf, msgBase);

  // Get statistics. These take the base's own id, not the ordinal.
  const stats = await _getConferenceStats(conf, msgBaseId);
  const mailStat = await _getMailStatFile(conf, msgBaseId);

  // Build conference string (express.e:22713-22720)
  const msgBaseCount = bases.length;
  let confStr: string;
  let confTitle: string;

  if (msgBaseCount > 1 && messageBase) {
    confStr = `${conf}.${msgBase}`;
    // express.e:22714 getMsgBaseName - the name the board DECLARED. `name`
    // carries a substituted "Message Base <n>" label for lists; express
    // prints what MsgBases.info says and nothing when it says nothing.
    const declared = messageBase.declaredName ?? messageBase.name ?? '';
    confTitle = `${conference?.name ?? ''} - ${declared}`;
  } else {
    confStr = `${conf}`;
    confTitle = conference?.name ?? '';
  }

  // Clear screen and display full-screen ANSI menu - express.e:22718-22777
  emitText(socket, '\x1b[2J'); // Clear screen
  emitText(socket, '\x1b[?25l'); // Hide cursor

  // express.e:22710-22768, byte for byte: each line is positioned, and only
  // the conference line and the warning end in a line break.
  emitText(socket, '\x1b[2;1H                      \x1b[33mCONFERENCE MAINTENANCE\x1b[0m');
  emitText(socket, `\x1b[4;1H \x1b[32mConference \x1b[34m[\x1b[0m${sField(confStr, 5)}\x1b[34m]\x1b[36m:\x1b[0m ${sField(confTitle, 29)}\r\n`);
  emitText(socket, '\x1b[6;1H\x1b[0m THE FOLLOWING OPTIONS EFFECT ALL USERS FOR THIS CONFERENCE!\r\n');
  emitText(socket, '\x1b[8;2H\x1b[33m1.>\x1b[32m Ratio\x1b[0m');
  emitText(socket, '\x1b[9;2H\x1b[33m2.>\x1b[32m Ratio Type\x1b[0m');
  emitText(socket, '\x1b[10;2H\x1b[33m3.>\x1b[32m Reset New Mail Scan Pointers\x1b[0m');
  emitText(socket, '\x1b[11;2H\x1b[33m4.>\x1b[32m Reset Last Message Read Pointers\x1b[0m');
  emitText(socket, '\x1b[12;2H\x1b[33m5.>\x1b[32m Dump all user stats to Conf.Stats\x1b[0m');
  emitText(socket, '\x1b[13;2H\x1b[33m6.>\x1b[32m Set Default New Mail Scan\x1b[0m');
  emitText(socket, '\x1b[14;2H\x1b[33m7.>\x1b[32m Set Default New File Scan\x1b[0m');
  emitText(socket, '\x1b[15;2H\x1b[33m8.>\x1b[32m Set Default Zoom Flag\x1b[0m');

  emitText(socket, '\x1b[8;40H\x1b[33m9.>\x1b[32m Reset Messages Posted\x1b[0m');
  emitText(socket, '\x1b[9;40H\x1b[33mA.>\x1b[32m Reset Voting Booth\x1b[0m');
  // `\z\r\d[8]`: zero-filled, right-justified in eight.
  emitText(socket, `\x1b[10;40H\x1b[33mB.>\x1b[32m Next   Msg # \x1b[0m${zrField(mailStat.highMsgNum || 0, 8)}`);
  emitText(socket, `\x1b[11;40H\x1b[33mC.>\x1b[32m Lowest Msg # \x1b[0m${zrField(mailStat.lowestKey || 0, 8)}`);
  // express.e:22741 prints the conference DATABASE's capacity in records
  // (`Div(FileLength(confDb), SIZEOF confBase)`), and :22743-22756 the share
  // of it in use. This printed the USER COUNT as the capacity and then
  // divided that same count by a hardcoded 1000, so a board of twelve users
  // read "Capacity 12 Users / 1.2% In use" whatever the sysop had set - and
  // option D, which sets the capacity, changed neither number.
  const capacity = Number(stats.capacity ?? 0);
  emitText(socket, `\x1b[12;40H\x1b[33mD.>\x1b[32m Capacity \x1b[0m${sField(String(capacity), 4)} \x1b[32mUsers`);

  // Percentage in use - express.e:22742-22757 with its own arithmetic: n is
  // the whole percent, f is the REMAINDER times 1000 (not a fraction of
  // anything), printed `\z\r\d[3]` - so 12 of 200 reads " 6.000% In use ".
  const totalUsers = Number(stats.userCount ?? 0);
  const n = capacity > 0 ? Math.floor((totalUsers * 100) / capacity) : 0;
  const f = capacity > 0 ? ((totalUsers * 100) % capacity) * 1000 : 0;
  if (n > 100) {
    emitText(socket, '\x1b[13;44H\x1b[31m>100% In use    ');
  } else if (n < 90) {
    emitText(socket, `\x1b[13;44H\x1b[33m${String(n).slice(0, 2).padStart(2)}.${zrField(f, 3)}% In use `);
  } else {
    emitText(socket, `\x1b[13;44H\x1b[31m${n}.${zrField(f, 3)}% In use `);
  }

  // Dir cache options - express.e:22759-22766.
  //
  // EXEMPT, and inert on purpose: E and F toggle and rebuild RAM: dir caches
  // through AmigaDOS `LIST`/`COPY` into `RAM:DirCaches`, which is an AmigaDOS
  // filesystem this port does not have. The lines are drawn so the screen
  // matches, the state always reads Disabled, and F is not offered - express
  // itself blanks that line when caching is off.
  emitText(socket, '\x1b[14;40H\x1b[33mE.>\x1b[32m Ram Dir Cache(s) \x1b[0mDisabled');
  emitText(socket, '\x1b[15;40H\x1b[33m                        ');

  // Footer - express.e:22768
  emitText(socket, '\x1b[17;2H\x1b[33m<TAB>\x1b[36m to exit \x1b[33m-/+\x1b[36m=\x1b[0mPrev/Next Conference \x1b[0m');

  // Position cursor and show - express.e:22778-22779
  emitText(socket, `\x1b[18;2H`);
  emitText(socket, '\x1b[?25h'); // Show cursor
}

/**
 * Handle CM menu input
 */
export async function handleCMInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // The key arrives untrimmed: TAB is the exit (express.e:22910) and Return
  // is not, and trimming made the two the same empty string.
  // Check if awaiting Y/N confirmation for cases 6, 7, 8
  if (session.tempData?.awaitingCMConfirm) {
    delete session.tempData.awaitingCMConfirm;
    // yesNo (express.e:2143) takes Return (13) as the default answer; a TAB
    // is just another key it ignores.
    await handleCMConfirmInput(socket, session, input === '\t' ? input : input.trim());
    return;
  }

  // readChar + UpperChar (express.e:22773-22777).
  const choice = input === '\t' ? input : input.trim().toUpperCase();
  const conf = session.tempData.cmConf;
  const msgBase = session.tempData.cmMsgBase;
  // The ordinal names a base; the pointer helpers take that base's id.
  const { id: msgBaseId } = cmMessageBase(conf, msgBase);

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
      emitText(socket, CM_WORKING);
      await _resetNewMailScanPointers(conf, msgBaseId);
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '4': // Reset Last Message Read Pointers - express.e:22800-22802
      emitText(socket, CM_WORKING);
      await _resetLastMessageReadPointers(conf, msgBaseId);
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '5': // Dump user stats - express.e:22803-22805
      emitText(socket, CM_WORKING);
      try {
        dumpUserStats(conf);
      } catch (error) {
        // express.e:22533-22585 skips what it cannot open and says nothing.
        console.error('[CM] Error dumping user stats:', error);
      }
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case '6': // Set Default New Mail Scan - express.e:22798-22806
      // express.e:22799-22800: "Default ON " then yesNo(1).
      emitText(socket, `\x1b[18;2H \x1b[0mDefault ON ${YES_NO_PROMPT[1]}`);
      session.tempData.cmAction = 'setMailScan';
      session.tempData.awaitingCMConfirm = true;
      return;

    case '7': // Set Default New File Scan - express.e:22807-22815
      // express.e:22799-22800: "Default ON " then yesNo(1).
      emitText(socket, `\x1b[18;2H \x1b[0mDefault ON ${YES_NO_PROMPT[1]}`);
      session.tempData.cmAction = 'setFileScan';
      session.tempData.awaitingCMConfirm = true;
      return;

    case '8': // Set Default Zoom Flag - express.e:22816-22824
      // express.e:22799-22800: "Default ON " then yesNo(1).
      emitText(socket, `\x1b[18;2H \x1b[0mDefault ON ${YES_NO_PROMPT[1]}`);
      session.tempData.cmAction = 'setZoomFlag';
      session.tempData.awaitingCMConfirm = true;
      return;

    case '9': // Reset Messages Posted - express.e:22833-22835
      emitText(socket, CM_WORKING);
      try {
        const confId = session.tempData?.cmConf || session.currentConf || 1;
        // express.e:22833-22835 updateAllUsers(conf,msgBase,UPDATE_MESSAGES_POSTED,0):
        // every record of the conference's Conf.DB (22504).
        messagePointerFileManager.updateAllUsers(confId, rec => { rec.messagesPosted = 0; });
      } catch (error) {
        console.error('[CM] Error resetting messages posted:', error);
      }
      await displayConferenceMaintenanceMenu(socket, session);
      return;

    case 'A': // Reset Voting Booth - express.e:22828-22830
      emitText(socket, CM_WORKING);
      try {
        const confId = session.tempData?.cmConf || session.currentConf || 1;
        // express.e:22830 updateAllUsers(conf,msgBase,UPDATE_RESET_VOTING,-1),
        // 22505-22509: every Conf.DB record forgets which topics its caller
        // voted on - the voted bits are handle[0] bits 4-7 and handle[1..3]
        // (topic n is bit n+3, 20547-20548), the scan flags in bits 0-3 stay.
        // The tallies in Vote/ are left alone. That bit is the only "voted"
        // the booth reads (handlers/commands/vote-booth.ts hasVoted).
        messagePointerFileManager.updateAllUsers(confId, rec => {
          const handle = Buffer.from(rec.handle);
          handle[0] = handle[0]! & 15;
          handle[1] = 0;
          handle[2] = 0;
          handle[3] = 0;
          rec.handle = handle;
        });
      } catch (error) {
        console.error('[CM] Error resetting voting booth:', error);
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

    case '\t': // TAB - exit - express.e:22910-22911, the only way out
      // express.e:22937 blanks the prompt row and leaves the screen as it
      // is; internalCommandCM returns RESULT_SUCCESS, so the main loop
      // pauses before the menu (28647 menuPause:=TRUE).
      emitText(socket, CM_ROW_BLANK);
      session.menuPause = true;
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
  const value = numberInputNoDefault(input);
  const conf = session.tempData.cmConf;
  const msgBase = session.tempData.cmMsgBase;
  // B and C write mail_stats, which is keyed by the base's id - writing the
  // ordinal there set the next/lowest message number of a DIFFERENT
  // conference's base on every conference past the first.
  const { id: msgBaseId } = cmMessageBase(conf, msgBase);

  if (field === 'HIGH_MSG') {
    // express.e:22831-22844: no message, and Val of an empty line is 0.
    await _updateMessageNumberRange(conf, msgBaseId, undefined, value);
  } else if (field === 'LOW_MSG') {
    await _updateMessageNumberRange(conf, msgBaseId, value, undefined);
  } else if (field === 'RATIO') {
    // express.e:22779-22783 updateAllUsers(conf,msgBase,UPDATE_RATIO,n):
    // the ratio is every caller's own, in his Conf.DB record (22478).
    emitText(socket, CM_WORKING);
    messagePointerFileManager.updateAllUsers(conf, rec => { rec.ratio = value; });
  } else if (field === 'RATIO_TYPE') {
    // express.e:22784-22788 updateAllUsers(conf,msgBase,UPDATE_RATIO_TYPE,n) (22480).
    emitText(socket, CM_WORKING);
    messagePointerFileManager.updateAllUsers(conf, rec => { rec.ratioType = value; });
  } else if (field === 'CAPACITY' && value > 0) {
    // express.e:22845-22853 - only a size above 0 resizes the conference
    // database. In our SQL version, we can track this as metadata.
    emitText(socket, '\x1b[18;2H\x1b[0mResizing, Please Standby');
    await getDatabase().run(
      `UPDATE conferences SET max_users = $1 WHERE id = $2`,
      [value, conf]
    );
  }

  session.subState = LoggedOnSubState.CM_DISPLAY_MENU;
  await displayConferenceMaintenanceMenu(socket, session);
}

/**
 * Handle conference maintenance Y/N confirmations
 * For cases 6, 7, 8 (set default scan flags)
 */
export async function handleCMConfirmInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:2129-2157 yesNo(1): Return means yes, only y, n or Return end
  // it, and it answers Yes or No. Any other key is read and ignored.
  const key = input.toLowerCase();
  if (key !== 'y' && key !== 'n' && input !== '') {
    session.tempData.awaitingCMConfirm = true;
    return;
  }
  const isYes = key !== 'n';
  emitText(socket, isYes ? 'Yes\r\n' : 'No\r\n');

  const action = session.tempData.cmAction;
  const confId = session.tempData.cmConf || session.currentConf || 1;

  emitText(socket, CM_WORKING);

  try {
    // express.e:22798-22824 updateAllUsers(conf,msgBase,UPDATE_NEW_MAIL_SCAN /
    // UPDATE_NEW_FILE_SCAN / UPDATE_DEFAULT_ZOOM_FLAG, yes): handle[0] of every
    // record in the conference's Conf.DB, with MAIL_SCAN_MASK 4, FILE_SCAN_MASK 8
    // and ZOOM_SCAN_MASK 2 (axconsts.e:45-47; 22483-22499). The SQL version set
    // bits 128 and 64, which are MAILSCAN_ALL and nothing.
    const masks: Record<string, number> = { setMailScan: 4, setFileScan: 8, setZoomFlag: 2 };
    const mask = masks[action];
    if (mask) {
      messagePointerFileManager.updateAllUsers(confId, rec => {
        rec.handle = Buffer.from(rec.handle);
        rec.handle[0] = isYes ? (rec.handle[0] | mask) : (rec.handle[0] & ~mask & 0xff);
      });
    }
  } catch (error) {
    console.error('[CM] Error updating default flags:', error);
  }

  delete session.tempData.cmAction;
  session.subState = LoggedOnSubState.CM_DISPLAY_MENU;
  await displayConferenceMaintenanceMenu(socket, session);
}
