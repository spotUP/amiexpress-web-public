/**
 * BBS Event Emitter Service
 *
 * Broadcasts BBS system events to all connected LiveChat instances.
 * Supports: user_login, user_logout, upload, download, door_activity
 */

import { Server as SocketIOServer } from 'socket.io';

export type BBSEventType = 'user_login' | 'user_logout' | 'upload' | 'download' | 'door_activity';

export interface BBSEventPayload {
  type: BBSEventType;
  username: string;
  nodeId: number;
  timestamp: number;
  data?: Record<string, any>;
}

export interface UserLoginEvent {
  username: string;
  nodeId: number;
  location?: string;
  timestamp: number;
}

export interface UserLogoutEvent {
  username: string;
  nodeId: number;
  timestamp: number;
  duration?: number; // session duration in seconds
}

export interface UploadEvent {
  username: string;
  nodeId: number;
  fileName: string;
  fileSize: number;
  conferenceId: number;
  conferenceName?: string;
  timestamp: number;
}

export interface DownloadEvent {
  username: string;
  nodeId: number;
  fileName: string;
  fileSize: number;
  conferenceId: number;
  conferenceName?: string;
  timestamp: number;
}

export interface DoorActivityEvent {
  username: string;
  nodeId: number;
  doorName: string;
  action: 'entered' | 'exited';
  timestamp: number;
}

class BBSEventEmitter {
  private io: SocketIOServer | null = null;

  /**
   * Initialize the emitter with Socket.IO server instance
   * Must be called before emitting events
   */
  setIO(io: SocketIOServer): void {
    this.io = io;
console.log('[BBSEventEmitter] Initialized with Socket.IO server');
  }

  /**
   * Emit user login event
   */
  emitUserLogin(data: UserLoginEvent): void {
    this.emit('user_login', {
      type: 'user_login',
      username: data.username,
      nodeId: data.nodeId,
      timestamp: data.timestamp,
      data: {
        location: data.location
      }
    });
  }

  /**
   * Emit user logout event
   */
  emitUserLogout(data: UserLogoutEvent): void {
    this.emit('user_logout', {
      type: 'user_logout',
      username: data.username,
      nodeId: data.nodeId,
      timestamp: data.timestamp,
      data: {
        duration: data.duration
      }
    });
  }

  /**
   * Emit file upload event
   */
  emitUpload(data: UploadEvent): void {
    this.emit('upload', {
      type: 'upload',
      username: data.username,
      nodeId: data.nodeId,
      timestamp: data.timestamp,
      data: {
        fileName: data.fileName,
        fileSize: data.fileSize,
        conferenceId: data.conferenceId,
        conferenceName: data.conferenceName
      }
    });
  }

  /**
   * Emit file download event
   */
  emitDownload(data: DownloadEvent): void {
    this.emit('download', {
      type: 'download',
      username: data.username,
      nodeId: data.nodeId,
      timestamp: data.timestamp,
      data: {
        fileName: data.fileName,
        fileSize: data.fileSize,
        conferenceId: data.conferenceId,
        conferenceName: data.conferenceName
      }
    });
  }

  /**
   * Emit door activity event
   */
  emitDoorActivity(data: DoorActivityEvent): void {
    this.emit('door_activity', {
      type: 'door_activity',
      username: data.username,
      nodeId: data.nodeId,
      timestamp: data.timestamp,
      data: {
        doorName: data.doorName,
        action: data.action
      }
    });
  }

  /**
   * Emit import progress event to admin clients
   */
  emitImportProgress(data: { sessionId: string; progress: number; message: string }): void {
    if (!this.io) {
console.warn('[BBSEventEmitter] Cannot emit import progress - Socket.IO not initialized');
      return;
    }

    // Broadcast to admin room (only connected admin clients)
    this.io.to('admin').emit('import:progress', data);

console.log(`[BBSEventEmitter] Import progress (${data.sessionId}): ${data.progress}% - ${data.message}`);
  }

  /**
   * Internal method to broadcast event to all LiveChat sockets
   */
  private emit(eventType: BBSEventType, payload: BBSEventPayload): void {
    if (!this.io) {
console.warn('[BBSEventEmitter] Cannot emit - Socket.IO not initialized');
      return;
    }

    // Broadcast to all sockets listening to 'bbs:event' channel
    this.io.emit('bbs:event', payload);

console.log(`[BBSEventEmitter] Emitted ${eventType}: ${payload.username} (node ${payload.nodeId})`);
  }
}

// Singleton instance
export const bbsEventEmitter = new BBSEventEmitter();

/**
 * Convenience function for emitting user login events
 */
export function emitUserLogin(data: UserLoginEvent): void {
  bbsEventEmitter.emitUserLogin(data);
}

/**
 * Convenience function for emitting user logout events
 */
export function emitUserLogout(data: UserLogoutEvent): void {
  bbsEventEmitter.emitUserLogout(data);
}

/**
 * Convenience function for emitting upload events
 */
export function emitUpload(data: UploadEvent): void {
  bbsEventEmitter.emitUpload(data);
}

/**
 * Convenience function for emitting download events
 */
export function emitDownload(data: DownloadEvent): void {
  bbsEventEmitter.emitDownload(data);
}

/**
 * Convenience function for emitting door activity events
 */
export function emitDoorActivity(data: DoorActivityEvent): void {
  bbsEventEmitter.emitDoorActivity(data);
}
