/** Message type */
export type MessageType = 'message' | 'system' | 'action' | 'join' | 'leave' | 'file' | 'topic';

/** Chat message */
export interface Message {
  id: string;
  channelId: string;
  userId: string;
  username: string;
  content: string;
  type: MessageType;
  createdAt: Date;
  editedAt?: Date;
  threadId?: string;
  replyCount: number;
  metadata?: Record<string, unknown>;
}

/** Typing user state */
export interface TypingUser {
  userId: string;
  username: string;
  buffer: string;
  lastKeystroke: number;
}

/** Message to display in UI */
export interface DisplayMessage {
  time: string;
  username: string;
  content: string;
  color: string;
  isSystem: boolean;
}
