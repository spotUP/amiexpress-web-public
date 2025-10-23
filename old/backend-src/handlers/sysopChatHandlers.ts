/**
 * Sysop Chat Handlers Module
 *
 * This module contains all sysop chat/paging functionality for the BBS system.
 * It implements the 1:1 AmiExpress chat system (ccom() and related functions).
 *
 * Functions:
 * - startSysopPage: Initiates sysop paging (like ccom() in AmiExpress)
 * - exitChat: Exit chat mode (like F1 exit in AmiExpress)
 * - executePagerDoor: Execute external pager door (like runSysCommand('PAGER'))
 * - displayInternalPager: Internal pager display (like the dots in ccom())
 * - completePaging: Complete the paging process
 * - acceptChat: Sysop accepts chat (like F1 press handling)
 * - enterChatMode: Enter active chat mode (like chatFlag=TRUE)
 * - sendChatMessage: Send message in chat
 * - toggleSysopAvailable: Toggle sysop availability (like F7)
 * - getChatStatus: Get current chat status for display
 *
 * Based on express.e chat system implementation
 *
 * @module handlers/sysopChatHandlers
 */

import { Socket } from 'socket.io';
import { BBSSession, BBSState, LoggedOnSubState } from '../bbs/session';
import { displayMainMenu } from '../bbs/menu';
import { ChatSession, ChatMessage, ChatState } from '../types';
import { chatState } from '../server/dataStore';

/**
 * startSysopPage() - Initiates sysop paging (like ccom() in AmiExpress)
 *
 * This function:
 * 1. Creates a chat session for the user
 * 2. Logs the page attempt
 * 3. Tries to execute external pager door
 * 4. Falls back to internal pager if no door available
 *
 * @param socket - The socket.io socket instance
 * @param session - The BBS session
 */
export function startSysopPage(socket: Socket, session: BBSSession) {
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
 * executePagerDoor() - Execute external pager door (like runSysCommand('PAGER') in AmiExpress)
 *
 * @param socket - The socket.io socket instance
 * @param session - The BBS session
 * @param chatSession - The chat session object
 * @returns true if pager door was executed, false to fall back to internal pager
 */
export function executePagerDoor(socket: Socket, session: BBSSession, chatSession: ChatSession): boolean {
  // For now, always fall back to internal pager
  // In full implementation, this would check for PAGER door and execute it
  return false;
}

/**
 * displayInternalPager() - Internal pager display (like the dots in ccom())
 *
 * This displays a paging animation with dots and handles Ctrl+C abort.
 *
 * @param socket - The socket.io socket instance
 * @param session - The BBS session
 * @param chatSession - The chat session object
 */
export function displayInternalPager(socket: Socket, session: BBSSession, chatSession: ChatSession) {
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
  (session as any).pagingInterval = dotInterval;

  // Handle Ctrl+C to abort paging
  const abortHandler = (data: string) => {
    if (data === '\x03') { // Ctrl+C
      console.log('Ctrl+C detected, aborting sysop page');
      clearInterval(dotInterval);
      delete (session as any).pagingInterval;

      // Remove from paging users
      const pagingIndex = chatState.pagingUsers.indexOf(session.user!.id);
      if (pagingIndex > -1) {
        chatState.pagingUsers.splice(pagingIndex, 1);
      }

      // Remove chat session
      const sessionIndex = chatState.activeSessions.findIndex(s => s.id === chatSession.id);
      if (sessionIndex > -1) {
        chatState.activeSessions.splice(sessionIndex, 1);
      }

      socket.emit('ansi-output', '\r\n\r\nPaging aborted.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;

      // Remove this handler after use
      socket.removeListener('command', abortHandler);
    }
  };

  // Listen for Ctrl+C during paging
  socket.on('command', abortHandler);
}

/**
 * completePaging() - Complete the paging process
 *
 * Called when paging dots animation completes.
 *
 * @param socket - The socket.io socket instance
 * @param session - The BBS session
 * @param chatSession - The chat session object
 */
export function completePaging(socket: Socket, session: BBSSession, chatSession: ChatSession) {
  // Clear any paging interval
  if ((session as any).pagingInterval) {
    clearInterval((session as any).pagingInterval);
    delete (session as any).pagingInterval;
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
 * acceptChat() - Sysop accepts chat (like F1 press handling)
 *
 * @param socket - The socket.io socket instance
 * @param session - The BBS session
 * @param chatSession - The chat session object
 */
export function acceptChat(socket: Socket, session: BBSSession, chatSession: ChatSession) {
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
 * enterChatMode() - Enter active chat mode (like chatFlag=TRUE in AmiExpress)
 *
 * @param socket - The socket.io socket instance
 * @param session - The BBS session
 * @param chatSession - The chat session object
 */
export function enterChatMode(socket: Socket, session: BBSSession, chatSession: ChatSession) {
  // Set chat flag (like chatFlag:=TRUE in AmiExpress)
  (session as any).inChat = true;
  (session as any).chatSession = chatSession;

  socket.emit('ansi-output', '\x1b[36m[Chat Mode Active]\x1b[0m\r\n');
  socket.emit('ansi-output', 'You are now in chat with the user.\r\n');
  socket.emit('ansi-output', 'Press F1 to exit chat.\r\n\r\n');
}

/**
 * exitChat() - Exit chat mode (like F1 exit in AmiExpress)
 *
 * This function:
 * 1. Ends the chat session
 * 2. Removes it from active sessions
 * 3. Clears chat state from session
 * 4. Returns to normal menu operation
 *
 * @param socket - The socket.io socket instance
 * @param session - The BBS session
 */
export function exitChat(socket: Socket, session: BBSSession) {
  const chatSession = (session as any).chatSession as ChatSession;
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
  delete (session as any).inChat;
  delete (session as any).chatSession;

  // Display exit message (like ENDCHAT.TXT)
  socket.emit('ansi-output', '\r\n\x1b[32mChat session ended.\r\n');

  // Return to normal operation
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  displayMainMenu(socket, session);
}

/**
 * sendChatMessage() - Send message in chat (like chat input handling)
 *
 * @param socket - The socket.io socket instance
 * @param session - The BBS session
 * @param message - The message text to send
 */
export function sendChatMessage(socket: Socket, session: BBSSession, message: string) {
  const chatSession = (session as any).chatSession as ChatSession;
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
 * toggleSysopAvailable() - Toggle sysop availability (like F7 in AmiExpress)
 *
 * This function toggles whether the sysop is available to accept chat requests.
 */
export function toggleSysopAvailable() {
  chatState.sysopAvailable = !chatState.sysopAvailable;
  console.log('Sysop availability toggled to:', chatState.sysopAvailable);
}

/**
 * getChatStatus() - Get current chat status for display
 *
 * @returns Object with current chat system status
 */
export function getChatStatus(): { available: boolean, pagingCount: number, activeCount: number } {
  return {
    available: chatState.sysopAvailable,
    pagingCount: chatState.pagingUsers.length,
    activeCount: chatState.activeSessions.filter(s => s.status === 'active').length
  };
}
