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
   * Escape blessed tags in user-provided content to prevent formatting injection
   */
  private escapeBlessedTags(text: string): string {
    return text.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
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
        return `{cyan-fg}[${timestamp}]{/} {green-fg}* ${this.escapeBlessedTags(event.username)}{/} logged in from ${this.escapeBlessedTags(event.data?.location || 'Unknown')} (Node ${event.nodeId})`;

      case 'user_logout':
        const duration = event.data?.duration;
        const durationText = duration ? ` after ${Math.floor(duration / 60)}m ${duration % 60}s` : '';
        return `{cyan-fg}[${timestamp}]{/} {yellow-fg}* ${this.escapeBlessedTags(event.username)}{/} logged out${durationText} (Node ${event.nodeId})`;

      case 'upload':
        const uploadSize = event.data?.fileSize ? ` (${(event.data.fileSize / 1024).toFixed(1)}KB)` : '';
        const uploadConf = event.data?.conferenceName ? ` to ${this.escapeBlessedTags(event.data.conferenceName)}` : '';
        return `{cyan-fg}[${timestamp}]{/} {blue-fg}* ${this.escapeBlessedTags(event.username)}{/} uploaded {white-fg}${this.escapeBlessedTags(event.data?.fileName)}${uploadSize}{/}${uploadConf}`;

      case 'download':
        const downloadSize = event.data?.fileSize ? ` (${(event.data.fileSize / 1024).toFixed(1)}KB)` : '';
        const downloadConf = event.data?.conferenceName ? ` from ${this.escapeBlessedTags(event.data.conferenceName)}` : '';
        return `{cyan-fg}[${timestamp}]{/} {magenta-fg}* ${this.escapeBlessedTags(event.username)}{/} downloaded {white-fg}${this.escapeBlessedTags(event.data?.fileName)}${downloadSize}{/}${downloadConf}`;

      case 'door_activity':
        const action = event.data?.action === 'entered' ? 'entered' : 'exited';
        const actionColor = action === 'entered' ? 'green-fg' : 'yellow-fg';
        return `{cyan-fg}[${timestamp}]{/} {${actionColor}}* ${this.escapeBlessedTags(event.username)}{/} ${action} door {white-fg}${this.escapeBlessedTags(event.data?.doorName)}{/}`;

      case 'custom_door_event':
        const doorName = this.escapeBlessedTags(event.data?.doorName || 'Unknown');
        const eventType = event.data?.eventType || 'event';
        const message = this.escapeBlessedTags(event.data?.message || 'No message');
        const username = this.escapeBlessedTags(event.username);

        // Color-code based on event type
        let eventColor = 'white-fg';
        if (eventType === 'score' || eventType === 'score_submitted') {
          eventColor = 'yellow-fg';
        } else if (eventType.includes('create') || eventType.includes('add') || eventType.includes('new')) {
          eventColor = 'green-fg';
        } else if (eventType.includes('delete') || eventType.includes('remove')) {
          eventColor = 'red-fg';
        } else if (eventType.includes('complete') || eventType.includes('done') || eventType.includes('finish')) {
          eventColor = 'blue-fg';
        } else if (eventType.includes('achievement') || eventType.includes('unlock')) {
          eventColor = 'yellow-fg';
        } else if (eventType.includes('update') || eventType.includes('edit') || eventType.includes('move')) {
          eventColor = 'cyan-fg';
        }

        // Score events get a special trophy prefix
        if (eventType === 'score' || eventType === 'score_submitted') {
          const pbTag = event.data?.isPersonalBest ? ' {lightgreen-fg}[NEW PB!]{/}' : '';
          return `{cyan-fg}[${timestamp}]{/} {${eventColor}}[${doorName}]{/} {white-fg}${username}{/}: ${message}${pbTag}`;
        }

        // Match result events (winner/loser)
        if (eventType === 'match_result') {
          return `{cyan-fg}[${timestamp}]{/} {yellow-fg}[${doorName}]{/} {white-fg}${username}{/} ${message}`;
        }

        return `{cyan-fg}[${timestamp}]{/} {${eventColor}}[${doorName}]{/} {white-fg}${username}{/}: ${message}`;

      default:
        return `{cyan-fg}[${timestamp}]{/} {gray-fg}* Unknown event: ${event.type}{/}`;
    }
  }
}
