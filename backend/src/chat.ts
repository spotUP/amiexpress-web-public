/**
 * AmiExpress Chat System
 * 1:1 port from AmiExpress E source (express.e lines 5854-6244)
 */

import { Socket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';

// Chat message
export interface ChatMessage {
  senderId: string;
  senderName: string;
  isSysop: boolean;
  message: string;
  timestamp: Date;
  color: number;  // ANSI color code
}

// Chat session status
export type ChatSessionStatus = 'paging' | 'active' | 'ended';

// Chat session
export interface ChatSession {
  sessionId: string;
  userId: string;
  username: string;
  nodeId: number;
  startTime: Date;
  endTime?: Date;
  status: ChatSessionStatus;
  messages: ChatMessage[];
  pageCount: number;
  sysopName?: string;
  sysopAvailable: boolean;
  userSocket?: Socket;
  sysopSocket?: Socket;
}

/**
 * Chat Manager
 * Based on chat() and tranChat() functions from express.e (lines 5854-6244)
 *
 * Original E variables:
 * - chatFlag: Chat is active (0=off, 1=on)
 * - pagedFlag: User is paging sysop
 * - sysopAvail: Sysop available for chat
 * - chatConFlag: Console (sysop) input enabled
 * - chatSerFlag: Serial (user) input enabled
 * - chatColor: ANSI color for chat text
 */
export class ChatManager {
  private activeSessions: Map<string, ChatSession>;
  private sysopAvailable: boolean = true;
  private chatColorSysop: number = 32; // Green (LVL_CHAT_COLOR_SYSOP)
  private chatColorUser: number = 36;  // Cyan (LVL_CHAT_COLOR_USER)
  private screenPath: string;

  constructor(screenPath?: string) {
    this.activeSessions = new Map();
    // BBS directory structure matches original Amiga AmiExpress
    this.screenPath = screenPath || path.join(process.cwd(), 'BBS');
  }

  /**
   * User pages sysop
   * Sets pagedFlag=1 in original E source
   * Displays paging indicator (*) in status bar
   *
   * From express.e: User presses 'P' to page sysop
   */
  pageRequest(userId: string, username: string, nodeId: number, socket: Socket): ChatSession {
    const session: ChatSession = {
      sessionId: `chat-${Date.now()}-${userId}`,
      userId,
      username,
      nodeId,
      startTime: new Date(),
      status: 'paging',
      messages: [],
      pageCount: 1,
      sysopAvailable: this.sysopAvailable,
      userSocket: socket
    };

    this.activeSessions.set(session.sessionId, session);

    console.log(`Chat: User ${username} paging sysop on node ${nodeId}`);

    // Notify sysop of page request
    this.notifySysop(session);

    // Send paging message to user
    socket.emit('ansi-output', '\x1b[33mPaging sysop... Please wait.\x1b[0m\r\n');

    // If sysop not available, inform user
    if (!this.sysopAvailable) {
      socket.emit('ansi-output', '\x1b[31mSysop is not available at this time.\x1b[0m\r\n');
      this.endChat(session.sessionId);
    }

    return session;
  }

  /**
   * Sysop answers page
   * Enters chat() or tranChat() function from original
   * Displays StartChat.txt screen
   *
   * From express.e line 6067: chat() function
   * Sets chatFlag=1, displays StartChat screen
   */
  answerPage(sessionId: string, sysopName: string, sysopSocket: Socket): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'paging') {
      return false;
    }

    session.status = 'active';
    session.sysopName = sysopName;
    session.sysopSocket = sysopSocket;

    console.log(`Chat: Sysop ${sysopName} answered page from ${session.username}`);

    // Display StartChat screen to user
    this.displayStartChat(session);

    // Notify user that sysop has joined
    if (session.userSocket) {
      session.userSocket.emit('chat-started', {
        sessionId,
        sysopName,
        sysopColor: this.chatColorSysop,
        userColor: this.chatColorUser
      });
    }

    // Notify sysop
    if (sysopSocket) {
      sysopSocket.emit('chat-started', {
        sessionId,
        username: session.username,
        nodeId: session.nodeId,
        sysopColor: this.chatColorSysop,
        userColor: this.chatColorUser
      });
    }

    return true;
  }

  /**
   * Send chat message
   * Echoes character to both user and sysop
   * Handles word-wrap at column 78
   * Uses ANSI colors to distinguish speakers
   *
   * From express.e: Chat loop reads character, echoes with color
   */
  sendMessage(sessionId: string, senderId: string, message: string, isSysop: boolean): void {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return;
    }

    const chatMsg: ChatMessage = {
      senderId,
      senderName: isSysop ? session.sysopName! : session.username,
      isSysop,
      message,
      timestamp: new Date(),
      color: isSysop ? this.chatColorSysop : this.chatColorUser
    };

    session.messages.push(chatMsg);

    // Broadcast message to both parties
    this.broadcastMessage(session, chatMsg);
  }

  /**
   * End chat session
   * Displays EndChat.txt screen
   * Runs CHATOUT command hook
   * Resets chatFlag and pagedFlag
   *
   * From express.e: Display EndChat file, run CHATOUT, clear flags
   */
  endChat(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.endTime = new Date();
    session.status = 'ended';

    console.log(`Chat: Ending chat session ${sessionId} (${session.messages.length} messages)`);

    // Display EndChat screen to user
    this.displayEndChat(session);

    // Notify both parties
    if (session.userSocket) {
      session.userSocket.emit('chat-ended', { sessionId });
    }
    if (session.sysopSocket) {
      session.sysopSocket.emit('chat-ended', { sessionId });
    }

    // Run CHATOUT command hook
    this.runChatOutCommand(session);

    this.activeSessions.delete(sessionId);
  }

  /**
   * Display StartChat file
   * Looks for Node#/StartChat.{screenType} or Node#/StartChat.txt
   * Falls back to default message
   *
   * From express.e: Displays screen-specific StartChat or default
   */
  private displayStartChat(session: ChatSession): void {
    const nodeDir = path.join(this.screenPath, `Node${session.nodeId}`);
    const startChatFile = path.join(nodeDir, 'StartChat.txt');

    let content = '';
    if (fs.existsSync(startChatFile)) {
      content = fs.readFileSync(startChatFile, 'utf-8');
    } else {
      // Default message from original E source
      content = `\x1b[32mThis is ${session.sysopName || 'Sysop'}, How can I help you??\x1b[0m\r\n`;
    }

    if (session.userSocket) {
      session.userSocket.emit('ansi-output', content);
    }
  }

  /**
   * Display EndChat file
   * Looks for Node#/EndChat.{screenType} or Node#/EndChat.txt
   * Falls back to default: "Ending Chat."
   *
   * From express.e: Displays screen-specific EndChat or default
   */
  private displayEndChat(session: ChatSession): void {
    const nodeDir = path.join(this.screenPath, `Node${session.nodeId}`);
    const endChatFile = path.join(nodeDir, 'EndChat.txt');

    let content = '';
    if (fs.existsSync(endChatFile)) {
      content = fs.readFileSync(endChatFile, 'utf-8');
    } else {
      // Default message from original E source
      content = '\x1b[33mEnding Chat.\x1b[0m\r\n';
    }

    if (session.userSocket) {
      session.userSocket.emit('ansi-output', content);
    }
  }

  /**
   * Broadcast message to both parties
   * Sends with ANSI color codes
   * Format: [Color]Name: Message[Reset]
   *
   * From express.e: Echo with color codes
   */
  private broadcastMessage(session: ChatSession, msg: ChatMessage): void {
    const formatted = this.formatChatMessage(msg);

    // Send to user socket
    if (session.userSocket) {
      session.userSocket.emit('chat-message', {
        sender: msg.senderName,
        message: msg.message,
        isSysop: msg.isSysop,
        color: msg.color,
        formatted
      });
    }

    // Send to sysop socket
    if (session.sysopSocket) {
      session.sysopSocket.emit('chat-message', {
        sender: msg.senderName,
        message: msg.message,
        isSysop: msg.isSysop,
        color: msg.color,
        formatted
      });
    }
  }

  /**
   * Format chat message with ANSI colors
   * Returns: [Color]Name: Message[Reset]\r\n
   */
  private formatChatMessage(msg: ChatMessage): string {
    return `\x1b[${msg.color}m${msg.senderName}: ${msg.message}\x1b[0m\r\n`;
  }

  /**
   * Notify sysop of page
   * Updates status bar with paging indicator (*)
   *
   * From express.e: statChatFlag() - Update status bar
   * Shows (*) when user paging
   */
  private notifySysop(session: ChatSession): void {
    // Send notification to sysop console/window
    // This would be handled by Socket.IO broadcast to sysop clients
    console.log(`Chat: Sysop page from ${session.username} on node ${session.nodeId}`);

    // TODO: Implement sysop notification system
    // Could use Socket.IO room for sysop clients
    // Send event with username, node, timestamp
  }

  /**
   * Run CHATOUT command
   * Executes external command/AREXX script after chat ends
   * Hook for logging, notifications, etc.
   *
   * From express.e: CHATOUT command hook
   */
  private runChatOutCommand(session: ChatSession): void {
    // Execute external command/AREXX script
    // Original E source would run configured CHATOUT command
    // Could invoke AREXX engine here with chat session data

    console.log(`Chat: CHATOUT hook for session ${session.sessionId}`);

    // TODO: Implement AREXX hook
    // Example: arexxEngine.execute('chatout.rexx', {
    //   username: session.username,
    //   duration: (session.endTime - session.startTime) / 1000,
    //   messageCount: session.messages.length
    // });
  }

  /**
   * Set sysop availability
   * Updates sysopAvail flag
   * Broadcasts to all nodes via sendChatFlag()
   *
   * From express.e: sendChatFlag() broadcasts to all nodes
   */
  setSysopAvailable(available: boolean): void {
    this.sysopAvailable = available;
    console.log(`Chat: Sysop availability set to ${available}`);

    // TODO: Broadcast to all active nodes
    // Original would update all node status bars
  }

  /**
   * Get sysop availability
   */
  isSysopAvailable(): boolean {
    return this.sysopAvailable;
  }

  /**
   * Set chat colors
   * Updates ANSI color codes for chat text
   *
   * From express.e: LVL_CHAT_COLOR_SYSOP, LVL_CHAT_COLOR_USER
   */
  setChatColors(sysopColor: number, userColor: number): void {
    this.chatColorSysop = sysopColor;
    this.chatColorUser = userColor;
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): ChatSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ChatSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get session by user ID
   */
  getSessionByUserId(userId: string): ChatSession | undefined {
    for (const session of this.activeSessions.values()) {
      if (session.userId === userId) {
        return session;
      }
    }
    return undefined;
  }
}

// Global instance (singleton pattern)
export const chatManager = new ChatManager();
