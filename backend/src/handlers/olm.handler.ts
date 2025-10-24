/**
 * OLM (Online Message) Handler
 * 1:1 port from express.e:25406-25503
 *
 * OLM is the authentic AmiExpress async messaging system (NOT real-time chat)
 * - User composes message using message editor
 * - Message is sent to another node
 * - If recipient is at command prompt, displays immediately
 * - Otherwise message is queued for display when they return to prompt
 * - Can reply to last OLM with R command
 * - Can block OLMs with Q command
 */

import { Socket } from 'socket.io';
import { LoggedOnSubState } from '../constants/bbs-states';
import { ACSPermission } from '../constants/acs-permissions';
import { EnvStat } from '../constants/env-codes';
import { checkSecurity } from '../utils/acs.util';

// Session type
interface BBSSession {
  user?: any;
  state?: string;
  subState?: string;
  socketId?: string;
  lastOlmNode?: number;  // express.e: lastOlmNode - for R reply
  blockOLM?: boolean;     // express.e: blockOLM / quietFlag
  olmQueue?: string[];    // express.e: olmQueue - queued messages
  olmBuffer?: string[];   // express.e: olmBuf - message being composed
  [key: string]: any;
}

// Dependencies (injected)
let db: any;
let sessions: Map<string, BBSSession>;
let io: any;
let setEnvStatFn: any;

export function setOlmDependencies(deps: {
  db: any;
  sessions: Map<string, BBSSession>;
  io: any;
  setEnvStat: any;
}) {
  db = deps.db;
  sessions = deps.sessions;
  io = deps.io;
  setEnvStatFn = deps.setEnvStat;
}

/**
 * OLM command handler
 * express.e:25406-25503 - PROC internalCommandOLM(params)
 */
export async function handleOlmCommand(socket: Socket, session: BBSSession, params: string = '') {
  console.log('📨 [OLM] handleOlmCommand called with params:', params);

  // express.e:25416 - Check security ACS_OLM and multinode enabled
  if (!checkSecurity(session.user, ACSPermission.OLM)) {
    socket.emit('ansi-output', '\r\n\x1b[31mAccess denied.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // TODO: Check if multinode is enabled (sopt.toggles[TOGGLES_MULTICOM])
  // For now, always allow

  // express.e:25418 - Set environment status
  if (setEnvStatFn) {
    setEnvStatFn(session, EnvStat.ONLINEMSG);
  }

  // express.e:25419 - Display OLM header
  socket.emit('ansi-output', '\r\n\x1b[34m*\x1b[0mOLM MESSAGE SYSTEM\x1b[34m*\x1b[0m\r\n');

  // express.e:25421-25425 - Parse params for node number
  const parts = params.trim().split(/\s+/);
  let nodenumstr = parts[0] || '';

  // express.e:25427-25429 - If no params, prompt for node number
  if (!nodenumstr) {
    socket.emit('ansi-output',
      '\r\n\x1b[32m-\x1b[0m OLM to Which Node? \x1b[36m[\x1b[0mNode \x1b[33m#\x1b[36m]\x1b[0m \x1b[36m[\x1b[0mR\x1b[36m]\x1b[0m To Reply\x1b[0m Or \x1b[36m[\x1b[0mQ\x1b[36m]\x1b[0m To Quit\x1b[32m:\x1b[0m '
    );

    // Set state to wait for node input
    session.subState = LoggedOnSubState.OLM_NODE_INPUT;
    return;
  }

  // Process node selection
  await processNodeSelection(socket, session, nodenumstr, parts.slice(1));
}

/**
 * Handle node input for OLM
 * Called from command.handler.ts when in OLM_NODE_INPUT state
 */
export async function handleOlmNodeInput(socket: Socket, session: BBSSession, input: string) {
  const nodenumstr = input.trim();
  await processNodeSelection(socket, session, nodenumstr, []);
}

/**
 * Process node selection and continue OLM flow
 * express.e:25431-25503
 */
async function processNodeSelection(socket: Socket, session: BBSSession, nodenumstr: string, messageParts: string[]) {
  // express.e:25431-25437 - Handle R (reply) command
  if (nodenumstr.toUpperCase() === 'R') {
    if (!session.lastOlmNode || session.lastOlmNode === -1) {
      socket.emit('ansi-output', '\r\nNo OLM has been received in this session\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }
    nodenumstr = String(session.lastOlmNode);
  }

  // express.e:25439 - Handle Q (quit) or empty
  if (!nodenumstr || nodenumstr.toUpperCase() === 'Q') {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // express.e:25441-25447 - If no message in params, use editor
  socket.emit('ansi-output', '\r\n');

  if (messageParts.length === 0) {
    // Start message editor
    // express.e:25443-25445 - msgBuf.clear(), lines:=0, edit()
    session.olmMessageLines = [];
    session.olmNodeTarget = parseInt(nodenumstr);
    session.subState = LoggedOnSubState.OLM_COMPOSE;

    socket.emit('ansi-output',
      '\x1b[36mEnter your message (max 10 lines, /S to send, /A to abort):\x1b[0m\r\n'
    );
    socket.emit('ansi-output', '\x1b[33m1>\x1b[0m ');
    return;
  }

  // express.e:25449 - Get node number
  const nodenum = parseInt(nodenumstr);

  // Combine message parts into single message
  const messageText = messageParts.join(' ');

  // Send the message
  await sendOlmMessage(socket, session, nodenum, [messageText]);
}

/**
 * Handle OLM message composition
 * Called from command.handler.ts when in OLM_COMPOSE state
 */
export async function handleOlmComposeInput(socket: Socket, session: BBSSession, input: string) {
  const trimmedInput = input.trim();

  // Check for /S (send) command
  if (trimmedInput.toUpperCase() === '/S') {
    if (!session.olmMessageLines || session.olmMessageLines.length === 0) {
      socket.emit('ansi-output', '\r\n\x1b[31mNo message to send. Message aborted.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      delete session.olmMessageLines;
      delete session.olmNodeTarget;
      return;
    }

    // Send the message
    await sendOlmMessage(socket, session, session.olmNodeTarget!, session.olmMessageLines);
    return;
  }

  // Check for /A (abort) command
  if (trimmedInput.toUpperCase() === '/A') {
    socket.emit('ansi-output', '\r\n\x1b[33mMessage aborted.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.olmMessageLines;
    delete session.olmNodeTarget;
    return;
  }

  // Add line to message
  if (!session.olmMessageLines) {
    session.olmMessageLines = [];
  }

  session.olmMessageLines.push(input);

  // Check if we've hit 10 line limit
  if (session.olmMessageLines.length >= 10) {
    socket.emit('ansi-output', '\r\n\x1b[33mMaximum 10 lines reached. Auto-sending...\x1b[0m\r\n');
    await sendOlmMessage(socket, session, session.olmNodeTarget!, session.olmMessageLines);
    return;
  }

  // Show next line prompt
  const lineNum = session.olmMessageLines.length + 1;
  socket.emit('ansi-output', `\x1b[33m${lineNum}>\x1b[0m `);
}

/**
 * Send OLM message to target node
 * express.e:25449-25500
 */
async function sendOlmMessage(socket: Socket, session: BBSSession, nodenum: number, messageLines: string[]) {
  console.log('📨 [OLM] Sending message to node', nodenum);

  // express.e:25451-25459 - Check if node is valid and not blocked
  if (nodenum < 0 || nodenum >= 100) {  // MAXNODES = 100 typically
    socket.emit('ansi-output', '\r\n\x1b[34m*\x1b[0mOLM UNSUCCESSFUL\x1b[34m*\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.olmMessageLines;
    delete session.olmNodeTarget;
    return;
  }

  // Find target user session by nodeId - express.e:25451
  let targetSession: BBSSession | null = null;
  let targetSocketId: string | null = null;

  for (const [socketId, sess] of Array.from(sessions.entries())) {
    // Match by nodeId (each connected user has a unique virtual node number 1-99)
    if (sess.nodeId === nodenum && sess.user) {
      targetSession = sess;
      targetSocketId = socketId;
      break;
    }
  }

  // express.e:25459 - Check if target is blocked
  if (targetSession && targetSession.blockOLM) {
    socket.emit('ansi-output',
      `\r\n\x1b[34m*\x1b[0m--\x1b[33mNODE \x1b[0m${nodenum}\x1b[33m HAS MESSAGES SUPPRESSED\x1b[0m--\x1b[34m*\x1b[0m\r\n`
    );
  }

  // express.e:25470-25473 - Check if target exists
  if (!targetSession || targetSession.blockOLM) {
    socket.emit('ansi-output', '\r\n\x1b[34m*\x1b[0mOLM UNSUCCESSFUL\x1b[34m*\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.olmMessageLines;
    delete session.olmNodeTarget;
    return;
  }

  // express.e:25475-25493 - Send message packets
  let msgsent = true;

  // Build message header - express.e:25477-25478
  const headerMsg = `\r\n\r\n\x1b[34m*\x1b[0mOnline Message!\x1b[0m From Node\x1b[32m:\x1b[36m(\x1b[33m${session.nodeId}\x1b[36m)\x1b[0m User\x1b[32m: \x1b[36m[\x1b[0m${session.user!.username}\x1b[36m]\x1b[0m\r\n\r\n`;

  // Send header packet - express.e:25478
  if (!sendOlmPacket(targetSocketId!, targetSession, headerMsg, 0, session.nodeId)) {
    msgsent = false;
  }

  // Send message lines - express.e:25480-25485
  for (const line of messageLines) {
    if (!sendOlmPacket(targetSocketId!, targetSession, line + '\r\n', 0, session.nodeId)) {
      msgsent = false;
    }
  }

  // Send footer packet - express.e:25494-25495
  const footerMsg = '\r\n\x1b[34m*\x1b[0mPress \x1b[36m[\x1b[33mReturn\x1b[36m]\x1b[0m To Resume BBS Operations.\r\n\r\n';
  if (!sendOlmPacket(targetSocketId!, targetSession, footerMsg, -1, session.nodeId)) {
    msgsent = false;
  }

  // express.e:25497-25500 - Show status
  if (msgsent) {
    socket.emit('ansi-output', '\x1b[34m*\x1b[0mOLM SENT\x1b[34m*\x1b[0m\r\n');
  } else {
    socket.emit('ansi-output', '\x1b[34m*\x1b[0mOLM UNSUCCESSFUL\x1b[34m*\x1b[0m\r\n');
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
  delete session.olmMessageLines;
  delete session.olmNodeTarget;
}

/**
 * Send OLM packet to target node
 * express.e:24386-24408 - PROC sendOlmPacket(nodenum,msg:PTR TO CHAR,last)
 *
 * @param targetSocketId - Socket ID of target user
 * @param targetSession - Target user's session
 * @param msg - Message text
 * @param last - 0 for normal line, -1 for last line
 * @param senderNodeId - Sender's node ID (for R reply command)
 * @returns true if successful, false otherwise
 */
function sendOlmPacket(targetSocketId: string, targetSession: BBSSession, msg: string, last: number, senderNodeId?: number): boolean {
  try {
    console.log('📤 [OLM] Sending packet to', targetSocketId, 'last:', last);

    // express.e:1452-1473 - Receiving side handles SV_INCOMING_MSG
    if (!targetSession.olmBuffer) {
      targetSession.olmBuffer = [];
    }

    // Add message to buffer
    targetSession.olmBuffer.push(msg);

    // express.e:1462 - If last packet (lineNum < 0), message is complete
    if (last < 0) {
      // Store sender's node for R (reply) command - express.e:1465
      if (senderNodeId !== undefined) {
        targetSession.lastOlmNode = senderNodeId;
      }

      // express.e:1464-1473 - Check if user is at command prompt
      if (targetSession.subState === LoggedOnSubState.READ_COMMAND ||
          targetSession.subState === LoggedOnSubState.READ_SHORTCUTS) {
        // Display immediately
        for (const line of targetSession.olmBuffer) {
          io.to(targetSocketId).emit('ansi-output', line);
        }
        targetSession.olmBuffer = [];
      } else {
        // Queue for later display - express.e:1468-1472
        if (!targetSession.olmQueue) {
          targetSession.olmQueue = [];
        }
        for (const line of targetSession.olmBuffer) {
          targetSession.olmQueue.push(line);
        }
        targetSession.olmBuffer = [];
      }
    }

    return true;
  } catch (error) {
    console.error('❌ [OLM] Error sending packet:', error);
    return false;
  }
}

/**
 * Process queued OLM messages
 * express.e: processOlmMessageQueue
 * Called when user returns to command prompt
 */
export function processOlmQueue(socket: Socket, session: BBSSession) {
  if (!session.olmQueue || session.olmQueue.length === 0) {
    return;
  }

  console.log('📬 [OLM] Processing queued messages:', session.olmQueue.length);

  // Display all queued messages
  for (const msg of session.olmQueue) {
    socket.emit('ansi-output', msg);
  }

  // Clear queue
  session.olmQueue = [];
}

/**
 * Q command - Toggle quiet mode (block OLMs)
 * express.e:25505-25515 - PROC internalCommandQ()
 */
export async function handleQuietCommand(socket: Socket, session: BBSSession) {
  console.log('🔇 [OLM] handleQuietCommand called');

  // express.e:25506 - Check security
  if (!checkSecurity(session.user, ACSPermission.QUIET_NODE)) {
    socket.emit('ansi-output', '\r\n\x1b[31mAccess denied.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // express.e:25507 - Toggle quiet flag
  session.blockOLM = !session.blockOLM;

  // TODO: Send quiet flag to other nodes via sendQuietFlag()
  // For now, just local toggle

  // express.e:25509-25513 - Display status
  if (session.blockOLM) {
    socket.emit('ansi-output', '\r\nQuiet Mode On\r\n');
  } else {
    socket.emit('ansi-output', '\r\nQuiet Mode Off\r\n');
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}
