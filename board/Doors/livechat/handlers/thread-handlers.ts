/**
 * Thread socket event handlers for LiveChat frontend
 */
import type { Socket } from 'socket.io-client';

export function setupThreadListeners(
  socket: Socket,
  onThreadCreated: (data: any) => void,
  onThreadReply: (data: any) => void,
  onThreadMessages: (data: any) => void
) {
  socket.on('chat:thread:created', onThreadCreated);
  socket.on('chat:thread:reply', onThreadReply);
  socket.on('chat:thread:messages', onThreadMessages);
}

export function createThread(socket: Socket, messageId: number, title?: string) {
  socket.emit('chat:thread:create', { messageId, title });
}

export function replyToThread(socket: Socket, threadId: number, message: string) {
  socket.emit('chat:thread:reply', { threadId, message });
}

export function getThreadMessages(socket: Socket, threadId: number) {
  socket.emit('chat:thread:messages', { threadId });
}

export function cleanupThreadListeners(socket: Socket) {
  socket.off('chat:thread:created');
  socket.off('chat:thread:reply');
  socket.off('chat:thread:messages');
}
