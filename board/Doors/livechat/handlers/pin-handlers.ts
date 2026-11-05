/**
 * Pin socket event handlers for LiveChat frontend
 */
import type { Socket } from 'socket.io-client';

export function setupPinListeners(
  socket: Socket,
  onPinUpdated: (data: any) => void,
  onPinList: (data: any) => void
) {
  socket.on('chat:pin:updated', onPinUpdated);
  socket.on('chat:pin:list', onPinList);
}

export function pinMessage(socket: Socket, roomId: string, messageId: number) {
  socket.emit('chat:pin:add', { roomId, messageId });
}

export function unpinMessage(socket: Socket, roomId: string, messageId: number) {
  socket.emit('chat:pin:remove', { roomId, messageId });
}

export function getPinnedMessages(socket: Socket, roomId: string) {
  socket.emit('chat:pin:list', { roomId });
}

export function cleanupPinListeners(socket: Socket) {
  socket.off('chat:pin:updated');
  socket.off('chat:pin:list');
}
