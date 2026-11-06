/**
 * Reaction socket emits for LiveChat. The slash commands, the picker and the
 * context menu all send through these, so there is one wire shape.
 * The backend Number()s the id (the door keeps message ids as strings).
 */
import type { Socket } from 'socket.io-client';

export function reactToMessage(socket: Socket, roomId: string, messageId: string, emoji: string) {
  socket.emit('chat:react', { roomId, messageId, emoji });
}

export function unreactToMessage(socket: Socket, roomId: string, messageId: string, emoji: string) {
  socket.emit('chat:unreact', { roomId, messageId, emoji });
}

export function listMessageReactions(socket: Socket, roomId: string, messageId: string) {
  socket.emit('chat:reactions:list', { roomId, messageId });
}
