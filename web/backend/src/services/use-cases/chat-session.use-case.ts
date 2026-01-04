/**
 * Chat Session Use Case
 *
 * Clean Architecture: Business logic for sysop chat sessions
 * Isolates chat management logic from handlers
 */

import { injectable } from 'tsyringe';

export interface ChatSession {
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

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isSysop: boolean;
}

export interface ChatState {
  sysopAvailable: boolean;
  activeSessions: ChatSession[];
  pagingUsers: string[];
  chatToggle: boolean;
}

@injectable()
export class ChatSessionUseCase {
  private chatState: ChatState = {
    sysopAvailable: true,
    activeSessions: [],
    pagingUsers: [],
    chatToggle: true
  };

  /**
   * Create new chat session
   */
  createChatSession(userId: string, username: string): ChatSession {
    const session: ChatSession = {
      id: `chat_${Date.now()}_${userId}`,
      userId,
      startTime: new Date(),
      status: 'paging',
      messages: [],
      pageCount: 1,
      lastActivity: new Date()
    };

    this.chatState.activeSessions.push(session);
    this.chatState.pagingUsers.push(userId);

console.log(`Chat session created: ${session.id} for user ${username}`);
    return session;
  }

  /**
   * Accept chat session (sysop accepts)
   */
  acceptChatSession(sessionId: string, sysopId: string): ChatSession | null {
    const session = this.chatState.activeSessions.find(s => s.id === sessionId);
    if (!session) return null;

    session.status = 'active';
    session.sysopId = sysopId;
    session.lastActivity = new Date();

    // Remove from paging queue
    const pagingIndex = this.chatState.pagingUsers.indexOf(session.userId);
    if (pagingIndex > -1) {
      this.chatState.pagingUsers.splice(pagingIndex, 1);
    }

console.log(`Chat session accepted: ${sessionId} by sysop ${sysopId}`);
    return session;
  }

  /**
   * End chat session
   */
  endChatSession(sessionId: string): void {
    const sessionIndex = this.chatState.activeSessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) return;

    const session = this.chatState.activeSessions[sessionIndex];
    session.status = 'ended';
    session.endTime = new Date();

    // Remove from active sessions
    this.chatState.activeSessions.splice(sessionIndex, 1);

    // Remove from paging queue if still there
    const pagingIndex = this.chatState.pagingUsers.indexOf(session.userId);
    if (pagingIndex > -1) {
      this.chatState.pagingUsers.splice(pagingIndex, 1);
    }

console.log(`Chat session ended: ${sessionId}`);
  }

  /**
   * Add message to chat session
   */
  addChatMessage(
    sessionId: string,
    senderId: string,
    senderName: string,
    content: string,
    isSysop: boolean
  ): ChatMessage | null {
    const session = this.chatState.activeSessions.find(s => s.id === sessionId);
    if (!session || session.status !== 'active') {
      return null;
    }

    const message: ChatMessage = {
      id: `msg_${Date.now()}`,
      sessionId,
      senderId,
      senderName,
      content,
      timestamp: new Date(),
      isSysop
    };

    session.messages.push(message);
    session.lastActivity = new Date();

    return message;
  }

  /**
   * Get chat session by ID
   */
  getChatSession(sessionId: string): ChatSession | null {
    return this.chatState.activeSessions.find(s => s.id === sessionId) || null;
  }

  /**
   * Get chat session by user ID
   */
  getChatSessionByUser(userId: string): ChatSession | null {
    return this.chatState.activeSessions.find(s => s.userId === userId) || null;
  }

  /**
   * Get all paging users
   */
  getPagingUsers(): string[] {
    return [...this.chatState.pagingUsers];
  }

  /**
   * Get all active chat sessions
   */
  getActiveSessions(): ChatSession[] {
    return this.chatState.activeSessions.filter(s => s.status === 'active');
  }

  /**
   * Toggle sysop availability
   */
  toggleSysopAvailable(): boolean {
    this.chatState.sysopAvailable = !this.chatState.sysopAvailable;
console.log(`Sysop availability toggled: ${this.chatState.sysopAvailable}`);
    return this.chatState.sysopAvailable;
  }

  /**
   * Get sysop availability status
   */
  isSysopAvailable(): boolean {
    return this.chatState.sysopAvailable;
  }

  /**
   * Get chat status for display
   */
  getChatStatus(): {
    available: boolean;
    pagingCount: number;
    activeCount: number;
  } {
    return {
      available: this.chatState.sysopAvailable,
      pagingCount: this.chatState.pagingUsers.length,
      activeCount: this.chatState.activeSessions.filter(s => s.status === 'active').length
    };
  }

  /**
   * Format chat message for display
   */
  formatChatMessage(message: ChatMessage): string {
    const colorCode = message.isSysop ? '\x1b[31m' : '\x1b[32m'; // Red for sysop, green for user
    return `${colorCode}${message.senderName}: ${message.content}\x1b[0m\r\n`;
  }

  /**
   * Get chat state (for backward compatibility)
   */
  getState(): ChatState {
    return this.chatState;
  }
}
