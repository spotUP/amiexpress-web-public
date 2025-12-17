import type { BBSEvent } from '../types';
import { BBSEventBus } from './event-bus';

/** Extended BBS Event Bus methods */
export class ExtendedEventBus extends BBSEventBus {
  /** Door entered */
  doorEnter(userId: number, username: string, doorName: string): void {
    this.emit({ type: 'door_enter', userId, username, details: { doorName }, visibility: 'all', timestamp: new Date() });
  }

  /** Door exited */
  doorExit(userId: number, username: string, doorName: string): void {
    this.emit({ type: 'door_exit', userId, username, details: { doorName }, visibility: 'all', timestamp: new Date() });
  }

  /** New message posted */
  newMessage(userId: number, username: string, conference: string): void {
    this.emit({ type: 'new_message', userId, username, details: { conference }, visibility: 'all', timestamp: new Date() });
  }

  /** Sysop paged */
  pageSysop(userId: number, username: string): void {
    this.emit({ type: 'page_sysop', userId, username, details: {}, visibility: 'all', timestamp: new Date() });
  }

  /** Conference joined */
  conferenceJoin(userId: number, username: string, conference: string): void {
    this.emit({ type: 'conference_join', userId, username, details: { conference }, visibility: 'all', timestamp: new Date() });
  }

  /** Download completed */
  downloadComplete(userId: number, username: string, filename: string): void {
    this.emit({ type: 'download_complete', userId, username, details: { filename }, visibility: 'all', timestamp: new Date() });
  }

  /** Node activity */
  nodeActivity(nodeId: number, status: 'active' | 'offline'): void {
    this.emit({ type: 'node_activity', nodeId, details: { status }, visibility: 'all', timestamp: new Date() });
  }

  /** System announcement */
  announce(message: string): void {
    this.emit({ type: 'system_announcement', details: { message }, visibility: 'all', timestamp: new Date() });
  }
}
