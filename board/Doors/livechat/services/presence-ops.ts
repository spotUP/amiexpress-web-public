import type { PresenceStatus } from '../types';
import { PresenceRepository } from '../database';

/** Presence operations with DB persistence */
export class PresenceOps {
  private repo: PresenceRepository;
  private socket: any;
  private userId: number;

  constructor(repo: PresenceRepository, socket: any, userId: number) {
    this.repo = repo;
    this.socket = socket;
    this.userId = userId;
  }

  /** Set user online */
  async setOnline(): Promise<void> {
    await this.repo.set(this.userId, 'online');
    this.socket?.emit?.('chat:presence-update', {
      userId: this.userId, status: 'online'
    });
  }

  /** Set user away */
  async setAway(message?: string): Promise<void> {
    await this.repo.set(this.userId, 'away', message);
    this.socket?.emit?.('chat:presence-update', {
      userId: this.userId, status: 'away', custom: message
    });
  }

  /** Set user status */
  async setStatus(status: PresenceStatus, custom?: string): Promise<void> {
    await this.repo.set(this.userId, status, custom);
    this.socket?.emit?.('chat:presence-update', {
      userId: this.userId, status, custom
    });
  }

  /** Set activity (playing game, etc) */
  async setActivity(activity: string): Promise<void> {
    await this.repo.setActivity(this.userId, activity);
    this.socket?.emit?.('chat:activity-update', {
      userId: this.userId, activity
    });
  }

  /** Set user offline */
  async setOffline(): Promise<void> {
    await this.repo.setOffline(this.userId);
    this.socket?.emit?.('chat:presence-update', {
      userId: this.userId, status: 'offline'
    });
  }
}
