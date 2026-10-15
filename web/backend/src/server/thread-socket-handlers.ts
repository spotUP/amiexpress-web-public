/**
 * Thread socket handlers for LiveChat
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { onLevel, SYSOP_LEVEL } from './socket-guard';
import { db } from '../database';
import { ChatRepository } from '../database/chat-repository';

export function setupThreadHandlers(socket: Socket, session: any) {
  const chatRepo = new ChatRepository(db);
  const userId = session.user?.id;
  const username = session.user?.username;

  if (!userId || !username) return;

  // Threads read and write any room's messages by id, private rooms
  // included. No client sends these today (the livechat door's emits go to
  // the browser), so they are the sysop's until one does and asks for a
  // room-membership rule (open-surface audit, 2026-10-04).

  // Create thread from message
  onLevel(socket, 'chat:thread:create', SYSOP_LEVEL, async (_caller: BBSSession, data: { messageId: number; title?: string }) => {
    try {
      const { messageId, title } = data;

      // Verify message exists
      const message = await chatRepo.getMessageById(messageId);
      if (!message) {
        socket.emit('chat:error', { error: 'Message not found' });
        return;
      }

      // Thread is created by setting thread_id on replies
      // The parent message becomes the thread root
      socket.emit('chat:thread:created', {
        threadId: messageId,
        parentMessage: message,
        title: title || `Thread: ${message.message.substring(0, 50)}...`
      });
    } catch (error) {
console.error('[Thread] Create error:', error);
      socket.emit('chat:error', { error: 'Failed to create thread' });
    }
  });

  // Reply to thread
  onLevel(socket, 'chat:thread:reply', SYSOP_LEVEL, async (_caller: BBSSession, data: { threadId: number; message: string }) => {
    try {
      const { threadId, message: content } = data;

      // Create reply message with thread_id set
      const replyId = await chatRepo.saveChatRoomMessage({
        roomId: session.currentRoomId || 'general',
        senderId: userId,
        senderUsername: username,
        message: content,
        threadId,
        messageType: 'message'
      });

      const reply = await chatRepo.getMessageById(replyId);

      // Update reply count on parent thread
      await chatRepo.updateThreadReplyCount(threadId);

      // Broadcast to room
      socket.to(session.currentRoomId || 'general').emit('chat:thread:reply', {
        threadId,
        reply
      });

      socket.emit('chat:thread:reply', { threadId, reply });
    } catch (error) {
console.error('[Thread] Reply error:', error);
      socket.emit('chat:error', { error: 'Failed to reply to thread' });
    }
  });

  // Get thread messages
  onLevel(socket, 'chat:thread:messages', SYSOP_LEVEL, async (_caller: BBSSession, data: { threadId: number }) => {
    try {
      const { threadId } = data;

      // Get parent message
      const parent = await chatRepo.getMessageById(threadId);
      if (!parent) {
        socket.emit('chat:error', { error: 'Thread not found' });
        return;
      }

      // Get all replies
      const replies = await chatRepo.getThreadReplies(threadId);

      socket.emit('chat:thread:messages', {
        threadId,
        parent,
        replies
      });
    } catch (error) {
console.error('[Thread] Get messages error:', error);
      socket.emit('chat:error', { error: 'Failed to load thread' });
    }
  });
}
