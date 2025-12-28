/**
 * BBS Event Handler for LiveChat
 * Listens to BBS system events and displays them in the chat log
 */

import type { Socket } from 'socket.io-client';
import type { BBSEventPayload } from '../types/bbs-events';

export class BBSEventHandler {
  private socket: Socket;
  private eventCallback?: (event: BBSEventPayload) => void;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  /**
   * Register callback for BBS events
   */
  onEvent(callback: (event: BBSEventPayload) => void): void {
    this.eventCallback = callback;
  }

  /**
   * Start listening to BBS events from server
   */
  listen(): void {
    this.socket.on('bbs:event', (payload: BBSEventPayload) => {
      if (this.eventCallback) {
        this.eventCallback(payload);
      }
    });
  }

  /**
   * Stop listening to BBS events
   */
  unlisten(): void {
    this.socket.off('bbs:event');
  }

  /**
   * Format event for display in chat log
   */
  formatEvent(event: BBSEventPayload): string {
    const timestamp = new Date(event.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    switch (event.type) {
      case 'user_login':
        return `{cyan-fg}[${timestamp}]{/} {green-fg}* ${event.username}{/} logged in from ${event.data?.location || 'Unknown'} (Node ${event.nodeId})`;

      case 'user_logout':
        const duration = event.data?.duration;
        const durationText = duration ? ` after ${Math.floor(duration / 60)}m ${duration % 60}s` : '';
        return `{cyan-fg}[${timestamp}]{/} {yellow-fg}* ${event.username}{/} logged out${durationText} (Node ${event.nodeId})`;

      case 'upload':
        const uploadSize = event.data?.fileSize ? ` (${(event.data.fileSize / 1024).toFixed(1)}KB)` : '';
        const uploadConf = event.data?.conferenceName ? ` to ${event.data.conferenceName}` : '';
        return `{cyan-fg}[${timestamp}]{/} {blue-fg}* ${event.username}{/} uploaded {white-fg}${event.data?.fileName}${uploadSize}{/}${uploadConf}`;

      case 'download':
        const downloadSize = event.data?.fileSize ? ` (${(event.data.fileSize / 1024).toFixed(1)}KB)` : '';
        const downloadConf = event.data?.conferenceName ? ` from ${event.data.conferenceName}` : '';
        return `{cyan-fg}[${timestamp}]{/} {magenta-fg}* ${event.username}{/} downloaded {white-fg}${event.data?.fileName}${downloadSize}{/}${downloadConf}`;

      case 'door_activity':
        const action = event.data?.action === 'entered' ? 'entered' : 'exited';
        const actionColor = action === 'entered' ? 'green-fg' : 'yellow-fg';
        return `{cyan-fg}[${timestamp}]{/} {${actionColor}}* ${event.username}{/} ${action} door {white-fg}${event.data?.doorName}{/}`;

      default:
        return `{cyan-fg}[${timestamp}]{/} {gray-fg}* Unknown event: ${event.type}{/}`;
    }
  }
}
