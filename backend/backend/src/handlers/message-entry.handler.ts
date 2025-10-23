/**
 * Message Entry Handler - Handles the E (Enter Message) command flow
 * 1:1 port from express.e:10749+ enterMSG()
 */

import { AnsiUtil } from '../utils/ansi.util';
import { LoggedOnSubState } from '../constants/bbs-states';

// Types
interface BBSSession {
  user?: any;
  state: string;
  subState: string;
  currentConf?: number;
  currentMsgBase?: number;
  tempData?: any;
}

// Dependencies (injected from index.ts)
let _db: any;
let _callersLog: (userId: string | null, username: string, action: string, details?: string, nodeId?: number) => Promise<void>;

export function setMessageEntryDependencies(deps: {
  db: any;
  callersLog: typeof _callersLog;
}) {
  _db = deps.db;
  _callersLog = deps.callersLog;
}

/**
 * Handle recipient (To:) input - express.e:10771-10838
 */
export function handleMessageToInput(socket: any, session: BBSSession, input: string): void {
  const recipient = input.trim();

  // Blank = ALL (express.e:10793-10795)
  if (recipient === '') {
    session.tempData.messageEntry.toUser = 'ALL';
  } else {
    session.tempData.messageEntry.toUser = recipient;
  }

  socket.emit('ansi-output', '\r\n');
  promptForSubject(socket, session);
}

/**
 * Handle subject input - express.e:10839-10849
 */
export function handleMessageSubjectInput(socket: any, session: BBSSession, input: string): void {
  const subject = input.trim();

  // Blank = abort (express.e:10847-10849)
  if (subject === '') {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.warningLine('Message entry aborted'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }

  session.tempData.messageEntry.subject = subject;
  socket.emit('ansi-output', '\r\n');

  promptForPrivate(socket, session);
}

/**
 * Handle Private/Public input - express.e:10851-10864
 */
export function handleMessagePrivateInput(socket: any, session: BBSSession, input: string): void {
  const answer = input.trim().toUpperCase();

  // Y/YES = private, anything else = public
  session.tempData.messageEntry.isPrivate = (answer === 'Y' || answer === 'YES');

  socket.emit('ansi-output', '\r\n');
  promptForMessageBody(socket, session);
}

/**
 * Handle message body input - express.e:10898-10909 (edit function)
 */
export async function handleMessageBodyInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const line = input;

  // Check for editor commands
  if (line.startsWith('/')) {
    const cmd = line.substring(1).toUpperCase();

    // /S = Save - express.e:10909 stat:=saveNewMSG()
    if (cmd === 'S' || cmd === 'SAVE') {
      await saveMessage(socket, session);
      return;
    }

    // /A = Abort
    if (cmd === 'A' || cmd === 'ABORT') {
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.warningLine('Message entry aborted'));
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }

    // /H = Help
    if (cmd === 'H' || cmd === 'HELP') {
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.colorize('Editor Commands:', 'cyan') + '\r\n');
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/S', 'yellow')} - Save message\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/A', 'yellow')} - Abort message\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/H', 'yellow')} - This help\r\n`);
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
      return;
    }

    // Unknown command - treat as normal text
  }

  // Add line to message body
  session.tempData.messageEntry.body.push(line);
  session.tempData.messageEntry.currentLine++;

  // Limit to 200 lines (express.e typical limit)
  if (session.tempData.messageEntry.body.length >= 200) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.warningLine('Maximum message length reached (200 lines)'));
    socket.emit('ansi-output', '\r\n');
    await saveMessage(socket, session);
    return;
  }

  // Display next line prompt
  socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
}

/**
 * Save message to database - express.e:10909 saveNewMSG()
 */
async function saveMessage(socket: any, session: BBSSession): Promise<void> {
  const entry = session.tempData.messageEntry;

  // Validate message has content
  if (entry.body.length === 0) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Cannot save empty message'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Saving...', 'cyan'));

  try {
    // Create message object
    const messageBody = entry.body.join('\n');

    const message = {
      subject: entry.subject,
      body: messageBody,
      author: session.user!.username,
      timestamp: new Date(),
      conferenceId: session.currentConf || 1,
      messageBaseId: session.currentMsgBase || 1,
      isPrivate: entry.isPrivate,
      toUser: entry.toUser,
      parentId: null,
      attachments: [],
      edited: false,
      editedBy: null,
      editedAt: null
    };

    // Save to database
    const messageId = await _db.createMessage(message);

    // Log the action
    await _callersLog(
      session.user!.id,
      session.user!.username,
      'Posted message',
      `#${messageId}: "${entry.subject}" to ${entry.toUser}`
    );

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.successLine(`Message #${messageId} posted successfully!`));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  } catch (error) {
    console.error('[saveMessage] Error:', error);
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Failed to save message'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.tempData = undefined;
}

/**
 * Helper: Prompt for message subject - express.e:10839-10849
 */
function promptForSubject(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', `${AnsiUtil.colorize('Subject:', 'cyan')} ${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Blank', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('abort', 'yellow')}${AnsiUtil.colorize('?', 'green')} `);
  session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
}

/**
 * Helper: Prompt for Private/Public - express.e:10851-10864
 */
function promptForPrivate(socket: any, session: BBSSession): void {
  const toUser = session.tempData.messageEntry.toUser.toUpperCase();

  // Messages to ALL/EALL cannot be private - express.e:10850
  if (toUser === 'ALL' || toUser === 'EALL') {
    session.tempData.messageEntry.isPrivate = false;
    promptForMessageBody(socket, session);
    return;
  }

  socket.emit('ansi-output', `         ${AnsiUtil.colorize('Private', 'cyan')} `);
  socket.emit('ansi-output', `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Y', 'yellow')}${AnsiUtil.colorize('/', 'green')}${AnsiUtil.colorize('N', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize('?', 'green')} `);
  session.subState = LoggedOnSubState.POST_MESSAGE_PRIVATE;
}

/**
 * Helper: Prompt for message body - express.e:10898-10909
 */
function promptForMessageBody(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Enter message (', 'cyan'));
  socket.emit('ansi-output', AnsiUtil.colorize('/S', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize(' to save, ', 'cyan'));
  socket.emit('ansi-output', AnsiUtil.colorize('/A', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize(' to abort, ', 'cyan'));
  socket.emit('ansi-output', AnsiUtil.colorize('/H', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize(' for help):', 'cyan'));
  socket.emit('ansi-output', '\r\n\r\n');

  session.tempData.messageEntry.body = [];
  session.tempData.messageEntry.currentLine = 1;

  socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}
