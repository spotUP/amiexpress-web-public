/**
 * Chat Handler - Sysop chat system
 *
 * Handles sysop paging, chat sessions, and chat message handling.
 * Based on express.e chat system (ccom() function and chat mode).
 */

// Types (will be provided by index.ts)
interface BBSSession {
  user?: {
    id: string;
    username: string;
    secLevel?: number;
  };
  subState: string;
  [key: string]: any; // For dynamic properties like inChat, chatSession, pagingInterval
}

interface ChatSession {
  id: string;
  userId: string;
  sysopId?: string;
  startTime: Date;
  endTime?: Date;
  status: string;
  messages: ChatMessage[];
  pageCount: number;
  lastActivity: Date;
}

interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isSysop: boolean;
}

interface ChatState {
  sysopAvailable: boolean;
  activeSessions: ChatSession[];
  pagingUsers: string[];
  chatToggle: boolean;
}

// Injected dependencies
let chatState: ChatState;
let LoggedOnSubState: any;
let executePagerDoor: (socket: any, session: BBSSession, chatSession: ChatSession) => boolean;
let displayMainMenu: (socket: any, session: BBSSession) => void;

// Injection functions
export function setChatState(state: ChatState) {
  chatState = state;
}

export function setConstants(constants: {
  LoggedOnSubState: any;
}) {
  LoggedOnSubState = constants.LoggedOnSubState;
}

export function setHelpers(helpers: {
  executePagerDoor: typeof executePagerDoor;
  displayMainMenu: typeof displayMainMenu;
}) {
  executePagerDoor = helpers.executePagerDoor;
  displayMainMenu = helpers.displayMainMenu;
}

/**
 * Start sysop page - Initiates sysop paging (like ccom() in AmiExpress)
 */
export function startSysopPage(socket: any, session: BBSSession) {
  console.log('Starting sysop page for user:', session.user?.username);

  // Create chat session (like pagedFlag in AmiExpress)
  const chatSession: ChatSession = {
    id: `chat_${Date.now()}_${session.user?.id}`,
    userId: session.user!.id,
    startTime: new Date(),
    status: 'paging',
    messages: [],
    pageCount: 1,
    lastActivity: new Date()
  };

  chatState.activeSessions.push(chatSession);
  chatState.pagingUsers.push(session.user!.id);

  // Log the page (like callersLog in AmiExpress)
  console.log(`Operator paged at ${new Date().toISOString()} by ${session.user?.username}`);

  // Display paging message (like ccom() output)
  socket.emit('ansi-output', '\r\n\x1b[32mF1 Toggles chat\r\n');

  // Try to execute pager door first (like runSysCommand('PAGER') in AmiExpress)
  if (!executePagerDoor(socket, session, chatSession)) {
    // Fall back to internal pager (like the dots display)
    displayInternalPager(socket, session, chatSession);
  }
}

/**
 * Display internal pager - Internal pager display (like the dots in ccom())
 */
export function displayInternalPager(socket: any, session: BBSSession, chatSession: ChatSession) {
  const displayTime = new Date().toLocaleTimeString();
  const sysopName = 'Sysop'; // In real implementation, get from config

  socket.emit('ansi-output', `\r\n${displayTime}\r\n\r\nPaging ${sysopName} (CTRL-C to Abort). .`);

  // Start the paging dots animation (like the FOR loops in ccom())
  let dotCount = 0;
  const maxDots = 20;

  const dotInterval = setInterval(() => {
    socket.emit('ansi-output', ' .');

    // Check for F1 key press (like chatF=1 check in AmiExpress)
    // In web implementation, this would be handled by client-side key events

    dotCount++;
    if (dotCount >= maxDots) {
      clearInterval(dotInterval);
      // Complete paging process
      completePaging(socket, session, chatSession);
    }
  }, 1000); // 1 second delay like Delay(1) in AmiExpress

  // Store interval for cleanup
  session.pagingInterval = dotInterval;
}

/**
 * Complete paging - Complete the paging process
 */
export function completePaging(socket: any, session: BBSSession, chatSession: ChatSession) {
  // Clear any paging interval
  if (session.pagingInterval) {
    clearInterval(session.pagingInterval);
    delete session.pagingInterval;
  }

  socket.emit('ansi-output', '\r\n\r\nThe Sysop has been paged\r\n');
  socket.emit('ansi-output', 'You may continue using the system\r\n');
  socket.emit('ansi-output', 'until the sysop answers your request.\r\n\r\n');

  // Update session status (like statMessage in AmiExpress)
  chatSession.status = 'paging'; // Wait for sysop response

  // Return to menu (like the end of ccom())
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  displayMainMenu(socket, session);
}

/**
 * Accept chat - Sysop accepts chat (like F1 press handling)
 */
export function acceptChat(socket: any, session: BBSSession, chatSession: ChatSession) {
  console.log('Sysop accepting chat for session:', chatSession.id);

  chatSession.status = 'active';
  chatSession.sysopId = session.user?.id; // Assuming sysop is accepting

  // Remove from paging users
  const pagingIndex = chatState.pagingUsers.indexOf(chatSession.userId);
  if (pagingIndex > -1) {
    chatState.pagingUsers.splice(pagingIndex, 1);
  }

  // Display chat start messages (like STARTCHAT.TXT)
  socket.emit('ansi-output', '\r\n\x1b[32mChat session started!\r\n');
  socket.emit('ansi-output', 'Type your messages. Press F1 to exit chat.\r\n\r\n');

  // Enter chat mode
  enterChatMode(socket, session, chatSession);
}

/**
 * Enter chat mode - Enter active chat mode (like chatFlag=TRUE in AmiExpress)
 */
export function enterChatMode(socket: any, session: BBSSession, chatSession: ChatSession) {
  // Set chat flag (like chatFlag:=TRUE in AmiExpress)
  session.inChat = true;
  session.chatSession = chatSession;

  socket.emit('ansi-output', '\x1b[36m[Chat Mode Active]\x1b[0m\r\n');
  socket.emit('ansi-output', 'You are now in chat with the user.\r\n');
  socket.emit('ansi-output', 'Press F1 to exit chat.\r\n\r\n');
}

/**
 * Exit chat - Exit chat mode (like F1 exit in AmiExpress)
 */
export function exitChat(socket: any, session: BBSSession) {
  const chatSession = session.chatSession as ChatSession;
  if (chatSession) {
    chatSession.status = 'ended';
    chatSession.endTime = new Date();

    // Remove from active sessions
    const sessionIndex = chatState.activeSessions.findIndex(s => s.id === chatSession.id);
    if (sessionIndex > -1) {
      chatState.activeSessions.splice(sessionIndex, 1);
    }
  }

  // Clear chat state
  delete session.inChat;
  delete session.chatSession;

  // Display exit message (like ENDCHAT.TXT)
  socket.emit('ansi-output', '\r\n\x1b[32mChat session ended.\r\n');

  // Return to normal operation
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  displayMainMenu(socket, session);
}

/**
 * Send chat message - Send message in chat (like chat input handling)
 */
export function sendChatMessage(socket: any, session: BBSSession, message: string) {
  const chatSession = session.chatSession as ChatSession;
  if (!chatSession || chatSession.status !== 'active') {
    return;
  }

  const chatMessage: ChatMessage = {
    id: `msg_${Date.now()}`,
    sessionId: chatSession.id,
    senderId: session.user!.id,
    senderName: session.user!.username,
    content: message,
    timestamp: new Date(),
    isSysop: session.user?.secLevel === 255 // Assuming 255 = sysop level
  };

  chatSession.messages.push(chatMessage);
  chatSession.lastActivity = new Date();

  // Format and display message (like ANSI color handling in AmiExpress)
  const colorCode = chatMessage.isSysop ? '\x1b[31m' : '\x1b[32m'; // Red for sysop, green for user
  socket.emit('ansi-output', `${colorCode}${chatMessage.senderName}: ${chatMessage.content}\x1b[0m\r\n`);
}

/**
 * Toggle sysop available - Toggle sysop availability (like F7 in AmiExpress)
 */
export function toggleSysopAvailable() {
  chatState.sysopAvailable = !chatState.sysopAvailable;
  console.log('Sysop availability toggled to:', chatState.sysopAvailable);
}

/**
 * Get chat status - Get current chat status for display
 */
export function getChatStatus(): { available: boolean, pagingCount: number, activeCount: number } {
  return {
    available: chatState.sysopAvailable,
    pagingCount: chatState.pagingUsers.length,
    activeCount: chatState.activeSessions.filter(s => s.status === 'active').length
  };
}
