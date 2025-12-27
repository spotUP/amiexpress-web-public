import type { BBSEvent, BBSEventType } from '../types';
import { events } from './events';

/** BBS Event Bus - broadcasts system events to chat */
export class BBSEventBus {
  private socket: any;

  constructor(socket: any) {
    this.socket = socket;
  }

  /** Emit a BBS event */
  emit(event: BBSEvent): void {
    events.emit('bbs:event', event);
    if (this.socket) {
      this.socket.send('bbs:event', event);
    }
  }

  /** User logged in */
  userLogin(userId: number, username: string, nodeId: number): void {
    this.emit({
      type: 'user_login',
      userId, username, nodeId,
      details: {},
      visibility: 'all',
      timestamp: new Date()
    });
  }

  /** User logged out */
  userLogout(userId: number, username: string): void {
    this.emit({
      type: 'user_logout',
      userId, username,
      details: {},
      visibility: 'all',
      timestamp: new Date()
    });
  }

  /** Upload started */
  uploadStart(userId: number, username: string, filename: string, size: string): void {
    this.emit({
      type: 'upload_start',
      userId, username,
      details: { filename, size },
      visibility: 'all',
      timestamp: new Date()
    });
  }

  /** Upload completed */
  uploadComplete(userId: number, username: string, filename: string, area: string): void {
    this.emit({
      type: 'upload_complete',
      userId, username,
      details: { filename, area },
      visibility: 'all',
      timestamp: new Date()
    });
  }

  /** Download started */
  downloadStart(userId: number, username: string, filename: string): void {
    this.emit({
      type: 'download_start',
      userId, username,
      details: { filename },
      visibility: 'all',
      timestamp: new Date()
    });
  }
}
