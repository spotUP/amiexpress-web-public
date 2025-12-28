/**
 * Network Quality Monitor Handlers
 *
 * Handles ping/pong for network quality measurement
 */

import type { Socket } from 'socket.io';

/**
 * Register network monitoring handlers on a socket
 */
export function registerNetworkMonitorHandlers(socket: Socket): void {
  /**
   * Handle ping from client
   */
  socket.on('network-ping', (data: { seq: number; clientTime: number }) => {
    // Immediately respond with pong
    socket.emit('network-pong', {
      seq: data.seq,
      serverTime: Date.now(),
    });
  });
}
