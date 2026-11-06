/**
 * Edit and delete socket emits for LiveChat. The /edit and /deletemsg
 * commands, the picker, the context menu and the input-history edit all send
 * through these, so there is one wire shape. The backend Number()s the id.
 */
import type { Socket } from 'socket.io-client';

export function editMessage(socket: Socket, roomId: string, messageId: string, content: string) {
  socket.emit('chat:edit', { roomId, messageId, content });
}

export function deleteMessage(socket: Socket, roomId: string, messageId: string) {
  socket.emit('chat:delete', { roomId, messageId });
}
